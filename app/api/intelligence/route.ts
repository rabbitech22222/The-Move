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
    "refresh-news",
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
    if (input.action === "refresh-news") {
      await enqueueTask("NEWS_INGEST", {}, user.id);
      return ok(await getWorkspaceData());
    }
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
          draftCopy: researchBrief(topic),
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
    if (input.action === "research" && process.env.OPENAI_API_KEY) {
      await enqueueTask("AI_DRAFT", { projectId }, user.id);
      return ok(await getWorkspaceData());
    }
    return ok(result);
  });
}

function researchBrief(topic: import("@/lib/domain").Topic) {
  return `조사 준비 — ${topic.title}

원문 출처: ${topic.sourceUrl}
발행일: ${topic.publishedAt || "미확인"}
수집일: ${topic.retrievedAt}
분류: ${topic.category}

편집 방향: 제목이 제기하는 변화의 배경과 THE MOVE 독자에게 미칠 영향을 원문에서 조사합니다.

확인할 사항
- 원문의 날짜, 수치, 인명·기관명과 핵심 주장
- 추가 독립 출처와 기사 재배포 여부
- 제목에 나타난 변화의 실제 범위와 기존 사례
- 사진·영상 사용 권한과 출처 표기

불확실성: ${topic.uncertainClaims.join(" / ")}
이용 권한: ${topic.rights}

[검증한 사실과 근거를 이곳에 정리하세요. 이 조사 준비서는 완성 원고나 사실 확인 결과가 아닙니다.]`;
}
