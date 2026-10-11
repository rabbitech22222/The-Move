import { randomUUID } from "node:crypto";
import { mutateWorkspace } from "@/lib/data";
import { HttpError } from "@/lib/http";
import {
  stages,
  type Stage,
  type Project,
  type WorkspaceData,
} from "@/lib/domain";
export function validateTransition(project: Project, next: Stage) {
  if (next === "PUBLISHED" || next === "SCHEDULED")
    throw new HttpError(
      409,
      "CONTROLLED_STAGE",
      "Schedule through the publishing workflow. Published status requires a confirmed platform response.",
    );
  if (next === "APPROVED")
    throw new HttpError(
      409,
      "APPROVAL_REQUIRED",
      "Use the human approval action from Review.",
    );
  if (project.stage === "PUBLISHED" || project.stage === "SCHEDULED")
    throw new HttpError(
      409,
      "LOCKED_PROJECT",
      "Published or scheduled content cannot be edited here. Cancel its schedule first.",
    );
  const before = stages.indexOf(project.stage),
    after = stages.indexOf(next);
  if (after > before + 1)
    throw new HttpError(
      409,
      "INVALID_TRANSITION",
      "Complete the preceding editorial stage first.",
    );
}
export function invalidateApprovals(data: WorkspaceData, projectId: string) {
  data.approvals = data.approvals.filter((a) => a.projectId !== projectId);
}
export function assertReadyForReview(project: Project) {
  if (!project.draftCopy.trim() || !project.sourceUrls.length)
    throw new HttpError(
      409,
      "RESEARCH_REQUIRED",
      "A sourced draft is required before approval.",
    );
}
export async function projectAction(
  actorId: string,
  input: {
    action: string;
    projectId?: string;
    title?: string;
    channelId?: string;
    operatorId?: string;
    format?: "CAROUSEL" | "REEL";
    sourceUrls?: string[];
    draftCopy?: string;
    dueAt?: string | null;
    stage?: Stage;
    minutes?: number;
  },
) {
  return mutateWorkspace(
    actorId,
    `project.${input.action}`,
    input.projectId || "new",
    (data) => {
      const now = new Date().toISOString();
      if (input.action === "create") {
        if (
          !input.title?.trim() ||
          !data.channels.some((c) => c.id === input.channelId) ||
          !data.operators.some((o) => o.id === input.operatorId)
        )
          throw new HttpError(
            400,
            "INVALID_PROJECT",
            "Choose a title, channel and operator.",
          );
        data.projects.unshift({
          id: randomUUID(),
          title: input.title.trim(),
          channelId: input.channelId!,
          operatorId: input.operatorId!,
          stage: "IDEA",
          format: input.format || "CAROUSEL",
          sourceUrls: input.sourceUrls || [],
          draftCopy: input.draftCopy || "",
          dueAt: input.dueAt || null,
          productionMinutes: 0,
          revisions: [{ at: now, actorId, note: "Created project" }],
          updatedAt: now,
        });
        return;
      }
      const project = data.projects.find((p) => p.id === input.projectId);
      if (!project) throw new HttpError(404, "NOT_FOUND", "Project not found.");
      if (input.action === "approve") {
        if (project.stage !== "REVIEW")
          throw new HttpError(
            409,
            "NOT_IN_REVIEW",
            "Only projects in Review can be approved.",
          );
        assertReadyForReview(project);
        if (data.assets.some((a) => a.projectId === project.id && !a.approved))
          throw new HttpError(
            409,
            "ASSET_APPROVAL_REQUIRED",
            "Review and approve every attached media asset before approving the project.",
          );
        project.stage = "APPROVED";
        project.updatedAt = now;
        data.approvals.push({
          id: randomUUID(),
          projectId: project.id,
          actorId,
          kind: "EDITORIAL",
          approvedAt: now,
          revisionAt: now,
        });
      } else if (input.action === "transition") {
        if (!input.stage)
          throw new HttpError(400, "STAGE_REQUIRED", "Choose a stage.");
        validateTransition(project, input.stage);
        project.stage = input.stage;
        invalidateApprovals(data, project.id);
        project.updatedAt = now;
      } else if (input.action === "update") {
        if (project.stage === "PUBLISHED" || project.stage === "SCHEDULED")
          throw new HttpError(
            409,
            "LOCKED_PROJECT",
            "Cancel scheduling before editing.",
          );
        if (
          input.channelId &&
          !data.channels.some((c) => c.id === input.channelId)
        )
          throw new HttpError(400, "INVALID_CHANNEL", "Unknown channel.");
        if (
          input.operatorId &&
          !data.operators.some((o) => o.id === input.operatorId)
        )
          throw new HttpError(400, "INVALID_OPERATOR", "Unknown operator.");
        for (const key of [
          "title",
          "channelId",
          "operatorId",
          "format",
          "sourceUrls",
          "draftCopy",
          "dueAt",
        ] as const) {
          if (input[key] !== undefined)
            Object.assign(project, { [key]: input[key] });
        }
        if (project.stage === "APPROVED") project.stage = "REVIEW";
        invalidateApprovals(data, project.id);
        project.updatedAt = now;
      } else if (input.action === "track-time") {
        project.productionMinutes += input.minutes || 0;
        // Tracking time does not change the content revision or invalidate a content approval.
      } else
        throw new HttpError(400, "INVALID_ACTION", "Unknown project action.");
      project.revisions.push({
        at: now,
        actorId,
        note:
          input.action === "track-time"
            ? `Recorded ${input.minutes} production minutes`
            : input.action === "transition"
              ? `Moved to ${input.stage}`
              : input.action,
      });
    },
  );
}
