import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { getWorkspaceData, mutateWorkspace } from "@/lib/data";
import { credentialStatus } from "@/lib/credentials";
export async function GET() {
  return endpoint(async () => {
    const user = await authorize();
    const data = await getWorkspaceData();
    const [canva, meta] = await Promise.all([
      credentialStatus("canva"),
      credentialStatus("meta"),
    ]);
    const state = (configured: boolean, details: string, expired = false) => ({
      configured,
      status: expired
        ? "Expired"
        : configured
          ? "Configured · unverified"
          : "Disconnected",
      details,
    });
    return ok({
      demo: data.demo,
      canManageIntegrations: user.role === "ADMIN",
      operators: data.operators,
      integrations: {
        openai: state(
          !!process.env.OPENAI_API_KEY,
          "AI is optional. Successful provider execution is required before results appear.",
        ),
        canva: {
          ...state(
            canva.configured,
            "OAuth and eligible brand-template datasets are required. Existing designs are preserved.",
            canva.expired,
          ),
          oauthReady: !!(
            process.env.CANVA_CLIENT_ID &&
            process.env.CANVA_CLIENT_SECRET &&
            process.env.APP_URL &&
            process.env.TOKEN_ENCRYPTION_KEY
          ),
        },
        meta: {
          ...state(
            meta.configured,
            "An authorized professional account, app review and account mapping are required.",
            meta.expired,
          ),
          oauthReady: !!(
            process.env.META_APP_ID &&
            process.env.META_APP_SECRET &&
            process.env.APP_URL &&
            process.env.TOKEN_ENCRYPTION_KEY
          ),
        },
        redis: state(
          !!process.env.REDIS_URL,
          "Connection settings exist only; actual jobs and worker results verify readiness.",
        ),
      },
    });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    const user = await authorize(request, true);
    const input = await body(
      request,
      z.discriminatedUnion("action", [
        z.object({
          action: z.literal("create-channel"),
          name: z.string().trim().min(1).max(100),
          handle: z.string().trim().min(1).max(100),
          guidelines: z.string().trim().min(10).max(10000),
        }),
        z.object({
          action: z.literal("guidelines"),
          channelId: z.string(),
          guidelines: z.string().trim().min(10).max(10000),
        }),
        z.object({
          action: z.literal("connect-meta-account"),
          channelId: z.string(),
          accountId: z.string().regex(/^\d+$/),
        }),
      ]),
    );
    if (user.role !== "ADMIN")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only an admin can change editorial rules and account mappings.",
      );
    if (input.action === "connect-meta-account") {
      const { getIntegrationToken } = await import("@/lib/credentials");
      const token = await getIntegrationToken("meta");
      if (!token)
        throw new HttpError(422, "META_DISCONNECTED", "Connect Meta first.");
      const { officialApi } = await import("@/lib/integrations/http");
      const { metaApiBase } = await import("@/lib/integrations/meta");
      await officialApi(
        `${metaApiBase()}/${input.accountId}?fields=id,username`,
        { token },
      );
    }
    if (input.action === "create-channel")
      return ok(
        await mutateWorkspace(user.id, "channel.create", "new", (data) => {
          if (
            data.channels.some(
              (c) =>
                c.name.toLowerCase() === input.name.toLowerCase() ||
                c.handle.toLowerCase() === input.handle.toLowerCase(),
            )
          )
            throw new HttpError(
              409,
              "DUPLICATE_CHANNEL",
              "This channel name or handle is already registered.",
            );
          data.channels.push({
            id: randomUUID(),
            name: input.name,
            handle: input.handle,
            accent: "#d65b4f",
            connected: false,
            guidelines: input.guidelines,
            guidelineVersion: 1,
          });
        }),
      );
    return ok(
      await mutateWorkspace(
        user.id,
        `settings.${input.action}`,
        input.channelId,
        (data) => {
          const channel = data.channels.find((c) => c.id === input.channelId);
          if (!channel)
            throw new HttpError(404, "NOT_FOUND", "Channel not found.");
          if (input.action === "guidelines") {
            channel.guidelineHistory ??= [
              {
                version: channel.guidelineVersion,
                guidelines: channel.guidelines,
                changedAt: null,
              },
            ];
            channel.guidelines = input.guidelines;
            channel.guidelineVersion++;
            channel.guidelineHistory.push({
              version: channel.guidelineVersion,
              guidelines: channel.guidelines,
              changedAt: new Date().toISOString(),
            });
          } else {
            channel.platformAccountId = input.accountId;
            channel.connected = true;
          }
        },
      ),
    );
  });
}
