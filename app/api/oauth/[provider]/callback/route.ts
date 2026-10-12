import { providerFetch } from "@/lib/integrations/transport";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { authorize, endpoint, HttpError } from "@/lib/http";
import { oauthProvider, verifyOAuthState } from "@/lib/oauth";
import { resolvedOAuthConfig } from "@/lib/integration-config";
import { saveIntegrationToken } from "@/lib/credentials";
import { getWorkspaceData, mutateWorkspace } from "@/lib/data";
import { connectTheMoveAccount } from "@/lib/integrations/the-move-account";
import { enqueueTask } from "@/lib/jobs";
import { connectCanvaAccount } from "@/lib/integrations/canva-account";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return endpoint(async () => {
    const user = await authorize();
    if (user.role !== "ADMIN")
      throw new HttpError(403, "FORBIDDEN", "Admin access required.");
    const provider = oauthProvider((await params).provider);
    const jar = await cookies();
    const cookie = jar.get(`move_oauth_${provider}`)?.value;
    jar.delete(`move_oauth_${provider}`);
    const url = new URL(request.url);
    const state = verifyOAuthState(
      cookie,
      url.searchParams.get("state"),
      user.id,
    );
    const config = await resolvedOAuthConfig(provider);
    const code = url.searchParams.get("code");
    if (!code)
      throw new HttpError(
        400,
        "OAUTH_DENIED",
        "Authorization was not granted. Start again in Settings.",
      );
    let r: Response;
    if (provider === "canva")
      r = await providerFetch("https://api.canva.com/rest/v1/oauth/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.secret}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          code_verifier: state.verifier,
          redirect_uri: config.redirectUri,
        }),
        signal: AbortSignal.timeout(20000),
      });
    else
      r = await providerFetch(
        `https://graph.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/oauth/access_token`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.secret,
            redirect_uri: config.redirectUri,
            code,
          }),
          signal: AbortSignal.timeout(20000),
        },
      );
    if (!r.ok)
      throw new HttpError(
        422,
        "TOKEN_EXCHANGE_FAILED",
        `${provider} authorization could not be exchanged. Check app configuration; no token was stored.`,
      );
    const token = await r.json();
    if (typeof token.access_token !== "string")
      throw new HttpError(
        422,
        "INVALID_TOKEN_RESPONSE",
        "Provider did not return an access token.",
      );
    if (provider === "meta") {
      if ((await getWorkspaceData()).demo)
        throw new HttpError(
          409,
          "DEMO_PUBLISH_DISABLED",
          "기본 실행 파일로 실제 운영 공간을 열어 주세요. 예시 모드에는 실제 계정을 연결하지 않습니다.",
        );
      await connectTheMoveAccount(
        user.id,
        undefined,
        token.access_token,
        token.expires_in,
      );
      await enqueueTask("METRICS_SYNC", { channelId: "the-move" }, user.id);
    } else
      await connectCanvaAccount(
        user.id,
        token.access_token,
        token.refresh_token,
        token.expires_in,
      );
    await mutateWorkspace(
      user.id,
      "integration.authorized",
      provider,
      () => {},
    );
    return NextResponse.redirect(
      new URL("/settings?connection=authorized", process.env.APP_URL!),
    );
  });
}
