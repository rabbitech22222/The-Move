import { NextResponse } from "next/server";
import { authorizationUrl, oauthProvider } from "@/lib/oauth";
import { authorize, endpoint, HttpError } from "@/lib/http";
import { secureCookie } from "@/lib/auth";
import { resolvedOAuthConfig } from "@/lib/integration-config";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  return endpoint(async () => {
    const user = await authorize();
    if (user.role !== "ADMIN")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only the workspace admin can connect integrations.",
      );
    const provider = oauthProvider((await params).provider);
    const result = authorizationUrl(
      provider,
      user.id,
      await resolvedOAuthConfig(provider),
    );
    const response = NextResponse.redirect(result.url);
    response.cookies.set(`move_oauth_${provider}`, result.cookie, {
      httpOnly: true,
      secure: secureCookie(),
      sameSite: "lax",
      maxAge: 600,
      path: `/api/oauth/${provider}`,
    });
    return response;
  });
}
