"use client";
import { koreanLabel } from "@/lib/korean";

import { useState, useEffect } from "react";
import { ProductionSteps } from "./production-steps";
import { ProjectAssets } from "./project-assets";
import { CanvaTemplateSetup } from "@/components/canva-template-setup";
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
  return koreanLabel(status);
}

export function CanvaFactory() {
  const { data, loading, mutate, refresh } = useWorkspace();
  const [projectId, setProjectId] = useState("");
  const [canvaConfigured, setCanvaConfigured] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [videoFields, setVideoFields] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get(
      "project",
    );
    const current = data?.projects.find((p) => p.id === requested);
    if (current && data) {
      setProjectId(current.id);
      setTemplateId(
        data.templates.find(
          (t) =>
            t.channelId === current.channelId &&
            t.format === current.format &&
            (!t.operatorId || t.operatorId === current.operatorId),
        )?.id || "",
      );
      const url = new URL(window.location.href);
      url.searchParams.delete("project");
      window.history.replaceState({}, "", url.pathname + url.search);
    }
  }, [data]);
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
        text: "검사를 완료했습니다. 데이터 필드와 템플릿 상태를 확인하세요.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "템플릿 검사를 완료하지 못했습니다.",
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
        text: "Canva 작업 상태를 확인했습니다. 아래 결과를 확인하세요.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "Canva 작업 상태를 확인하지 못했습니다.",
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
      await mutate("/api/canva", {
        action: "generate",
        projectId,
        templateId,
        pageCount: template?.configuration?.pageCount,
        fields: Object.fromEntries(
          Object.entries(fieldValues)
            .filter(([, value]) => value.trim())
            .map(([name, value]) => [
              name,
              ["image", "video"].includes(
                template?.configuration?.fieldTypes?.[name] ?? "",
              )
                ? {
                    type:
                      videoFields[name] ||
                      template?.configuration?.fieldTypes?.[name] === "video"
                        ? "video"
                        : "image",
                    asset_id: value.trim(),
                  }
                : { type: "text", text: value },
            ]),
        ),
      });
      setNotice({
        text: "디자인 요청을 기록했습니다. 아래 결과와 오피스의 디자인 담당 작업을 확인하세요.",
        failed: false,
      });
    } catch (err) {
      setNotice({
        text:
          err instanceof Error ? err.message : "디자인을 생성하지 못했습니다.",
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
          <p className="eyebrow">디자인 / 검토</p>
          <h1 className="page-title">캔바 제작소</h1>
          <p className="mt-2 muted">
            검증된 자료를 브랜드 기준에 맞는 편집 가능한 디자인으로 제작합니다.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/settings">
            <LayoutTemplate size={15} /> 연결 설정
          </a>
        </Button>
      </header>
      <ProductionSteps onCanvaConfigured={setCanvaConfigured} />
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
            <h2 className="font-semibold">승인된 원본 디자인</h2>
            <p className="mt-1 text-xs muted">
              원본 디자인은 변경하지 않습니다. 새 결과물은 사람이 검토하고
              승인합니다.
            </p>
          </div>
          <Badge>{data.templates.length} 개 원본</Badge>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-3">
          {data.templates.map((t) => (
            <article
              key={t.id}
              className={`overflow-hidden rounded-xl border transition-colors ${templateId === t.id ? "border-[var(--accent)] ring-1 ring-[var(--accent)]" : "border-[var(--border)]"} ${!eligible(t) ? "opacity-55" : ""}`}
            >
              <button
                className="block w-full text-left focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
                onClick={() => {
                  setTemplateId(t.id);
                  setFieldValues({});
                  setVideoFields({});
                }}
                aria-label={`${t.name} 선택`}
                aria-pressed={templateId === t.id}
                disabled={!eligible(t)}
              >
                <div className="relative flex h-48 items-center justify-center bg-[var(--muted)]">
                  {t.configuration?.previewUrl ? (
                    <img
                      src={t.configuration.previewUrl}
                      alt={`${t.name} · Canva에서 확인한 실제 미리보기`}
                      className="h-full w-full object-contain"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="text-center px-4">
                      <LayoutTemplate
                        className="mx-auto mb-3 muted"
                        size={30}
                      />
                      <p className="text-xs muted">
                        실제 원본 미리보기 확인 전
                      </p>
                      <p className="mt-2 font-mono text-xs">{t.designId}</p>
                      <p className="mt-2 text-[10px] muted">
                        Canva 연결 후 원본 검사를 진행하세요.
                      </p>
                    </div>
                  )}
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
                          ?.name || "담당 운영자"
                      : "공용 템플릿"}
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
                  {t.approved && <Badge>승인된 원본</Badge>}
                </div>
                <p className="min-h-9 text-[11px] leading-relaxed muted">
                  {t.status === "READY"
                    ? `필드 ${t.fields.length}개를 확인했습니다. 생성 시 자료 호환성을 검사합니다.`
                    : t.status === "SETUP_REQUIRED"
                      ? "자동 채우기 설정이 필요합니다. 승인된 사본에 지원되는 필드를 설정한 뒤 다시 검사하세요."
                      : "필드를 검사해 자동 채우기 지원 여부를 확인하세요."}
                </p>
                {t.fields.length > 0 && (
                  <div className="mt-3">
                    <p className="text-[10px] muted">확인된 필드</p>
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
                    {busy === t.id ? "검사 중…" : "필드 검사"}
                  </Button>
                  <a
                    className="inline-flex items-center gap-1 text-[11px] muted hover:text-[var(--text)]"
                    href={`https://www.canva.com/design/${t.designId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    원본 <ArrowUpRight size={12} />
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
            <h2 className="font-semibold">새 디자인 생성</h2>
            <p className="mt-1 text-xs muted">
              프로젝트와 해당 원본을 선택하세요. 생성된 결과물은 검토 단계로
              보냅니다.
            </p>
          </div>
          <div className="space-y-5 p-5">
            <label className="block">
              <span className="field-label">편집 프로젝트</span>
              <select
                className="select mt-2 w-full"
                value={projectId}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  setTemplateId("");
                }}
              >
                <option value="">프로젝트 선택…</option>
                {data.projects
                  .filter((p) => p.stage !== "PUBLISHED")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title} · {koreanLabel(p.format)}
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
                  <Badge>{koreanLabel(project.format)}</Badge>
                  <Badge>{stateLabel(project.stage)}</Badge>
                </div>
                <p className="mt-3 text-sm font-medium">{project.title}</p>
                <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-relaxed muted">
                  {project.draftCopy ||
                    "초안이 없습니다. 스튜디오에서 초안을 작성하세요."}
                </p>
                <a
                  href="/studio"
                  className="mt-3 inline-flex items-center gap-1 text-xs text-[var(--accent)] hover:underline"
                >
                  스튜디오에서 편집 <ArrowUpRight size={12} />
                </a>
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Readiness
                ready={
                  !!project && ["DESIGN", "REVIEW"].includes(project.stage)
                }
                title="편집 단계"
                detail={
                  project && ["DESIGN", "REVIEW"].includes(project.stage)
                    ? "디자인 제작 단계입니다"
                    : "초안과 출처를 검토하고 스튜디오에서 디자인 단계로 이동하세요"
                }
              />
              <Readiness
                ready={researchReady}
                title="조사 출처"
                detail={
                  researchReady
                    ? `출처 링크 ${project!.sourceUrls.length}개 연결됨`
                    : "스튜디오에서 출처 링크 추가"
                }
              />
              <Readiness
                ready={copyReady}
                title="초안"
                detail={
                  copyReady
                    ? "검사할 초안이 있습니다"
                    : "출처를 바탕으로 채널에 맞는 초안 작성"
                }
              />
              <Readiness
                ready={selectionReady}
                title="승인된 원본"
                detail={
                  selectionReady ? template!.name : "위에서 해당 템플릿 선택"
                }
              />
              <Readiness
                ready={false}
                title="미디어 및 글자 넘침 검사"
                detail="생성 과정에서 검사합니다"
                pending
              />
            </div>
            {template && template.status !== "READY" && (
              <div className="rounded-lg border border-amber-500/25 bg-amber-500/5 p-3 text-xs leading-relaxed text-amber-700 dark:text-amber-400">
                자동 채우기 필드를 아직 확인하지 못했습니다. 먼저 검사하세요.
                필드나 API 권한이 없으면 필요한 설정을 안내합니다.{" "}
                {template.configuration?.inspectionError}
              </div>
            )}
            {template?.fields.length ? (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold">
                  확인된 자동 채우기 필드
                </h3>
                <p className="text-xs muted">
                  필드 이름은 실제 Canva 데이터셋을 사용합니다. 이미지·영상에는
                  인증된 Canva 자료 ID가 필요합니다. 자동으로 추론 가능한
                  제목·본문·출처는 비워두면 초안을 사용합니다.
                </p>
                {template.fields.map((name) => (
                  <label key={name} className="block">
                    <span className="field-label">
                      {name} ·{" "}
                      {["image", "video"].includes(
                        template.configuration?.fieldTypes?.[name] ?? "",
                      )
                        ? "Canva 미디어 자료 ID"
                        : "문구"}
                    </span>
                    {["image", "video"].includes(
                      template.configuration?.fieldTypes?.[name] || "",
                    ) && (
                      <select
                        className="select mt-2"
                        aria-label={`${name} 업로드된 프로젝트 자료`}
                        value=""
                        onChange={(e) => {
                          const asset = data.assets.find(
                            (a) => a.id === e.target.value,
                          );
                          if (asset?.canvaAssetId) {
                            setFieldValues((v) => ({
                              ...v,
                              [name]: asset.canvaAssetId!,
                            }));
                            setVideoFields((v) => ({
                              ...v,
                              [name]: asset.kind === "VIDEO",
                            }));
                          }
                        }}
                      >
                        <option value="">업로드 완료한 승인 자료 선택…</option>
                        {data.assets
                          .filter(
                            (a) =>
                              a.projectId === projectId &&
                              a.approved &&
                              a.canvaAssetId &&
                              (template.configuration?.fieldTypes?.[name] ===
                              "video"
                                ? a.kind === "VIDEO"
                                : a.kind === "IMAGE" ||
                                  project?.format === "REEL"),
                          )
                          .map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.kind === "VIDEO" ? "영상" : "이미지"} ·{" "}
                              {a.credit.slice(0, 70)}
                            </option>
                          ))}
                      </select>
                    )}
                    {project?.format === "REEL" &&
                      template.configuration?.fieldTypes?.[name] ===
                        "image" && (
                        <select
                          className="select mt-2"
                          aria-label={`${name} 자료 유형`}
                          value={videoFields[name] ? "video" : "image"}
                          onChange={(e) =>
                            setVideoFields((v) => ({
                              ...v,
                              [name]: e.target.value === "video",
                            }))
                          }
                        >
                          <option value="image">이미지</option>
                          <option value="video">
                            영상 · 기존 가로 프레임 유지
                          </option>
                        </select>
                      )}
                    <textarea
                      className="input mt-1 w-full"
                      value={fieldValues[name] ?? ""}
                      onChange={(e) =>
                        setFieldValues((v) => ({
                          ...v,
                          [name]: e.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
              </div>
            ) : null}
            {project && <ProjectAssets project={project} />}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-5">
              <p className="max-w-sm text-xs leading-relaxed muted">
                Canva에서는 초안을 생성합니다. Instagram 게시에는 별도의 사람
                승인이 필요합니다.
              </p>
              <Button
                disabled={
                  !!busy ||
                  !canvaConfigured ||
                  !researchReady ||
                  !copyReady ||
                  !selectionReady ||
                  template?.status !== "READY" ||
                  !project ||
                  !["DESIGN", "REVIEW"].includes(project.stage)
                }
                onClick={generate}
              >
                <Copy size={14} />
                {busy === "generate" ? "요청 중…" : "Canva에서 생성"}
              </Button>
            </div>
          </div>
        </section>
        <aside className="panel">
          <div className="panel-header !block">
            <h2 className="text-sm font-semibold">템플릿 설정 순서</h2>
          </div>
          <ol className="space-y-4 p-5 text-sm">
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                1
              </span>
              <div>
                Canva 연결
                <p className="mt-1 text-xs leading-relaxed muted">
                  Canva 계정을 인증하고 필요한 권한과 자동 채우기 이용 권한을
                  확인하세요.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                2
              </span>
              <div>
                원본과 연결된 필드 검사
                <p className="mt-1 text-xs leading-relaxed muted">
                  원본을 조회하고 연결된 브랜드 템플릿을 검사합니다. 디자인
                  ID만으로는 자동 채우기 지원을 확인할 수 없습니다.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                3
              </span>
              <div>
                편집 가능한 필드 설정
                <p className="mt-1 text-xs leading-relaxed muted">
                  원본을 수정하지 말고 사본을 만드세요. 승인된 브랜드 템플릿에
                  다음과 같은 필드를 설정하세요: {requiredFields.join(", ")}{" "}
                  원본의 실제 필드를 먼저 검사합니다. 필드가 있는 경우 원본 기반
                  새 디자인을 자동 생성합니다. 필드가 없으면 사본에 필드를
                  설정해 승인된 브랜드 템플릿으로 연결하세요. 릴스 자동 생성도
                  DAHPcvVkH8k만 사용합니다.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--muted)] text-[10px]">
                4
              </span>
              <div>
                미리보기 및 승인
                <p className="mt-1 text-xs leading-relaxed muted">
                  페이지 수, 줄바꿈, 글자 넘침, 영상 비율, 출처 표기와 브랜드
                  요소를 확인하세요.
                </p>
              </div>
            </li>
          </ol>
          <div className="mx-5 mb-5 rounded-lg bg-[var(--muted)] p-3">
            <ShieldCheck size={16} className="mb-2 text-[var(--accent)]" />
            <p className="text-xs leading-relaxed muted">
              THE MOVE 릴스는 이 원본만 사용합니다:{" "}
              <strong className="font-medium text-[var(--text)]">
                DAHPcvVkH8k
              </strong>
              . 1080 × 1920 화면 안의 가로 영상 위치와 비율을 유지합니다.
            </p>
          </div>
        </aside>
      </div>
      <CanvaTemplateSetup template={template} />
      <ManualCanvaCopy project={project} template={template} />
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2 className="font-semibold">디자인 요청 내역</h2>
            <p className="mt-1 text-xs muted">
              API 결과는 Canva 응답으로 확인합니다. 직접 등록한 사본은 수동
              검토로 표시합니다.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            요청 새로고침
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">프로젝트</th>
                <th className="text-left">원본</th>
                <th className="text-left">상태</th>
                <th className="text-left">결과</th>
              </tr>
            </thead>
            <tbody>
              {data.designs.map((d) => (
                <tr key={d.id}>
                  <td className="min-w-[180px] text-sm font-medium">
                    {data.projects.find((p) => p.id === d.projectId)?.title ||
                      "알 수 없는 프로젝트"}
                  </td>
                  <td className="text-xs muted">
                    {data.templates.find((t) => t.id === d.templateId)?.name ||
                      "알 수 없는 템플릿"}
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
                    {(d.status === "READY" || d.status === "MANUAL_REVIEW") && (
                      <div className="mb-3">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={!!busy}
                          onClick={async () => {
                            setBusy(d.id);
                            setNotice(null);
                            try {
                              await mutate("/api/canva", {
                                action: d.exportJobId
                                  ? "refresh-export"
                                  : "export",
                                designId: d.id,
                              });
                              setNotice({
                                text: "내보내기 상태를 확인했습니다. 실제 파일을 열어 내용과 순서를 검토하세요.",
                                failed: false,
                              });
                            } catch (e) {
                              setNotice({
                                text:
                                  e instanceof Error
                                    ? e.message
                                    : "내보내기에 실패했습니다.",
                                failed: true,
                              });
                            } finally {
                              setBusy(null);
                            }
                          }}
                        >
                          {d.exportJobId
                            ? "내보내기 결과 확인"
                            : "게시용 파일 내보내기"}
                        </Button>
                        {d.exportUrls?.length ? (
                          <div className="mt-2 space-y-1">
                            {d.exportUrls.map((url, index) => (
                              <a
                                key={url}
                                className="block text-xs underline"
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                {index + 1}번째 파일 확인
                              </a>
                            ))}
                            <a
                              className="block text-xs text-[var(--accent)] mt-2"
                              href={
                                project
                                  ? `/studio?project=${encodeURIComponent(project.id)}`
                                  : "/studio"
                              }
                            >
                              스튜디오에서 파일 검토·승인·게시 →
                            </a>
                            <p className="text-[10px] muted mt-1">
                              파일 주소는 만료될 수 있습니다. 예약 시각까지 공개
                              접근이 가능한지 확인하세요.
                            </p>
                          </div>
                        ) : d.exportJobId ? (
                          <p className="mt-2 text-xs muted">
                            결과 확인 전 · 게시 성공을 의미하지 않습니다.
                          </p>
                        ) : null}
                      </div>
                    )}

                    {d.editUrl &&
                    (d.status === "READY" || d.status === "MANUAL_REVIEW") ? (
                      <a
                        className="inline-flex items-center gap-2 text-xs text-[var(--accent)] hover:underline"
                        href={d.editUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {d.status === "MANUAL_REVIEW"
                          ? "사본 열어 검토"
                          : "편집 가능한 디자인 열기"}{" "}
                        <ExternalLink size={12} />
                      </a>
                    ) : (
                      <div>
                        <p className="whitespace-normal text-xs leading-relaxed muted">
                          {d.error ||
                            "결과 확인을 기다리고 있습니다. 아직 디자인 링크가 없습니다."}
                        </p>
                        {d.status === "QUEUED" && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-2"
                            disabled={!!busy}
                            onClick={() => refreshDesign(d.id)}
                          >
                            {busy === d.id ? "확인 중…" : "Canva 작업 확인"}
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
              <p className="font-medium">새 디자인을 제작하세요</p>
              <p className="mt-1 text-sm muted">
                프로젝트를 선택해 승인된 원본으로 새 초안을 만드세요.
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
