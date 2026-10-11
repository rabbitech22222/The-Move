import { randomUUID } from "node:crypto";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { getIntegrationToken } from "../credentials";
import type { CanvaTemplate, GeneratedDesign, Project } from "../domain";
import { officialApi } from "../integrations/http";
import { ServiceError, errorMessage } from "./errors";

const CANVA = "https://api.canva.com/rest/v1";
export const THE_MOVE_REEL_DESIGN = "DAHPcvVkH8k";
const referenceDesigns = new Set([
  "DAHPXU1IGDI",
  "DAHXJGy8do8",
  THE_MOVE_REEL_DESIGN,
]);
type Dataset = Record<string, { type: string }>;
export type CanvaField =
  | { type: "text"; text: string }
  | { type: "image" | "video"; asset_id: string };
export interface CanvaGenerationOptions {
  fields?: Record<string, CanvaField>;
  pageCount?: number;
}
interface TemplateBinding {
  brandTemplateId?: string;
  designId?: string;
  pageCount?: number;
}
interface AutofillJob {
  id: string;
  status: "in_progress" | "success" | "failed";
  result?: { design: { id: string; urls?: { edit_url?: string } } };
  error?: { code: string; message?: string };
}

function bindingFor(template: CanvaTemplate): TemplateBinding | null {
  let config: Record<string, string | TemplateBinding>;
  try {
    config = JSON.parse(process.env.CANVA_BRAND_TEMPLATE_MAP ?? "{}");
  } catch {
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "CANVA_BRAND_TEMPLATE_MAP must be valid JSON mapping source design IDs to approved brand template IDs.",
    );
  }
  const binding =
    (template.configuration?.brandTemplateId
      ? {
          brandTemplateId: template.configuration.brandTemplateId,
          pageCount: template.configuration.pageCount,
        }
      : undefined) ??
    config[template.designId] ??
    process.env[`CANVA_BRAND_TEMPLATE_${template.designId}`];
  return typeof binding === "string"
    ? { brandTemplateId: binding }
    : (binding ?? null);
}

export function validateTemplate(
  template: CanvaTemplate,
  project: Pick<Project, "format" | "channelId"> &
    Partial<Pick<Project, "operatorId">>,
): void {
  if (
    !template.approved ||
    template.channelId !== project.channelId ||
    template.format !== project.format
  ) {
    throw new ServiceError(
      "TEMPLATE_NOT_APPROVED",
      "Select a human-approved template matching this channel and content format.",
    );
  }
  if (
    template.operatorId &&
    project.operatorId &&
    template.operatorId !== project.operatorId
  ) {
    throw new ServiceError(
      "WRONG_OPERATOR_TEMPLATE",
      "Select the approved Canva reference belonging to the assigned operator.",
    );
  }
  if (
    project.channelId === "the-move" &&
    !referenceDesigns.has(template.designId)
  )
    throw new ServiceError(
      "TEMPLATE_NOT_APPROVED",
      "THE MOVE는 지정된 실제 원본만 사용할 수 있습니다. 릴스는 DAHPcvVkH8k만 사용하세요.",
    );
  if (project.format === "REEL") {
    if (
      template.width !== 1080 ||
      template.height !== 1920 ||
      (project.channelId === "the-move" &&
        template.designId !== THE_MOVE_REEL_DESIGN)
    ) {
      throw new ServiceError(
        "INVALID_REEL_TEMPLATE",
        `THE MOVE reels require the preserved landscape-video design ${THE_MOVE_REEL_DESIGN} at 1080 × 1920.`,
      );
    }
  } else if (template.width !== 1080 || template.height !== 1350) {
    throw new ServiceError(
      "INVALID_CAROUSEL_SIZE",
      "Carousel templates must preserve 1080 × 1350 output.",
    );
  }
}

/** Conservative copy preflight; final font wrapping and clipping require Canva human preview. */
export function validateCopyLayout(fields: Record<string, CanvaField>): void {
  for (const [name, value] of Object.entries(fields)) {
    if (value.type !== "text") continue;
    if (!value.text.trim())
      throw new ServiceError(
        "EMPTY_FIELD",
        `Canva text field ${name} must not be empty.`,
      );
    const headline = /headline|title|제목|헤드라인/i.test(name);
    const maxLength = headline ? 110 : 900;
    const maxLines = headline ? 4 : 22;
    if (
      value.text.length > maxLength ||
      value.text.split("\n").length > maxLines
    ) {
      throw new ServiceError(
        "COPY_OVERFLOW",
        `${name} exceeds the conservative copy limit. Shorten the text, then inspect wrapping in the editable Canva preview.`,
      );
    }
  }
}

async function datasetFor(
  template: CanvaTemplate,
  token: string,
): Promise<{ binding: TemplateBinding; dataset: Dataset }> {
  const binding = bindingFor(template);
  const selected: TemplateBinding = binding?.brandTemplateId
    ? binding
    : { designId: template.designId };
  if (selected.designId) {
    const source = await officialApi<{
      design: { id: string; page_count?: number };
    }>(`${CANVA}/designs/${encodeURIComponent(selected.designId)}`, { token });
    if (source.design.id !== selected.designId)
      throw new ServiceError(
        "INVALID_API_RESPONSE",
        "Canva 원본 디자인 ID가 일치하지 않습니다.",
        502,
      );
    selected.pageCount = source.design.page_count;
  }
  const response = await officialApi<{ dataset: Dataset }>(
    selected.brandTemplateId
      ? `${CANVA}/brand-templates/${encodeURIComponent(selected.brandTemplateId)}/dataset`
      : `${CANVA}/designs/${encodeURIComponent(selected.designId!)}/dataset`,
    { token },
  );
  if (!response.dataset || !Object.keys(response.dataset).length)
    throw new ServiceError(
      "SETUP_REQUIRED",
      "실제 원본에 자동 채우기 필드가 없습니다. 원본을 변경하지 말고 새 사본에서 제목·본문·미디어·출처 필드를 설정해 승인된 브랜드 템플릿으로 연결하세요.",
    );
  return { binding: selected, dataset: response.dataset };
}

export async function inspectCanvaTemplate(
  templateId: string,
  actorId: string,
): Promise<CanvaTemplate> {
  const data = await getWorkspaceData();
  const template = data.templates.find((t) => t.id === templateId);
  if (!template)
    throw new ServiceError(
      "NOT_FOUND",
      "The Canva reference template was not found.",
      404,
    );
  const token = await getIntegrationToken("canva");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Connect Canva with design-read and brand-template content-read scopes before inspecting templates.",
      409,
    );
  try {
    // Read only; source designs are never updated, resized, exported, or overwritten.
    const source = await officialApi<{
      design: {
        id: string;
        title?: string;
        thumbnail?: { url: string };
        page_count?: number;
      };
    }>(`${CANVA}/designs/${encodeURIComponent(template.designId)}`, { token });
    await mutateWorkspace(
      actorId,
      "CANVA_REFERENCE_READ",
      templateId,
      (draft) => {
        const target = draft.templates.find((t) => t.id === templateId)!;
        target.configuration = {
          ...target.configuration,
          previewUrl: source.design.thumbnail?.url,
          sourceTitle: source.design.title,
          ...(!template.configuration?.brandTemplateId &&
          source.design.page_count
            ? { pageCount: source.design.page_count }
            : {}),
        };
        target.inspectedAt = new Date().toISOString();
      },
    );
    const { binding: inspectedBinding, dataset } = await datasetFor(
      template,
      token,
    );
    const status = Object.values(dataset).some(
      (field) => !["text", "image", "video"].includes(field.type),
    )
      ? "SETUP_REQUIRED"
      : "READY";
    const snapshot = await mutateWorkspace(
      actorId,
      "CANVA_TEMPLATE_INSPECTED",
      templateId,
      (draft) => {
        const target = draft.templates.find((t) => t.id === templateId)!;
        target.fields = Object.keys(dataset);
        target.configuration = {
          ...target.configuration,
          fieldTypes: Object.fromEntries(
            Object.entries(dataset).map(([name, field]) => [name, field.type]),
          ),
          previewUrl: source.design.thumbnail?.url,
          sourceTitle: source.design.title,
          ...(inspectedBinding.pageCount
            ? { pageCount: inspectedBinding.pageCount }
            : {}),
        };
        target.inspectedAt = new Date().toISOString();
        target.status = status;
      },
    );
    return snapshot.templates.find((t) => t.id === templateId)!;
  } catch (error) {
    await mutateWorkspace(
      actorId,
      "CANVA_TEMPLATE_INSPECTION_FAILED",
      templateId,
      (draft) => {
        const target = draft.templates.find((t) => t.id === templateId)!;
        target.status = "SETUP_REQUIRED";
      },
    );
    throw error;
  }
}

function inferredFields(
  project: Project,
  dataset: Dataset,
): Record<string, CanvaField> {
  const result: Record<string, CanvaField> = {};
  for (const [name, field] of Object.entries(dataset)) {
    if (field.type !== "text") continue;
    if (/^(headline|title|제목|헤드라인)$/i.test(name))
      result[name] = { type: "text", text: project.title };
    if (/^(body|copy|caption|본문|캡션)$/i.test(name))
      result[name] = { type: "text", text: project.draftCopy };
    if (/^(source_credit|sources|credit|출처)$/i.test(name))
      result[name] = { type: "text", text: project.sourceUrls.join("\n") };
  }
  return result;
}

export async function generateCanvaDesign(
  projectId: string,
  templateId: string,
  actorId: string,
  options: CanvaGenerationOptions = {},
): Promise<GeneratedDesign> {
  const data = await getWorkspaceData();
  const project = data.projects.find((p) => p.id === projectId);
  const template = data.templates.find((t) => t.id === templateId);
  if (!project || !template)
    throw new ServiceError(
      "NOT_FOUND",
      "The editorial project or Canva template was not found.",
      404,
    );
  validateTemplate(template, project);
  if (!["DESIGN", "REVIEW"].includes(project.stage))
    throw new ServiceError(
      "INVALID_STAGE",
      "디자인·검토 단계의 프로젝트만 새 Canva 디자인을 생성할 수 있습니다.",
      409,
    );
  if (!project.draftCopy.trim() || !project.sourceUrls.length)
    throw new ServiceError(
      "RESEARCH_REQUIRED",
      "Add draft copy and research source references before Canva production.",
    );
  const token = await getIntegrationToken("canva");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Connect Canva with approved Autofill access before generating a design.",
      409,
    );
  const { binding, dataset } = await datasetFor(template, token);
  if (options.pageCount && binding.pageCount !== options.pageCount)
    throw new ServiceError(
      "SETUP_REQUIRED",
      "Autofill preserves the Brand Template page count. Configure an approved template with the requested page count; arbitrary page insertion is not supported by this integration.",
    );
  const fields = { ...inferredFields(project, dataset), ...options.fields };
  for (const [name, field] of Object.entries(dataset)) {
    if (!["text", "image", "video"].includes(field.type))
      throw new ServiceError(
        "UNSUPPORTED_FIELD",
        `Dataset field ${name} (${field.type}) requires a manual Canva workflow.`,
      );
    if (
      !fields[name] ||
      !(
        fields[name].type === field.type ||
        (field.type === "image" &&
          fields[name].type === "video" &&
          project.format === "REEL")
      )
    )
      throw new ServiceError(
        "MISSING_CANVA_FIELD",
        `Provide ${field.type} data for dataset field ${name}. Images require an authorized, existing Canva asset ID; no placeholder asset is generated.`,
      );
    const value = fields[name];
    if (value.type !== "text" && !/^[A-Za-z0-9_-]{1,200}$/.test(value.asset_id))
      throw new ServiceError(
        "INVALID_ASSET",
        `Dataset image field ${name} requires an existing authorized Canva asset ID.`,
      );
  }
  if (Object.keys(fields).some((name) => !dataset[name]))
    throw new ServiceError(
      "UNKNOWN_CANVA_FIELD",
      "The request includes a field absent from the inspected Canva dataset.",
    );
  validateCopyLayout(fields);
  let design: GeneratedDesign = {
    id: randomUUID(),
    projectId,
    templateId,
    status: "QUEUED",
    editUrl: null,
    externalId: null,
    error: null,
    createdAt: new Date().toISOString(),
  };
  // Reserve before side effect. A concurrent attempt or uncertain result must not silently duplicate designs.
  await mutateWorkspace(
    actorId,
    "CANVA_GENERATION_REQUESTED",
    projectId,
    (draft) => {
      const current = draft.projects.find((p) => p.id === projectId);
      if (current?.updatedAt !== project.updatedAt)
        throw new ServiceError(
          "STALE_REVISION",
          "The project changed while validating Canva generation. Retry with the current revision.",
          409,
        );
      if (
        draft.designs.some(
          (d) => d.projectId === projectId && d.status === "QUEUED",
        )
      )
        throw new ServiceError(
          "GENERATION_PENDING",
          "A Canva submission is already pending. Reconcile that job before submitting another.",
          409,
        );
      draft.designs.push(design);
    },
  );
  try {
    const response = await officialApi<{ job: AutofillJob }>(
      `${CANVA}/autofills`,
      {
        method: "POST",
        token,
        body: {
          ...(binding.brandTemplateId
            ? {
                type: "create_from_brand_template",
                brand_template_id: binding.brandTemplateId,
              }
            : { type: "create_from_design", design_id: template.designId }),
          title: project.title.slice(0, 255),
          data: fields,
        },
      },
    );
    if (!response.job?.id)
      throw new ServiceError(
        "API_OUTCOME_UNKNOWN",
        "Canva did not return a job ID. Check recent designs before retrying.",
        502,
      );
    design = { ...design, externalId: `job:${response.job.id}` };
    await mutateWorkspace(actorId, "CANVA_JOB_ACCEPTED", design.id, (draft) => {
      Object.assign(draft.designs.find((d) => d.id === design.id)!, design);
    });
    return await refreshCanvaDesign(design.id, actorId);
  } catch (error) {
    const uncertain =
      error instanceof ServiceError && error.code === "API_OUTCOME_UNKNOWN";
    await mutateWorkspace(
      actorId,
      "CANVA_GENERATION_FAILED",
      design.id,
      (draft) => {
        const target = draft.designs.find((d) => d.id === design.id)!;
        target.status = uncertain ? "QUEUED" : "FAILED";
        target.error = errorMessage(error);
      },
    );
    throw error;
  }
}

export async function refreshCanvaDesign(
  designId: string,
  actorId: string,
): Promise<GeneratedDesign> {
  const data = await getWorkspaceData();
  const design = data.designs.find((d) => d.id === designId);
  if (!design)
    throw new ServiceError("NOT_FOUND", "Generated design was not found.", 404);
  if (design.status === "READY" || design.status === "MANUAL_REVIEW")
    return design;
  if (!design.externalId?.startsWith("job:"))
    throw new ServiceError(
      "RECONCILIATION_REQUIRED",
      "No Canva job ID is available. Inspect recent provider designs before retrying.",
      409,
    );
  const token = await getIntegrationToken("canva");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Reconnect Canva to reconcile the pending autofill job.",
      409,
    );
  const { job } = await officialApi<{ job: AutofillJob }>(
    `${CANVA}/autofills/${encodeURIComponent(design.externalId.slice(4))}`,
    { token },
  );
  if (!job || !["in_progress", "success", "failed"].includes(job.status))
    throw new ServiceError(
      "INVALID_API_RESPONSE",
      "Canva returned an unrecognized autofill job state.",
      502,
    );
  const snapshot = await mutateWorkspace(
    actorId,
    "CANVA_JOB_RECONCILED",
    designId,
    (draft) => {
      const target = draft.designs.find((d) => d.id === designId)!;
      if (job.status === "failed") {
        target.status = "FAILED";
        target.error = `Canva autofill failed (${job.error?.code ?? "unknown"}). Check the Brand Template dataset and account access.`;
      } else if (job.status === "success") {
        const editUrl = job.result?.design?.urls?.edit_url;
        const externalId = job.result?.design?.id;
        if (
          !externalId ||
          referenceDesigns.has(externalId) ||
          !editUrl ||
          !/^https:\/\/(www\.)?canva\.com\//.test(editUrl)
        ) {
          throw new ServiceError(
            "INVALID_API_RESPONSE",
            "Canva did not return a new editable design. No source design is accepted as a generated result.",
            502,
          );
        }
        target.status = "READY";
        target.externalId = externalId;
        target.editUrl = editUrl;
        target.error = null;
        const project = draft.projects.find((p) => p.id === target.projectId)!;
        if (["SCHEDULED", "PUBLISHED"].includes(project.stage))
          throw new ServiceError(
            "PROJECT_LOCKED",
            "예약·게시된 프로젝트에는 새 디자인을 적용할 수 없습니다.",
            409,
          );
        draft.approvals = draft.approvals.filter(
          (a) => a.projectId !== project.id,
        );
        project.stage = "REVIEW";
        project.updatedAt = new Date().toISOString();
        project.revisions.push({
          at: project.updatedAt,
          actorId,
          note: "새 Canva 디자인을 받았습니다. 사람의 검토가 필요하며 Instagram 게시 승인은 별도입니다.",
        });
      }
    },
  );
  return snapshot.designs.find((d) => d.id === designId)!;
}

export interface ManualDesignInput {
  editUrl: string;
  pageCount: number;
  preservedLayout: boolean;
}
export function validateManualDesignLink(editUrl: string): {
  url: string;
  designId: string;
} {
  let url: URL;
  try {
    url = new URL(editUrl);
  } catch {
    throw new ServiceError(
      "INVALID_CANVA_LINK",
      "Provide the editable link to the new Canva copy.",
    );
  }
  const match = url.pathname.match(
    /^\/design\/([A-Za-z0-9_-]+)(?:\/[^/]+)?\/edit\/?$/,
  );
  if (
    url.protocol !== "https:" ||
    !["www.canva.com", "canva.com"].includes(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !match
  )
    throw new ServiceError(
      "INVALID_CANVA_LINK",
      "Use an HTTPS Canva /design/<new-design-id>/edit link without credentials.",
    );
  if (referenceDesigns.has(match[1]))
    throw new ServiceError(
      "SOURCE_DESIGN_PROTECTED",
      "The original reference cannot be submitted as new output. Use Make a copy first.",
    );
  url.search = "";
  url.hash = "";
  return { url: url.toString(), designId: match[1] };
}

/** Records an operator-supplied alternative, never claims API generation or visual verification. */
export async function registerManualDesign(
  projectId: string,
  templateId: string,
  input: ManualDesignInput,
  actorId: string,
): Promise<GeneratedDesign> {
  const link = validateManualDesignLink(input.editUrl);
  if (
    !input.preservedLayout ||
    !Number.isInteger(input.pageCount) ||
    input.pageCount < 1 ||
    input.pageCount > 30
  )
    throw new ServiceError(
      "MANUAL_REVIEW_REQUIRED",
      "Confirm that the new copy preserves the reference layout and enter its actual page count (1–30).",
    );
  let result: GeneratedDesign | undefined;
  await mutateWorkspace(
    actorId,
    "CANVA_MANUAL_COPY_SUBMITTED",
    projectId,
    (data) => {
      const project = data.projects.find((p) => p.id === projectId),
        template = data.templates.find((t) => t.id === templateId);
      if (!project || !template)
        throw new ServiceError(
          "NOT_FOUND",
          "Select a project and its approved reference.",
          404,
        );
      validateTemplate(template, project);
      if (!["DESIGN", "REVIEW"].includes(project.stage))
        throw new ServiceError(
          "INVALID_STAGE",
          "Move the sourced project to Design or Review before submitting a manual design.",
          409,
        );
      if (!project.sourceUrls.length || !project.draftCopy.trim())
        throw new ServiceError(
          "RESEARCH_REQUIRED",
          "A sourced draft is required before submitting a design.",
        );
      if (data.templates.some((t) => t.designId === link.designId))
        throw new ServiceError(
          "SOURCE_DESIGN_PROTECTED",
          "Submit a new copy, never a source template.",
        );
      if (data.designs.some((d) => d.externalId === link.designId))
        throw new ServiceError(
          "DUPLICATE_DESIGN",
          "This design copy is already recorded.",
        );
      if (project.format === "REEL" && input.pageCount !== 1)
        throw new ServiceError(
          "INVALID_REEL_PAGES",
          "The landscape-video reel copy must have one 1080 × 1920 page.",
        );
      const now = new Date().toISOString();
      result = {
        id: randomUUID(),
        projectId,
        templateId,
        status: "MANUAL_REVIEW",
        editUrl: link.url,
        externalId: link.designId,
        error:
          "운영자가 등록한 사본입니다. Canva API 생성, 페이지 수, 디자인과 소유권은 확인되지 않았습니다. 사람이 직접 검토해야 합니다.",
        createdAt: now,
      };
      data.designs.unshift(result);
      project.stage = "REVIEW";
      project.updatedAt = now;
      project.revisions.push({
        at: now,
        actorId,
        note: `Canva 사본 검토 요청: ${link.designId}, 운영자가 확인한 ${input.pageCount}페이지, ${template.width} × ${template.height} 원본. API 생성 성공으로 표시하지 않습니다.`,
      });
      data.approvals = data.approvals.filter((a) => a.projectId !== projectId);
    },
  );
  return result!;
}

/** Human attestation maps a preserved working copy; API inspection verifies field types, not pixel equality. */
export async function configureCanvaTemplate(
  templateId: string,
  brandTemplateId: string,
  pageCount: number,
  actorId: string,
) {
  if (
    !/^[A-Za-z0-9_-]{1,200}$/.test(brandTemplateId) ||
    !Number.isInteger(pageCount) ||
    pageCount < 1 ||
    pageCount > 30
  )
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "올바른 브랜드 템플릿 ID와 페이지 수를 입력하세요.",
    );
  await mutateWorkspace(
    actorId,
    "CANVA_BINDING_HUMAN_CONFIRMED",
    templateId,
    (draft) => {
      const template = draft.templates.find((t) => t.id === templateId);
      if (!template || !referenceDesigns.has(template.designId))
        throw new ServiceError(
          "NOT_FOUND",
          "승인된 실제 원본을 선택하세요.",
          404,
        );
      if (template.format === "REEL" && pageCount !== 1)
        throw new ServiceError(
          "INVALID_CONFIGURATION",
          "릴스 템플릿은 1페이지여야 합니다.",
          409,
        );
      template.configuration = { brandTemplateId, pageCount };
      template.status = "UNINSPECTED";
      template.fields = [];
      template.inspectedAt = null;
    },
  );
  return inspectCanvaTemplate(templateId, actorId);
}

type ExportJob = {
  id: string;
  status: "in_progress" | "success" | "failed";
  urls?: string[];
  error?: { code?: string };
};
/** Exports a new reviewed copy, never one of the protected original designs. */
export async function exportCanvaDesign(
  designId: string,
  actorId: string,
  refresh = false,
) {
  const data = await getWorkspaceData();
  const design = data.designs.find((d) => d.id === designId);
  const project = data.projects.find((p) => p.id === design?.projectId);
  if (
    !design ||
    !project ||
    !design.externalId ||
    !["READY", "MANUAL_REVIEW"].includes(design.status) ||
    referenceDesigns.has(design.externalId)
  )
    throw new ServiceError(
      "DESIGN_REQUIRED",
      "원본이 아닌 새 Canva 디자인을 먼저 생성하거나 사본을 등록하세요.",
      409,
    );
  if (!["DESIGN", "REVIEW"].includes(project.stage))
    throw new ServiceError(
      "REVIEW_REQUIRED",
      "내보내기는 디자인·검토 단계에서 진행합니다. 승인된 프로젝트는 검토로 되돌려 새 파일을 검토하세요.",
      409,
    );
  const token = await getIntegrationToken("canva");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Canva 디자인 읽기 권한으로 계정을 연결하세요.",
      409,
    );
  let ids: string[] = [];
  const jobs: ExportJob[] = [];
  if (refresh) {
    if (!design.exportJobId)
      throw new ServiceError(
        "RECONCILIATION_REQUIRED",
        "확인할 내보내기 작업이 없습니다.",
        409,
      );
    try {
      ids = JSON.parse(design.exportJobId);
    } catch {
      ids = [design.exportJobId];
    }
    if (
      !Array.isArray(ids) ||
      ids.some((id) => typeof id !== "string" || id === "pending")
    )
      throw new ServiceError(
        "RECONCILIATION_REQUIRED",
        "내보내기 요청 결과가 불명확합니다. Canva에서 확인하고 새 사본을 검토하세요.",
        409,
      );
    for (const id of ids) {
      const response = await officialApi<{ job: ExportJob }>(
        `${CANVA}/exports/${encodeURIComponent(id)}`,
        { token },
      );
      jobs.push(response.job);
    }
  } else {
    const metadata = await officialApi<{
      design: { id: string; page_count?: number };
    }>(`${CANVA}/designs/${encodeURIComponent(design.externalId)}`, { token });
    if (metadata.design.id !== design.externalId)
      throw new ServiceError(
        "INVALID_API_RESPONSE",
        "Canva 디자인 ID가 요청한 사본과 일치하지 않습니다.",
        502,
      );
    const pageCount = metadata.design.page_count;
    if (
      !pageCount ||
      !Number.isInteger(pageCount) ||
      pageCount < 1 ||
      pageCount > (project.format === "REEL" ? 1 : 10)
    )
      throw new ServiceError(
        "PAGE_COUNT_REQUIRED",
        "Instagram 게시용 캐러셀은 2~10페이지, 릴스는 1페이지여야 합니다. Canva에서 페이지 수를 확인하세요.",
        409,
      );
    if (project.format === "CAROUSEL" && pageCount < 2)
      throw new ServiceError(
        "PAGE_COUNT_REQUIRED",
        "캐러셀에는 최소 2페이지가 필요합니다.",
        409,
      );
    await mutateWorkspace(
      actorId,
      "CANVA_EXPORT_REQUESTED",
      designId,
      (draft) => {
        const target = draft.designs.find((d) => d.id === designId)!;
        if (target.exportJobId)
          throw new ServiceError(
            "EXPORT_ALREADY_REQUESTED",
            "내보내기 요청이 이미 있습니다. 결과 확인을 눌러주세요. 만료된 파일은 새 사본으로 다시 검토하세요.",
            409,
          );
        target.exportJobId = JSON.stringify(["pending"]);
        target.exportUrls = [];
        draft.approvals = draft.approvals.filter(
          (a) => a.projectId !== project.id,
        );
      },
    );
    // A separate page export avoids ZIP archives and preserves the exact page order.
    for (let page = 1; page <= pageCount; page++) {
      const response = await officialApi<{ job: ExportJob }>(
        `${CANVA}/exports`,
        {
          token,
          method: "POST",
          body: {
            design_id: design.externalId,
            format:
              project.format === "REEL"
                ? { type: "mp4", quality: "vertical_1080p", pages: [1] }
                : {
                    type: "png",
                    width: 1080,
                    height: 1350,
                    pages: [page],
                    export_quality: "regular",
                  },
          },
        },
      );
      const job = response.job;
      if (
        !job?.id ||
        !["in_progress", "success", "failed"].includes(job.status)
      )
        throw new ServiceError(
          "API_OUTCOME_UNKNOWN",
          "Canva 내보내기 결과가 불명확합니다. 성공으로 기록하지 않았습니다.",
          502,
        );
      ids.push(job.id);
      jobs.push(job);
      await mutateWorkspace(
        actorId,
        "CANVA_PAGE_EXPORT_ACCEPTED",
        designId,
        (draft) => {
          draft.designs.find((d) => d.id === designId)!.exportJobId =
            JSON.stringify(page < pageCount ? [...ids, "pending"] : ids);
        },
      );
    }
  }
  if (
    jobs.some(
      (job) =>
        !job?.id || !["in_progress", "success", "failed"].includes(job.status),
    )
  )
    throw new ServiceError(
      "INVALID_API_RESPONSE",
      "Canva 작업 상태를 확인할 수 없습니다.",
      502,
    );
  const status = jobs.some((job) => job.status === "failed")
    ? "failed"
    : jobs.every((job) => job.status === "success")
      ? "success"
      : "in_progress";
  const urls =
    status === "success"
      ? jobs.map((job) => {
          if (job.urls?.length !== 1)
            throw new ServiceError(
              "INVALID_API_RESPONSE",
              "페이지별 파일 주소를 확인하지 못했습니다. Canva에서 직접 내보낸 이미지 주소를 사용하세요.",
              502,
            );
          const url = job.urls[0];
          try {
            const parsed = new URL(url);
            if (
              parsed.protocol !== "https:" ||
              parsed.username ||
              parsed.password ||
              /\.zip$/i.test(parsed.pathname)
            )
              throw new Error();
          } catch {
            throw new ServiceError(
              "INVALID_API_RESPONSE",
              "올바른 공개 HTTPS 미디어 주소가 아닙니다.",
              502,
            );
          }
          return url;
        })
      : [];
  const result = await mutateWorkspace(
    actorId,
    "CANVA_EXPORT_STATUS_CONFIRMED",
    designId,
    (draft) => {
      const target = draft.designs.find((d) => d.id === designId)!;
      target.exportJobId = JSON.stringify(ids);
      target.exportUrls = urls ?? [];
      target.error =
        status === "failed"
          ? `Canva 내보내기 실패 (${jobs.find((job) => job.status === "failed")?.error?.code ?? "unknown"}). 이용 권한 및 유료 요소를 확인하세요.`
          : null;
      if (status === "success") {
        const current = draft.projects.find((p) => p.id === project.id)!;
        current.stage = "REVIEW";
        current.updatedAt = new Date().toISOString();
        current.revisions.push({
          at: current.updatedAt,
          actorId,
          note: "Canva 내보내기 파일을 받았습니다. 파일 내용·순서·브랜드·출처를 확인하고 편집 및 게시를 각각 승인하세요. 다운로드 주소는 만료될 수 있습니다.",
        });
        draft.approvals = draft.approvals.filter(
          (a) => a.projectId !== project.id,
        );
      }
    },
  );
  return result.designs.find((d) => d.id === designId)!;
}
