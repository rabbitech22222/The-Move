import { getWorkspaceData, mutateWorkspace } from "./data";
import { enqueueTask, processTask, type QueuePayload } from "./jobs";
import { ServiceError } from "./services/errors";
import { defaultNewsSources } from "./news-sources";
import { mkdir, writeFile, rename, readFile } from "node:fs/promises";
import path from "node:path";

const heartbeatFile = () =>
  path.join(process.env.MOVE_DATA_DIR || ".move-local", "worker.json");
export async function localWorkerStatus() {
  try {
    const data = JSON.parse(await readFile(heartbeatFile(), "utf8"));
    return {
      running: Date.now() - Date.parse(data.at) < 15000,
      checkedAt: data.at as string,
    };
  } catch {
    return { running: false, checkedAt: null };
  }
}
export async function heartbeat() {
  const filename = heartbeatFile();
  await mkdir(path.dirname(filename), { recursive: true, mode: 0o700 });
  const temporary = `${filename}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify({ at: new Date().toISOString() }), {
    mode: 0o600,
  });
  await rename(temporary, filename);
}
function alive(pid?: number) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}
export async function runLocalJobOnce(): Promise<boolean> {
  const data = await getWorkspaceData();
  const ready = data.tasks.find(
    (t) =>
      t.localJob &&
      t.localJob.dueAt <= Date.now() &&
      (t.status === "QUEUED" ||
        (t.status === "RUNNING" &&
          (!alive(t.localJob.leasePid) ||
            (t.localJob.leaseUntil || 0) < Date.now()))),
  );
  if (!ready) return false;
  let input: QueuePayload | null = null;
  await mutateWorkspace("system", "LOCAL_JOB_CLAIMED", ready.id, (draft) => {
    const task = draft.tasks.find((t) => t.id === ready.id)!;
    const job = task.localJob;
    if (
      !job ||
      ["SUCCEEDED", "FAILED"].includes(task.status) ||
      job.dueAt > Date.now() ||
      (job.leasePid &&
        alive(job.leasePid) &&
        (job.leaseUntil || 0) >= Date.now())
    )
      return;
    job.leasePid = process.pid;
    job.leaseUntil = Date.now() + 15 * 60_000;
    job.attempts++;
    input = job.input as QueuePayload;
    task.status = "RUNNING";
  });
  if (!input) return false;
  let errorCode: string | null = null;
  try {
    await processTask(input);
  } catch (error) {
    errorCode = error instanceof ServiceError ? error.code : "OPERATION_FAILED";
  }
  await mutateWorkspace("system", "LOCAL_JOB_FINISHED", ready.id, (draft) => {
    const task = draft.tasks.find((t) => t.id === ready.id)!;
    const job = task.localJob!;
    const retry =
      errorCode === "CONTAINER_PROCESSING" ||
      [
        "RATE_LIMITED",
        "API_UNAVAILABLE",
        "SOURCE_FETCH_FAILED",
        "SOURCE_INGEST_FAILED",
      ].includes(errorCode || "");
    if (
      retry &&
      job.attempts < (task.kind === "PUBLICATION" ? 120 : 4) &&
      (task.kind !== "PUBLICATION" || errorCode === "CONTAINER_PROCESSING")
    ) {
      job.dueAt =
        Date.now() +
        (errorCode === "CONTAINER_PROCESSING"
          ? 5000
          : Math.min(60000, 2000 * 2 ** job.attempts));
      delete job.leasePid;
      delete job.leaseUntil;
      task.status = "QUEUED";
    } else delete task.localJob;
  });
  return true;
}
export async function prepareNewsQueue() {
  await mutateWorkspace(
    "system",
    "THE_MOVE_WORKSPACE_READY",
    "the-move",
    (data) => {
      for (const source of defaultNewsSources())
        if (!data.sources.some((s) => s.url === source.url))
          data.sources.push(source);
    },
  );
  const data = await getWorkspaceData();
  const sources = data.sources.filter((s) => s.enabled);
  if (
    sources.some(
      (s) =>
        !s.lastFetchedAt ||
        Date.now() - Date.parse(s.lastFetchedAt) > 2 * 60 * 60_000,
    ) &&
    !data.tasks.some(
      (t) =>
        t.kind === "NEWS_INGEST" && ["QUEUED", "RUNNING"].includes(t.status),
    )
  )
    await enqueueTask("NEWS_INGEST", {}, "system");
}
