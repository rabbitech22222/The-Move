import { z } from "zod";
import { stages } from "@/lib/domain";
import { authorize, body, endpoint, ok } from "@/lib/http";
import { projectAction } from "@/lib/services/projects";
const schema = z.object({
  action: z.enum(["create", "update", "transition", "approve", "track-time"]),
  projectId: z.string().optional(),
  title: z.string().trim().min(1).max(300).optional(),
  channelId: z.string().optional(),
  operatorId: z.string().optional(),
  format: z.enum(["CAROUSEL", "REEL"]).optional(),
  sourceUrls: z
    .array(
      z
        .url()
        .refine(
          (s) =>
            ["http:", "https:"].includes(new URL(s).protocol) &&
            !new URL(s).username &&
            !new URL(s).password,
        ),
    )
    .max(20)
    .optional(),
  draftCopy: z.string().max(30000).optional(),
  dueAt: z.iso.datetime().nullable().optional(),
  stage: z.enum(stages).optional(),
  minutes: z.number().int().positive().max(1440).optional(),
});
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true);
    return ok(await projectAction(user.id, await body(request, schema)));
  });
}
