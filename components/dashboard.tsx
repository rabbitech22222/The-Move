"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  ArrowRight,
  Users,
  Eye,
  ScanLine,
  Heart,
  ChevronDown,
  RefreshCw,
  CalendarDays,
  Layers2,
  Radio,
  Clock3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  useWorkspace,
  WorkspaceLoading,
  WorkspaceError,
} from "@/components/workspace-provider";
import { stages } from "@/lib/domain";
import type { AccountMetric } from "@/lib/domain";

const number = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US").format(Math.round(value));
const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const nullableSum = (values: (number | null)[]) =>
  values.length > 0 && values.every((v) => v !== null)
    ? values.reduce<number>((total, v) => total + (v ?? 0), 0)
    : null;
const toDate = (date: string) => date.slice(0, 10);
const stageLabels: Record<string, string> = {
  IDEA: "Ideas",
  RESEARCH: "Research",
  DRAFT: "Drafts",
  DESIGN: "Design",
  REVIEW: "In review",
  APPROVED: "Approved",
  SCHEDULED: "Scheduled",
  PUBLISHED: "Published",
};

export function Dashboard() {
  const { data, loading, refresh } = useWorkspace();
  const [channelId, setChannelId] = useState("all");
  const [period, setPeriod] = useState("30");
  const [start, setStart] = useState(() =>
    new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10),
  );
  const [end, setEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [refreshing, setRefreshing] = useState(false);
  const report = useMemo(() => {
    if (!data) return null;
    const endDate =
      period === "custom" ? end : new Date().toISOString().slice(0, 10);
    const startDate =
      period === "custom"
        ? start
        : new Date(
            new Date(`${endDate}T00:00:00Z`).getTime() -
              (Number(period) - 1) * 86400000,
          )
            .toISOString()
            .slice(0, 10);
    const channels = data.channels.filter(
      (c) => channelId === "all" || c.id === channelId,
    );
    const channelIds = new Set(channels.map((c) => c.id));
    const allMetrics = data.accountMetrics.filter(
      (m) => channelIds.has(m.channelId) && toDate(m.date) <= endDate,
    );
    const metrics = allMetrics.filter((m) => toDate(m.date) >= startDate);
    const latest = channels
      .map(
        (c) =>
          allMetrics
            .filter((m) => m.channelId === c.id)
            .sort((a, b) => b.date.localeCompare(a.date))[0],
      )
      .filter((m): m is AccountMetric => Boolean(m));
    const followers =
      latest.length === channels.length && latest.length > 0
        ? latest.reduce((total, m) => total + m.followers, 0)
        : null;
    const dailyDelta =
      latest.length === channels.length
        ? nullableSum(latest.map((m) => m.followerDelta))
        : null;
    const views = nullableSum(metrics.map((m) => m.views));
    const reach = nullableSum(metrics.map((m) => m.reach));
    const engagements = nullableSum(metrics.map((m) => m.engagements));
    const engagementRate =
      engagements !== null && reach !== null && reach > 0
        ? (engagements / reach) * 100
        : null;
    const chartDates = [...new Set(metrics.map((m) => toDate(m.date)))].sort();
    const chart = chartDates.map((date) => ({
      date,
      followers: channels.every((c) =>
        allMetrics.some((m) => m.channelId === c.id && toDate(m.date) <= date),
      )
        ? channels.reduce((total, c) => {
            const metric = allMetrics
              .filter((m) => m.channelId === c.id && toDate(m.date) <= date)
              .sort((a, b) => b.date.localeCompare(a.date))[0];
            return total + (metric?.followers ?? 0);
          }, 0)
        : null,
    }));
    const projects = data.projects.filter((p) => channelIds.has(p.channelId));
    const posts = data.posts.filter(
      (p) =>
        channelIds.has(p.channelId) &&
        toDate(p.publishedAt) >= startDate &&
        toDate(p.publishedAt) <= endDate,
    );
    const topPosts = posts
      .map((post) => ({
        post,
        metric: data.postMetrics
          .filter((m) => m.postId === post.id && toDate(m.date) <= endDate)
          .sort((a, b) => b.date.localeCompare(a.date))[0],
      }))
      .filter((p) => p.metric?.views !== null && p.metric?.views !== undefined)
      .sort((a, b) => (b.metric?.views ?? 0) - (a.metric?.views ?? 0))
      .slice(0, 4);
    const finance = data.finance.filter(
      (f) =>
        channelIds.has(f.channelId) &&
        toDate(f.date) >= startDate &&
        toDate(f.date) <= endDate,
    );
    const syncedAt = metrics
      .map((m) => m.syncedAt)
      .sort()
      .at(-1);
    return {
      channels,
      metrics,
      latest,
      followers,
      dailyDelta,
      views,
      reach,
      engagements,
      engagementRate,
      chart,
      projects,
      posts,
      topPosts,
      finance,
      syncedAt,
      startDate,
      endDate,
    };
  }, [data, channelId, period, start, end]);
  if (loading) return <WorkspaceLoading />;
  if (!data || !report)
    return (
      <>
        <WorkspaceError />
        <div className="empty-state">Your workspace could not be loaded.</div>
      </>
    );
  const update = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };
  const source = report.metrics.length
    ? [
        ...new Set(
          report.metrics.map((m) =>
            m.source === "DEMO"
              ? "Demo seed · sample data"
              : "Meta Instagram API",
          ),
        ),
      ].join(", ")
    : "No synchronized source";
  const publishedCount = nullableSum(
    report.metrics.map((m) => m.postsPublished),
  );
  const dailyFrequency =
    publishedCount === null
      ? null
      : publishedCount /
        Math.max(
          1,
          (new Date(report.endDate).getTime() -
            new Date(report.startDate).getTime()) /
            86400000 +
            1,
        );
  return (
    <>
      <div className="page-header">
        <div>
          <p className="eyebrow">YOUR EDITORIAL OVERVIEW</p>
          <h1 className="page-title">
            Dashboard
            <span className="inline-block w-1.5 h-1.5 bg-[var(--accent)] rounded-full ml-1.5" />
          </h1>
          <p className="page-description">
            A clear view of your channels, content, and momentum.
          </p>
        </div>
        <div className="flex items-center gap-2 mt-2">
          <Button
            variant="outline"
            size="sm"
            className="!text-[10px]"
            onClick={() => void update()}
            disabled={refreshing}
          >
            <RefreshCw size={12} className={refreshing ? "spin" : ""} />
            {refreshing ? "Refreshing" : "Refresh workspace"}
          </Button>
          <Button variant="outline" asChild size="sm" className="!text-[10px]">
            <Link href="/analytics">
              View analytics
              <ArrowUpRight size={12} />
            </Link>
          </Button>
        </div>
      </div>
      <WorkspaceError />
      <div className="flex justify-between items-center gap-3 flex-wrap mb-6">
        <div className="filter-row">
          <div className="relative">
            <select
              aria-label="Report channel"
              className="select !text-[11px] !w-44 !pr-8 appearance-none"
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
            <ChevronDown
              size={12}
              className="absolute right-3 top-3 pointer-events-none muted"
            />
          </div>
          <div className="period-switch" aria-label="Reporting period">
            {["7", "30", "90", "custom"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={period === p ? "active" : ""}
              >
                {p === "custom" ? "Custom" : `${p} days`}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex gap-2 items-center">
              <input
                className="input !text-[10px] !w-32"
                type="date"
                aria-label="Report start date"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
              />
              <span className="muted">–</span>
              <input
                className="input !text-[10px] !w-32"
                type="date"
                aria-label="Report end date"
                value={end}
                min={start}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>
          )}
        </div>
        <div className="text-[9px] muted flex items-center gap-1.5">
          <span
            className={`status-dot ${report.syncedAt ? "" : "disconnected"}`}
          />
          {data.demo ? "Sample snapshot:" : "Last synchronized:"}{" "}
          {report.syncedAt
            ? new Date(report.syncedAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "Not synchronized"}
        </div>
      </div>
      {data.demo && (
        <div className="status-banner !mb-5 !text-[10px]">
          <Radio size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold text-[var(--text)]">
              You’re viewing a demo workspace.
            </strong>{" "}
            Metrics and published posts below are sample data. Connect
            authorized accounts in Settings to use live data.
          </span>
          <Link
            href="/settings"
            className="ml-auto shrink-0 text-[var(--text)] flex items-center gap-1"
          >
            Connections
            <ArrowRight size={11} />
          </Link>
        </div>
      )}
      <div className="stat-grid">
        <Stat
          title="Total followers"
          value={number(report.followers)}
          icon={<Users size={14} />}
          footer={
            report.dailyDelta !== null ? (
              <>
                <span
                  className={report.dailyDelta >= 0 ? "positive" : "negative"}
                >
                  {report.dailyDelta >= 0 ? (
                    <ArrowUpRight size={11} className="inline" />
                  ) : (
                    <ArrowDownRight size={11} className="inline" />
                  )}{" "}
                  {number(Math.abs(report.dailyDelta))}
                </span>
                <span>latest daily change</span>
              </>
            ) : (
              <>Daily change unavailable</>
            )
          }
          demo={data.demo}
        />
        <Stat
          title="Content views"
          value={number(report.views)}
          icon={<Eye size={14} />}
          footer={
            <>
              {number(publishedCount)} {data.demo ? "sample " : ""}posts ·
              reporting period
            </>
          }
          demo={data.demo}
        />
        <Stat
          title="Account reach"
          value={number(report.reach)}
          icon={<ScanLine size={14} />}
          footer={<>Sum of daily reach · non-unique</>}
          demo={data.demo}
        />
        <Stat
          title="Engagement rate"
          value={
            report.engagementRate === null
              ? "—"
              : `${report.engagementRate.toFixed(2)}%`
          }
          icon={<Heart size={14} />}
          footer={<>Interactions ÷ daily reach</>}
          demo={data.demo}
        />
      </div>
      <div className="dashboard-chart-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Follower growth</h2>
              <p className="panel-subtitle">
                Daily account snapshots across{" "}
                {report.channels.length === 1
                  ? report.channels[0].name
                  : "all selected channels"}
              </p>
            </div>
            <div className="text-[9px] muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              Followers
            </div>
          </div>
          {report.chart.length ? (
            <div className="chart-frame">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={report.chart}
                  margin={{ top: 12, right: 13, left: 1, bottom: 0 }}
                >
                  <defs>
                    <linearGradient
                      id="followerFill"
                      x1="0"
                      y1="0"
                      x2="0"
                      y2="1"
                    >
                      <stop
                        offset="0%"
                        stopColor="var(--accent)"
                        stopOpacity={0.14}
                      />
                      <stop
                        offset="100%"
                        stopColor="var(--accent)"
                        stopOpacity={0.01}
                      />
                    </linearGradient>
                  </defs>
                  <CartesianGrid
                    stroke="var(--border)"
                    vertical={false}
                    strokeDasharray="3 4"
                  />
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    minTickGap={45}
                    tick={{ fontSize: 9, fill: "var(--muted-text)" }}
                    tickFormatter={(date) =>
                      new Date(`${date}T12:00:00Z`).toLocaleDateString(
                        "en-US",
                        { month: "short", day: "numeric" },
                      )
                    }
                    dy={8}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 9, fill: "var(--muted-text)" }}
                    tickFormatter={compact}
                    width={50}
                    domain={["dataMin", "dataMax"]}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--surface)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 11,
                      color: "var(--text)",
                    }}
                    labelFormatter={(date) =>
                      new Date(`${date}T12:00:00Z`).toLocaleDateString(
                        "en-US",
                        { month: "long", day: "numeric" },
                      )
                    }
                    formatter={(value) => [
                      number(Number(value)),
                      data.demo ? "Sample followers" : "Followers",
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="followers"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    fill="url(#followerFill)"
                    activeDot={{
                      r: 4,
                      strokeWidth: 3,
                      stroke: "var(--surface)",
                    }}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="empty-state h-[250px]">
              No account snapshots for this reporting period.
            </div>
          )}
          <div className="border-t border-[var(--border)] px-5 py-3 text-[9px] muted flex justify-between gap-3">
            <span>Source: {source}</span>
            <span>
              {report.startDate} — {report.endDate}
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Content pipeline</h2>
              <p className="panel-subtitle">
                From first idea to final approval
              </p>
            </div>
            <Layers2 size={15} className="muted" />
          </div>
          <div className="px-[22px] pb-5 space-y-[17px]">
            {(
              [
                "IDEA",
                "RESEARCH",
                "DRAFT",
                "DESIGN",
                "REVIEW",
                "APPROVED",
              ] as const
            ).map((stage) => {
              const count = report.projects.filter(
                (p) => p.stage === stage,
              ).length;
              return (
                <div key={stage} className="flex items-center gap-3">
                  <span className="text-[10px] muted w-[62px] shrink-0">
                    {stageLabels[stage]}
                  </span>
                  <div className="progress-track flex-1">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${report.projects.length ? (count / report.projects.length) * 100 : 0}%`,
                        background:
                          stage === "REVIEW"
                            ? "#cd9a5b"
                            : stage === "APPROVED"
                              ? "var(--positive)"
                              : stage === "DESIGN"
                                ? "#8b83a8"
                                : stage === "RESEARCH"
                                  ? "#7794a2"
                                  : stage === "DRAFT"
                                    ? "#818c76"
                                    : "#b8b6ad",
                      }}
                    />
                  </div>
                  <span className="text-[10px] w-3 text-right">{count}</span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-[var(--border)] flex justify-between items-center px-[22px] py-3">
            <span className="text-[9px] muted">
              {
                report.projects.filter(
                  (p) => !["PUBLISHED", "SCHEDULED"].includes(p.stage),
                ).length
              }{" "}
              projects in production
            </span>
            <Link
              href="/studio"
              className="flex items-center gap-1 text-[10px] font-medium"
            >
              Open studio
              <ArrowRight size={12} />
            </Link>
          </div>
        </section>
      </div>
      <section className="panel mb-[23px]">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">Your channels</h2>
            <p className="panel-subtitle">
              One workspace. Every brand in view.
            </p>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-1 text-[10px] muted"
          >
            Manage channels
            <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Channel</th>
                <th>Followers</th>
                <th>Daily change</th>
                <th>Views</th>
                <th>Engagement</th>
                <th>Posts</th>
                <th>Connection</th>
              </tr>
            </thead>
            <tbody>
              {report.channels.map((channel) => {
                const latest = report.latest.find(
                  (m) => m.channelId === channel.id,
                );
                const metrics = report.metrics.filter(
                  (m) => m.channelId === channel.id,
                );
                const views = nullableSum(metrics.map((m) => m.views));
                const reach = nullableSum(metrics.map((m) => m.reach));
                const engagement = nullableSum(
                  metrics.map((m) => m.engagements),
                );
                return (
                  <tr key={channel.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <span
                          className="w-7 h-7 rounded-md flex items-center justify-center text-[9px] font-semibold shrink-0"
                          style={{
                            background: `${channel.accent}15`,
                            color: channel.accent,
                          }}
                        >
                          {channel.name
                            .split(/\s|-/)
                            .map((w) => w[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <div className="font-semibold text-[11px]">
                            {channel.name}
                          </div>
                          <div className="text-[9px] muted mt-0.5">
                            {channel.handle}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="font-medium tabular-nums">
                      {number(latest?.followers ?? null)}
                    </td>
                    <td
                      className={
                        (latest?.followerDelta ?? 0) >= 0
                          ? "positive"
                          : "negative"
                      }
                    >
                      {latest?.followerDelta !== null &&
                      latest?.followerDelta !== undefined
                        ? `${latest.followerDelta >= 0 ? "+" : ""}${number(latest.followerDelta)}`
                        : "—"}
                    </td>
                    <td>{number(views)}</td>
                    <td>
                      {reach && engagement !== null
                        ? `${((engagement / reach) * 100).toFixed(2)}%`
                        : "—"}
                    </td>
                    <td>
                      {number(
                        nullableSum(metrics.map((m) => m.postsPublished)),
                      )}
                    </td>
                    <td>
                      <span className="flex items-center gap-1.5 text-[9px] muted">
                        <span
                          className={`status-dot ${channel.connected ? "" : "disconnected"}`}
                        />
                        {channel.connected ? "Connected" : "Disconnected"}
                        {data.demo && (
                          <span className="demo-label !text-[7px] !py-0.5 ml-1">
                            SAMPLE
                          </span>
                        )}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      <div className="dashboard-bottom-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Top-performing content</h2>
              <p className="panel-subtitle">
                Ranked by measured post views
                {data.demo ? " · sample posts" : ""}
              </p>
            </div>
            <Link
              href="/analytics"
              className="text-[10px] muted flex items-center gap-1"
            >
              Explore
              <ArrowUpRight size={12} />
            </Link>
          </div>
          {report.topPosts.length ? (
            <div className="px-[22px] pb-2">
              {report.topPosts.map(({ post, metric }, index) => (
                <div
                  key={post.id}
                  className="flex items-center gap-3 py-3 border-t border-[var(--border)]"
                >
                  <span className="text-[10px] muted w-3">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                  <div className="w-8 h-10 rounded bg-[var(--muted)] flex items-center justify-center text-[9px] font-semibold muted shrink-0">
                    {post.format === "REEL" ? "RE" : "CA"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-[11px] font-medium truncate">
                      {post.title}
                    </p>
                    <p className="m-0 text-[9px] muted mt-1">
                      {data.channels.find((c) => c.id === post.channelId)?.name}{" "}
                      · {post.format === "REEL" ? "Reel" : "Carousel"} ·{" "}
                      {new Date(post.publishedAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] m-0 font-medium tabular-nums">
                      {number(metric?.views ?? null)}
                    </p>
                    <p className="text-[9px] muted m-0 mt-1">views</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              No post-level view data for this period.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">Production at a glance</h2>
              <p className="panel-subtitle">The work behind your publishing</p>
            </div>
            <Clock3 size={15} className="muted" />
          </div>
          <div className="px-[22px] pb-5 space-y-4">
            <div className="flex justify-between">
              <span className="text-[10px] muted">Published in period</span>
              <span className="text-[11px] font-medium">
                {number(publishedCount)} posts
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] muted">Posting frequency</span>
              <span className="text-[11px] font-medium">
                {dailyFrequency === null ? "—" : dailyFrequency.toFixed(1)} /
                day
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] muted">Tracked production time</span>
              <span className="text-[11px] font-medium">
                {(
                  report.projects.reduce(
                    (sum, p) => sum + p.productionMinutes,
                    0,
                  ) / 60
                ).toFixed(1)}{" "}
                hrs
              </span>
            </div>
            <div className="border-t border-[var(--border)] pt-3">
              {report.finance.length ? (
                [...new Set(report.finance.map((entry) => entry.currency))].map(
                  (currency) => (
                    <div key={currency} className="space-y-2 mb-2">
                      <div className="flex justify-between">
                        <span className="text-[10px] muted">
                          Revenue · {currency}
                        </span>
                        <span className="text-[11px] font-medium">
                          {number(
                            nullableSum(
                              report.finance
                                .filter(
                                  (entry) =>
                                    entry.currency === currency &&
                                    entry.type === "REVENUE",
                                )
                                .map((entry) => entry.amount),
                            ),
                          )}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[10px] muted">
                          Expenses · {currency}
                        </span>
                        <span className="text-[11px] font-medium">
                          {number(
                            nullableSum(
                              report.finance
                                .filter(
                                  (entry) =>
                                    entry.currency === currency &&
                                    entry.type === "EXPENSE",
                                )
                                .map((entry) => entry.amount),
                            ),
                          )}
                        </span>
                      </div>
                    </div>
                  ),
                )
              ) : (
                <div className="flex justify-between">
                  <span className="text-[10px] muted">Revenue / costs</span>
                  <span className="text-[10px]">No entries yet</span>
                </div>
              )}
            </div>
            <p className="text-[9px] muted leading-relaxed">
              Production time reflects recorded project entries. Financial data
              is shown only when available.
            </p>
          </div>
        </section>
      </div>
    </>
  );
}

function Stat({
  title,
  value,
  icon,
  footer,
  demo,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  footer: React.ReactNode;
  demo: boolean;
}) {
  return (
    <section className="panel stat">
      <div className="stat-heading">
        <span>{title}</span>
        {icon}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-footer">{footer}</div>
      {demo && <span className="sr-only">Demo sample data</span>}
    </section>
  );
}
