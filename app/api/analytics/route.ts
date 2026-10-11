import { z } from "zod";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { getWorkspaceData, mutateWorkspace } from "@/lib/data";
import { enqueueTask } from "@/lib/jobs";
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true);
    const input = await body(
      request,
      z.object({
        action: z.enum(["recommend", "approve", "reject", "record-experiment"]),
        recommendationId: z.string().optional(),
        result: z.string().trim().min(10).max(4000).optional(),
      }),
    );
    if (input.action === "recommend") {
      await enqueueTask("WEEKLY_REPORT", {}, user.id);
      return ok(await getWorkspaceData());
    }
    return ok(
      await mutateWorkspace(
        user.id,
        `recommendation.${input.action}`,
        input.recommendationId || "",
        (data) => {
          const recommendation = data.recommendations.find(
            (r) => r.id === input.recommendationId,
          );
          if (!recommendation)
            throw new HttpError(404, "NOT_FOUND", "Recommendation not found.");
          if (input.action === "record-experiment") {
            if (!input.result)
              throw new HttpError(
                400,
                "RESULT_REQUIRED",
                "Record the observed result and limitations.",
              );
            if (recommendation.status !== "APPROVED")
              throw new HttpError(
                409,
                "EXPERIMENT_APPROVAL_REQUIRED",
                "Approve the proposal before recording an experiment.",
              );
            recommendation.experimentResult = input.result;
          } else
            recommendation.status =
              input.action === "approve" ? "APPROVED" : "REJECTED";
        },
      ),
    );
  });
}
