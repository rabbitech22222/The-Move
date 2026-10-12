"use client";
import { useEffect, useState } from "react";
import { useWorkspace } from "./workspace-provider";
export function ProductionSteps({
  onCanvaConfigured,
}: { onCanvaConfigured?: (configured: boolean) => void } = {}) {
  const { data } = useWorkspace();
  const [settings, setSettings] = useState<{
    instagram?: { verified: boolean };
    integrations?: { canva: { configured: boolean; expired?: boolean } };
  } | null>(null);
  useEffect(() => {
    let active = true;
    const read = async () => {
      try {
        const r = await fetch("/api/settings", { cache: "no-store" });
        const j = await r.json();
        if (active && r.ok) {
          setSettings(j.data);
          onCanvaConfigured?.(
            !!j.data.integrations.canva.configured &&
              !j.data.integrations.canva.expired,
          );
        }
      } catch {
        if (active) {
          setSettings(null);
          onCanvaConfigured?.(false);
        }
      }
    };
    void read();
    return () => {
      active = false;
    };
  }, [data?.audit[0]?.id, data?.tasks[0]?.updatedAt, onCanvaConfigured]);
  const source =
    data?.templates.filter((t) => t.inspectedAt && t.configuration?.previewUrl)
      .length || 0;
  const ready = data?.templates.filter((t) => t.status === "READY").length || 0;
  const connected =
    settings?.integrations?.canva.configured &&
    !settings.integrations.canva.expired;
  const generated =
    data?.designs.filter(
      (d) => d.status === "READY" && d.externalId && d.editUrl,
    ).length || 0;
  const steps = [
    {
      label: "Instagram",
      done: !!settings?.instagram?.verified,
      detail: "@themovemag_ 계정 확인",
      href: "/settings#instagram-connection",
    },
    {
      label: "Canva",
      done: !!connected && source > 0,
      detail: `실제 원본 접근 ${source}/3`,
      href: "/settings#canva-connection",
    },
    {
      label: "원본 필드",
      done: !!connected && ready > 0,
      detail: `자동 제작 가능 ${ready}/3`,
      href: "/canva",
    },
    {
      label: "새 디자인",
      done: generated > 0,
      detail: `API 생성 완료 ${generated}건 · 사람 검토 필요`,
      href: "/canva",
    },
  ];
  return (
    <section className="panel p-5" aria-label="실제 연결·제작 흐름">
      <h2 className="font-semibold text-sm">
        실제 계정 연결 → 원본 확인 → Canva 제작
      </h2>
      <div className="grid gap-3 mt-4 md:grid-cols-4">
        {steps.map((s, i) => (
          <a
            href={s.href}
            key={s.label}
            className="rounded-lg border border-[var(--border)] p-3"
          >
            <p className="text-sm font-medium">
              {i + 1}. {s.label}{" "}
              <span className={s.done ? "text-emerald-600" : "muted"}>
                {s.done ? "확인" : "대기"}
              </span>
            </p>
            <p className="text-xs muted mt-2">{s.detail}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
