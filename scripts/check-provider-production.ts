import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import type { CanvaField } from "../lib/services/canva";

/** Uses the official providers; never intercepts responses or publishes to Instagram. */
async function main() {
  const envFile = process.env.MOVE_PROVIDER_ENV_FILE || ".env.desktop";
  const settings = parseEnv(await readFile(envFile, "utf8"));
  const injected = new Set([
    "CANVA_ACCESS_TOKEN",
    "META_ACCESS_TOKEN",
    "CANVA_CLIENT_ID",
    "CANVA_CLIENT_SECRET",
    "META_APP_ID",
    "META_APP_SECRET",
  ]);
  for (const [name, value] of Object.entries(settings))
    if (!injected.has(name) || !process.env[name]) process.env[name] = value;
  const { credentialStatus } = await import("../lib/credentials");
  const missing = [];
  for (const provider of ["meta", "canva"] as const) {
    const status = await credentialStatus(provider);
    if (!status.configured || status.expired) missing.push(provider);
  }
  if (missing.length) {
    console.error(
      `BLOCKED: 실제 인증 필요 — ${missing.join(", ")}. 클라우드 보안 설정 또는 앱 계정 연결에서 제공하세요. 제공자 요청·디자인 생성·게시는 실행하지 않았습니다.`,
    );
    process.exitCode = 2;
    return;
  }
  const { getWorkspaceData } = await import("../lib/data");
  const workspace = await getWorkspaceData();
  if (workspace.demo)
    throw new Error(
      "실제 계정 검증은 DEMO_MODE=false 운영 공간에서만 실행합니다.",
    );
  const actor = workspace.operators.find((o) => o.role === "ADMIN")!.id;
  const { connectTheMoveAccount } =
    await import("../lib/integrations/the-move-account");
  const { syncInstagramMetrics } = await import("../lib/integrations/meta");
  const { connectCanvaAccount } =
    await import("../lib/integrations/canva-account");
  await connectTheMoveAccount(actor);
  console.log("실제 Meta 계정 이름·ID 확인 완료: @themovemag_");
  const synced = await syncInstagramMetrics("the-move", actor);
  console.log(
    `실제 Meta 지표 저장: ${synced.snapshots}회 관측. 미제공 항목: ${synced.unavailable.length}개.`,
  );
  const connected = await connectCanvaAccount(actor);
  console.log(
    `실제 Canva 원본 접근: ${connected.accessible.length}/3. 필드·접근 확인 필요: ${connected.failures.length}건.`,
  );
  if (!process.argv.includes("--generate")) {
    console.log(
      "실제 연결·원본 검사 완료. 생성 검증에는 --generate --project ID --template ID --fields 로컬_JSON_파일을 지정하세요.",
    );
    return;
  }
  const arg = (name: string) => {
    const pos = process.argv.indexOf(name);
    return pos >= 0 ? process.argv[pos + 1] : undefined;
  };
  const projectId = arg("--project"),
    templateId = arg("--template"),
    filename = arg("--fields");
  if (!projectId || !templateId || !filename)
    throw new Error(
      "기존 디자인 단계 프로젝트·승인된 원본·실제 필드 입력 파일이 필요합니다. 임의 초안이나 자료를 생성하지 않습니다.",
    );
  const input = JSON.parse(await readFile(filename, "utf8")) as {
    fields?: Record<string, CanvaField>;
    assetBindings?: Record<string, string>;
    pageCount?: number;
  };
  const fields = { ...input.fields };
  const { uploadCanvaAsset } = await import("../lib/services/canva-assets");
  for (const [fieldName, assetId] of Object.entries(
    input.assetBindings || {},
  )) {
    if (
      !(await getWorkspaceData()).assets.some(
        (a) => a.id === assetId && a.projectId === projectId,
      )
    )
      throw new Error(
        "선택한 프로젝트에 속한 승인 미디어만 검증할 수 있습니다.",
      );
    let asset = await uploadCanvaAsset(assetId, actor);
    const deadline = Date.now() + 180000;
    while (
      !asset.canvaAssetId &&
      asset.canvaUploadJobId &&
      Date.now() < deadline
    ) {
      await delay(2000);
      asset = await uploadCanvaAsset(assetId, actor, true);
    }
    if (!asset.canvaAssetId)
      throw new Error(
        `실제 Canva 미디어 완료를 확인하지 못했습니다: ${fieldName}. 작업 기록을 확인하세요.`,
      );
    fields[fieldName] = {
      type: asset.kind === "VIDEO" ? "video" : "image",
      asset_id: asset.canvaAssetId,
    };
    console.log(
      `승인한 ${asset.kind === "VIDEO" ? "영상" : "이미지"}의 실제 Canva 업로드 완료.`,
    );
  }
  const { generateCanvaDesign, refreshCanvaDesign } =
    await import("../lib/services/canva");
  let design = await generateCanvaDesign(projectId, templateId, actor, {
    fields,
    pageCount: input.pageCount,
  });
  const deadline = Date.now() + 180000;
  while (design.status === "QUEUED" && Date.now() < deadline) {
    await delay(2000);
    design = await refreshCanvaDesign(design.id, actor);
  }
  if (design.status !== "READY" || !design.externalId || !design.editUrl)
    throw new Error(
      "실제 Canva 생성 성공을 확인하지 못했습니다. 요청을 반복하지 말고 기록된 작업 상태를 확인하세요.",
    );
  const latest = await getWorkspaceData();
  if (latest.templates.some((t) => t.designId === design.externalId))
    throw new Error("원본 ID가 결과로 반환되었습니다.");
  if (latest.projects.find((p) => p.id === projectId)?.stage !== "REVIEW")
    throw new Error("생성 결과가 사람 검토 단계로 이동하지 않았습니다.");
  console.log(
    `PASS: 실제 Canva 새 디자인 생성·검토 대기. 편집 링크: ${design.editUrl}`,
  );
  console.log(
    "Instagram 게시는 실행하지 않았습니다. 최종 미디어·캡션에 대한 별도 사람 승인이 필요합니다.",
  );
}
main().catch((error) => {
  console.error(
    error instanceof Error ? error.message : "실제 제공자 검증 실패",
  );
  process.exitCode = 1;
});
