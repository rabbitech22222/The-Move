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
        "Your new copy is recorded as Manual review. No Canva API creation or layout verification is claimed.",
      );
      setFailed(false);
      setOpen(false);
      setLink("");
      setConfirmed(false);
    } catch (e) {
      setFailed(true);
      setMessage(
        e instanceof Error ? e.message : "The copy could not be recorded.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-header flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Manual Canva alternative</h2>
          <p className="mt-1 text-xs muted">
            For video replacement, page changes, or unavailable autofill access.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!eligible || busy}
          onClick={() => setOpen(!open)}
        >
          <Copy size={13} />
          Record a new Canva copy
        </Button>
      </div>
      <div className="p-5">
        <p className="text-xs leading-relaxed muted">
          Select a sourced Studio project in Design or Review and its approved
          reference above. In Canva, use Make a copy, preserve the canvas,
          hierarchy and brand, then paste the editable link to the new design.
          THE MOVE reels must duplicate only DAHPcvVkH8k and preserve its
          landscape-video frame.
        </p>
        {template && (
          <a
            className="inline-flex items-center gap-1 mt-3 text-xs text-[var(--accent)]"
            href={`https://www.canva.com/design/${template.designId}/view`}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open selected reference
            <ExternalLink size={12} />
          </a>
        )}
        {open && (
          <form onSubmit={submit} className="mt-5 space-y-4">
            <div className="grid gap-4 md:grid-cols-[1fr_150px]">
              <label>
                <span className="field-label">New Canva editable link</span>
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
                <span className="field-label">Actual page count</span>
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
                I made a new copy without editing the source and checked
                branding, source credit, line wrapping and the {template?.width}{" "}
                × {template?.height} canvas. For THE MOVE reels I preserved the
                landscape-video placement and aspect ratio. This is my
                declaration; a human visual review is still required.
              </span>
            </label>
            <Button
              type="submit"
              size="sm"
              disabled={busy || !confirmed || !eligible}
            >
              <ShieldCheck size={13} />
              {busy ? "Recording…" : "Submit copy for review"}
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
