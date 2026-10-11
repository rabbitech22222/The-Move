import {
  createHmac,
  randomBytes,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { sessionSecret } from "@/lib/auth";
export type OAuthProvider = "canva" | "meta";
export function oauthProvider(value: string): OAuthProvider {
  if (value === "canva" || value === "meta") return value;
  throw new Error("Unknown OAuth provider");
}
export function oauthConfig(provider: OAuthProvider) {
  const clientId =
    process.env[provider === "canva" ? "CANVA_CLIENT_ID" : "META_APP_ID"];
  const secret =
    process.env[
      provider === "canva" ? "CANVA_CLIENT_SECRET" : "META_APP_SECRET"
    ];
  const appUrl = process.env.APP_URL;
  if (!clientId || !secret || !appUrl)
    throw new Error(
      `Configure ${provider} client credentials and APP_URL securely in the environment first.`,
    );
  return {
    clientId,
    secret,
    redirectUri: `${appUrl}/api/oauth/${provider}/callback`,
  };
}
export function createOAuthState(userId: string) {
  const value = {
    state: randomBytes(24).toString("base64url"),
    verifier: randomBytes(48).toString("base64url"),
    userId,
    expires: Date.now() + 600000,
  };
  const payload = Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    value,
    cookie: `${payload}.${createHmac("sha256", sessionSecret()).update(payload).digest("base64url")}`,
  };
}
export function verifyOAuthState(
  cookie: string | undefined,
  state: string | null,
  userId: string,
) {
  if (!cookie || !state)
    throw new Error("OAuth state is missing. Start the connection again.");
  const [payload, signature] = cookie.split(".");
  const expected = createHmac("sha256", sessionSecret())
    .update(payload)
    .digest();
  const received = Buffer.from(signature || "", "base64url");
  if (
    expected.length !== received.length ||
    !timingSafeEqual(expected, received)
  )
    throw new Error("Invalid OAuth state signature.");
  const value = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (
    value.state !== state ||
    value.userId !== userId ||
    value.expires < Date.now()
  )
    throw new Error("OAuth state expired or does not match this session.");
  return value as { verifier: string };
}
export function authorizationUrl(provider: OAuthProvider, userId: string) {
  const config = oauthConfig(provider),
    state = createOAuthState(userId);
  const url = new URL(
    provider === "canva"
      ? "https://www.canva.com/api/oauth/authorize"
      : `https://www.facebook.com/${process.env.META_GRAPH_VERSION || "v23.0"}/dialog/oauth`,
  );
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state.value.state);
  if (provider === "canva") {
    url.searchParams.set(
      "code_challenge",
      createHash("sha256").update(state.value.verifier).digest("base64url"),
    );
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set(
      "scope",
      "design:content:read design:content:write design:meta:read brandtemplate:meta:read brandtemplate:content:read asset:read asset:write",
    );
  } else
    url.searchParams.set(
      "scope",
      "instagram_basic,instagram_manage_insights,instagram_content_publish,pages_show_list,pages_read_engagement",
    );
  return { url: url.toString(), cookie: state.cookie };
}
