import "dotenv/config";
import { enqueueTask, closeQueue } from "../lib/jobs";
import { getWorkspaceData } from "../lib/data";
import { prisma } from "../lib/prisma";
async function main() {
  const data = await getWorkspaceData();
  if (!data.demo)
    throw new Error(
      "This readiness smoke is for a labeled demo workspace only.",
    );
  for (const kind of ["TOPIC_DEDUP", "WEEKLY_REPORT"] as const) {
    const task = await enqueueTask(kind, {}, data.operators[0].id);
    const deadline = Date.now() + 60000;
    while (true) {
      const current = await getWorkspaceData();
      const observed = current.tasks.find((t) => t.id === task.id);
      if (observed?.status === "FAILED")
        throw new Error(`${kind} failed: ${observed.message}`);
      if (observed?.status === "SUCCEEDED") {
        const states = current.events
          .filter((e) => e.taskId === task.id)
          .map((e) => e.status);
        for (const state of ["QUEUED", "RUNNING", "SUCCEEDED"])
          if (!states.includes(state as never))
            throw new Error("Missing actual task lifecycle state");
        console.log(
          `${kind}: confirmed worker completion, actual lifecycle events, result recorded.`,
        );
        break;
      }
      if (Date.now() > deadline)
        throw new Error(
          "Worker did not complete task before readiness timeout.",
        );
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
}
main()
  .catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeQueue();
    await prisma.$disconnect();
  });
