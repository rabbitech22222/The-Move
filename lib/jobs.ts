import { koreanLabel } from "./korean";
import { isLocalOperation } from "./runtime";
import { createHash, randomUUID } from "node:crypto";
import { Queue, type ConnectionOptions } from "bullmq";
import { getWorkspaceData, mutateWorkspace } from "./data";
import type { AgentName, AgentTask, TaskStatus } from "./domain";
import {
  ingestSource,
  deduplicateTopics,
  generateDraft,
  generateTopicRecommendations,
} from "./services/intelligence";
import { weeklyRecommendations } from "./services/analytics";
import {
  generateCanvaDesign,
  type CanvaGenerationOptions,
} from "./services/canva";
import { syncInstagramMetrics } from "./integrations/meta";
import { publishScheduledPublication } from "./services/publishing";
import { ServiceError, errorMessage } from "./services/errors";

export const jobKinds = [
  "NEWS_INGEST",
  "TOPIC_DEDUP",
  "METRICS_SYNC",
  "PERFORMANCE_SNAPSHOT",
  "AI_DRAFT",
  "AI_RECOMMENDATIONS",
  "WEEKLY_REPORT",
  "CANVA_GENERATE",
  "PUBLICATION",
] as const;
export type JobKind = (typeof jobKinds)[number];
export interface TaskPayload {
  sourceId?: string;
  channelId?: string;
  projectId?: string;
  templateId?: string;
  publicationId?: string;
  idempotencyKey?: string;
  canvaOptions?: CanvaGenerationOptions;
}
export interface QueuePayload {
  kind: JobKind;
  payload: TaskPayload;
  actorId: string;
  taskId?: string;
}
export const QUEUE_NAME = "the-move-os";
const agents: Record<JobKind, AgentName> = {
  NEWS_INGEST: "Scout",
  TOPIC_DEDUP: "Researcher",
  METRICS_SYNC: "Analyst",
  PERFORMANCE_SNAPSHOT: "Analyst",
  AI_DRAFT: "Editor",
  AI_RECOMMENDATIONS: "Scout",
  WEEKLY_REPORT: "Analyst",
  CANVA_GENERATE: "Designer",
  PUBLICATION: "Publisher",
};
let queue: Queue | undefined;

export function redisConnection(worker = false): ConnectionOptions {
  if (!process.env.REDIS_URL)
    throw new ServiceError(
      "REDIS_REQUIRED",
      "Set REDIS_URL and start Redis to enable background automation.",
      409,
    );
  let url: URL;
  try {
    url = new URL(process.env.REDIS_URL);
  } catch {
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "REDIS_URL must be a valid redis:// or rediss:// URL.",
    );
  }
  if (!["redis:", "rediss:"].includes(url.protocol))
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "REDIS_URL must use redis:// or rediss://.",
    );
  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  if (!Number.isInteger(db) || db < 0)
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "The Redis database number is invalid.",
    );
  return {
    host: url.hostname,
    port: Number(url.port || 6379),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: worker ? null : 1,
    connectTimeout: 5000,
    enableOfflineQueue: worker,
  };
}

export function getQueue(): Queue {
  queue ??= new Queue(QUEUE_NAME, { connection: redisConnection() });
  return queue;
}

export async function closeQueue(): Promise<void> {
  if (queue) {
    await queue.close();
    queue = undefined;
  }
}

function assertPayload(kind: JobKind, payload: TaskPayload): void {
  if (!jobKinds.includes(kind))
    throw new ServiceError(
      "INVALID_JOB",
      "This automation job type is not supported.",
    );
  const required: Partial<Record<JobKind, (keyof TaskPayload)[]>> = {
    AI_DRAFT: ["projectId"],
    CANVA_GENERATE: ["projectId", "templateId"],
    PUBLICATION: ["publicationId"],
  };
  for (const key of required[kind] ?? [])
    if (!payload[key])
      throw new ServiceError("INVALID_JOB", `${kind} requires ${key}.`);
  for (const [key, value] of Object.entries(payload)) {
    if (key === "canvaOptions") {
      if (
        kind !== "CANVA_GENERATE" ||
        !value ||
        typeof value !== "object" ||
        JSON.stringify(value).length > 20000
      )
        throw new ServiceError(
          "INVALID_JOB",
          "Canva field mapping must be a bounded generation options object.",
        );
      continue;
    }
    if (
      value !== undefined &&
      (typeof value !== "string" || value.length > 200)
    )
      throw new ServiceError(
        "INVALID_JOB",
        "Job payload IDs must be strings of at most 200 characters.",
      );
  }
}

export async function createTask(
  kind: JobKind,
  payload: TaskPayload,
  actorId: string,
): Promise<AgentTask> {
  assertPayload(kind, payload);
  const data = await getWorkspaceData();
  const id = payload.idempotencyKey
    ? createHash("sha256")
        .update(`${kind}:${payload.idempotencyKey}`)
        .digest("hex")
    : randomUUID();
  const at = new Date().toISOString();
  const task: AgentTask = {
    id,
    agent: agents[kind],
    kind,
    status: "QUEUED",
    progress: 0,
    message: "실제 작업 요청을 대기열에 추가했습니다.",
    createdAt: at,
    updatedAt: at,
    result: null,
    isDemo: data.demo,
  };
  const snapshot = await mutateWorkspace(actorId, "JOB_QUEUED", id, (draft) => {
    if (draft.tasks.some((existing) => existing.id === id)) return;
    draft.tasks.unshift(task);
    draft.events.unshift({
      id: randomUUID(),
      taskId: id,
      at,
      status: "QUEUED",
      message: task.message,
    });
  });
  return snapshot.tasks.find((existing) => existing.id === id)!;
}

export async function taskProgress(
  taskId: string,
  actorId: string,
  status: TaskStatus,
  progress: number,
  message: string,
  result?: unknown,
): Promise<void> {
  await mutateWorkspace(actorId, "JOB_STATE_CHANGED", taskId, (draft) => {
    const task = draft.tasks.find((t) => t.id === taskId);
    if (!task)
      throw new ServiceError(
        "NOT_FOUND",
        "The persisted automation task was not found.",
        404,
      );
    const at = new Date().toISOString();
    Object.assign(task, {
      status,
      progress: Math.max(0, Math.min(100, progress)),
      message,
      updatedAt: at,
      ...(result !== undefined ? { result: JSON.stringify(result) } : {}),
    });
    draft.events.unshift({ id: randomUUID(), taskId, at, status, message });
    // Keep useful recent activity while leaving significant actions in the audit log.
    draft.events = draft.events.slice(0, 1000);
  });
}

export async function enqueueTask(
  kind: JobKind,
  payload: TaskPayload = {},
  actorId = "system",
): Promise<AgentTask> {
  assertPayload(kind, payload);
  const data = await getWorkspaceData();
  if (
    !process.env.REDIS_URL &&
    !isLocalOperation() &&
    !(data.demo && ["TOPIC_DEDUP", "WEEKLY_REPORT"].includes(kind))
  ) {
    throw new ServiceError(
      "REDIS_REQUIRED",
      "Start Redis and configure REDIS_URL. Local demo mode can run source deduplication and weekly analysis directly.",
      409,
    );
  }
  const task = await createTask(kind, payload, actorId);
  if (task.status !== "QUEUED") return task;
  if (isLocalOperation()) {
    const publication =
      kind === "PUBLICATION"
        ? data.publications.find((p) => p.id === payload.publicationId)
        : null;
    await mutateWorkspace(actorId, "LOCAL_JOB_REGISTERED", task.id, (draft) => {
      const target = draft.tasks.find((t) => t.id === task.id)!;
      target.localJob ??= {
        input: { taskId: task.id, kind, payload, actorId },
        dueAt: publication ? Date.parse(publication.scheduledAt) : Date.now(),
        attempts: 0,
      };
    });
    return (await getWorkspaceData()).tasks.find((t) => t.id === task.id)!;
  }
  if (!process.env.REDIS_URL && data.demo) {
    await processTask({ taskId: task.id, kind, payload, actorId });
  } else {
    try {
      const publication =
        kind === "PUBLICATION"
          ? data.publications.find((p) => p.id === payload.publicationId)
          : null;
      const delay = publication
        ? Math.max(0, Date.parse(publication.scheduledAt) - Date.now())
        : 0;
      await getQueue().add(
        kind,
        { taskId: task.id, kind, payload, actorId } satisfies QueuePayload,
        {
          jobId: task.id,
          attempts: kind === "PUBLICATION" ? 120 : 4,
          delay,
          backoff:
            kind === "PUBLICATION"
              ? { type: "fixed", delay: 5000 }
              : { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      );
    } catch {
      await taskProgress(
        task.id,
        actorId,
        "FAILED",
        0,
        "Redis queue submission failed. Start Redis and retry with a new request.",
      );
      throw new ServiceError(
        "QUEUE_UNAVAILABLE",
        "Redis could not accept the job. The failed task is visible in Office.",
        503,
      );
    }
  }
  return (await getWorkspaceData()).tasks.find((t) => t.id === task.id)!;
}

/** Only this function creates RUNNING events; animations reflect these persisted events. */
export async function processTask(input: QueuePayload): Promise<unknown> {
  assertPayload(input.kind, input.payload);
  const task = input.taskId
    ? (await getWorkspaceData()).tasks.find((t) => t.id === input.taskId)
    : await createTask(input.kind, input.payload, input.actorId);
  if (!task)
    throw new ServiceError(
      "NOT_FOUND",
      "The queued application task was not found.",
      404,
    );
  if (task.status === "SUCCEEDED") return task.result;
  const { kind, payload, actorId } = input;
  try {
    await taskProgress(
      task.id,
      actorId,
      "RUNNING",
      10,
      `${koreanLabel(kind)} 작업 실행 중입니다.`,
    );
    let result: unknown;
    switch (kind) {
      case "NEWS_INGEST": {
        const sources = payload.sourceId
          ? [payload.sourceId]
          : (await getWorkspaceData()).sources
              .filter((s) => s.enabled)
              .map((s) => s.id);
        const results = [];
        const failures: { sourceId: string; error: string }[] = [];
        for (const [index, source] of sources.entries()) {
          try {
            results.push(await ingestSource(source, actorId));
          } catch (error) {
            failures.push({ sourceId: source, error: errorMessage(error) });
          }
          await taskProgress(
            task.id,
            actorId,
            "RUNNING",
            10 + Math.floor(((index + 1) / sources.length) * 75),
            `출처 ${sources.length}개 중 ${index + 1}개 점검: 성공 ${results.length}개, 실패 ${failures.length}개.`,
          );
        }
        if (sources.length && !results.length)
          throw new ServiceError(
            "SOURCE_INGEST_FAILED",
            "모든 뉴스 출처 수집에 실패했습니다. 정보 수집 화면의 출처별 오류와 네트워크를 확인하세요.",
            502,
          );
        result = { sources: results, failures };
        break;
      }
      case "TOPIC_DEDUP":
        result = await deduplicateTopics(actorId);
        break;
      case "METRICS_SYNC":
      case "PERFORMANCE_SNAPSHOT": {
        const channels = payload.channelId
          ? [payload.channelId]
          : (await getWorkspaceData()).channels
              .filter((c) => c.id === "the-move" && c.platformAccountId)
              .map((c) => c.id);
        if (!channels.length)
          throw new ServiceError(
            "ACCOUNT_REQUIRED",
            "Configure at least one authorized Instagram professional account for metrics synchronization.",
            409,
          );
        const results = [];
        for (const [index, channel] of channels.entries()) {
          results.push(await syncInstagramMetrics(channel, actorId));
          await taskProgress(
            task.id,
            actorId,
            "RUNNING",
            10 + Math.floor(((index + 1) / channels.length) * 75),
            `인증된 계정 ${channels.length}개 중 ${index + 1}개를 동기화했습니다.`,
          );
        }
        result = { channels: results };
        break;
      }
      case "AI_DRAFT":
        result = await generateDraft(payload.projectId!, actorId);
        break;
      case "AI_RECOMMENDATIONS":
        result = await generateTopicRecommendations(actorId);
        break;
      case "WEEKLY_REPORT":
        result = await weeklyRecommendations(actorId);
        break;
      case "CANVA_GENERATE":
        result = await generateCanvaDesign(
          payload.projectId!,
          payload.templateId!,
          actorId,
          payload.canvaOptions,
        );
        break;
      case "PUBLICATION":
        result = await publishScheduledPublication(
          payload.publicationId!,
          actorId,
        );
        break;
    }
    await taskProgress(
      task.id,
      actorId,
      "SUCCEEDED",
      100,
      "작업을 완료했습니다. 기록된 결과를 확인하세요.",
      result,
    );
    return result;
  } catch (error) {
    const processing =
      error instanceof ServiceError && error.code === "CONTAINER_PROCESSING";
    await taskProgress(
      task.id,
      actorId,
      processing ? "QUEUED" : "FAILED",
      processing ? 50 : task.progress,
      errorMessage(error),
      { code: error instanceof ServiceError ? error.code : "OPERATION_FAILED" },
    );
    throw error;
  }
}

export async function registerRecurringJobs(): Promise<void> {
  const data = await getWorkspaceData();
  const schedule = getQueue();
  const jobs: { id: string; kind: JobKind; pattern: string }[] = [
    { id: "news-ingestion", kind: "NEWS_INGEST", pattern: "0 */2 * * *" },
    { id: "topic-deduplication", kind: "TOPIC_DEDUP", pattern: "10 */2 * * *" },
    { id: "account-metrics", kind: "METRICS_SYNC", pattern: "0 1 * * *" },
    {
      id: "performance-snapshots",
      kind: "PERFORMANCE_SNAPSHOT",
      pattern: "0 13 * * *",
    },
    {
      id: "ai-topic-recommendations",
      kind: "AI_RECOMMENDATIONS",
      pattern: "30 0 * * *",
    },
    { id: "weekly-report", kind: "WEEKLY_REPORT", pattern: "0 0 * * 1" },
  ];
  // DEMO schedules run only genuine local operations; no synthetic provider activity.
  for (const item of jobs.filter(
    (item) =>
      !data.demo || ["TOPIC_DEDUP", "WEEKLY_REPORT"].includes(item.kind),
  )) {
    await schedule.upsertJobScheduler(
      item.id,
      { pattern: item.pattern, tz: "Asia/Seoul" },
      {
        name: item.kind,
        data: {
          kind: item.kind,
          payload: {},
          actorId: "system",
        } satisfies QueuePayload,
        opts: {
          attempts: 4,
          backoff: { type: "exponential", delay: 2000 },
          removeOnComplete: { count: 1000 },
          removeOnFail: { count: 1000 },
        },
      },
    );
  }
}
