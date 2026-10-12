"use client";
import { koreanLabel, koreanRevision } from "@/lib/korean";

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
  IDEA: "아이디어",
  RESEARCH: "조사",
  DRAFT: "초안",
  DESIGN: "디자인",
  REVIEW: "검토",
  APPROVED: "승인 완료",
  SCHEDULED: "게시 예약",
  PUBLISHED: "게시 완료",
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
    const requested = new URLSearchParams(window.location.search).get(
      "project",
    );
    const current = data?.projects.find((p) => p.id === requested);
    if (current && data) {
      setSelectedId(current.id);
      setForm(fromProject(current));
      setCaption(current.draftCopy);
      setOpen(true);
      setApprovedPayload(null);
      setMediaUrl(
        data.designs
          .filter((d) => d.projectId === current.id && d.exportUrls?.length)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
          ?.exportUrls?.join("\n") || "",
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
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
        <div className="empty-state">스튜디오를 불러오지 못했습니다.</div>
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
    const exportFiles =
      data.designs
        .filter((d) => d.projectId === project.id && d.exportUrls?.length)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
        ?.exportUrls ?? [];
    setMediaUrl(exportFiles.join("\n"));
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
      setFormError("프로젝트 제목을 입력하세요.");
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
          "올바른 HTTP 또는 HTTPS 출처 주소를 한 줄에 하나씩 입력하세요.",
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
        cause instanceof Error ? cause.message : "작업을 완료하지 못했습니다.",
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
    selected.channelId === "the-move" &&
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
        cause instanceof Error ? cause.message : "게시 작업에 실패했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };
  const publicationMedia = () => {
    const urls = mediaUrl
      .split("\n")
      .map((url) => url.trim())
      .filter(Boolean);
    return {
      mediaUrl: urls[0],
      ...(selected?.format === "CAROUSEL" ? { mediaUrls: urls } : {}),
    };
  };
  const validateMedia = () => {
    try {
      const urls = mediaUrl
        .split("\n")
        .map((url) => url.trim())
        .filter(Boolean);
      if (
        selected?.format === "CAROUSEL"
          ? urls.length < 2 ||
            urls.length > 10 ||
            new Set(urls).size !== urls.length
          : urls.length !== 1
      ) {
        setFormError(
          selected?.format === "CAROUSEL"
            ? "캐러셀 이미지 목록을 확인하세요."
            : "릴스는 영상 주소 하나를 입력하세요.",
        );
        if (selected?.format === "CAROUSEL")
          setFormError(
            "캐러셀 이미지 2~10개의 공개 HTTPS 주소를 순서대로 입력하세요.",
          );
        return false;
      }
      for (const value of urls) {
        const url = new URL(value);
        if (url.protocol !== "https:") throw new Error();
      }
      if (!caption.trim() || caption.length > 2200) {
        setFormError("최종 캡션을 1~2,200자로 입력하세요.");
        return false;
      }
      return true;
    } catch {
      setFormError("검토한 미디어의 공개 HTTPS 주소를 입력하세요.");
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
      setFormError("현재보다 이후의 게시 시각을 선택하세요.");
      return;
    }
    await publicationAction({
      action: "schedule",
      projectId: selected.id,
      scheduledAt: date.toISOString(),
      ...publicationMedia(),
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
          <p className="eyebrow">편집 작업 공간</p>
          <h1 className="page-title">콘텐츠 스튜디오</h1>
          <p className="page-description">
            좋은 콘텐츠를 만들고 모든 제작 단계를 관리하세요.
          </p>
        </div>
        <Button onClick={create} size="sm" className="!text-[11px] mt-2">
          <Plus size={14} />새 프로젝트
        </Button>
      </div>
      <WorkspaceError />
      <div className="flex justify-between items-center gap-4 mb-6 flex-wrap">
        <div className="filter-row">
          <div className="relative">
            <select
              className="select !w-40 !text-[10px]"
              aria-label="프로젝트 채널 필터"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
            >
              <option value="all">전체 채널</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <select
            className="select !w-40 !text-[10px]"
            aria-label="프로젝트 담당자 필터"
            value={operatorId}
            onChange={(e) => setOperatorId(e.target.value)}
          >
            <option value="all">전체 운영자</option>
            {data.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <div className="relative">
            <Search size={12} className="absolute left-3 top-3 muted" />
            <input
              aria-label="프로젝트 검색"
              className="input !pl-8 !w-48 !text-[10px]"
              placeholder="프로젝트 검색…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div className="flex gap-4 text-[10px] muted">
          <span className="flex items-center gap-1.5">
            <Layers2 size={12} />
            {projects.length} 개 프로젝트
          </span>
          <span className="flex items-center gap-1.5">
            <Clock3 size={12} />
            {(productionTotal / 60).toFixed(1)} 시간 기록됨
          </span>
        </div>
      </div>
      <div className="status-banner !text-[10px]">
        <ShieldCheck size={14} className="mt-0.5 shrink-0" />
        <span>
          검토를 거친 콘텐츠만 승인할 수 있습니다. Canva 초안 생성이나 단계
          변경만으로 Instagram에 게시되지 않습니다.
        </span>
        {data.demo && <span className="demo-label ml-auto">예시 프로젝트</span>}
      </div>
      <div className="kanban-scroll">
        <div className="kanban-board">
          {stages.map((stage) => (
            <section
              className="kanban-column"
              key={stage}
              aria-label={`${labels[stage]} 프로젝트`}
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
                      aria-label={`${project.title} 열기`}
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
                          {project.format === "CAROUSEL" ? "캐러셀" : "릴스"}
                        </span>
                        <span>·</span>
                        <Link2 size={10} />
                        <span>{project.sourceUrls.length} 개 출처</span>
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
                                "ko-KR",
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
                    ? "게시 완료 프로젝트 없음"
                    : stage === "SCHEDULED"
                      ? "게시 예약 프로젝트 없음"
                      : "다음 아이디어를 추가하세요."}
                </div>
              )}
              {stage === "IDEA" && (
                <button
                  onClick={create}
                  className="flex items-center justify-center gap-1.5 text-[10px] muted p-2 w-full hover:text-[var(--text)]"
                >
                  <Plus size={12} />
                  아이디어 추가
                </button>
              )}
            </section>
          ))}
        </div>
      </div>
      <div className="text-[9px] muted mt-2 flex items-center justify-between gap-3">
        <span>
          프로젝트를 눌러 문구와 출처를 검토하고 다음 단계로 이동하세요.
        </span>
        <span>
          {data.demo
            ? "예시 제작 흐름 · 실제 게시 없음"
            : "게시 상태는 실제 플랫폼 응답을 기준으로 표시합니다"}
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
            {selected ? "프로젝트 편집" : "새 콘텐츠 시작"}
          </DialogTitle>
          <DialogDescription className="text-[11px] muted mt-2 mb-5">
            {selected
              ? "출처, 문구와 검토 이력을 함께 관리하세요."
              : "아이디어를 등록하고 조사 자료와 초안을 추가하세요."}
          </DialogDescription>
          {selected && (
            <div className="flex flex-wrap gap-2 mb-5">
              <Badge>{labels[selected.stage]}</Badge>
              <Badge>{selected.format === "REEL" ? "릴스" : "캐러셀"}</Badge>
              <span className="text-[10px] muted flex items-center gap-1">
                <Clock3 size={11} />
                {selected.productionMinutes} 분 기록됨
              </span>
            </div>
          )}
          {selected?.stage === "APPROVED" && (
            <div className="status-banner !text-[10px]">
              수정하면 검토 단계로 돌아가며 이전 승인은 무효가 됩니다.
            </div>
          )}
          {locked && (
            <div className="status-banner !text-[10px]">
              현재 프로젝트 상태: {labels[selected!.stage].toLowerCase()}.
              편집이 잠겨 있습니다. 예약한 콘텐츠는 예약 취소 후 편집하세요.
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
                  프로젝트 제목
                </label>
                <input
                  id="project-title"
                  className="input"
                  placeholder="어떤 이야기를 담을까요?"
                  value={form.title}
                  onChange={(e) => change("title", e.target.value)}
                  required
                  maxLength={200}
                />
              </div>
              <div>
                <label htmlFor="project-channel" className="field-label">
                  채널
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
                  담당 운영자
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
                  콘텐츠 형식
                </label>
                <select
                  id="project-format"
                  className="select"
                  value={form.format}
                  onChange={(e) =>
                    change("format", e.target.value as FormValues["format"])
                  }
                >
                  <option value="CAROUSEL">캐러셀 · 1080 × 1350</option>
                  <option value="REEL">릴스 · 1080 × 1920</option>
                </select>
              </div>
              <div>
                <label htmlFor="project-due" className="field-label">
                  마감일
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
                  출처 링크
                </label>
                <textarea
                  id="project-sources"
                  className="input min-h-[70px] text-[11px]"
                  value={form.sourceUrls}
                  onChange={(e) => change("sourceUrls", e.target.value)}
                  placeholder="출처 링크를 한 줄에 하나씩 입력하세요"
                />
                <p className="field-hint">
                  검증 가능한 출처를 입력하세요. 조사와 승인에는 근거가
                  필요합니다.
                </p>
              </div>
              <div className="form-full">
                <label htmlFor="project-draft" className="field-label">
                  초안
                </label>
                <textarea
                  id="project-draft"
                  className="input min-h-[130px] text-[12px] leading-relaxed"
                  value={form.draftCopy}
                  onChange={(e) => change("draftCopy", e.target.value)}
                  placeholder="콘텐츠 방향을 정하고 제목, 페이지별 문구와 캡션을 작성하세요…"
                />
              </div>
              <div className="form-full">
                <details className="border border-[var(--border)] rounded-lg p-3 text-[10px]">
                  <summary className="cursor-pointer font-semibold">
                    채널 작성 지침 · 버전
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
                  취소
                </Button>
                <Button type="submit" disabled={busy || locked}>
                  <Save size={14} />
                  {busy
                    ? "저장 중…"
                    : selected
                      ? "변경 저장"
                      : "프로젝트 만들기"}
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
              <h3 className="text-[11px] font-semibold mb-3">편집 작업</h3>
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
                    다음 단계: {labels[nextStage]}
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
                    이전 단계: {selected.stage === "APPROVED" ? "검토" : "초안"}
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
                    검토 및 승인
                  </Button>
                )}
                {["DESIGN", "REVIEW", "APPROVED"].includes(selected.stage) && (
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/canva?project=${encodeURIComponent(selected.id)}`}
                    >
                      <Layers2 size={13} />
                      캔바 제작소 열기
                    </Link>
                  </Button>
                )}
                {selected.stage === "APPROVED" && (
                  <span className="flex items-center gap-1.5 text-[10px] positive">
                    <CheckCircle2 size={13} />
                    편집 승인 완료
                  </span>
                )}
              </div>
              {approvalConfirm && (
                <div className="status-banner !mt-3 !mb-0 !block">
                  <p className="text-[11px] font-semibold text-[var(--text)] mb-1">
                    사람의 검토 확인
                  </p>
                  <p className="text-[10px] mb-3">
                    출처, 불확실한 주장, 초안과 디자인을 확인했습니다. 승인하면
                    현재 저장된 버전의 검토 기록이 남습니다. 수정 사항은 승인
                    전에 저장하세요.
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
                      승인 확인
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setApprovalConfirm(false)}
                    >
                      취소
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex items-end gap-2 mt-5">
                <div className="flex-1">
                  <label className="field-label" htmlFor="production-minutes">
                    제작 시간 기록
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
                  시간 추가 (분)
                </Button>
              </div>
              {selected.stage === "APPROVED" && (
                <section className="mt-6 pt-5 border-t border-[var(--border)]">
                  <h3 className="text-[11px] font-semibold flex items-center gap-1.5">
                    <Send size={13} />
                    Instagram 게시
                  </h3>
                  <p className="field-hint mb-3">
                    현재 버전에는 별도의 사람 게시 승인이 필요합니다. 예약은
                    작업 대기열에 추가되며 Meta가 게시 ID를 반환해야 게시 완료로
                    기록됩니다.
                  </p>
                  {data.demo ? (
                    <div className="status-banner !text-[10px] !mb-0">
                      데모에서는 실제 게시가 차단됩니다. 실제 운영 공간을
                      실행하고 설정에서 프로페셔널 계정을 인증하세요.
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-media"
                          >
                            {selected.format === "CAROUSEL"
                              ? "캐러셀 이미지 주소 · 한 줄에 하나씩, 게시 순서대로"
                              : "최종 릴스 영상 주소"}
                          </label>
                          <textarea
                            id="publication-media"
                            className="input text-[11px]"
                            placeholder={
                              selected.format === "CAROUSEL"
                                ? "https://미디어-서버/1.png\nhttps://미디어-서버/2.png"
                                : "https://미디어-서버/릴스.mp4"
                            }
                            value={mediaUrl}
                            onChange={(e) => {
                              setMediaUrl(e.target.value);
                              setApprovedPayload(null);
                            }}
                          />
                          <p className="field-hint">
                            공개 HTTPS 미디어 주소를 사용하세요. Canva 편집
                            링크는 게시용 미디어가 아닙니다.
                          </p>
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-caption"
                          >
                            최종 캡션
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
                            {caption.length} / 2,200자 · 출처 포함
                          </p>
                        </div>
                        <div>
                          <label
                            className="field-label"
                            htmlFor="publication-time"
                          >
                            게시 날짜 및 시각
                          </label>
                          <input
                            id="publication-time"
                            className="input text-[11px]"
                            type="datetime-local"
                            value={scheduledAt}
                            onChange={(e) => setScheduledAt(e.target.value)}
                          />
                          <p className="field-hint">
                            시간대:{" "}
                            {Intl.DateTimeFormat().resolvedOptions().timeZone}.
                            작업 처리기가 예약 시각 이후에 게시합니다.
                          </p>
                        </div>
                      </div>
                      {!selectedChannel?.connected ||
                      !selectedChannel.platformAccountId ? (
                        <div className="status-banner !text-[10px] !mt-3">
                          예약 전 Instagram 프로페셔널 계정을 인증하고
                          연결하세요.
                          <Link
                            href="/settings"
                            className="font-semibold ml-auto shrink-0"
                          >
                            설정 열기
                          </Link>
                        </div>
                      ) : null}
                      <div className="flex flex-wrap items-center gap-2 mt-4">
                        {publicationApproved ? (
                          <span className="text-[10px] positive flex items-center gap-1">
                            <ShieldCheck size={13} />
                            게시 승인됨 ·{" "}
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
                            게시 내용 검토
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
                          게시 예약
                        </Button>
                      </div>
                    </>
                  )}
                </section>
              )}
              {publications.length > 0 && (
                <section className="mt-5 pt-4 border-t border-[var(--border)]">
                  <h3 className="text-[11px] font-semibold mb-3">게시 상태</h3>
                  {publications.map((publication) => (
                    <div
                      key={publication.id}
                      className="border border-[var(--border)] rounded-lg p-3 mb-2"
                    >
                      <div className="flex justify-between items-center gap-2">
                        <Badge>{koreanLabel(publication.status)}</Badge>
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
                            예약 취소
                          </Button>
                        )}
                      </div>
                      <p className="text-[10px] muted mt-2">
                        {new Date(publication.scheduledAt).toLocaleString(
                          "ko-KR",
                          { timeZone: "Asia/Seoul" },
                        )}{" "}
                        · {selectedChannel?.name}
                      </p>
                      {publication.platformPostId && (
                        <p className="text-[10px] positive mt-1">
                          Meta 확인 게시물 ID: {publication.platformPostId}
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
                          처리 또는 결과 대조 중입니다. 게시 성공은 아직
                          확인되지 않았습니다.
                        </p>
                      )}
                    </div>
                  ))}
                </section>
              )}
              <details className="mt-5 text-[10px]">
                <summary className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <History size={12} />
                  수정 이력 ({selected.revisions.length})
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
                        <p className="m-0 text-[10px]">
                          {koreanRevision(revision.note)}
                        </p>
                        <p className="text-[9px] muted mt-1">
                          {data.operators.find((o) => o.id === revision.actorId)
                            ?.name ?? "작업 공간 운영자"}{" "}
                          ·{" "}
                          {new Date(revision.at).toLocaleString("ko-KR", {
                            timeZone: "Asia/Seoul",
                          })}
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
            Instagram 게시 승인
          </DialogTitle>
          <DialogDescription className="text-[11px] muted mt-2 mb-5">
            최종 미디어와 캡션을 확인하고 명시적으로 게시를 승인하세요.
          </DialogDescription>
          <div className="panel p-4 mb-4">
            <p className="eyebrow !mb-2">
              {selectedChannel?.name} · 게시 미디어
            </p>
            <h3 className="text-sm font-semibold mb-3">{selected?.title}</h3>
            <a
              href={publicationMedia().mediaUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] flex items-center gap-1 text-[var(--accent)] mb-4"
            >
              최종 미디어 미리보기
              <ExternalLink size={12} />
            </a>
            <p className="mb-3 text-sm font-semibold">
              게시 계정: @themovemag_
            </p>
            {selected?.format === "CAROUSEL" && (
              <ol className="mb-4 space-y-2 text-xs">
                {publicationMedia().mediaUrls?.map((url, index) => (
                  <li key={url}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      {index + 1}번째 이미지 확인
                    </a>
                  </li>
                ))}
              </ol>
            )}
            <p className="text-[11px] whitespace-pre-wrap leading-relaxed">
              {caption}
            </p>
          </div>
          <p className="text-[11px] muted leading-relaxed mb-5">
            최종 미디어, 캡션, 출처와 이용 권한을 검토했습니다. 현재 저장된
            버전을 선택 계정에 게시하도록 승인합니다. 예약은 별도 작업입니다.
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
              취소
            </Button>
            <Button
              disabled={busy || !selected || !publicationReady}
              onClick={() =>
                selected &&
                void publicationAction(
                  {
                    action: "approve",
                    projectId: selected.id,
                    ...publicationMedia(),
                    caption: caption.trim(),
                  },
                  true,
                )
              }
            >
              <ShieldCheck size={14} />
              {busy ? "승인 기록 중…" : "게시 승인"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
