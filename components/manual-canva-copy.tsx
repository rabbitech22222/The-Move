"use client";
import { useState } from "react";
import { Copy, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import type { CanvaTemplate, Project } from "@/lib/domain";

export function ManualCanvaCopy({
  project,
  template,
}: {
  project: Project | undefined;
  template: CanvaTemplate | undefined;
}) {
  const { mutate } = useWorkspace();
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState("");
  const [pages, setPages] = useState(1);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [failed, setFailed] = useState(false);
  const eligible =
    !!project &&
    !!template &&
    ["DESIGN", "REVIEW"].includes(project.stage) &&
    !!project.draftCopy.trim() &&
    !!project.sourceUrls.length &&
    project.channelId === template.channelId &&
    project.format === template.format;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      await mutate("/api/canva", {
        action: "register-manual",
        projectId: project?.id,
        templateId: template?.id,
        editUrl: link,
        pageCount: pages,
        preservedLayout: confirmed,
      });
      setMessage(
        "새 사본을 수동 검토 상태로 등록했습니다. API 생성이나 디자인 검증 완료를 의미하지 않습니다.",
      );
      setFailed(false);
      setOpen(false);
      setLink("");
      setConfirmed(false);
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "사본을 등록하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Canva 수동 제작</h2>
          <p className="mt-1 text-xs muted">
            영상 교체, 페이지 변경 또는 자동 채우기 사용 불가 시 이용하세요.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!eligible || busy}
          onClick={() => setOpen(!open)}
        >
          <Copy size={13} />새 Canva 사본 등록
        </Button>
      </div>
      <div className="p-5">
        <p className="text-xs leading-relaxed muted">
          위에서 출처가 있는 디자인·검토 단계의 프로젝트와 승인된 원본을
          선택하세요. Canva에서 사본을 만들어 화면 크기, 정보 위계와 브랜드를
          유지한 뒤 새 편집 링크를 등록하세요. THE MOVE 릴스는 DAHPcvVkH8k만
          복제하고 가로 영상 프레임을 유지해야 합니다.
        </p>
        {template && (
          <a
            className="inline-flex items-center gap-1 mt-3 text-xs text-[var(--accent)]"
            href={`https://www.canva.com/design/${template.designId}/view`}
            target="_blank"
            rel="noopener noreferrer"
          >
            선택한 원본 열기
            <ExternalLink size={12} />
          </a>
        )}
        {open && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_150px]">
              <label>
                <span className="field-label">새 Canva 편집 링크</span>
                <input
                  className="input w-full mt-2"
                  type="url"
                  required
                  placeholder="https://www.canva.com/design/NEW_COPY/edit"
                  value={link}
                  onChange={(e) => setLink(e.target.value)}
                />
              </label>
              <label>
                <span className="field-label">실제 페이지 수</span>
                <input
                  className="input w-full mt-2"
                  type="number"
                  min="1"
                  max={project?.format === "REEL" ? 1 : 30}
                  required
                  value={pages}
                  onChange={(e) => setPages(Number(e.target.value))}
                />
              </label>
            </div>
            <label className="flex items-start gap-2 text-xs leading-relaxed">
              <input
                type="checkbox"
                required
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 accent-red-600"
              />
              <span>
                원본을 수정하지 않고 새 사본을 만들었으며 브랜드, 출처 표기,
                줄바꿈과 다음 화면 크기를 확인했습니다: {template?.width} ×{" "}
                {template?.height} . THE MOVE 릴스의 가로 영상 위치와 비율을
                유지했습니다. 이는 등록자의 확인이며 별도 시각 검토가
                필요합니다.
              </span>
            </label>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !confirmed || !eligible}
            >
              <ShieldCheck size={13} />
              {busy ? "기록 중…" : "사본 검토 요청"}
            </Button>
          </form>
        )}
        {message && (
          <p
            className={`text-xs leading-relaxed mt-4 ${failed ? "text-red-600" : "muted"}`}
            role={failed ? "alert" : "status"}
          >
            {message}
          </p>
        )}
      </div>
    </section>
  );
}
