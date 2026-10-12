import { getWorkspaceData, mutateWorkspace } from "../data";
import { getIntegrationToken } from "../credentials";
import {
  officialApi,
  safeFetch,
  validatePublicUrl,
} from "../integrations/http";
import { providerFetch } from "../integrations/transport";
import { invalidateApprovals } from "./projects";
import { ServiceError, errorMessage } from "./errors";
import type { Asset, WorkspaceData } from "../domain";

interface UploadJob {
  id: string;
  status: "in_progress" | "success" | "failed";
  asset?: { id: string; type: "image" | "video" };
}
const API = "https://api.canva.com/rest/v1";
function selected(data: WorkspaceData, id: string): Asset {
  const asset = data.assets.find((a) => a.id === id);
  const project = data.projects.find((p) => p.id === asset?.projectId);
  if (!asset || !project)
    throw new ServiceError(
      "NOT_FOUND",
      "프로젝트 미디어를 찾지 못했습니다.",
      404,
    );
  if (data.demo)
    throw new ServiceError(
      "DEMO_PUBLISH_DISABLED",
      "실제 운영 공간에서 승인한 미디어를 Canva로 업로드하세요.",
      409,
    );
  if (!asset.approved || !asset.credit.trim())
    throw new ServiceError(
      "ASSET_APPROVAL_REQUIRED",
      "파일 내용·출처·이용 권한을 확인하고 미디어를 승인하세요.",
      409,
    );
  if (["SCHEDULED", "PUBLISHED"].includes(project.stage))
    throw new ServiceError(
      "LOCKED_PROJECT",
      "예약을 취소한 뒤 미디어를 변경하세요.",
      409,
    );
  return asset;
}
async function applyResult(
  id: string,
  original: Asset,
  job: UploadJob,
  actorId: string,
) {
  if (!job.id || !["in_progress", "success", "failed"].includes(job.status))
    throw new ServiceError(
      "INVALID_API_RESPONSE",
      "Canva 업로드 작업 응답을 확인할 수 없습니다.",
      502,
    );
  if (
    job.status === "success" &&
    (!job.asset?.id || job.asset.type !== original.kind.toLowerCase())
  )
    throw new ServiceError(
      "INVALID_API_RESPONSE",
      "Canva 업로드 결과의 자료 ID·유형이 일치하지 않습니다.",
      502,
    );
  await mutateWorkspace(actorId, "CANVA_ASSET_RESULT", id, (data) => {
    const asset = selected(data, id);
    if (asset.url !== original.url || asset.kind !== original.kind)
      throw new ServiceError(
        "ASSET_CHANGED",
        "미디어가 변경되었습니다. 기존 업로드 결과를 대조하세요.",
        409,
      );
    if (
      asset.canvaUploadJobId !== "pending" &&
      asset.canvaUploadJobId !== job.id
    )
      throw new ServiceError(
        "RECONCILIATION_REQUIRED",
        "다른 업로드 요청이 기록되어 있습니다. 결과를 대조하세요.",
        409,
      );
    asset.canvaUploadJobId = job.status === "failed" ? null : job.id;
    asset.canvaUploadError =
      job.status === "failed"
        ? "Canva가 업로드 실패를 확인했습니다. 파일 유형·용량·권한을 확인하고 다시 시도하세요."
        : null;
    if (job.status === "success") {
      const already = asset.canvaAssetId === job.asset!.id;
      asset.canvaAssetId = job.asset!.id;
      if (!already) {
        const project = data.projects.find((p) => p.id === asset.projectId)!;
        if (project.stage === "APPROVED") project.stage = "REVIEW";
        project.updatedAt = new Date().toISOString();
        project.revisions.push({
          actorId,
          at: project.updatedAt,
          note: "실제 Canva 미디어 업로드 완료. 결과 파일과 브랜드 배치를 확인하고 새 디자인을 검토하세요.",
        });
        invalidateApprovals(data, project.id);
      }
    }
  });
  return (await getWorkspaceData()).assets.find((a) => a.id === id)!;
}
export async function uploadCanvaAsset(
  id: string,
  actorId: string,
  refresh = false,
): Promise<Asset> {
  const data = await getWorkspaceData();
  const asset = selected(data, id);
  const token = await getIntegrationToken("canva");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Canva 인증을 먼저 연결하세요.",
      409,
    );
  if (asset.canvaAssetId) return asset;
  if (asset.canvaUploadJobId === "pending")
    throw new ServiceError(
      "RECONCILIATION_REQUIRED",
      "업로드 요청의 응답이 불명확합니다. Canva의 업로드 자료를 확인하세요. 중복 업로드를 자동 요청하지 않습니다.",
      409,
    );
  if (asset.canvaUploadJobId) {
    const response = await officialApi<{ job: UploadJob }>(
      `${API}/asset-uploads/${encodeURIComponent(asset.canvaUploadJobId)}`,
      { token },
    );
    if (response.job?.id !== asset.canvaUploadJobId)
      throw new ServiceError(
        "INVALID_API_RESPONSE",
        "다른 Canva 업로드 작업이 반환되었습니다.",
        502,
      );
    return applyResult(id, asset, response.job, actorId);
  }
  if (refresh)
    throw new ServiceError(
      "NOT_FOUND",
      "확인할 Canva 업로드 요청이 없습니다.",
      404,
    );
  if (validatePublicUrl(asset.url).protocol !== "https:")
    throw new ServiceError(
      "HTTPS_REQUIRED",
      "Canva 업로드 자료는 공개 HTTPS 주소를 사용하세요.",
    );
  const response = await safeFetch(asset.url, {
    maxBytes: 32 * 1024 * 1024,
    timeoutMs: 30000,
  });
  const mime = response.headers.get("content-type")?.split(";")[0] || "";
  if (
    !response.ok ||
    !(asset.kind === "IMAGE"
      ? mime.startsWith("image/")
      : mime.startsWith("video/"))
  )
    throw new ServiceError(
      "INVALID_MEDIA",
      "승인한 주소에서 해당 이미지·영상 파일을 받지 못했습니다. 공개 HTTPS 파일 주소와 MIME 유형을 확인하세요.",
      409,
    );
  const binary = await response.arrayBuffer();
  if (!binary.byteLength)
    throw new ServiceError(
      "INVALID_MEDIA",
      "빈 미디어 파일은 업로드할 수 없습니다.",
    );
  await mutateWorkspace(actorId, "CANVA_ASSET_UPLOAD_RESERVED", id, (draft) => {
    const current = selected(draft, id);
    if (
      current.canvaUploadJobId ||
      current.canvaAssetId ||
      current.url !== asset.url ||
      current.kind !== asset.kind
    )
      throw new ServiceError(
        "RECONCILIATION_REQUIRED",
        "미디어가 변경되었거나 기존 업로드가 있습니다. 결과를 먼저 확인하세요.",
        409,
      );
    current.canvaUploadJobId = "pending";
    current.canvaUploadError = null;
  });
  try {
    let result: Response;
    const project = data.projects.find((p) => p.id === asset.projectId)!;
    const name = Array.from(`THE MOVE ${project.title} ${asset.kind}`)
      .slice(0, 50)
      .join("");
    try {
      result = await providerFetch(`${API}/asset-uploads`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/octet-stream",
          "Asset-Upload-Metadata": JSON.stringify({
            name_base64: Buffer.from(name).toString("base64"),
          }),
        },
        body: binary,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ServiceError(
        "API_OUTCOME_UNKNOWN",
        "Canva 업로드 응답을 받지 못했습니다. 미디어 목록을 대조한 뒤 다시 진행하세요.",
        502,
      );
    }
    if (!result.ok) {
      if (result.status >= 500)
        throw new ServiceError(
          "API_OUTCOME_UNKNOWN",
          "Canva 업로드 응답이 불명확합니다. 결과를 먼저 대조하세요.",
          502,
        );
      await mutateWorkspace(
        actorId,
        "CANVA_ASSET_UPLOAD_REJECTED",
        id,
        (draft) => {
          const current = selected(draft, id);
          current.canvaUploadJobId = null;
        },
      );
      throw new ServiceError(
        result.status === 401 || result.status === 403
          ? "AUTHORIZATION_REQUIRED"
          : "CANVA_UPLOAD_REJECTED",
        `Canva가 업로드를 HTTP ${result.status}로 거부했습니다. asset:write 권한과 파일 규격을 확인하세요.`,
        result.status,
      );
    }
    let payload: { job: UploadJob };
    try {
      payload = await result.json();
    } catch {
      throw new ServiceError(
        "API_OUTCOME_UNKNOWN",
        "Canva 업로드 결과를 해석하지 못했습니다. 결과를 대조하세요.",
        502,
      );
    }
    if (!payload.job?.id)
      throw new ServiceError(
        "API_OUTCOME_UNKNOWN",
        "Canva가 업로드 작업 ID를 반환하지 않았습니다. 기존 업로드를 먼저 대조하세요.",
        502,
      );
    await mutateWorkspace(actorId, "CANVA_ASSET_JOB_ACCEPTED", id, (draft) => {
      const current = draft.assets.find((a) => a.id === id);
      if (!current || current.canvaUploadJobId !== "pending")
        throw new ServiceError(
          "RECONCILIATION_REQUIRED",
          "업로드 예약 상태가 변경되었습니다. 기존 Canva 작업을 대조하세요.",
          409,
        );
      current.canvaUploadJobId = payload.job.id;
    });
    return await applyResult(id, asset, payload.job, actorId);
  } catch (error) {
    await mutateWorkspace(actorId, "CANVA_ASSET_UPLOAD_ERROR", id, (draft) => {
      const current = draft.assets.find((a) => a.id === id);
      if (current) current.canvaUploadError = errorMessage(error);
    });
    throw error;
  }
}
