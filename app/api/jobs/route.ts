import { z } from "zod";
import { authorize, body, endpoint, ok } from "@/lib/http";
import { getWorkspaceData } from "@/lib/data";
import { enqueueTask } from "@/lib/jobs";
const schema = z.object({
  kind: z.enum([
    "NEWS_INGEST",
    "TOPIC_DEDUP",
    "METRICS_SYNC",
    "PERFORMANCE_SNAPSHOT",
    "AI_DRAFT",
    "AI_RECOMMENDATIONS",
    "WEEKLY_REPORT",
    "CANVA_GENERATE",
  ]),
  sourceId: z.string().optional(),
  channelId: z.string().optional(),
  projectId: z.string().optional(),
  templateId: z.string().optional(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true);
    const { kind, ...payload } = await body(request, schema);
    await enqueueTask(kind, payload, user.id);
    return ok(await getWorkspaceData());
  });
}
