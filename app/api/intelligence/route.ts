import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { getWorkspaceData, mutateWorkspace } from "@/lib/data";
import { enqueueTask } from "@/lib/jobs";
import { validatePublicUrl } from "@/lib/integrations/http";
const schema = z.object({
  action: z.enum([
    "save",
    "dismiss",
    "research",
    "create-project",
    "add-source",
    "ingest",
  ]),
  topicId: z.string().optional(),
  sourceId: z.string().optional(),
  format: z.enum(["CAROUSEL", "REEL"]).optional(),
  source: z
    .object({
      name: z.string().trim().min(1).max(200),
      url: z.url(),
      rights: z.string().trim().min(1).max(2000),
      type: z.enum(["RSS", "MANUAL"]).default("RSS"),
    })
    .optional(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true),
      input = await body(request, schema);
    if (input.action === "ingest") {
      if (!input.sourceId)
        throw new HttpError(400, "SOURCE_REQUIRED", "Select a source.");
      await enqueueTask("NEWS_INGEST", { sourceId: input.sourceId }, user.id);
      return ok(await getWorkspaceData());
    }
    let projectId = "";
    const result = await mutateWorkspace(
      user.id,
      `intelligence.${input.action}`,
      input.topicId || input.sourceId || "new",
      (data) => {
        if (input.action === "add-source") {
          if (!input.source)
            throw new HttpError(
              400,
              "SOURCE_REQUIRED",
              "Provide source details and rights.",
            );
          validatePublicUrl(input.source.url);
          if (data.sources.some((s) => s.url === input.source!.url))
            throw new HttpError(
              409,
              "DUPLICATE_SOURCE",
              "This source is already registered.",
            );
          data.sources.push({
            id: randomUUID(),
            ...input.source,
            enabled: true,
            lastFetchedAt: null,
            lastError: null,
          });
          return;
        }
        const topic = data.topics.find((t) => t.id === input.topicId);
        if (!topic) throw new HttpError(404, "NOT_FOUND", "Topic not found.");
        if (input.action === "save" || input.action === "dismiss") {
          topic.status = input.action === "save" ? "SAVED" : "DISMISSED";
          return;
        }
        const now = new Date().toISOString();
        projectId = randomUUID();
        data.projects.unshift({
          id: projectId,
          title: topic.title,
          channelId: topic.recommendedChannelId,
          operatorId: user.id,
          stage: "RESEARCH",
          format: input.format || topic.format,
          draftCopy: "",
          sourceUrls: [topic.sourceUrl],
          dueAt: null,
          productionMinutes: 0,
          revisions: [
            {
              at: now,
              actorId: user.id,
              note: `Created from intelligence topic ${topic.id}`,
            },
          ],
          updatedAt: now,
        });
        topic.status = "SAVED";
      },
    );
    if (input.action === "research") {
      await enqueueTask("AI_DRAFT", { projectId }, user.id);
      return ok(await getWorkspaceData());
    }
    return ok(result);
  });
}
