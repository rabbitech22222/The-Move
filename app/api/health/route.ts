import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    status: "ok",
    application: "THE MOVE OS",
    mode:
      process.env.DEMO_MODE === "true"
        ? "demo"
        : process.env.LOCAL_MODE === "true"
          ? "local"
          : "production",
  });
}
