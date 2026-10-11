import { NextResponse } from "next/server";
import { ZodError, type ZodType } from "zod";
import { getSession, canWrite } from "@/lib/auth";
import type { Operator } from "@/lib/domain";
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  const expected = new URL(process.env.APP_URL || request.url).origin;
  if (!origin || origin !== expected)
    throw new HttpError(
      403,
      "ORIGIN_MISMATCH",
      "Use this workspace origin for changes.",
    );
}
export async function authorize(
  request?: Request,
  write = false,
): Promise<Operator> {
  const user = await getSession();
  if (!user) throw new HttpError(401, "UNAUTHENTICATED", "Please sign in.");
  if (write) {
    if (request) assertSameOrigin(request);
    if (!canWrite(user.role))
      throw new HttpError(
        403,
        "FORBIDDEN",
        "This role cannot change the workspace.",
      );
  }
  return user;
}
export async function body<T>(
  request: Request,
  schema: ZodType<T>,
): Promise<T> {
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "CONTENT_TYPE", "Send application/json.");
  const text = await request.text();
  if (text.length > 100_000)
    throw new HttpError(413, "TOO_LARGE", "Request exceeds 100 KB.");
  try {
    return schema.parse(JSON.parse(text));
  } catch (e) {
    if (e instanceof ZodError) throw e;
    throw new HttpError(400, "INVALID_JSON", "Send valid JSON.");
  }
}
export function ok(data: unknown, status = 200) {
  return NextResponse.json(
    { data },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}
export async function endpoint(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof ZodError)
      return NextResponse.json(
        {
          error: e.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
          code: "VALIDATION",
        },
        { status: 400 },
      );
    if (e instanceof HttpError)
      return NextResponse.json(
        { error: e.message, code: e.code },
        { status: e.status },
      );
    if (e instanceof Error && "code" in e && typeof e.code === "string")
      return NextResponse.json(
        { error: e.message, code: e.code },
        {
          status:
            "status" in e && typeof e.status === "number" ? e.status : 422,
        },
      );
    console.error(
      "Request failed:",
      e instanceof Error ? e.name : "Unknown error",
    );
    return NextResponse.json(
      {
        error:
          "The operation could not complete. Check server logs and configuration.",
        code: "INTERNAL_ERROR",
      },
      { status: 500 },
    );
  }
}
