import { createHash, randomUUID } from "node:crypto";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { getIntegrationToken } from "../credentials";
import type { Approval, Project, ScheduledPublication } from "../domain";
import { officialApi, validatePublicDestination } from "../integrations/http";
import { metaApiBase } from "../integrations/meta";
import { verifyTheMoveAccount } from "../integrations/the-move-account";
import { ServiceError, errorMessage } from "./errors";

export function publicationFingerprint(
  mediaUrl: string,
  caption: string,
  mediaUrls?: string[],
): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        mediaUrls?.length
          ? { mediaUrl, caption, mediaUrls }
          : { mediaUrl, caption },
      ),
    )
    .digest("hex");
}

export function assertPublicationApproved(
  project: Project,
  approvals: Approval[],
  publication?: Pick<
    ScheduledPublication,
    "mediaUrl" | "caption" | "mediaUrls"
  >,
): void {
  if (!["APPROVED", "SCHEDULED"].includes(project.stage))
    throw new ServiceError(
      "APPROVAL_REQUIRED",
      "The editorial project must be approved before publishing.",
      409,
    );
  if (
    !approvals.some(
      (a) =>
        a.projectId === project.id &&
        a.kind === "EDITORIAL" &&
        a.actorId !== "system" &&
        a.revisionAt === project.updatedAt,
    )
  ) {
    throw new ServiceError(
      "APPROVAL_REQUIRED",
      "Human editorial approval for the current project revision is required.",
      409,
    );
  }
  if (
    !approvals.some(
      (a) =>
        a.projectId === project.id &&
        a.kind === "PUBLICATION" &&
        a.actorId !== "system" &&
        a.revisionAt === project.updatedAt &&
        (!publication ||
          a.payloadHash ===
            publicationFingerprint(
              publication.mediaUrl,
              publication.caption,
              publication.mediaUrls,
            )),
    )
  ) {
    throw new ServiceError(
      "APPROVAL_REQUIRED",
      "An explicit human publication approval for the current project revision is required.",
      409,
    );
  }
  if (!project.sourceUrls.length || !project.draftCopy.trim())
    throw new ServiceError(
      "RESEARCH_REQUIRED",
      "Publishing requires researched sources and a nonempty reviewed draft.",
    );
}

/** Resumes known containers safely; an ambiguous publish request is never repeated automatically. */
export async function publishScheduledPublication(
  publicationId: string,
  actorId: string,
): Promise<ScheduledPublication> {
  const data = await getWorkspaceData();
  if (data.demo)
    throw new ServiceError(
      "DEMO_PUBLICATION_DISABLED",
      "Demo mode does not publish real Instagram media. Switch to a separately initialized live workspace and authorize the account first.",
      409,
    );
  const publication = data.publications.find((p) => p.id === publicationId);
  if (!publication)
    throw new ServiceError(
      "NOT_FOUND",
      "The scheduled publication was not found.",
      404,
    );
  if (publication.status === "PUBLISHED") return publication;
  if (!["SCHEDULED", "RUNNING"].includes(publication.status))
    throw new ServiceError(
      "PUBLICATION_NOT_SCHEDULED",
      "This publication requires a newly reviewed schedule before another attempt.",
      409,
    );
  const project = data.projects.find((p) => p.id === publication.projectId);
  if (!project)
    throw new ServiceError(
      "NOT_FOUND",
      "The publication project was not found.",
      404,
    );
  assertPublicationApproved(project, data.approvals, publication);
  if (new Date(publication.scheduledAt).getTime() > Date.now())
    throw new ServiceError(
      "NOT_DUE",
      "The approved scheduled publication is not due yet.",
      409,
    );
  const channel = data.channels.find((c) => c.id === project.channelId);
  if (!channel?.platformAccountId)
    throw new ServiceError(
      "ACCOUNT_REQUIRED",
      "Configure the authorized Instagram professional account ID.",
      409,
    );
  const token = await getIntegrationToken("meta");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Connect Meta with authorized Instagram content-publishing permissions.",
      409,
    );
  if (channel.id !== "the-move")
    throw new ServiceError(
      "ACCOUNT_SCOPE",
      "현재 게시 대상은 @themovemag_뿐입니다.",
      409,
    );
  // Identity is checked immediately before a provider submission, including resumed jobs.
  await verifyTheMoveAccount(channel.platformAccountId, token);
  const mediaUrls =
    project.format === "CAROUSEL"
      ? (publication.mediaUrls ?? [])
      : [publication.mediaUrl];
  if (
    project.format === "CAROUSEL" &&
    (mediaUrls.length < 2 ||
      mediaUrls.length > 10 ||
      new Set(mediaUrls).size !== mediaUrls.length)
  )
    throw new ServiceError(
      "CAROUSEL_MEDIA_REQUIRED",
      "캐러셀에는 순서가 정해진 서로 다른 이미지 주소 2~10개가 필요합니다.",
      409,
    );
  for (const url of mediaUrls) {
    if (!url.startsWith("https://"))
      throw new ServiceError(
        "HTTPS_REQUIRED",
        "게시 미디어는 공개 HTTPS 주소여야 합니다.",
      );
    await validatePublicDestination(url);
  }
  const existingContainer = data.audit.find(
    (a) =>
      a.entityId === publicationId &&
      a.action === "INSTAGRAM_CONTAINER_CREATED",
  )?.details;
  if (
    data.audit.some(
      (a) =>
        a.entityId === publicationId &&
        a.action === "INSTAGRAM_PUBLISH_REQUESTED",
    )
  ) {
    throw new ServiceError(
      "RECONCILIATION_REQUIRED",
      "A publish request has already been sent. Check the Instagram account and reconcile its post ID; automatic retries are blocked to prevent duplicates.",
      409,
    );
  }
  let containerId = existingContainer;
  const base = metaApiBase();
  try {
    if (!containerId) {
      await mutateWorkspace(
        actorId,
        "INSTAGRAM_CONTAINER_REQUESTED",
        publicationId,
        (draft) => {
          const current = draft.publications.find(
            (p) => p.id === publicationId,
          )!;
          if (
            current.status !== "SCHEDULED" &&
            !(
              project.format === "CAROUSEL" &&
              current.status === "RUNNING" &&
              draft.audit.some(
                (a) =>
                  a.entityId.startsWith(`${publicationId}:child:`) &&
                  a.action === "INSTAGRAM_CHILD_CREATED",
              )
            )
          )
            throw new ServiceError(
              "RECONCILIATION_REQUIRED",
              "A container request is already pending. Reconcile the provider result before retrying.",
              409,
            );
          const currentProject = draft.projects.find(
            (p) => p.id === current.projectId,
          )!;
          assertPublicationApproved(currentProject, draft.approvals, current);
          current.status = "RUNNING";
          current.error = null;
        },
      );
      let children: string[] = [];
      if (project.format === "CAROUSEL") {
        // Known child IDs are persisted one at a time; a pending child submission is never silently repeated.
        for (let index = 0; index < mediaUrls.length; index++) {
          const latest = await getWorkspaceData();
          const entityId = `${publicationId}:child:${index}`;
          const recorded = latest.audit.find(
            (a) =>
              a.entityId === entityId && a.action === "INSTAGRAM_CHILD_CREATED",
          );
          let id = recorded?.details;
          if (!id) {
            if (
              latest.audit.some(
                (a) =>
                  a.entityId === entityId &&
                  a.action === "INSTAGRAM_CHILD_REQUESTED",
              )
            )
              throw new ServiceError(
                "RECONCILIATION_REQUIRED",
                "이미지 컨테이너 요청 결과가 불명확합니다. Meta 결과를 대조한 뒤 다시 승인하세요.",
                409,
              );
            await mutateWorkspace(
              actorId,
              "INSTAGRAM_CHILD_RESERVED",
              entityId,
              (draft) => {
                if (
                  draft.audit.some(
                    (a) =>
                      a.entityId === entityId &&
                      a.action === "INSTAGRAM_CHILD_REQUESTED",
                  )
                )
                  throw new ServiceError(
                    "RECONCILIATION_REQUIRED",
                    "이미지 요청이 이미 진행 중입니다.",
                    409,
                  );
                draft.audit.push({
                  id: randomUUID(),
                  actorId,
                  entityId,
                  action: "INSTAGRAM_CHILD_REQUESTED",
                  at: new Date().toISOString(),
                  details: `Image ${index + 1}`,
                });
              },
            );
            const child = await officialApi<{ id: string }>(
              `${base}/${encodeURIComponent(channel.platformAccountId)}/media`,
              {
                token,
                method: "POST",
                body: { image_url: mediaUrls[index], is_carousel_item: true },
              },
            );
            if (!child.id)
              throw new ServiceError(
                "API_OUTCOME_UNKNOWN",
                "Meta 이미지 컨테이너 ID를 받지 못했습니다.",
                502,
              );
            id = child.id;
            await mutateWorkspace(
              actorId,
              "INSTAGRAM_CHILD_RECORDED",
              entityId,
              (draft) => {
                draft.audit.push({
                  id: randomUUID(),
                  actorId,
                  entityId,
                  action: "INSTAGRAM_CHILD_CREATED",
                  at: new Date().toISOString(),
                  details: child.id,
                });
              },
            );
          }
          const state = await officialApi<{ status_code?: string }>(
            `${base}/${encodeURIComponent(id)}?fields=status_code`,
            { token },
          );
          if (["ERROR", "EXPIRED"].includes(state.status_code ?? ""))
            throw new ServiceError(
              "CONTAINER_FAILED",
              "캐러셀 이미지 처리에 실패했습니다. 이미지 규격과 주소를 확인하세요.",
            );
          if (state.status_code !== "FINISHED")
            throw new ServiceError(
              "CONTAINER_PROCESSING",
              "Meta에서 이미지를 처리 중입니다. 기존 컨테이너를 다시 확인합니다.",
              409,
            );
          children.push(id);
        }
        const latest = await getWorkspaceData();
        if (
          latest.audit.some(
            (a) =>
              a.entityId === publicationId &&
              a.action === "INSTAGRAM_PARENT_REQUESTED",
          )
        )
          throw new ServiceError(
            "RECONCILIATION_REQUIRED",
            "캐러셀 컨테이너 요청이 이미 전달되었습니다. Meta 결과를 확인하세요.",
            409,
          );
        await mutateWorkspace(
          actorId,
          "INSTAGRAM_PARENT_RESERVED",
          publicationId,
          (draft) => {
            if (
              draft.audit.some(
                (a) =>
                  a.entityId === publicationId &&
                  a.action === "INSTAGRAM_PARENT_REQUESTED",
              )
            )
              throw new ServiceError(
                "RECONCILIATION_REQUIRED",
                "캐러셀 요청이 이미 진행 중입니다.",
                409,
              );
            draft.audit.push({
              id: randomUUID(),
              actorId,
              action: "INSTAGRAM_PARENT_REQUESTED",
              entityId: publicationId,
              at: new Date().toISOString(),
              details: "Ordered carousel children reserved",
            });
          },
        );
      }
      const response = await officialApi<{ id: string }>(
        `${base}/${encodeURIComponent(channel.platformAccountId)}/media`,
        {
          token,
          method: "POST",
          body:
            project.format === "CAROUSEL"
              ? {
                  media_type: "CAROUSEL",
                  children,
                  caption: publication.caption,
                }
              : {
                  media_type: "REELS",
                  video_url: publication.mediaUrl,
                  caption: publication.caption,
                  share_to_feed: true,
                },
        },
      );
      if (!response.id)
        throw new ServiceError(
          "API_OUTCOME_UNKNOWN",
          "Meta did not return a container ID. Reconcile the provider result before retrying.",
          502,
        );
      containerId = response.id;
      await mutateWorkspace(
        actorId,
        "INSTAGRAM_CONTAINER_RECORDED",
        publicationId,
        (draft) => {
          draft.audit.push({
            id: randomUUID(),
            actorId,
            action: "INSTAGRAM_CONTAINER_CREATED",
            entityId: publicationId,
            at: new Date().toISOString(),
            details: response.id,
          });
        },
      );
    }
    const container = await officialApi<{ status_code?: string }>(
      `${base}/${encodeURIComponent(containerId)}?fields=status_code`,
      { token },
    );
    if (
      container.status_code === "ERROR" ||
      container.status_code === "EXPIRED"
    )
      throw new ServiceError(
        "CONTAINER_FAILED",
        `Meta media container is ${container.status_code.toLowerCase()}. Review the media requirements before a new approved attempt.`,
      );
    if (container.status_code !== "FINISHED")
      throw new ServiceError(
        "CONTAINER_PROCESSING",
        "Meta is processing the media container. The worker can safely poll this existing container; no publish success has been recorded.",
        409,
      );
    await mutateWorkspace(
      actorId,
      "INSTAGRAM_PUBLICATION_RESERVED",
      publicationId,
      (draft) => {
        const current = draft.publications.find((p) => p.id === publicationId)!;
        const currentProject = draft.projects.find(
          (p) => p.id === current.projectId,
        )!;
        assertPublicationApproved(currentProject, draft.approvals, current);
        if (
          draft.audit.some(
            (a) =>
              a.entityId === publicationId &&
              a.action === "INSTAGRAM_PUBLISH_REQUESTED",
          )
        )
          throw new ServiceError(
            "RECONCILIATION_REQUIRED",
            "Another publish submission has already been reserved.",
            409,
          );
        if (current.status !== "RUNNING")
          throw new ServiceError(
            "PUBLICATION_CANCELLED",
            "Publication state changed; the provider publish request was stopped.",
            409,
          );
        draft.audit.push({
          id: randomUUID(),
          actorId,
          action: "INSTAGRAM_PUBLISH_REQUESTED",
          entityId: publicationId,
          at: new Date().toISOString(),
          details: `Approved revision ${currentProject.updatedAt}; container ${containerId}`,
        });
      },
    );
    const published = await officialApi<{ id: string }>(
      `${base}/${encodeURIComponent(channel.platformAccountId)}/media_publish`,
      {
        token,
        method: "POST",
        body: { creation_id: containerId },
      },
    );
    if (!published.id)
      throw new ServiceError(
        "API_OUTCOME_UNKNOWN",
        "Meta did not return a published post ID. Reconcile the account before any retry.",
        502,
      );
    const snapshot = await mutateWorkspace(
      actorId,
      "INSTAGRAM_PUBLICATION_CONFIRMED",
      publicationId,
      (draft) => {
        const target = draft.publications.find((p) => p.id === publicationId)!;
        target.status = "PUBLISHED";
        target.platformPostId = published.id;
        target.error = null;
        const currentProject = draft.projects.find((p) => p.id === project.id)!;
        currentProject.stage = "PUBLISHED";
        currentProject.updatedAt = new Date().toISOString();
        currentProject.revisions.push({
          at: currentProject.updatedAt,
          actorId,
          note: `Instagram confirmed publication ${published.id}.`,
        });
        if (!draft.posts.some((p) => p.id === `meta-${published.id}`))
          draft.posts.push({
            id: `meta-${published.id}`,
            channelId: project.channelId,
            title: project.title,
            format: project.format,
            category: "Uncategorized",
            publishedAt: currentProject.updatedAt,
            permalink: null,
            source: "META",
          });
      },
    );
    return snapshot.publications.find((p) => p.id === publicationId)!;
  } catch (error) {
    if (error instanceof ServiceError && error.code === "CONTAINER_PROCESSING")
      throw error;
    const latest = await getWorkspaceData();
    const uncertain =
      (error instanceof ServiceError &&
        ["API_OUTCOME_UNKNOWN", "RECONCILIATION_REQUIRED"].includes(
          error.code,
        )) ||
      latest.audit.some(
        (a) =>
          a.entityId === publicationId &&
          a.action === "INSTAGRAM_PUBLISH_REQUESTED",
      );
    await mutateWorkspace(
      actorId,
      "INSTAGRAM_PUBLICATION_FAILED",
      publicationId,
      (draft) => {
        const target = draft.publications.find((p) => p.id === publicationId)!;
        if (target.status !== "PUBLISHED") {
          target.status = uncertain ? "RUNNING" : "FAILED";
          target.error = errorMessage(error);
        }
      },
    );
    throw error;
  }
}
