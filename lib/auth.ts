import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getWorkspaceData } from "@/lib/data";
import type { Operator, Role } from "@/lib/domain";
export const SESSION_COOKIE = "move_session";
export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32)
    throw new Error(
      "SESSION_SECRET must contain at least 32 random characters. See .env.example.",
    );
  return secret;
}
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt:${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function verifyPassword(password: string, encoded: string) {
  const [algorithm, salt, hex] = encoded.split(":");
  if (algorithm !== "scrypt" || !salt || !hex || !/^[0-9a-f]{128}$/.test(hex))
    return false;
  return timingSafeEqual(
    scryptSync(password, salt, 64),
    Buffer.from(hex, "hex"),
  );
}
export function signSession(userId: string, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ userId, exp: now + 12 * 60 * 60 * 1000 }),
  ).toString("base64url");
  return `${payload}.${createHmac("sha256", sessionSecret()).update(payload).digest("base64url")}`;
}
export function verifySession(token: string, now = Date.now()): string | null {
  try {
    const [payload, signature, extra] = token.split(".");
    if (extra || !payload || !signature) return null;
    const expected = createHmac("sha256", sessionSecret())
      .update(payload)
      .digest();
    const received = Buffer.from(signature, "base64url");
    if (
      received.length !== expected.length ||
      !timingSafeEqual(expected, received)
    )
      return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (
      typeof parsed.userId !== "string" ||
      typeof parsed.exp !== "number" ||
      parsed.exp <= now
    )
      return null;
    return parsed.userId;
  } catch {
    return null;
  }
}
export async function getSession(): Promise<Operator | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const id = token ? verifySession(token) : null;
  if (!id) return null;
  return (await getWorkspaceData()).operators.find((u) => u.id === id) || null;
}
export async function requireSessionPage() {
  const user = await getSession();
  if (!user) redirect("/login");
  return user;
}
export function canWrite(role: Role) {
  return role === "ADMIN" || role === "OPERATOR";
}
export function secureCookie() {
  return (process.env.APP_URL || "").startsWith("https://");
}
