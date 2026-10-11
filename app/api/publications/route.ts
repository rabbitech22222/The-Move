import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { mutateWorkspace, getWorkspaceData } from "@/lib/data";
import {
  assertPublicationApproved,
  publicationFingerprint,
} from "@/lib/services/publishing";
import { validatePublicDestination } from "@/lib/integrations/http";
import { enqueueTask } from "@/lib/jobs";
const schema = z.object({
  action: z.enum(["approve", "schedule", "cancel"]),
  projectId: z.string().optional(),
  publicationId: z.string().optional(),
  scheduledAt: z.iso.datetime().optional(),
  mediaUrl: z.url().optional(),
  caption: z.string().min(1).max(2200).optional(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true),
      input = await body(request, schema);
    let publicationId = "";
    if (input.action === "schedule" || input.action === "approve") {
      if (!input.caption)
        throw new HttpError(
          400,
          "CAPTION_REQUIRED",
          "Provide the final caption before approval.",
        );
      if (!input.mediaUrl)
        throw new HttpError(
          400,
          "MEDIA_REQUIRED",
          "Provide an HTTPS public media URL.",
        );
      await validatePublicDestination(input.mediaUrl);
      if (!input.mediaUrl.startsWith("https://"))
        throw new HttpError(
          400,
          "HTTPS_REQUIRED",
          "Published assets must use HTTPS.",
        );
      if (
        input.action === "schedule" &&
        (!input.scheduledAt ||
          new Date(input.scheduledAt).getTime() <= Date.now())
      )
        throw new HttpError(
          400,
          "FUTURE_DATE_REQUIRED",
          "Choose a future publication time.",
        );
    }
    const result = await mutateWorkspace(
      user.id,
      `publication.${input.action}`,
      input.projectId || input.publicationId || "",
      (data) => {
        if (input.action === "cancel") {
          const publication = data.publications.find(
            (p) => p.id === input.publicationId,
          );
          if (!publication)
            throw new HttpError(404, "NOT_FOUND", "Publication not found.");
          if (publication.status !== "SCHEDULED")
            throw new HttpError(
              409,
              "CANNOT_CANCEL",
              "Only queued schedules can be cancelled.",
            );
          publication.status = "CANCELLED";
          const project = data.projects.find(
            (p) => p.id === publication.projectId,
          );
          if (project) project.stage = "APPROVED";
          return;
        }
        const project = data.projects.find((p) => p.id === input.projectId);
        if (!project)
          throw new HttpError(404, "NOT_FOUND", "Project not found.");
        if (input.action === "approve") {
          if (project.stage !== "APPROVED")
            throw new HttpError(
              409,
              "EDITORIAL_APPROVAL_REQUIRED",
              "Approve editorial content first.",
            );
          if (
            !data.approvals.some(
              (a) =>
                a.projectId === project.id &&
                a.kind === "EDITORIAL" &&
                a.revisionAt === project.updatedAt,
            )
          )
            throw new HttpError(
              409,
              "STALE_APPROVAL",
              "Editorial approval is stale.",
            );
          data.approvals = data.approvals.filter(
            (a) => !(a.projectId === project.id && a.kind === "PUBLICATION"),
          );
          data.approvals.push({
            id: randomUUID(),
            projectId: project.id,
            actorId: user.id,
            kind: "PUBLICATION",
            approvedAt: new Date().toISOString(),
            revisionAt: project.updatedAt,
            payloadHash: publicationFingerprint(
              input.mediaUrl!,
              input.caption || "",
            ),
          });
          return;
        }
        assertPublicationApproved(project, data.approvals);
        if (
          !data.approvals.some(
            (a) =>
              a.projectId === project.id &&
              a.kind === "PUBLICATION" &&
              a.revisionAt === project.updatedAt &&
              a.payloadHash ===
                publicationFingerprint(input.mediaUrl!, input.caption || ""),
          )
        )
          throw new HttpError(
            409,
            "PAYLOAD_CHANGED",
            "The final media or caption changed. Request a new human publication approval.",
          );
        if (data.demo)
          throw new HttpError(
            409,
            "DEMO_PUBLISHING_DISABLED",
            "Demo content cannot be published. Configure a non-demo workspace with an authorized account.",
          );
        const channel = data.channels.find((c) => c.id === project.channelId);
        if (!channel?.connected || !channel.platformAccountId)
          throw new HttpError(
            409,
            "META_DISCONNECTED",
            "Connect and map an authorized Instagram account first.",
          );
        if (
          data.publications.some(
            (p) =>
              p.projectId === project.id &&
              ["SCHEDULED", "RUNNING", "PUBLISHED"].includes(p.status),
          )
        )
          throw new HttpError(
            409,
            "ALREADY_SCHEDULED",
            "This project already has an active or completed publication.",
          );
        if (project.format === "CAROUSEL")
          throw new HttpError(
            422,
            "CAROUSEL_SETUP_REQUIRED",
            "Multi-page publishing requires approved exported images and a child-container workflow. Use the manual export workflow; no single-image carousel substitute is allowed.",
          );
        if (!input.caption)
          throw new HttpError(
            400,
            "CAPTION_REQUIRED",
            "Provide the final caption.",
          );
        publicationId = randomUUID();
        data.publications.push({
          id: publicationId,
          projectId: project.id,
          scheduledAt: input.scheduledAt!,
          status: "SCHEDULED",
          platformPostId: null,
          error: null,
          mediaUrl: input.mediaUrl!,
          caption: input.caption,
        });
        project.stage = "SCHEDULED";
      },
    );
    if (publicationId) {
      try {
        await enqueueTask("PUBLICATION", { publicationId }, user.id);
      } catch (error) {
        await mutateWorkspace(
          user.id,
          "publication.queue-failed",
          publicationId,
          (data) => {
            const publication = data.publications.find(
              (p) => p.id === publicationId,
            )!;
            publication.status = "FAILED";
            publication.error =
              "Redis could not accept the publication schedule. Restore the queue and schedule again; no publishing success is claimed.";
            const project = data.projects.find(
              (p) => p.id === publication.projectId,
            );
            if (project) project.stage = "APPROVED";
          },
        );
        throw error;
      }
    }
    return ok(publicationId ? await getWorkspaceData() : result);
  });
}
