"use client";

import { useState } from "react";
import { ManualCanvaCopy } from "@/components/manual-canva-copy";
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  Layers,
  LayoutTemplate,
  ScanLine,
  ShieldCheck,
  Video,
} from "lucide-react";
import {
  useWorkspace,
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { CanvaTemplate } from "@/lib/domain";

const requiredFields = ["headline", "body", "image", "source_credit"];
function stateLabel(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export function CanvaFactory() {
  const { data, loading, mutate, refresh } = useWorkspace();
  const [projectId, setProjectId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const project = data?.projects.find((p) => p.id === projectId);
  const template = data?.templates.find((t) => t.id === templateId);
  const eligible = (t: CanvaTemplate) =>
    !project ||
    (t.channelId === project.channelId &&
      t.format === project.format &&
      (!t.operatorId || t.operatorId === project.operatorId));

  async function inspect(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      await mutate("/api/canva", { action: "inspect", templateId: id });
      setNotice({
        text: "Inspection request processed. Review the dataset status and required fields.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "Template inspection could not be completed.",
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }
  async function refreshDesign(id: string) {
    setBusy(id);
    setNotice(null);
    try {
      await mutate("/api/canva", { action: "refresh", designId: id });
      setNotice({
        text: "Canva job status checked. Review the confirmed result below.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error ? err.message : "Could not check the Canva job.",
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }
  async function generate() {
    setBusy("generate");
    setNotice(null);
    try {
      await mutate("/api/canva", { action: "generate", projectId, templateId });
      setNotice({
        text: "Design request recorded. Check the result below and the Designer task in the Office.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "Design generation could not be completed.",
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }

  if (loading) return <WorkspaceLoading />;
  if (!data) return <WorkspaceError />;
  const researchReady = !!project?.sourceUrls.length;
  const copyReady = !!project?.draftCopy.trim();
  const selectionReady =
    !!template && !!project && eligible(template) && template.approved;
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow">DESIGN / REVIEW</p>
          <h1 className="page-title">Canva Factory</h1>
          <p className="mt-2 muted">
            From approved research to an editable design, with your brand
            intact.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/settings">
            <LayoutTemplate size={15} /> Integration settings
          </a>
        </Button>
      </header>
      {notice && (
        <div
          role={notice.failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-red-400/40 bg-red-500/5 text-red-600" : "border-[var(--border)] bg-[var(--surface)]"}`}
        >
          {notice.text}
        </div>
      )}
      <section className="panel">
        <div className="panel-header flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Approved references</h2>
            <p className="mt-1 text-xs muted">
              Reference designs stay untouched. New output must receive human
              approval.
            </p>
          </div>
          <Badge>{data.templates.length} references</Badge>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {data.templates.map((t) => (
            <article
              key={t.id}
              className={`overflow-hidden rounded-xl border transition-colors ${templateId === t.id ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--border)]"} ${!eligible(t) ? "opacity-55" : ""}`}
            >
              <button
                className="block w-full text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onClick={() => setTemplateId(t.id)}
                aria-label={`Select ${t.name}`}
                aria-pressed={templateId === t.id}
                disabled={!eligible(t)}
              >
                <div className="relative flex h-48 items-center justify-center bg-[var(--muted)]">
                  <div
                    className={`relative border border-neutral-600/30 bg-[#171717] text-white shadow-lg ${t.format === "REEL" ? "h-40 w-[90px]" : "h-40 w-32"}`}
                  >
                    <div className="absolute left-3 right-3 top-3 flex items-center justify-between">
                      <span className="text-[7px] font-bold tracking-[.12em]">
                        THE MOVE
                      </span>
                      <span className="h-1.5 w-1.5 rounded-full bg-[#e84c4c]" />
                    </div>
                    {t.format === "REEL" ? (
                      <>
                        <div className="absolute left-3 right-3 top-12 h-3 border-t-2 border-white/80" />
                        <div className="absolute left-0 right-0 top-[68px] flex h-[51px] items-center justify-center bg-neutral-700">
                          <Video size={18} className="text-neutral-400" />
                        </div>
                        <div className="absolute bottom-6 left-3 right-3 h-1 bg-white/30" />
                      </>
                    ) : (
                      <>
                        <div className="absolute left-3 right-6 top-11 space-y-2">
                          <div className="h-2 bg-white/85" />
                          <div className="h-2 w-4/5 bg-white/85" />
                        </div>
                        <div className="absolute bottom-7 left-3 right-3 h-12 bg-neutral-700" />
                      </>
                    )}
                    <div className="absolute bottom-3 left-3 text-[5px] tracking-wider text-neutral-400">
                      REFERENCE LAYOUT
                    </div>
                  </div>
                  <span className="absolute bottom-3 left-3 text-[9px] uppercase tracking-widest muted">
                    Schematic preview
                  </span>
                  {templateId === t.id && (
                    <span className="absolute right-3 top-3 rounded-full bg-[var(--accent)] p-1.5 text-white">
                      <Check size={13} />
                    </span>
                  )}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-sm font-semibold">{t.name}</h3>
                    {t.format === "REEL" ? (
                      <Video size={16} className="shrink-0 muted" />
                    ) : (
                      <Layers size={16} className="shrink-0 muted" />
                    )}
                  </div>
                  <p className="mt-2 text-xs muted">
                    {t.width} × {t.height} ·{" "}
                    {t.operatorId
                      ? data.operators.find((o) => o.id === t.operatorId)
                          ?.name || "Assigned operator"
                      : "Shared template"}
                  </p>
                  <p className="mt-2 font-mono text-[10px] muted">
                    {t.designId}
                  </p>
                </div>
              </button>
              <div className="border-t border-[var(--border)] p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <Badge
                    className={
                      t.status === "READY"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : t.status === "SETUP_REQUIRED"
                          ? "text-amber-700 dark:text-amber-400"
                          : ""
                    }
                  >
                    {stateLabel(t.status)}
                  </Badge>
                  {t.approved && <Badge>Approved reference</Badge>}
                </div>
                <p className="min-h-9 text-[11px] leading-relaxed muted">
                  {t.status === "READY"
                    ? `${t.fields.length} dataset fields inspected. Field compatibility is checked during generation.`
                    : t.status === "SETUP_REQUIRED"
                      ? "Autofill setup is required. Configure supported fields on an approved working copy, then inspect again."
                      : "Inspect the dataset to check whether this design supports autofill."}
                </p>
                {t.fields.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] muted">Inspected fields</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {t.fields.map((field) => (
                        <Badge key={field} className="font-mono text-[9px]">
                          {field}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mt-3 flex items-center justify-between gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => inspect(t.id)}
                    disabled={!!busy}
                  >
                    <ScanLine size={13} />
                    {busy === t.id ? "Inspecting…" : "Inspect dataset"}
                  </Button>
                  <a
                    className="inline-flex items-center gap-1 text-[11px] muted hover:text-[var(--text)]"
                    href={`https://www.canva.com/design/${t.designId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Reference <ArrowUpRight size={12} />
                  </a>
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="panel">
          <div className="panel-header !block">
            <h2 className="font-semibold">Generate a new design</h2>
            <p className="mt-1 text-xs muted">
              Select a Studio project and a matching reference. Output is queued
              for review.
            </p>
          </div>
          <div className="space-y-5 p-5">
            <label className="block">
              <span className="field-label">Editorial project</span>
              <select
                className="select mt-2 w-full"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setTemplateId("");
                }}
              >
                <option value="">Choose a project…</option>
                {data.projects
                  .filter((p) => p.stage !== "PUBLISHED")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {p.format.toLowerCase()}
                    </option>
                  ))}
              </select>
            </label>
            {project && (
              <div className="rounded-lg border border-[var(--border)] p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>
                    {
                      data.channels.find((c) => c.id === project.channelId)
                        ?.name
                    }
                  </Badge>
                  <Badge>{project.format.toLowerCase()}</Badge>
                  <Badge>{stateLabel(project.stage)}</Badge>
                </div>
                <p className="mt-3 text-sm font-medium">{project.title}</p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed muted">
                  {project.draftCopy ||
                    "No draft copy yet. Write the draft in the Studio before generating."}
                </p>
                <a
                  href="/studio"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  Edit project in Studio <ArrowUpRight size={12} />
                </a>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Readiness
                ready={researchReady}
                title="Research references"
                detail={
                  researchReady
                    ? `${project!.sourceUrls.length} source link(s) attached`
                    : "Attach source references in the Studio"
                }
              />
              <Readiness
                ready={copyReady}
                title="Draft copy"
                detail={
                  copyReady
                    ? "Draft copy is available for validation"
                    : "Write a sourced, channel-specific draft"
                }
              />
              <Readiness
                ready={selectionReady}
                title="Approved reference"
                detail={
                  selectionReady
                    ? template!.name
                    : "Choose a matching template above"
                }
              />
              <Readiness
                ready={false}
                title="Asset & overflow validation"
                detail="Checked by the generation service"
                pending
              />
            </div>
            {template && template.status !== "READY" && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                This template has no verified autofill dataset. Inspect it
                first. Generation will return a setup requirement if compatible
                fields or API access are unavailable.
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <p className="max-w-sm text-xs leading-relaxed muted">
                Canva generation creates a draft. Instagram publication requires
                a separate human approval.
              </p>
              <Button
                disabled={
                  !!busy || !researchReady || !copyReady || !selectionReady
                }
                onClick={generate}
              >
                <Copy size={14} />
                {busy === "generate" ? "Requesting…" : "Generate in Canva"}
              </Button>
            </div>
          </div>
        </section>
        <aside className="panel">
          <div className="panel-header !block">
            <h2 className="text-sm font-semibold">Template setup checklist</h2>
          </div>
          <ol className="space-y-4 p-5 text-sm">
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                1
              </span>
              <div>
                Connect Canva
                <p className="mt-1 text-xs leading-relaxed muted">
                  Authorize a Canva account and verify the required scopes and
                  autofill access.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                2
              </span>
              <div>
                Inspect the reference dataset
                <p className="mt-1 text-xs leading-relaxed muted">
                  Read the source design, then inspect its mapped brand
                  template. A design ID alone does not establish autofill
                  support.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                3
              </span>
              <div>
                Configure editable fields
                <p className="mt-1 text-xs leading-relaxed muted">
                  Duplicate the reference without editing it. Publish an
                  approved brand template with fields such as{" "}
                  {requiredFields.join(", ")} and configure
                  CANVA_BRAND_TEMPLATE_MAP on the server. Reels require manual
                  headline and landscape-video replacement on a new copy.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                4
              </span>
              <div>
                Preview and approve
                <p className="mt-1 text-xs leading-relaxed muted">
                  Verify page count, line wrapping, overflow, video aspect
                  ratio, source credit and branding.
                </p>
              </div>
            </li>
          </ol>
          <div className="mx-5 mb-5 rounded-lg bg-[var(--muted)] p-3">
            <ShieldCheck size={16} className="mb-2 text-[var(--accent)]" />
            <p className="text-xs leading-relaxed muted">
              THE MOVE reels exclusively use{" "}
              <strong className="font-medium text-[var(--text)]">
                DAHPcvVkH8k
              </strong>
              . Its landscape-video placement is preserved within the 1080 ×
              1920 canvas.
            </p>
          </div>
        </aside>
      </div>
      <ManualCanvaCopy project={project} template={template} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">Design requests</h2>
            <p className="mt-1 text-xs muted">
              API-generated links require Canva confirmation. Operator-submitted
              copies are labeled Manual review.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            Refresh requests
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Project</th>
                <th className="text-left">Reference</th>
                <th className="text-left">Status</th>
                <th className="text-left">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.designs.map((d) => (
                <tr key={d.id}>
                  <td className="min-w-[180px] text-sm font-medium">
                    {data.projects.find((p) => p.id === d.projectId)?.title ||
                      "Unknown project"}
                  </td>
                  <td className="text-xs muted">
                    {data.templates.find((t) => t.id === d.templateId)?.name ||
                      "Unknown template"}
                  </td>
                  <td>
                    <Badge
                      className={
                        d.status === "FAILED"
                          ? "text-red-600"
                          : d.status === "READY"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : ""
                      }
                    >
                      {stateLabel(d.status)}
                    </Badge>
                  </td>
                  <td className="max-w-md">
                    {d.editUrl &&
                    (d.status === "READY" || d.status === "MANUAL_REVIEW") ? (
                      <a
                        className="inline-flex items-center gap-2 text-xs text-[var(--accent)] hover:underline"
                        href={d.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.status === "MANUAL_REVIEW"
                          ? "Open copy for human review"
                          : "Open editable design"}{" "}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <div>
                        <p className="whitespace-normal text-xs leading-relaxed muted">
                          {d.error ||
                            "Waiting for confirmed output. No design link is available yet."}
                        </p>
                        {d.status === "QUEUED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            disabled={!!busy}
                            onClick={() => refreshDesign(d.id)}
                          >
                            {busy === d.id ? "Checking…" : "Check Canva job"}
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.designs.length === 0 && (
            <div className="empty-state">
              <LayoutTemplate size={27} className="mx-auto mb-3 muted" />
              <p className="font-medium">Your next design starts here</p>
              <p className="mt-1 text-sm muted">
                Choose a project to create a new draft from an approved
                reference.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Readiness({
  ready,
  title,
  detail,
  pending = false,
}: {
  ready: boolean;
  title: string;
  detail: string;
  pending?: boolean;
}) {
  return (
    <div className="flex gap-3">
      <span
        className={`mt-0.5 ${ready ? "text-emerald-600" : "text-[var(--muted-text)]"}`}
      >
        {ready ? (
          <CheckCircle2 size={17} />
        ) : pending ? (
          <ScanLine size={17} />
        ) : (
          <AlertCircle size={17} />
        )}
      </span>
      <div>
        <p className="text-xs font-medium">{title}</p>
        <p className="mt-1 text-[11px] muted">{detail}</p>
      </div>
    </div>
  );
}
