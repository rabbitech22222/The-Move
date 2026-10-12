import "dotenv/config";
import { Worker, UnrecoverableError } from "bullmq";
import { prisma } from "../lib/prisma";
import {
  QUEUE_NAME,
  closeQueue,
  processTask,
  redisConnection,
  taskProgress,
  registerRecurringJobs,
  type QueuePayload,
} from "../lib/jobs";
import { prepareNewsQueue } from "../lib/local-worker";
import { ServiceError } from "../lib/services/errors";

async function main() {
  await registerRecurringJobs();
  if (process.env.DEMO_MODE !== "true") await prepareNewsQueue();
  const worker = new Worker<QueuePayload>(
    QUEUE_NAME,
    async (job) => {
      const data = { ...job.data, payload: { ...job.data.payload } };
      if (!data.taskId) data.payload.idempotencyKey = `recurring-${job.id}`;
      try {
        return await processTask(data);
      } catch (error) {
        const code =
          error instanceof ServiceError ? error.code : "OPERATION_FAILED";
        if (
          code === "CANVA_PROCESSING" &&
          data.taskId &&
          job.attemptsMade + 1 >= (job.opts.attempts || 1)
        )
          await taskProgress(
            data.taskId,
            data.actorId,
            "FAILED",
            50,
            "Canva 결과 확인의 제한 횟수를 초과했습니다. 새 디자인을 재요청하지 말고 기존 작업 결과를 제작소에서 확인하세요.",
          );
        if (
          [
            "API_OUTCOME_UNKNOWN",
            "RECONCILIATION_REQUIRED",
            "APPROVAL_REQUIRED",
            "DISCONNECTED",
            "SETUP_REQUIRED",
            "TEMPLATE_NOT_APPROVED",
            "CAROUSEL_SETUP_REQUIRED",
            "COPY_OVERFLOW",
            "MISSING_CANVA_FIELD",
            "UNKNOWN_CANVA_FIELD",
            "RESEARCH_REQUIRED",
            "ACCOUNT_REQUIRED",
          ].includes(code) ||
          (data.kind === "PUBLICATION" && code !== "CONTAINER_PROCESSING")
        ) {
          throw new UnrecoverableError(
            error instanceof Error
              ? error.message
              : "This task requires human review.",
          );
        }
        throw error;
      }
    },
    {
      connection: redisConnection(true),
      concurrency: 2,
      limiter: { max: 12, duration: 60_000 },
    },
  );
  worker.on("failed", (job) =>
    process.stdout.write(
      `Task ${job?.id ?? "unknown"} failed; inspect Office for its actionable state.\n`,
    ),
  );
  worker.on("error", () =>
    process.stderr.write(
      "Queue connection error. Check Redis; credentials are never printed.\n",
    ),
  );
  process.stdout.write(
    "THE MOVE OS worker ready. Recurring jobs use Asia/Seoul schedules.\n",
  );
  let closing = false;
  const close = async () => {
    if (closing) return;
    closing = true;
    await worker.close();
    await closeQueue();
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", close);
  process.on("SIGTERM", close);
}
main().catch(() => {
  process.stderr.write(
    "Worker startup failed. Verify Redis, database initialization, and environment configuration.\n",
  );
  process.exitCode = 1;
});
