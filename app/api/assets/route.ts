import { randomUUID } from "node:crypto";
import { z } from "zod";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { mutateWorkspace } from "@/lib/data";
import { validatePublicUrl } from "@/lib/integrations/http";
import { invalidateApprovals } from "@/lib/services/projects";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true),
      input = await body(
        request,
        z.discriminatedUnion("action", [
          z.object({
            action: z.literal("add"),
            projectId: z.string(),
            kind: z.enum(["IMAGE", "VIDEO"]),
            url: z.url(),
            credit: z.string().trim().min(1).max(2000),
            width: z.number().int().positive().max(20000).nullable().optional(),
            height: z
              .number()
              .int()
              .positive()
              .max(20000)
              .nullable()
              .optional(),
          }),
          z.object({
            action: z.enum(["approve", "remove"]),
            assetId: z.string(),
          }),
        ]),
      );
    if (input.action === "add") validatePublicUrl(input.url);
    return ok(
      await mutateWorkspace(
        user.id,
        `asset.${input.action}`,
        input.action === "add" ? input.projectId : input.assetId,
        (data) => {
          const asset =
            input.action === "add"
              ? null
              : data.assets.find((a) => a.id === input.assetId);
          const project = data.projects.find(
            (p) =>
              p.id ===
              (input.action === "add" ? input.projectId : asset?.projectId),
          );
          if (!project)
            throw new HttpError(
              404,
              "NOT_FOUND",
              "Project or asset not found.",
            );
          if (["SCHEDULED", "PUBLISHED"].includes(project.stage))
            throw new HttpError(
              409,
              "LOCKED_PROJECT",
              "Cancel the schedule before changing media.",
            );
          if (input.action === "add") {
            if (
              data.assets.some(
                (a) => a.projectId === project.id && a.url === input.url,
              )
            )
              throw new HttpError(
                409,
                "DUPLICATE_ASSET",
                "This media URL is already attached.",
              );
            data.assets.push({
              id: randomUUID(),
              projectId: project.id,
              kind: input.kind,
              url: input.url,
              credit: input.credit,
              width: input.width ?? null,
              height: input.height ?? null,
              approved: false,
              createdAt: new Date().toISOString(),
            });
          } else if (input.action === "approve") {
            asset!.approved = true;
          } else
            data.assets = data.assets.filter((a) => a.id !== input.assetId);
          const now = new Date().toISOString();
          if (project.stage === "APPROVED") project.stage = "REVIEW";
          project.updatedAt = now;
          project.revisions.push({
            at: now,
            actorId: user.id,
            note: `Media asset ${input.action}; externally hosted asset and credit recorded by an operator`,
          });
          invalidateApprovals(data, project.id);
        },
      ),
    );
  });
}
