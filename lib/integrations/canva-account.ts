import { getIntegrationToken, saveIntegrationToken } from "../credentials";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { officialApi } from "./http";
import { inspectCanvaTemplate } from "../services/canva";
import { ServiceError, errorMessage } from "../services/errors";
import { randomUUID } from "node:crypto";
export async function connectCanvaAccount(
  actorId: string,
  suppliedToken?: string,
  refreshToken?: string,
  expiresIn?: number,
) {
  const data = await getWorkspaceData();
  if (data.demo)
    throw new ServiceError(
      "DEMO_PUBLISH_DISABLED",
      "실제 운영 공간에서 Canva를 연결하세요.",
      409,
    );
  const token = suppliedToken || (await getIntegrationToken("canva"));
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Canva 계정을 인증하거나 공식 액세스 토큰을 연결하세요.",
      409,
    );
  const accessible: string[] = [];
  const failures: { templateId: string; message: string }[] = [];
  for (const template of data.templates) {
    try {
      const result = await officialApi<{ design: { id: string } }>(
        `https://api.canva.com/rest/v1/designs/${encodeURIComponent(template.designId)}`,
        { token },
      );
      if (result.design?.id !== template.designId)
        throw new ServiceError(
          "INVALID_API_RESPONSE",
          "Canva가 다른 디자인 ID를 반환했습니다.",
          502,
        );
      accessible.push(template.id);
    } catch (error) {
      failures.push({ templateId: template.id, message: errorMessage(error) });
    }
  }
  if (!accessible.length)
    throw new ServiceError(
      "CANVA_REFERENCE_ACCESS_REQUIRED",
      "지정된 THE MOVE 원본 3개에 접근할 수 없습니다. 원본이 있는 Canva 계정·팀과 design:meta:read 권한으로 인증하세요. 기존 인증은 덮어쓰지 않았습니다.",
      409,
    );
  if (suppliedToken)
    await saveIntegrationToken("canva", token, refreshToken, expiresIn);
  for (const id of accessible) {
    try {
      await inspectCanvaTemplate(id, actorId);
    } catch (error) {
      failures.push({ templateId: id, message: errorMessage(error) });
    }
  }
  await mutateWorkspace(actorId, "CANVA_ACCESS_VERIFIED", "canva", (draft) => {
    for (const failure of failures) {
      const target = draft.templates.find((t) => t.id === failure.templateId);
      if (target) {
        target.status = "SETUP_REQUIRED";
        target.configuration = {
          ...target.configuration,
          inspectionError: failure.message,
        };
      }
    }
    draft.audit.unshift({
      id: randomUUID(),
      actorId,
      action: "CANVA_CONNECTION_RESULT",
      entityId: "canva",
      at: new Date().toISOString(),
      details: JSON.stringify({ accessible, failures }),
    });
  });
  return { accessible, failures };
}
