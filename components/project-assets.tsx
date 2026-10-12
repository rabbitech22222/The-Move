"use client";
import { koreanLabel } from "@/lib/korean";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  ExternalLink,
  Image as ImageIcon,
  Link2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkspace } from "@/components/workspace-provider";
import type { Project } from "@/lib/domain";

export function ProjectAssets({
  project,
  disabled = false,
}: {
  project: Project;
  disabled?: boolean;
}) {
  const { data, mutate } = useWorkspace();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<"IMAGE" | "VIDEO">("IMAGE");
  const [url, setUrl] = useState("");
  const [credit, setCredit] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  async function transfer(assetId: string, refresh = false) {
    setBusy(true);
    setError(null);
    try {
      await mutate("/api/canva", {
        action: refresh ? "refresh-asset" : "upload-asset",
        assetId,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Canva 업로드 실패");
    } finally {
      setBusy(false);
    }
  }
  const locked = project.stage === "SCHEDULED" || project.stage === "PUBLISHED";
  const unavailable = locked || disabled || busy;
  const assets =
    data?.assets.filter((asset) => asset.projectId === project.id) ?? [];

  const act = async (payload: unknown, close = false) => {
    setBusy(true);
    setError(null);
    try {
      await mutate("/api/assets", payload);
      if (close) {
        setAdding(false);
        setUrl("");
        setCredit("");
        setWidth("");
        setHeight("");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "미디어 참조를 변경하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  };

  const add = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    try {
      if (new URL(url.trim()).protocol !== "https:") throw new Error();
    } catch {
      setError("외부 미디어의 올바른 HTTPS 주소를 입력하세요.");
      return;
    }
    if (!credit.trim()) {
      setError("출처와 이용 권한 정보를 입력하세요.");
      return;
    }
    for (const dimension of [width, height]) {
      if (
        dimension &&
        (!Number.isInteger(Number(dimension)) ||
          Number(dimension) < 1 ||
          Number(dimension) > 20000)
      ) {
        setError("크기는 1~20,000픽셀 사이의 정수로 입력하세요.");
        return;
      }
    }
    await act(
      {
        action: "add",
        projectId: project.id,
        kind,
        url: url.trim(),
        credit: credit.trim(),
        width: width ? Number(width) : undefined,
        height: height ? Number(height) : undefined,
      },
      true,
    );
  };

  return (
    <section
      className="mt-6 pt-5 border-t border-[var(--border)]"
      aria-labelledby="project-assets-title"
    >
      <div className="flex items-center justify-between gap-3 mb-2">
        <h3
          id="project-assets-title"
          className="text-[11px] font-semibold flex items-center gap-1.5"
        >
          <Link2 size={13} />
          미디어 자료{" "}
          <span className="muted font-normal">({assets.length})</span>
        </h3>
        {!locked && !adding && (
          <Button
            variant="ghost"
            size="sm"
            disabled={unavailable}
            onClick={() => setAdding(true)}
          >
            <Plus size={12} />
            미디어 연결
          </Button>
        )}
      </div>
      <p className="field-hint mb-3">
        외부 미디어 주소와 출처를 기록합니다. 파일 업로드나 소유권 확인을
        의미하지 않습니다. 크기는 운영자가 입력합니다.
      </p>
      {project.stage === "APPROVED" && (
        <p className="text-[10px] muted mb-3">
          미디어를 변경하거나 승인하면 검토 단계로 돌아가며 기존 승인은 무효가
          됩니다.
        </p>
      )}
      {assets.length ? (
        <div className="space-y-2">
          {assets.map((asset) => (
            <div
              key={asset.id}
              className="rounded-lg border border-[var(--border)] p-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="rounded-md bg-[var(--muted)] p-2 muted shrink-0">
                  {asset.kind === "VIDEO" ? (
                    <Clapperboard size={14} />
                  ) : (
                    <ImageIcon size={14} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <a
                    href={asset.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[11px] font-medium flex gap-1 items-center"
                    aria-label={`${koreanLabel(asset.kind)} 미리보기`}
                  >
                    <span className="truncate">{asset.url}</span>
                    <ExternalLink size={11} className="shrink-0 muted" />
                  </a>
                  <p className="text-[10px] muted mt-1 leading-relaxed break-words">
                    {asset.credit}
                  </p>
                  <p className="text-[9px] muted mt-1">
                    {asset.kind === "VIDEO" ? "영상" : "이미지"} · 입력된 크기:{" "}
                    {asset.width ?? "미확인"} × {asset.height ?? "미확인"}
                    {asset.width && asset.height ? " px" : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end items-center gap-2 mt-3">
                {asset.canvaAssetId && (
                  <p className="text-xs positive mr-auto">
                    Canva 업로드 완료 · {asset.canvaAssetId}
                  </p>
                )}
                {asset.canvaUploadError && (
                  <p className="text-xs text-red-600 w-full" role="alert">
                    {asset.canvaUploadError}
                  </p>
                )}
                {asset.canvaUploadJobId && !asset.canvaAssetId && (
                  <p className="text-xs muted w-full">
                    {asset.canvaUploadJobId === "pending"
                      ? "응답 대조 필요 · 중복 업로드 차단"
                      : "실제 Canva 업로드 처리 중"}
                  </p>
                )}
                {asset.approved && !asset.canvaAssetId && (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={
                      unavailable || asset.canvaUploadJobId === "pending"
                    }
                    onClick={() =>
                      void transfer(asset.id, !!asset.canvaUploadJobId)
                    }
                  >
                    {asset.canvaUploadJobId
                      ? "Canva 업로드 결과 확인"
                      : "승인 자료를 Canva로 업로드"}
                  </Button>
                )}
                {asset.approved ? (
                  <span className="text-[10px] positive flex items-center gap-1.5 mr-auto">
                    <CheckCircle2 size={12} />
                    사람 검토 완료
                  </span>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    className="!text-[10px]"
                    disabled={unavailable}
                    onClick={() =>
                      void act({ action: "approve", assetId: asset.id })
                    }
                  >
                    <ShieldCheck size={12} />
                    미디어 승인
                  </Button>
                )}
                {!locked && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!text-[10px] muted"
                    disabled={unavailable}
                    onClick={() =>
                      void act({ action: "remove", assetId: asset.id })
                    }
                  >
                    <Trash2 size={12} />
                    참조 삭제
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="text-[10px] muted py-3">
            이 프로젝트에 연결된 미디어가 없습니다.
          </p>
        )
      )}
      {adding && !locked && (
        <form
          onSubmit={(event) => void add(event)}
          className="border border-[var(--border)] rounded-lg p-3 mt-3 space-y-3"
        >
          <div className="form-grid">
            <div>
              <label className="field-label" htmlFor="asset-kind">
                미디어 유형
              </label>
              <select
                id="asset-kind"
                className="select text-[11px]"
                value={kind}
                disabled={unavailable}
                onChange={(event) =>
                  setKind(event.target.value as "IMAGE" | "VIDEO")
                }
              >
                <option value="IMAGE">이미지</option>
                <option value="VIDEO">영상</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="asset-url">
                외부 HTTPS 미디어 주소
              </label>
              <input
                id="asset-url"
                className="input text-[11px]"
                type="url"
                required
                disabled={unavailable}
                placeholder="https://your-cdn.example/media"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
              />
            </div>
            <div className="form-full">
              <label className="field-label" htmlFor="asset-credit">
                출처 및 이용 권한
              </label>
              <textarea
                id="asset-credit"
                className="input text-[11px] min-h-[65px]"
                required
                maxLength={2000}
                disabled={unavailable}
                placeholder="제작자, 출처, 라이선스 또는 사용 허가 내용"
                value={credit}
                onChange={(event) => setCredit(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="asset-width">
                너비 (선택)
              </label>
              <input
                id="asset-width"
                type="number"
                min="1"
                max="20000"
                className="input text-[11px]"
                disabled={unavailable}
                value={width}
                onChange={(event) => setWidth(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="asset-height">
                높이 (선택)
              </label>
              <input
                id="asset-height"
                type="number"
                min="1"
                max="20000"
                className="input text-[11px]"
                disabled={unavailable}
                value={height}
                onChange={(event) => setHeight(event.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              type="button"
              disabled={busy}
              onClick={() => setAdding(false)}
            >
              취소
            </Button>
            <Button size="sm" type="submit" disabled={unavailable}>
              <Link2 size={12} />
              {busy ? "연결 중…" : "미디어 연결"}
            </Button>
          </div>
        </form>
      )}
      {assets.some((asset) => !asset.approved) && !locked && (
        <p className="field-hint mt-3">
          승인하면 미디어, 출처와 이용 권한을 검토한 기록이 남습니다.
        </p>
      )}
      {locked && (
        <p className="field-hint mt-3">
          예약·게시 상태에서는 미디어를 변경할 수 없습니다.
        </p>
      )}
      {error && (
        <div className="status-banner error !mt-3 !mb-0" role="alert">
          <AlertCircle size={13} className="shrink-0 mt-0.5" />
          {error}
        </div>
      )}
    </section>
  );
}
