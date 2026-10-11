import { createHash, randomUUID } from "node:crypto";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { getIntegrationToken } from "../credentials";
import type { Approval, Project, ScheduledPublication } from "../domain";
import { officialApi, validatePublicDestination } from "../integrations/http";
import { metaApiBase } from "../integrations/meta";
import { ServiceError, errorMessage } from "./errors";

export function publicationFingerprint(
  mediaUrl: string,
  caption: string,
): string {
  return createHash("sha256")
    .update(JSON.stringify({ mediaUrl, caption }))
    .digest("hex");
}

export function assertPublicationApproved(
  project: Project,
  approvals: Approval[],
  publication?: Pick<ScheduledPublication, "mediaUrl" | "caption">,
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
            publicationFingerprint(publication.mediaUrl, publication.caption)),
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
  if (project.format !== "REEL")
    throw new ServiceError(
      "CAROUSEL_SETUP_REQUIRED",
      "Instagram carousels require an approved ordered asset list and child containers. The current single-media scheduler supports reels only; publish carousels manually until that workflow is configured.",
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
  await validatePublicDestination(publication.mediaUrl);
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
          if (current.status !== "SCHEDULED")
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
      const response = await officialApi<{ id: string }>(
        `${base}/${encodeURIComponent(channel.platformAccountId)}/media`,
        {
          token,
          method: "POST",
          body: {
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
