"use client";

import { useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  ChevronDown,
  ExternalLink,
  FileText,
  Plus,
  Radio,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import {
  useWorkspace,
  WorkspaceError,
  WorkspaceLoading,
} from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Topic } from "@/lib/domain";

function date(value: string | null) {
  return value
    ? new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Seoul",
      })
    : "Not provided";
}

export function Intelligence() {
  const { data, loading, mutate, refresh } = useWorkspace();
  const [search, setSearch] = useState("");
  const [channel, setChannel] = useState("all");
  const [status, setStatus] = useState("INBOX");
  const [selected, setSelected] = useState<Topic | null>(null);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceType, setSourceType] = useState<"RSS" | "MANUAL">("RSS");
  const [rights, setRights] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const topics = useMemo(
    () =>
      data?.topics.filter(
        (t) =>
          (status === "all" || t.status === status) &&
          (channel === "all" || t.recommendedChannelId === channel) &&
          `${t.title} ${t.category}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) ?? [],
    [data, search, channel, status],
  );

  async function action(
    key: string,
    body: Record<string, unknown>,
    success: string,
  ) {
    setBusy(key);
    setNotice(null);
    try {
      await mutate("/api/intelligence", body);
      setNotice({ text: success, failed: false });
      return true;
    } catch (err) {
      setNotice({
        text:
          err instanceof Error
            ? err.message
            : "The action could not be completed.",
        failed: true,
      });
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function fetchSources() {
    const sources = data?.sources.filter((source) => source.enabled) || [];
    if (!sources.length) {
      setNotice({
        text: "Add an authorized source before fetching. Demo fixture sources are disabled.",
        failed: true,
      });
      return;
    }
    setBusy("ingest");
    setNotice(null);
    let queued = 0;
    try {
      for (const source of sources) {
        await mutate("/api/intelligence", {
          action: "ingest",
          sourceId: source.id,
        });
        queued++;
      }
      setNotice({
        text: `${queued} source ingestion job(s) queued. Check the Scout task in the Office, then refresh the inbox.`,
        failed: false,
      });
    } catch (err) {
      setNotice({
        text: `${queued ? `${queued} source job(s) queued. ` : ""}${err instanceof Error ? err.message : "Source ingestion could not be queued."}`,
        failed: true,
      });
    } finally {
      setBusy(null);
    }
  }
  if (loading) return <WorkspaceLoading />;
  if (!data) return <WorkspaceError />;
  const selectedSource = data.sources.find((s) => s.id === selected?.sourceId);
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow">DISCOVER / RESEARCH / EVALUATE</p>
          <h1 className="page-title">Intelligence</h1>
          <p className="muted mt-2">
            A considered starting point for your next story. Every claim starts
            with a source.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => void refresh()}>
            Refresh inbox
          </Button>
          <Button variant="outline" onClick={() => setSourceOpen(true)}>
            <Plus size={15} /> Add source
          </Button>
          <Button onClick={fetchSources} disabled={!!busy}>
            <Radio size={15} />
            {busy === "ingest" ? "Queuing…" : "Fetch sources"}
          </Button>
        </div>
      </header>
      {notice && (
        <div
          role={notice.failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-red-400/40 bg-red-500/5 text-red-600" : "border-[var(--border)] bg-[var(--surface)]"}`}
        >
          {notice.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="IN THE INBOX"
          value={data.topics.filter((t) => t.status === "INBOX").length}
          description="Stories waiting for your judgment"
        />
        <Stat
          label="SAVED FOR LATER"
          value={data.topics.filter((t) => t.status === "SAVED").length}
          description="Keep promising angles within reach"
        />
        <Stat
          label="ACTIVE SOURCES"
          value={data.sources.filter((s) => s.enabled).length}
          description="Authorized RSS feeds and submissions"
        />
      </div>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_280px]">
        <section className="panel min-w-0 overflow-hidden">
          <div className="panel-header flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">
                The inbox{" "}
                <span className="ml-2 text-xs font-normal muted">
                  {topics.length} stories
                </span>
              </h2>
              <p className="muted mt-1 text-xs">
                Relevance is a transparent heuristic, never a prediction of
                virality.
              </p>
            </div>
            <div className="flex gap-1">
              <Button
                variant={status === "INBOX" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("INBOX")}
              >
                Inbox
              </Button>
              <Button
                variant={status === "SAVED" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("SAVED")}
              >
                Saved
              </Button>
              <Button
                variant={status === "all" ? "secondary" : "ghost"}
                size="sm"
                onClick={() => setStatus("all")}
              >
                All
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 border-b border-[var(--border)] p-4">
            <label className="relative min-w-[180px] flex-1">
              <span className="sr-only">Search intelligence topics</span>
              <Search
                size={15}
                className="absolute left-3 top-3 text-[var(--muted-text)]"
              />
              <input
                className="input w-full !pl-9"
                placeholder="Find a story or category…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <select
              className="select !w-auto"
              aria-label="Filter recommended channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value)}
            >
              <option value="all">All channels</option>
              {data.channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          <div className="overflow-x-auto">
            <table className="data-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Story & source</th>
                  <th className="text-left">Channel</th>
                  <th className="text-left">Relevance</th>
                  <th className="text-left">Evidence</th>
                  <th>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {topics.map((topic) => (
                  <tr key={topic.id}>
                    <td className="min-w-[280px]">
                      <button
                        className="max-w-96 whitespace-normal text-left font-medium leading-relaxed hover:text-[var(--accent)] focus-visible:underline"
                        onClick={() => setSelected(topic)}
                      >
                        {topic.title}
                      </button>
                      <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs muted">
                        <span>
                          {data.sources.find((s) => s.id === topic.sourceId)
                            ?.name ?? "Submitted source"}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>{date(topic.publishedAt)}</span>
                      </p>
                      <div className="mt-2 flex gap-2">
                        <Badge>{topic.category}</Badge>
                        <Badge>
                          {topic.format === "REEL" ? "Reel" : "Carousel"}
                        </Badge>
                        {topic.status === "DISMISSED" && (
                          <Badge>Dismissed</Badge>
                        )}
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {data.channels.find(
                        (c) => c.id === topic.recommendedChannelId,
                      )?.name ?? "Unassigned"}
                    </td>
                    <td>
                      <button
                        className="text-left"
                        onClick={() => setSelected(topic)}
                        aria-label={`Explain relevance score of ${topic.relevance} for ${topic.title}`}
                      >
                        <span className="font-semibold tabular-nums">
                          {topic.relevance}
                          <span className="text-xs font-normal muted">
                            {" "}
                            / 100
                          </span>
                        </span>
                        <div className="mt-2 h-1 w-20 overflow-hidden rounded-full bg-[var(--muted)]">
                          <div
                            style={{
                              width: `${Math.max(0, Math.min(100, topic.relevance))}%`,
                            }}
                            className="h-full bg-[var(--accent)]"
                          />
                        </div>
                      </button>
                    </td>
                    <td>
                      <Badge
                        className={
                          topic.confidence === "HIGH"
                            ? "text-emerald-700 dark:text-emerald-400"
                            : topic.confidence === "LOW"
                              ? "text-amber-700 dark:text-amber-400"
                              : ""
                        }
                      >
                        {topic.confidence.toLowerCase()}
                      </Badge>
                      {topic.uncertainClaims.length > 0 && (
                        <p className="mt-2 text-[11px] muted">
                          {topic.uncertainClaims.length} uncertain claim
                          {topic.uncertainClaims.length === 1 ? "" : "s"}
                        </p>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelected(topic)}
                        aria-label={`Review ${topic.title}`}
                      >
                        <ChevronDown size={16} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {topics.length === 0 && (
              <div className="empty-state">
                <FileText
                  className="mx-auto mb-3 text-[var(--muted-text)]"
                  size={28}
                />
                <p className="font-medium">No stories in this view</p>
                <p className="mt-1 text-sm muted">
                  Adjust your filters or add an authorized source.
                </p>
              </div>
            )}
          </div>
        </section>
        <aside className="space-y-4">
          <section className="panel">
            <div className="panel-header">
              <h2 className="text-sm font-semibold">Your source desk</h2>
            </div>
            <div className="divide-y divide-[var(--border)]">
              {data.sources.map((source) => (
                <div key={source.id} className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-sm font-medium hover:underline"
                    >
                      {source.name}
                      <ExternalLink size={11} />
                    </a>
                    <Badge className="text-[9px]">{source.type}</Badge>
                  </div>
                  <p className="mt-2 text-xs muted">
                    {source.lastFetchedAt
                      ? `Fetched ${date(source.lastFetchedAt)}`
                      : "Not fetched yet"}
                  </p>
                  {source.lastError && (
                    <p className="mt-2 text-xs text-red-600">
                      {source.lastError}
                    </p>
                  )}
                  <p className="mt-2 line-clamp-2 text-[11px] muted">
                    {source.rights || "Usage rights require review"}
                  </p>
                </div>
              ))}
              {data.sources.length === 0 && (
                <p className="p-4 text-sm muted">
                  No sources yet. Add a feed to begin.
                </p>
              )}
            </div>
          </section>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--accent-soft)] p-4">
            <Sparkles size={17} className="mb-3 text-[var(--accent)]" />
            <h3 className="text-sm font-semibold">Evidence before instinct</h3>
            <p className="mt-2 text-xs leading-relaxed muted">
              Inspect source dates, usage rights and uncertain claims before
              turning a topic into a project. AI suggestions remain subject to
              human review.
            </p>
          </div>
        </aside>
      </div>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent>
          {selected && (
            <>
              <p className="eyebrow mb-2">STORY BRIEF</p>
              <DialogTitle className="pr-6 text-xl font-semibold leading-snug">
                {selected.title}
              </DialogTitle>
              <DialogDescription className="mt-2 text-sm muted">
                Review the evidence and choose the next editorial step.
              </DialogDescription>
              <div className="mt-5 flex flex-wrap gap-2">
                <Badge>{selected.category}</Badge>
                <Badge>
                  {selected.confidence.toLowerCase()} evidence confidence
                </Badge>
                <Badge>{selected.status.toLowerCase()}</Badge>
              </div>
              <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                <div>
                  <dt className="text-xs muted">Source</dt>
                  <dd className="mt-1">
                    {selectedSource?.name || "Submitted source"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs muted">Published</dt>
                  <dd className="mt-1">{date(selected.publishedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">Retrieved</dt>
                  <dd className="mt-1">{date(selected.retrievedAt)}</dd>
                </div>
                <div>
                  <dt className="text-xs muted">Recommended channel</dt>
                  <dd className="mt-1">
                    {data.channels.find(
                      (c) => c.id === selected.recommendedChannelId,
                    )?.name || "Unassigned"}
                  </dd>
                </div>
              </dl>
              <a
                href={selected.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
              >
                Read original source <ExternalLink size={13} />
              </a>
              <section className="mt-5 rounded-lg bg-[var(--muted)] p-4">
                <h3 className="text-sm font-medium">
                  Why this scores {selected.relevance} / 100
                </h3>
                <p className="mt-2 text-sm leading-relaxed muted">
                  {selected.scoreExplanation}
                </p>
              </section>
              <section className="mt-4">
                <h3 className="text-sm font-medium">Rights & verification</h3>
                <p className="mt-2 text-sm muted">
                  {selected.rights ||
                    "Usage rights have not been verified. Review before reuse."}
                </p>
                {selected.uncertainClaims.length ? (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-amber-700 dark:text-amber-400">
                    {selected.uncertainClaims.map((claim, i) => (
                      <li key={i}>{claim}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs muted">
                    No uncertain claims have been flagged. Human verification is
                    still required.
                  </p>
                )}
              </section>
              {notice && (
                <p
                  role={notice.failed ? "alert" : "status"}
                  className={`mt-4 text-sm ${notice.failed ? "text-red-600" : "muted"}`}
                >
                  {notice.text}
                </p>
              )}
              <div className="mt-6 flex flex-wrap gap-2 border-t border-[var(--border)] pt-4">
                <Button
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      {
                        action: "create-project",
                        topicId: selected.id,
                        format: "CAROUSEL",
                      },
                      "Carousel project created in the Studio.",
                    )
                  }
                >
                  <Plus size={14} /> Create carousel
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      {
                        action: "create-project",
                        topicId: selected.id,
                        format: "REEL",
                      },
                      "Reel project created in the Studio.",
                    )
                  }
                >
                  Create reel
                </Button>
                <Button
                  variant="outline"
                  disabled={!!busy}
                  onClick={() =>
                    action(
                      selected.id,
                      { action: "research", topicId: selected.id },
                      "Research task queued. Check the Office for its result.",
                    )
                  }
                >
                  <Search size={14} /> Research further
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await action(
                        selected.id,
                        { action: "save", topicId: selected.id },
                        "Story saved.",
                      )
                    )
                      setSelected(null);
                  }}
                >
                  <Bookmark size={14} /> Save
                </Button>
                <Button
                  variant="ghost"
                  disabled={!!busy}
                  onClick={async () => {
                    if (
                      await action(
                        selected.id,
                        { action: "dismiss", topicId: selected.id },
                        "Story dismissed.",
                      )
                    )
                      setSelected(null);
                  }}
                >
                  <X size={14} /> Dismiss
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={sourceOpen} onOpenChange={setSourceOpen}>
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            Add a source
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm muted">
            Use an RSS feed or a source URL you are authorized to access. Source
            credit does not replace permission to reuse content.
          </DialogDescription>
          <form
            className="mt-6 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy("source");
              setNotice(null);
              try {
                await mutate("/api/intelligence", {
                  action: "add-source",
                  source: {
                    name: sourceName,
                    url: sourceUrl,
                    rights,
                    type: sourceType,
                  },
                });
                setSourceOpen(false);
                setSourceName("");
                setSourceUrl("");
                setRights("");
                setNotice({
                  text: "Source added. Fetch sources to retrieve its stories.",
                  failed: false,
                });
              } catch (err) {
                setNotice({
                  text:
                    err instanceof Error
                      ? err.message
                      : "Could not add source.",
                  failed: true,
                });
              } finally {
                setBusy(null);
              }
            }}
          >
            <label className="block">
              <span className="field-label">Source type</span>
              <select
                className="select mt-1 w-full"
                value={sourceType}
                onChange={(e) =>
                  setSourceType(e.target.value as "RSS" | "MANUAL")
                }
              >
                <option value="RSS">RSS feed</option>
                <option value="MANUAL">User-submitted source</option>
              </select>
            </label>
            <label className="block">
              <span className="field-label">Source name</span>
              <input
                className="input mt-1 w-full"
                required
                maxLength={120}
                placeholder="Publication or organization"
                value={sourceName}
                onChange={(e) => setSourceName(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">
                {sourceType === "RSS" ? "RSS feed URL" : "Source URL"}
              </span>
              <input
                className="input mt-1 w-full"
                type="url"
                required
                placeholder="https://example.com/feed.xml"
                value={sourceUrl}
                onChange={(e) => setSourceUrl(e.target.value)}
              />
            </label>
            <label className="block">
              <span className="field-label">Rights & permitted use</span>
              <textarea
                className="input mt-1 min-h-24 w-full"
                required
                maxLength={2000}
                placeholder="Record access terms and restrictions. If unknown, say so."
                value={rights}
                onChange={(e) => setRights(e.target.value)}
              />
            </label>
            {notice?.failed && (
              <p role="alert" className="text-sm text-red-600">
                {notice.text}
              </p>
            )}
            <Button type="submit" disabled={!!busy}>
              <Check size={14} />
              {busy === "source" ? "Adding…" : "Add source"}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Stat({
  label,
  value,
  description,
}: {
  label: string;
  value: number;
  description: string;
}) {
  return (
    <div className="panel p-5">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">
        {value}
      </p>
      <p className="mt-2 text-xs muted">{description}</p>
    </div>
  );
}
