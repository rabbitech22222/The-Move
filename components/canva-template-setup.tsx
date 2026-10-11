"use client";
import { useState, useEffect } from "react";
import type { CanvaTemplate } from "@/lib/domain";
import { useWorkspace } from "./workspace-provider";
import { Button } from "./ui/button";
export function CanvaTemplateSetup({ template }: { template?: CanvaTemplate }) {
  const { mutate } = useWorkspace();
  const [brandId, setBrandId] = useState("");
  const [pageCount, setPageCount] = useState(5);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    setBrandId(template?.configuration?.brandTemplateId ?? "");
    setPageCount(
      template?.configuration?.pageCount ??
        (template?.format === "REEL" ? 1 : 5),
    );
    setConfirmed(false);
    setMessage("");
  }, [template?.id]);
  if (!template) return null;
  return (
    <section className="panel p-5 space-y-4">
      <h2 className="font-semibold">{template.name} · 실제 원본 기반 설정</h2>
      <p className="text-sm muted">
        {template.designId}를 수정하지 않고 사본을 만들어 브랜드 템플릿으로
        등록하세요. 글꼴, 줄 간격, 여백, 이미지 프레임과 정보 위계를 유지한 뒤
        Canva에서 자동 채우기 필드를 지정합니다. 계정의 Canva Autofill 이용
        자격과 필요한 권한을 확인하세요.
      </p>
      <p className="text-xs muted">
        연결된 브랜드 템플릿:{" "}
        {template.configuration?.brandTemplateId ?? "미설정"}. API는 필드 유형을
        확인하며, 원본과의 시각적 일치는 사람이 검토합니다.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label>
          <span className="field-label">사본에서 등록한 브랜드 템플릿 ID</span>
          <input
            className="input mt-2 w-full"
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
          />
        </label>
        <label>
          <span className="field-label">승인한 템플릿 페이지 수</span>
          <input
            className="input mt-2 w-full"
            type="number"
            min={template.format === "REEL" ? 1 : 2}
            max={template.format === "REEL" ? 1 : 10}
            value={pageCount}
            onChange={(e) => setPageCount(Number(e.target.value))}
          />
        </label>
      </div>
      <label className="flex gap-2 items-start text-xs">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
        />
        <span>
          이 브랜드 템플릿이 선택한 실제 원본의 사본이며 {template.width} ×{" "}
          {template.height} 규격과 브랜드 디자인을 유지한 것을 확인했습니다.
          페이지 수가 다르면 해당 수의 사본을 별도로 준비합니다.
        </span>
      </label>
      <Button
        disabled={busy || !confirmed || !brandId.trim()}
        onClick={async () => {
          setBusy(true);
          setMessage("");
          try {
            await mutate("/api/canva", {
              action: "configure",
              templateId: template.id,
              brandTemplateId: brandId.trim(),
              pageCount,
              preservedLayout: true,
            });
            setMessage(
              "실제 원본과 필드를 조회했습니다. 자동 채우기 필드를 확인하세요.",
            );
          } catch (e) {
            setMessage(
              e instanceof Error ? e.message : "설정을 저장하지 못했습니다.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "설정 및 검사 중…" : "설정 저장 후 실제 필드 검사"}
      </Button>
      {message && (
        <p role="status" className="text-sm">
          {message}
        </p>
      )}
    </section>
  );
}
