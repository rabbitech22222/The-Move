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
        ? "인증 만료"
        : configured
          ? "설정됨 · 접근 확인 전"
          : "연결 안 됨",
      details,
    });
    return ok({
      demo: data.demo,
      canManageIntegrations: user.role === "ADMIN",
      operators: data.operators,
      integrations: {
        openai: state(
          !!process.env.OPENAI_API_KEY,
          "AI는 선택 기능입니다. 실제 API 실행 결과만 표시합니다.",
        ),
        canva: {
          ...state(
            canva.configured,
            "계정 인증과 자동 채우기가 가능한 브랜드 템플릿이 필요합니다. 기존 원본은 보존합니다.",
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
            "@themovemag_ 프로페셔널 계정 인증, 앱 권한 검토와 정확한 계정 확인이 필요합니다.",
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
          "설정 정보와 실행 상태는 별개입니다. 실제 작업 결과로 작동 여부를 확인하세요.",
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
          accountId: z.string().regex(/^\d+$/).optional(),
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
      if (input.channelId !== "the-move")
        throw new HttpError(
          409,
          "ACCOUNT_SCOPE",
          "현재 실제 연결 대상은 @themovemag_뿐입니다.",
        );
      const { connectTheMoveAccount } =
        await import("@/lib/integrations/the-move-account");
      await connectTheMoveAccount(user.id, input.accountId);
      return ok(await getWorkspaceData());
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
          }
        },
      ),
    );
  });
}
