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
  | { type: "image"; asset_id: string };
export interface CanvaGenerationOptions {
  fields?: Record<string, CanvaField>;
  pageCount?: number;
}
interface TemplateBinding {
  brandTemplateId: string;
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
    const headline = /headline|title/i.test(name);
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
  if (!binding?.brandTemplateId)
    throw new ServiceError(
      "SETUP_REQUIRED",
      `Reference ${template.designId} is a design ID, not an autofill brand template ID. Duplicate the reference without editing it, publish an approved Brand Template, add dataset fields in Canva, and configure CANVA_BRAND_TEMPLATE_MAP. Canva Enterprise/autofill access may be required.`,
    );
  const response = await officialApi<{ dataset: Dataset }>(
    `${CANVA}/brand-templates/${encodeURIComponent(binding.brandTemplateId)}/dataset`,
    { token },
  );
  if (!response.dataset || !Object.keys(response.dataset).length)
    throw new ServiceError(
      "SETUP_REQUIRED",
      "The selected Brand Template has no autofill dataset. Add and name supported text/image fields in Canva before generating.",
    );
  return { binding, dataset: response.dataset };
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
    await officialApi<{ design: { id: string } }>(
      `${CANVA}/designs/${encodeURIComponent(template.designId)}`,
      { token },
    );
    const { dataset } = await datasetFor(template, token);
    const status =
      template.format === "REEL" ||
      Object.values(dataset).some(
        (field) => !["text", "image"].includes(field.type),
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
    if (/^(headline|title)$/i.test(name))
      result[name] = { type: "text", text: project.title };
    if (/^(body|copy|caption)$/i.test(name))
      result[name] = { type: "text", text: project.draftCopy };
    if (/^(source_credit|sources|credit)$/i.test(name))
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
  if (!project.draftCopy.trim() || !project.sourceUrls.length)
    throw new ServiceError(
      "RESEARCH_REQUIRED",
      "Add draft copy and research source references before Canva production.",
    );
  if (project.format === "REEL")
    throw new ServiceError(
      "SETUP_REQUIRED",
      `Canva Autofill does not support video dataset replacement. Open reference ${THE_MOVE_REEL_DESIGN}, use Make a copy, keep the 1080 × 1920 canvas and landscape-video frame/aspect ratio, replace headline/video, add source credit, and submit the new editable design for human review. Do not modify the reference.`,
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
    if (!["text", "image"].includes(field.type))
      throw new ServiceError(
        "UNSUPPORTED_FIELD",
        `Dataset field ${name} (${field.type}) requires a manual Canva workflow.`,
      );
    if (!fields[name] || fields[name].type !== field.type)
      throw new ServiceError(
        "MISSING_CANVA_FIELD",
        `Provide ${field.type} data for dataset field ${name}. Images require an authorized, existing Canva asset ID; no placeholder asset is generated.`,
      );
    const value = fields[name];
    if (
      value.type === "image" &&
      !/^[A-Za-z0-9_-]{1,200}$/.test(value.asset_id)
    )
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
          brand_template_id: binding.brandTemplateId,
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
        project.stage = "REVIEW";
        project.updatedAt = new Date().toISOString();
        project.revisions.push({
          at: project.updatedAt,
          actorId,
          note: "New Canva design received; human review required. Instagram publishing remains separate.",
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
          "Operator-submitted copy. Canva API generation, page count, layout and ownership are not verified; visual human review is required.",
        createdAt: now,
      };
      data.designs.unshift(result);
      project.stage = "REVIEW";
      project.updatedAt = now;
      project.revisions.push({
        at: now,
        actorId,
        note: `Manual Canva copy submitted for visual review: ${link.designId}, operator-reported ${input.pageCount} page(s), ${template.width} × ${template.height} reference. No API success claimed.`,
      });
      data.approvals = data.approvals.filter((a) => a.projectId !== projectId);
    },
  );
  return result!;
}
