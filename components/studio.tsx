"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Plus,
  ArrowRight,
  CalendarDays,
  Clock3,
  Link2,
  Layers2,
  Clapperboard,
  Check,
  ShieldCheck,
  AlertCircle,
  Search,
  History,
  Save,
  CheckCircle2,
  Send,
  ExternalLink,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProjectAssets } from "@/components/project-assets";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  useWorkspace,
  WorkspaceLoading,
  WorkspaceError,
} from "@/components/workspace-provider";
import { stages } from "@/lib/domain";
import type { Project, Stage, WorkspaceData } from "@/lib/domain";

const labels: Record<Stage, string> = {
  IDEA: "Idea",
  RESEARCH: "Research",
  DRAFT: "Draft",
  DESIGN: "Design",
  REVIEW: "Review",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
};
const colors: Record<Stage, string> = {
  IDEA: "#a7a699",
  RESEARCH: "#7693a3",
  DRAFT: "#ab9574",
  DESIGN: "#9484ae",
  REVIEW: "#cf9955",
  APPROVED: "#6f947a",
  SCHEDULED: "#688d9d",
  PUBLISHED: "#6f947a",
};
type FormValues = {
  title: string;
  channelId: string;
  operatorId: string;
  format: "CAROUSEL" | "REEL";
  sourceUrls: string;
  draftCopy: string;
  dueAt: string;
};
const blank = (data: WorkspaceData): FormValues => ({
  title: "",
  channelId: data.channels[0]?.id ?? "",
  operatorId: data.operators[0]?.id ?? "",
  format: "CAROUSEL",
  sourceUrls: "",
  draftCopy: "",
  dueAt: "",
});
const fromProject = (p: Project): FormValues => ({
  title: p.title,
  channelId: p.channelId,
  operatorId: p.operatorId,
  format: p.format,
  sourceUrls: p.sourceUrls.join("\n"),
  draftCopy: p.draftCopy,
  dueAt: p.dueAt?.slice(0, 10) ?? "",
});

export function Studio() {
  const { data, loading, mutate } = useWorkspace();
  const [channelId, setChannelId] = useState("all");
  const [operatorId, setOperatorId] = useState("all");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<FormValues | null>(null);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState("15");
  const [approvalConfirm, setApprovalConfirm] = useState(false);
  const [publicationConfirm, setPublicationConfirm] = useState(false);
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [approvedPayload, setApprovedPayload] = useState<{
    projectId: string;
    mediaUrl: string;
    caption: string;
  } | null>(null);
  useEffect(() => {
    if (
      data &&
      new URLSearchParams(window.location.search).get("new") === "1"
    ) {
      setForm(blank(data));
      setSelectedId(null);
      setOpen(true);
      const url = new URL(window.location.href);
      url.searchParams.delete("new");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [data]);
  if (loading) return <WorkspaceLoading />;
  if (!data)
    return (
      <>
        <WorkspaceError />
        <div className="empty-state">Your studio could not be loaded.</div>
      </>
    );
  const selected = data.projects.find((p) => p.id === selectedId) ?? null;
  const projects = data.projects.filter(
    (p) =>
      (channelId === "all" || p.channelId === channelId) &&
      (operatorId === "all" || p.operatorId === operatorId) &&
      p.title.toLowerCase().includes(query.toLowerCase()),
  );
  const create = () => {
    setSelectedId(null);
    setForm(blank(data));
    setFormError(null);
    setApprovalConfirm(false);
    setOpen(true);
  };
  const edit = (project: Project) => {
    setSelectedId(project.id);
    setForm(fromProject(project));
    setFormError(null);
    setApprovalConfirm(false);
    setPublicationConfirm(false);
    setMediaUrl("");
    setApprovedPayload(null);
    setCaption(project.draftCopy);
    setScheduledAt("");
    setOpen(true);
  };
  const change = <K extends keyof FormValues>(field: K, value: FormValues[K]) =>
    setForm((previous) => (previous ? { ...previous, [field]: value } : null));
  const submit = async () => {
    if (!form) return;
    if (!form.title.trim()) {
      setFormError("Give your project a title.");
      return;
    }
    const sourceUrls = form.sourceUrls
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);
    for (const url of sourceUrls) {
      try {
        const parsed = new URL(url);
        if (!["https:", "http:"].includes(parsed.protocol)) throw new Error();
      } catch {
        setFormError(
          "Source references must be valid http or https URLs, one per line.",
        );
        return;
      }
    }
    await perform(
      {
        action: selected ? "update" : "create",
        projectId: selected?.id,
        title: form.title.trim(),
        channelId: form.channelId,
        operatorId: form.operatorId,
        format: form.format,
        sourceUrls,
        draftCopy: form.draftCopy,
        dueAt: form.dueAt ? `${form.dueAt}T12:00:00.000Z` : null,
      },
      true,
    );
  };
  const perform = async (payload: unknown, close = false) => {
    setBusy(true);
    setFormError(null);
    try {
      await mutate("/api/projects", payload);
      setApprovalConfirm(false);
      if (close) setOpen(false);
    } catch (cause) {
      setFormError(
        cause instanceof Error
          ? cause.message
          : "This action could not be completed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const locked =
    selected?.stage === "SCHEDULED" || selected?.stage === "PUBLISHED";
  const stageIndex = selected ? stages.indexOf(selected.stage) : 0;
  const nextStage = selected && stageIndex < 4 ? stages[stageIndex + 1] : null;
  const publicationApproval = selected
    ? data.approvals.find(
        (a) =>
          a.projectId === selected.id &&
          a.kind === "PUBLICATION" &&
          a.revisionAt === selected.updatedAt,
      )
    : null;
  const publicationApproved = Boolean(
    publicationApproval &&
      approvedPayload?.projectId === selected?.id &&
      approvedPayload?.mediaUrl === mediaUrl.trim() &&
      approvedPayload?.caption === caption.trim(),
  );
  const selectedChannel = selected
    ? data.channels.find((c) => c.id === selected.channelId)
    : null;
  const publications = selected
    ? data.publications
        .filter((p) => p.projectId === selected.id)
        .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))
    : [];
  const publicationReady = Boolean(
    selected &&
      selected.stage === "APPROVED" &&
      !data.demo &&
      selected.format === "REEL" &&
      selectedChannel?.connected &&
      selectedChannel.platformAccountId,
  );
  const publicationAction = async (payload: unknown, approve = false) => {
    setBusy(true);
    setFormError(null);
    try {
      await mutate("/api/publications", payload);
      if (approve && selected)
        setApprovedPayload({
          projectId: selected.id,
          mediaUrl: mediaUrl.trim(),
          caption: caption.trim(),
        });
      setPublicationConfirm(false);
    } catch (cause) {
      setFormError(
        cause instanceof Error ? cause.message : "Publication action failed.",
      );
    } finally {
      setBusy(false);
    }
  };
  const validateMedia = () => {
    try {
      const url = new URL(mediaUrl);
      if (url.protocol !== "https:") throw new Error();
      if (!caption.trim() || caption.length > 2200) {
        setFormError("Provide a final caption of 1–2200 characters.");
        return false;
      }
      return true;
    } catch {
      setFormError("Provide a public HTTPS URL for your reviewed reel video.");
      return false;
    }
  };
  const schedule = async () => {
    if (!selected || !validateMedia()) return;
    const date = new Date(scheduledAt);
    if (
      !scheduledAt ||
      !Number.isFinite(date.getTime()) ||
      date.getTime() <= Date.now()
    ) {
      setFormError("Choose a future publication date and time.");
      return;
    }
    await publicationAction({
      action: "schedule",
      projectId: selected.id,
      scheduledAt: date.toISOString(),
      mediaUrl: mediaUrl.trim(),
      caption: caption.trim(),
    });
  };
  const productionTotal = data.projects.reduce(
    (sum, p) => sum + p.productionMinutes,
    0,
  );
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">THE EDITORIAL WORKSPACE</p>
          <h1 className="page-title">Content studio</h1>
          <p className="page-description">
            Make good stories. Keep every step of the process in view.
          </p>
        </div>
        <Button onClick={create} size="sm" className="!text-[11px] mt-2">
          <Plus size={14} />
          New project
        </Button>
      </div>
      <WorkspaceError />
      <div className="flex justify-between items-center gap-4 mb-6 flex-wrap">
        <div className="filter-row">
          <div className="relative">
            <select
              className="select !w-40 !text-[10px]"
              aria-label="Filter projects by channel"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="all">All channels</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <select
            className="select !w-40 !text-[10px]"
            aria-label="Filter projects by operator"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
          >
            <option value="all">All operators</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-3 muted" />
            <input
              aria-label="Search projects"
              className="input !pl-8 !w-48 !text-[10px]"
              placeholder="Find a project…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-4 text-[10px] muted">
          <span className="flex items-center gap-1.5">
            <Layers2 size={12} />
            {projects.length} projects
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={12} />
            {(productionTotal / 60).toFixed(1)} hrs recorded
          </span>
        </div>
      </div>
      <div className="status-banner !text-[10px]">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <span>
          Human review is part of the process. Only reviewed content can be
          approved. Canva drafts and stage changes never publish to Instagram.
        </span>
        {data.demo && <span className="demo-label ml-auto">DEMO PROJECTS</span>}
      </div>
      <div className="kanban-scroll">
        <div className="kanban-board">
          {stages.map((stage) => (
            <section
              className="kanban-column"
              key={stage}
              aria-label={`${labels[stage]} projects`}
            >
              <div className="kanban-heading">
                <div className="flex gap-2 items-center">
                  <span
                    style={{ background: colors[stage] }}
                    className="w-1.5 h-1.5 rounded-full"
                  />
                  {labels[stage]}
                </div>
                <span>{projects.filter((p) => p.stage === stage).length}</span>
              </div>
              {projects
                .filter((p) => p.stage === stage)
                .map((project) => {
                  const channel = data.channels.find(
                    (c) => c.id === project.channelId,
                  );
                  const operator = data.operators.find(
                    (o) => o.id === project.operatorId,
                  );
                  return (
                    <button
                      className="project-card"
                      key={project.id}
                      onClick={() => edit(project)}
                      aria-label={`Open ${project.title}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className="text-[8px] font-semibold tracking-wide"
                          style={{ color: channel?.accent }}
                        >
                          {channel?.name.toUpperCase()}
                        </span>
                        {project.format === "CAROUSEL" ? (
                          <Layers2 size={12} className="muted" />
                        ) : (
                          <Clapperboard size={12} className="muted" />
                        )}
                      </div>
                      <h3>{project.title}</h3>
                      <div className="flex items-center gap-1.5 text-[9px] muted mb-3">
                        <span>
                          {project.format === "CAROUSEL" ? "Carousel" : "Reel"}
                        </span>
                        <span>·</span>
                        <Link2 size={10} />
                        <span>{project.sourceUrls.length} sources</span>
                      </div>
                      <div className="project-card-footer">
                        <span className="flex items-center gap-1.5">
                          <span className="w-4 h-4 rounded-full bg-[var(--muted)] text-[7px] grid place-items-center">
                            {operator?.name
                              .split(" ")
                              .map((w) => w[0])
                              .join("")
                              .slice(0, 2)}
                          </span>
                          {operator?.name.split(" ")[0]}
                        </span>
                        <span className="flex gap-1 items-center">
                          {project.dueAt ? (
                            <>
                              <CalendarDays size={9} />
                              {new Date(project.dueAt).toLocaleDateString(
                                "en-US",
                                { month: "short", day: "numeric" },
                              )}
                            </>
                          ) : (
                            <>
                              <Clock3 size={9} />
                              {project.productionMinutes}m
                            </>
                          )}
                        </span>
                      </div>
                    </button>
                  );
                })}
              {projects.filter((p) => p.stage === stage).length === 0 && (
                <div className="text-[9px] muted text-center py-10">
                  {stage === "PUBLISHED"
                    ? "No published projects"
                    : stage === "SCHEDULED"
                      ? "No scheduled projects"
                      : "A little room for the next idea."}
                </div>
              )}
              {stage === "IDEA" && (
                <button
                  onClick={create}
                  className="flex items-center justify-center gap-1.5 text-[10px] muted p-2 w-full hover:text-[var(--text)]"
                >
                  <Plus size={12} />
                  Add an idea
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
      <div className="text-[9px] muted mt-2 flex items-center justify-between gap-3">
        <span>
          Click a project to edit copy, review sources, and move it forward.
        </span>
        <span>
          {data.demo
            ? "Sample workflow · no actual publications"
            : "Publication status reflects recorded platform results"}
        </span>
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold tracking-tight pr-7">
            {selected ? "Project workspace" : "Start a new story"}
          </DialogTitle>
          <DialogDescription className="text-[11px] muted mt-2 mb-5">
            {selected
              ? "Keep your sources, copy, and review history together."
              : "Give your idea a home. You can add research and draft copy as you go."}
          </DialogDescription>
          {selected && (
            <div className="flex flex-wrap gap-2 mb-5">
              <Badge>{labels[selected.stage]}</Badge>
              <Badge>{selected.format === "REEL" ? "Reel" : "Carousel"}</Badge>
              <span className="text-[10px] muted flex items-center gap-1">
                <Clock3 size={11} />
                {selected.productionMinutes} minutes recorded
              </span>
            </div>
          )}
          {selected?.stage === "APPROVED" && (
            <div className="status-banner !text-[10px]">
              Saving edits sends this project back to Review and invalidates the
              previous approval.
            </div>
          )}
          {locked && (
            <div className="status-banner !text-[10px]">
              This project is {labels[selected!.stage].toLowerCase()}. Editing
              is locked; scheduled content must be cancelled before editing.
            </div>
          )}
          {form && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void submit();
              }}
              className="form-grid"
            >
              <div className="form-full">
                <label htmlFor="project-title" className="field-label">
                  Project title
                </label>
                <input
                  id="project-title"
                  className="input"
                  placeholder="What’s the story?"
                  value={form.title}
                  onChange={(e) => change("title", e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label htmlFor="project-channel" className="field-label">
                  Channel
                </label>
                <select
                  id="project-channel"
                  className="select"
                  value={form.channelId}
                  onChange={(e) => change("channelId", e.target.value)}
                >
                  {data.channels.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="project-operator" className="field-label">
                  Assigned operator
                </label>
                <select
                  id="project-operator"
                  className="select"
                  value={form.operatorId}
                  onChange={(e) => change("operatorId", e.target.value)}
                >
                  {data.operators.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="project-format" className="field-label">
                  Content format
                </label>
                <select
                  id="project-format"
                  className="select"
                  value={form.format}
                  onChange={(e) =>
                    change("format", e.target.value as FormValues["format"])
                  }
                >
                  <option value="CAROUSEL">Carousel · 1080 × 1350</option>
                  <option value="REEL">Reel · 1080 × 1920</option>
                </select>
              </div>
              <div>
                <label htmlFor="project-due" className="field-label">
                  Due date
                </label>
                <input
                  id="project-due"
                  type="date"
                  className="input"
                  value={form.dueAt}
                  onChange={(e) => change("dueAt", e.target.value)}
                />
              </div>
              <div className="form-full">
                <label htmlFor="project-sources" className="field-label">
                  Source references
                </label>
                <textarea
                  id="project-sources"
                  className="input min-h-[70px] text-[11px]"
                  value={form.sourceUrls}
                  onChange={(e) => change("sourceUrls", e.target.value)}
                  placeholder="https://source.example/article\nOne source URL per line"
                />
                <p className="field-hint">
                  Use verifiable source links. Research and approval require
                  supporting evidence.
                </p>
              </div>
              <div className="form-full">
                <label htmlFor="project-draft" className="field-label">
                  Draft copy
                </label>
                <textarea
                  id="project-draft"
                  className="input min-h-[130px] text-[12px] leading-relaxed"
                  value={form.draftCopy}
                  onChange={(e) => change("draftCopy", e.target.value)}
                  placeholder="Start with a clear angle. Add your headline, page copy, and caption here…"
                />
              </div>
              <div className="form-full">
                <details className="border border-[var(--border)] rounded-lg p-3 text-[10px]">
                  <summary className="cursor-pointer font-semibold">
                    Channel writing guidelines · v
                    {
                      data.channels.find((c) => c.id === form.channelId)
                        ?.guidelineVersion
                    }
                  </summary>
                  <p className="muted whitespace-pre-wrap leading-relaxed mt-2">
                    {
                      data.channels.find((c) => c.id === form.channelId)
                        ?.guidelines
                    }
                  </p>
                </details>
              </div>
              {formError && (
                <div
                  className="form-full status-banner error !mb-0"
                  role="alert"
                >
                  <AlertCircle size={14} className="shrink-0 mt-0.5" />
                  {formError}
                </div>
              )}
              <div className="form-full flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setOpen(false)}
                  disabled={busy}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={busy || locked}>
                  <Save size={14} />
                  {busy
                    ? "Saving…"
                    : selected
                      ? "Save changes"
                      : "Create project"}
                </Button>
              </div>
            </form>
          )}
          {selected && (
            <ProjectAssets
              key={selected.id}
              project={selected}
              disabled={busy}
            />
          )}
          {selected && (
            <div className="mt-6 pt-5 border-t border-[var(--border)]">
              <h3 className="text-[11px] font-semibold mb-3">
                Editorial actions
              </h3>
              <div className="flex flex-wrap gap-2">
                {nextStage && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void perform({
                        action: "transition",
                        projectId: selected.id,
                        stage: nextStage,
                      })
                    }
                  >
                    Move to {labels[nextStage]}
                    <ArrowRight size={13} />
                  </Button>
                )}
                {["REVIEW", "APPROVED"].includes(selected.stage) && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      void perform({
                        action: "transition",
                        projectId: selected.id,
                        stage:
                          selected.stage === "APPROVED" ? "REVIEW" : "DRAFT",
                      })
                    }
                  >
                    Return to{" "}
                    {selected.stage === "APPROVED" ? "Review" : "Draft"}
                  </Button>
                )}
                {selected.stage === "REVIEW" && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() => setApprovalConfirm(true)}
                  >
                    <ShieldCheck size={13} />
                    Review & approve
                  </Button>
                )}
                {["DESIGN", "REVIEW", "APPROVED"].includes(selected.stage) && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/canva">
                      <Layers2 size={13} />
                      Open Canva Factory
                    </Link>
                  </Button>
                )}
                {selected.stage === "APPROVED" && (
                  <span className="flex items-center gap-1.5 text-[10px] positive">
                    <CheckCircle2 size={13} />
                    Editorially approved
                  </span>
                )}
              </div>
              {approvalConfirm && (
                <div className="status-banner !mt-3 !mb-0 !block">
                  <p className="text-[11px] font-semibold text-[var(--text)] mb-1">
                    Confirm human approval
                  </p>
                  <p className="text-[10px] mb-3">
                    I have checked the source references, uncertain claims,
                    draft copy, and design. Approving records my review of the
                    saved revision. Save any changes before approving.
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void perform({
                          action: "approve",
                          projectId: selected.id,
                        })
                      }
                    >
                      <Check size={13} />
                      Confirm approval
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setApprovalConfirm(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-end gap-2 mt-5">
                <div className="flex-1">
                  <label className="field-label" htmlFor="production-minutes">
                    Record production time
                  </label>
                  <input
                    id="production-minutes"
                    className="input !text-[11px]"
                    type="number"
                    min="1"
                    max="1440"
                    value={minutes}
                    onChange={(e) => setMinutes(e.target.value)}
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="!h-9"
                  disabled={
                    busy ||
                    !Number.isInteger(Number(minutes)) ||
                    Number(minutes) < 1 ||
                    Number(minutes) > 1440
                  }
                  onClick={() =>
                    void perform({
                      action: "track-time",
                      projectId: selected.id,
                      minutes: Number(minutes),
                    })
                  }
                >
                  <Clock3 size={12} />
                  Add minutes
                </Button>
              </div>
              {selected.stage === "APPROVED" && (
                <section className="mt-6 pt-5 border-t border-[var(--border)]">
                  <h3 className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Send size={13} />
                    Instagram publication
                  </h3>
                  <p className="field-hint mb-3">
                    A separate human publication approval is required for this
                    saved revision. Scheduling queues a job; only a confirmed
                    Meta response records successful publication.
                  </p>
                  {data.demo ? (
                    <div className="status-banner !text-[10px] !mb-0">
                      Publishing is disabled in demo mode. Initialize a live
                      workspace and authorize your professional Instagram
                      account in Settings.
                    </div>
                  ) : selected.format === "CAROUSEL" ? (
                    <div className="status-banner !text-[10px] !mb-0 !block">
                      Carousel scheduling requires an approved ordered image
                      list and Meta child containers. This workflow is pending.
                      Export the reviewed carousel from Canva and publish it
                      manually.
                      <Link
                        href="/canva"
                        className="flex items-center gap-1 mt-2 text-[var(--text)] font-medium"
                      >
                        Open Canva Factory
                        <ArrowRight size={11} />
                      </Link>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-media"
                          >
                            Final reel video URL
                          </label>
                          <input
                            id="publication-media"
                            className="input text-[11px]"
                            type="url"
                            placeholder="https://your-cdn.example/reviewed-reel.mp4"
                            value={mediaUrl}
                            onChange={(e) => {
                              setMediaUrl(e.target.value);
                              setApprovedPayload(null);
                            }}
                          />
                          <p className="field-hint">
                            Use an accessible HTTPS video export. An editable
                            Canva design link cannot be published as a video.
                          </p>
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-caption"
                          >
                            Final caption
                          </label>
                          <textarea
                            id="publication-caption"
                            className="input text-[11px] min-h-[80px]"
                            maxLength={2200}
                            value={caption}
                            onChange={(e) => {
                              setCaption(e.target.value);
                              setApprovedPayload(null);
                            }}
                          />
                          <p className="field-hint">
                            {caption.length} / 2200 characters · include source
                            credit
                          </p>
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-time"
                          >
                            Publication date & time
                          </label>
                          <input
                            id="publication-time"
                            className="input text-[11px]"
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                          />
                          <p className="field-hint">
                            Time zone:{" "}
                            {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                            The worker publishes at or after the scheduled time.
                          </p>
                        </div>
                      </div>
                      {!selectedChannel?.connected ||
                      !selectedChannel.platformAccountId ? (
                        <div className="status-banner !text-[10px] !mt-3">
                          Authorize and map an Instagram professional account
                          before scheduling.
                          <Link
                            href="/settings"
                            className="font-semibold ml-auto shrink-0"
                          >
                            Open Settings
                          </Link>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        {publicationApproved ? (
                          <span className="text-[10px] positive flex items-center gap-1">
                            <ShieldCheck size={13} />
                            Publication approved ·{" "}
                            {
                              data.operators.find(
                                (o) => o.id === publicationApproval!.actorId,
                              )?.name
                            }
                          </span>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={busy || !publicationReady}
                            onClick={() => {
                              setFormError(null);
                              if (validateMedia()) setPublicationConfirm(true);
                            }}
                          >
                            <ShieldCheck size={13} />
                            Review publication
                          </Button>
                        )}
                        <Button
                          size="sm"
                          disabled={
                            busy || !publicationReady || !publicationApproved
                          }
                          onClick={() => void schedule()}
                        >
                          <CalendarDays size={13} />
                          Schedule reel
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
              {publications.length > 0 && (
                <section className="mt-5 pt-4 border-t border-[var(--border)]">
                  <h3 className="text-[11px] font-semibold mb-3">
                    Publication status
                  </h3>
                  {publications.map((publication) => (
                    <div
                      key={publication.id}
                      className="border border-[var(--border)] rounded-lg p-3 mb-2"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <Badge>{publication.status.replaceAll("_", " ")}</Badge>
                        {publication.status === "SCHEDULED" && (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={busy}
                            onClick={() =>
                              void publicationAction({
                                action: "cancel",
                                publicationId: publication.id,
                              })
                            }
                          >
                            <XCircle size={12} />
                            Cancel schedule
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] muted mt-2">
                        {new Date(publication.scheduledAt).toLocaleString()} ·{" "}
                        {selectedChannel?.name}
                      </p>
                      {publication.platformPostId && (
                        <p className="text-[10px] positive mt-1">
                          Meta confirmed post ID: {publication.platformPostId}
                        </p>
                      )}
                      {publication.error && (
                        <p
                          role="alert"
                          className="text-[10px] negative mt-2 leading-relaxed"
                        >
                          {publication.error}
                        </p>
                      )}
                      {publication.status === "RUNNING" && (
                        <p className="field-hint">
                          Processing or reconciliation is pending. Successful
                          publishing has not been confirmed.
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <details className="mt-5 text-[10px]">
                <summary className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <History size={12} />
                  Revision history ({selected.revisions.length})
                </summary>
                <div className="mt-3 space-y-3">
                  {selected.revisions
                    .slice()
                    .reverse()
                    .map((revision, index) => (
                      <div
                        key={`${revision.at}-${index}`}
                        className="border-l-2 border-[var(--border)] pl-3"
                      >
                        <p className="m-0 text-[10px]">{revision.note}</p>
                        <p className="text-[9px] muted mt-1">
                          {data.operators.find((o) => o.id === revision.actorId)
                            ?.name ?? "Workspace operator"}{" "}
                          · {new Date(revision.at).toLocaleString()}
                        </p>
                      </div>
                    ))}
                </div>
              </details>
            </div>
          )}
        </DialogContent>
      </Dialog>
      <Dialog
        open={publicationConfirm}
        onOpenChange={(value) => {
          if (!busy) setPublicationConfirm(value);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold tracking-tight">
            Approve Instagram publication
          </DialogTitle>
          <DialogDescription className="text-[11px] muted mt-2 mb-5">
            Review this final reel and caption before giving explicit
            publication permission.
          </DialogDescription>
          <div className="panel p-4 mb-4">
            <p className="eyebrow !mb-2">{selectedChannel?.name} · REEL</p>
            <h3 className="text-sm font-semibold mb-3">{selected?.title}</h3>
            <a
              href={mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] flex items-center gap-1 text-[var(--accent)] mb-4"
            >
              Preview reviewed video
              <ExternalLink size={12} />
            </a>
            <p className="text-[11px] whitespace-pre-wrap leading-relaxed">
              {caption}
            </p>
          </div>
          <p className="text-[11px] muted leading-relaxed mb-5">
            I have reviewed the final media, caption, source credit, and rights.
            I authorize publication of this saved project revision to the
            selected account. Scheduling remains a separate action.
          </p>
          {formError && (
            <div className="status-banner error" role="alert">
              {formError}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              disabled={busy}
              onClick={() => setPublicationConfirm(false)}
            >
              Cancel
            </Button>
            <Button
              disabled={busy || !selected || !publicationReady}
              onClick={() =>
                selected &&
                void publicationAction(
                  {
                    action: "approve",
                    projectId: selected.id,
                    mediaUrl: mediaUrl.trim(),
                    caption: caption.trim(),
                  },
                  true,
                )
              }
            >
              <ShieldCheck size={14} />
              {busy ? "Recording approval…" : "Approve publication"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
