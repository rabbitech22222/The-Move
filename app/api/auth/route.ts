import { NextResponse } from "next/server";
import { z } from "zod";
import { cookies } from "next/headers";
import { body, endpoint, assertSameOrigin, HttpError, ok } from "@/lib/http";
import { findUserByEmail } from "@/lib/data";
import {
  verifyPassword,
  signSession,
  SESSION_COOKIE,
  secureCookie,
  getSession,
} from "@/lib/auth";
const attempts = new Map<string, { count: number; until: number }>();
export async function GET() {
  return endpoint(async () => ok(await getSession()));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertSameOrigin(request);
    const input = await body(
      request,
      z.object({
        email: z.email().max(200),
        password: z.string().min(1).max(256),
      }),
    );
    // Server-level limit supplements proxy/edge limits; never trust a client-supplied IP header.
    const key = input.email.toLowerCase();
    const current = attempts.get(key);
    if (current && current.until > Date.now() && current.count >= 10)
      throw new HttpError(
        429,
        "RATE_LIMIT",
        "Too many sign-in attempts. Try again in 15 minutes.",
      );
    const user = await findUserByEmail(key);
    if (!user || !verifyPassword(input.password, user.passwordHash)) {
      attempts.set(key, {
        count: current && current.until > Date.now() ? current.count + 1 : 1,
        until: Date.now() + 15 * 60 * 1000,
      });
      throw new HttpError(
        401,
        "INVALID_LOGIN",
        "Email or password is incorrect.",
      );
    }
    attempts.delete(key);
    const response = NextResponse.json({
      data: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
    });
    response.cookies.set(SESSION_COOKIE, signSession(user.id), {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie(),
      path: "/",
      maxAge: 12 * 60 * 60,
    });
    return response;
  });
}
export async function DELETE(request: Request) {
  return endpoint(async () => {
    assertSameOrigin(request);
    (await cookies()).delete(SESSION_COOKIE);
    return ok({ signedOut: true });
  });
}
