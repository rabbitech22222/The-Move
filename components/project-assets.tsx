"use client";

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
          : "The media reference could not be updated.",
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
      setError("Provide a valid HTTPS URL for externally hosted media.");
      return;
    }
    if (!credit.trim()) {
      setError(
        "Include a source credit and any relevant usage rights information.",
      );
      return;
    }
    for (const dimension of [width, height]) {
      if (
        dimension &&
        (!Number.isInteger(Number(dimension)) ||
          Number(dimension) < 1 ||
          Number(dimension) > 20000)
      ) {
        setError(
          "Optional dimensions must be whole numbers between 1 and 20,000 pixels.",
        );
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
          Media assets{" "}
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
            Link media
          </Button>
        )}
      </div>
      <p className="field-hint mb-3">
        Link externally hosted media and record its source credit. A reference
        does not upload a file or establish ownership. Dimensions are entered by
        an operator.
      </p>
      {project.stage === "APPROVED" && (
        <p className="text-[10px] muted mb-3">
          Changing or approving assets sends the project back to Review and
          invalidates its existing approvals.
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
                    aria-label={`Preview ${asset.kind.toLowerCase()} media`}
                  >
                    <span className="truncate">{asset.url}</span>
                    <ExternalLink size={11} className="shrink-0 muted" />
                  </a>
                  <p className="text-[10px] muted mt-1 leading-relaxed break-words">
                    {asset.credit}
                  </p>
                  <p className="text-[9px] muted mt-1">
                    {asset.kind === "VIDEO" ? "Video" : "Image"} · Reported
                    dimensions: {asset.width ?? "unknown"} ×{" "}
                    {asset.height ?? "unknown"}
                    {asset.width && asset.height ? " px" : ""}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap justify-end items-center gap-2 mt-3">
                {asset.approved ? (
                  <span className="text-[10px] positive flex items-center gap-1.5 mr-auto">
                    <CheckCircle2 size={12} />
                    Human reviewed
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
                    Approve asset
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
                    Remove reference
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        !adding && (
          <p className="text-[10px] muted py-3">
            No media references linked to this project.
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
                Media type
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
                <option value="IMAGE">Image</option>
                <option value="VIDEO">Video</option>
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="asset-url">
                External HTTPS media URL
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
                Source credit & usage rights
              </label>
              <textarea
                id="asset-credit"
                className="input text-[11px] min-h-[65px]"
                required
                maxLength={2000}
                disabled={unavailable}
                placeholder="Creator, source, and relevant license or permission details"
                value={credit}
                onChange={(event) => setCredit(event.target.value)}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="asset-width">
                Reported width (optional)
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
                Reported height (optional)
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
              Cancel
            </Button>
            <Button size="sm" type="submit" disabled={unavailable}>
              <Link2 size={12} />
              {busy ? "Linking…" : "Link media"}
            </Button>
          </div>
        </form>
      )}
      {assets.some((asset) => !asset.approved) && !locked && (
        <p className="field-hint mt-3">
          Approving an asset records your review of the media, source credit,
          and usage rights.
        </p>
      )}
      {locked && (
        <p className="field-hint mt-3">
          Assets are locked while scheduled or published.
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
