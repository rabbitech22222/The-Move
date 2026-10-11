import { z } from "zod";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { getWorkspaceData } from "@/lib/data";
import {
  inspectCanvaTemplate,
  refreshCanvaDesign,
  registerManualDesign,
} from "@/lib/services/canva";
import { enqueueTask } from "@/lib/jobs";
const schema = z.object({
  action: z.enum(["inspect", "generate", "refresh", "register-manual"]),
  templateId: z.string().optional(),
  projectId: z.string().optional(),
  designId: z.string().optional(),
  editUrl: z.url().optional(),
  pageCount: z.number().int().min(1).max(30).optional(),
  preservedLayout: z.boolean().optional(),
  fields: z
    .record(
      z.string().min(1).max(100),
      z.discriminatedUnion("type", [
        z.object({ type: z.literal("text"), text: z.string().min(1).max(900) }),
        z.object({
          type: z.literal("image"),
          asset_id: z.string().regex(/^[A-Za-z0-9_-]{1,200}$/),
        }),
      ]),
    )
    .optional(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true),
      input = await body(request, schema);
    if (input.action === "register-manual") {
      if (
        !input.projectId ||
        !input.templateId ||
        !input.editUrl ||
        !input.pageCount ||
        input.preservedLayout !== true
      )
        throw new HttpError(
          400,
          "MANUAL_INPUT_REQUIRED",
          "Choose a project/reference and provide the new editable link, actual page count and layout confirmation.",
        );
      await registerManualDesign(
        input.projectId,
        input.templateId,
        {
          editUrl: input.editUrl,
          pageCount: input.pageCount,
          preservedLayout: true,
        },
        user.id,
      );
    } else if (input.action === "inspect") {
      if (!input.templateId)
        throw new HttpError(400, "TEMPLATE_REQUIRED", "Choose a template.");
      await inspectCanvaTemplate(input.templateId, user.id);
    } else if (input.action === "refresh") {
      if (!input.designId)
        throw new HttpError(
          400,
          "DESIGN_REQUIRED",
          "Select a generated design.",
        );
      await refreshCanvaDesign(input.designId, user.id);
    } else {
      if (!input.projectId || !input.templateId)
        throw new HttpError(
          400,
          "PROJECT_REQUIRED",
          "Choose a researched project and template.",
        );
      await enqueueTask(
        "CANVA_GENERATE",
        {
          projectId: input.projectId,
          templateId: input.templateId,
          canvaOptions: { fields: input.fields, pageCount: input.pageCount },
        },
        user.id,
      );
    }
    return ok(await getWorkspaceData());
  });
}
