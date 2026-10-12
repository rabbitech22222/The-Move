import { z } from "zod";
import { randomUUID } from "node:crypto";
import { authorize, body, endpoint, HttpError, ok } from "@/lib/http";
import { getWorkspaceData, mutateWorkspace } from "@/lib/data";
import { credentialStatus } from "@/lib/credentials";
import { isLocalOperation } from "@/lib/runtime";
import { localWorkerStatus } from "@/lib/local-worker";
import { enqueueTask } from "@/lib/jobs";
import { getOAuthClient, saveOAuthClient } from "@/lib/integration-config";
import { connectCanvaAccount } from "@/lib/integrations/canva-account";
export async function GET() {
  return endpoint(async () => {
    const user = await authorize();
    const data = await getWorkspaceData();
    const channel = data.channels[0];
    const latestMetric = data.accountMetrics
      .filter((m) => m.source === "META")
      .sort((a, b) => b.syncedAt.localeCompare(a.syncedAt))[0];
    const latestSync = data.tasks.find((t) => t.kind === "METRICS_SYNC");
    const local = isLocalOperation() ? await localWorkerStatus() : null;
    const [canva, meta, canvaClient, metaClient] = await Promise.all([
      credentialStatus("canva"),
      credentialStatus("meta"),
      getOAuthClient("canva"),
      getOAuthClient("meta"),
    ]);
    const state = (configured: boolean, details: string, expired = false) => ({
      configured,
      expired,
      status: expired
        ? "인증 만료"
        : configured
          ? "설정됨 · 접근 확인 전"
          : "연결 안 됨",
      details,
    });
    return ok({
      demo: data.demo,
      runtime: {
        mode: data.demo ? "demo" : isLocalOperation() ? "local" : "database",
        worker: local,
      },
      instagram: {
        handle: "@themovemag_",
        verified:
          meta.configured &&
          !!channel?.connected &&
          !!channel.platformAccountId &&
          !meta.expired,
        accountId: channel?.platformAccountId || null,
        lastSyncedAt: latestMetric?.syncedAt || null,
        syncStatus: latestSync?.status || null,
        syncMessage: latestSync?.message || null,
        missing: !meta.configured
          ? ["META_ACCESS_TOKEN 또는 Meta OAuth 인증"]
          : [],
      },
      canManageIntegrations: user.role === "ADMIN",
      canva: {
        references: data.templates.map((t) => ({
          id: t.id,
          designId: t.designId,
          name: t.name,
          status: t.status,
          inspectedAt: t.inspectedAt,
          fields: t.fields,
          message: t.configuration?.inspectionError || null,
        })),
        lastConnection:
          data.audit.find((a) => a.action === "CANVA_CONNECTION_RESULT")
            ?.details || null,
      },
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
            canvaClient &&
            process.env.APP_URL &&
            process.env.TOKEN_ENCRYPTION_KEY
          ),
          callbackUrl: `${process.env.APP_URL}/api/oauth/canva/callback`,
        },
        meta: {
          ...state(
            meta.configured,
            "@themovemag_ 프로페셔널 계정 인증, 앱 권한 검토와 정확한 계정 확인이 필요합니다.",
            meta.expired,
          ),
          oauthReady: !!(
            metaClient &&
            process.env.APP_URL &&
            process.env.TOKEN_ENCRYPTION_KEY
          ),
          callbackUrl: `${process.env.APP_URL}/api/oauth/meta/callback`,
        },
        redis: state(
          local ? local.running : !!process.env.REDIS_URL,
          local
            ? local.running
              ? "로컬 작업 처리기 실행 확인. 뉴스·제작·예약 작업은 실제 파일 대기열에 저장됩니다."
              : "로컬 작업 처리기가 꺼져 있습니다. 기본 실행 창을 다시 열어 주세요."
            : "설정 정보와 실행 상태는 별개입니다. 실제 작업 결과로 작동 여부를 확인하세요.",
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
          action: z.literal("configure-oauth"),
          provider: z.enum(["meta", "canva"]),
          clientId: z.string().trim().min(1).max(200),
          clientSecret: z.string().trim().min(8).max(4096),
        }),
        z.object({
          action: z.literal("connect-canva"),
          accessToken: z.string().trim().min(20).max(8192).optional(),
        }),
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
          accessToken: z.string().trim().min(20).max(8192).optional(),
        }),
      ]),
    );
    if (user.role !== "ADMIN")
      throw new HttpError(
        403,
        "FORBIDDEN",
        "Only an admin can change editorial rules and account mappings.",
      );
    if (
      input.action === "configure-oauth" ||
      (input.action === "connect-meta-account" && input.accessToken) ||
      (input.action === "connect-canva" && input.accessToken)
    ) {
      const origin = new URL(process.env.APP_URL || request.url);
      if (
        origin.protocol !== "https:" &&
        !["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname)
      )
        throw new HttpError(
          409,
          "HTTPS_REQUIRED",
          "인증 정보 입력에는 HTTPS 또는 내 컴퓨터의 localhost 실행이 필요합니다.",
        );
    }
    if (input.action === "configure-oauth") {
      if ((await getWorkspaceData()).demo)
        throw new HttpError(
          409,
          "DEMO_PUBLISH_DISABLED",
          "실제 운영 공간에서 계정 로그인을 설정하세요.",
        );
      await saveOAuthClient(input.provider, {
        clientId: input.clientId,
        secret: input.clientSecret,
      });
      await mutateWorkspace(
        user.id,
        "OAUTH_APP_CONFIGURED",
        input.provider,
        () => {},
      );
      return ok(await getWorkspaceData());
    }
    if (input.action === "connect-canva") {
      await connectCanvaAccount(user.id, input.accessToken);
      return ok(await getWorkspaceData());
    }
    if (input.action === "connect-meta-account") {
      if (input.channelId !== "the-move")
        throw new HttpError(
          409,
          "ACCOUNT_SCOPE",
          "현재 실제 연결 대상은 @themovemag_뿐입니다.",
        );
      const { connectTheMoveAccount } =
        await import("@/lib/integrations/the-move-account");
      if ((await getWorkspaceData()).demo)
        throw new HttpError(
          409,
          "DEMO_PUBLISH_DISABLED",
          "기본 실행 파일로 실제 운영 공간을 열어 주세요. 예시 모드에는 실제 계정을 연결하지 않습니다.",
        );
      await connectTheMoveAccount(user.id, input.accountId, input.accessToken);
      await enqueueTask("METRICS_SYNC", { channelId: "the-move" }, user.id);
      return ok(await getWorkspaceData());
    }
    if (input.action === "create-channel")
      throw new HttpError(
        409,
        "ACCOUNT_SCOPE",
        "이 작업 공간은 @themovemag_ 전용입니다. 다른 채널은 추가하지 않습니다.",
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
