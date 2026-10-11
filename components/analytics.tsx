"use client";

import { useMemo, useState } from "react";
import { Check, FlaskConical, Lightbulb, Sparkles, X } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
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
import type { PostMetric, Recommendation } from "@/lib/domain";

const number = (value: number | null) =>
  value === null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(
        value,
      );
const median = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
function engagement(metric: PostMetric | undefined) {
  if (
    !metric ||
    metric.reach === null ||
    metric.reach <= 0 ||
    [metric.likes, metric.comments, metric.saves, metric.shares].some(
      (value) => value === null,
    )
  )
    return null;
  return (
    ((metric.likes! + metric.comments! + metric.saves! + metric.shares!) /
      metric.reach) *
    100
  );
}
function daysBefore(end: string, days: number) {
  const value = new Date(`${end}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - days + 1);
  return value.toISOString().slice(0, 10);
}
const tooltipStyle = {
  background: "var(--surface)",
  color: "var(--text)",
  border: "1px solid var(--border)",
  borderRadius: 9,
  fontSize: 12,
};

export function Analytics() {
  const { data, loading, mutate, refresh } = useWorkspace();
  const [period, setPeriod] = useState("30");
  const [channelId, setChannelId] = useState("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{
    text: string;
    failed: boolean;
  } | null>(null);
  const [experiment, setExperiment] = useState<Recommendation | null>(null);
  const [result, setResult] = useState("");
  const computed = useMemo(() => {
    if (!data) return null;
    const source = data.demo ? "DEMO" : "META";
    const allSnapshots = data.accountMetrics.filter((m) => m.source === source);
    const latestDate =
      allSnapshots
        .map((m) => m.date)
        .sort()
        .at(-1) || new Date().toISOString().slice(0, 10);
    const to = period === "custom" ? customTo || latestDate : latestDate;
    const from =
      period === "custom"
        ? customFrom || daysBefore(to, 30)
        : daysBefore(to, Number(period));
    const channels = data.channels.filter(
      (c) => channelId === "all" || c.id === channelId,
    );
    const ids = new Set(channels.map((c) => c.id));
    const snapshots = allSnapshots
      .filter((m) => ids.has(m.channelId) && m.date >= from && m.date <= to)
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.syncedAt.localeCompare(b.syncedAt),
      );
    const posts = data.posts.filter(
      (p) =>
        p.source === source &&
        ids.has(p.channelId) &&
        p.publishedAt.slice(0, 10) >= from &&
        p.publishedAt.slice(0, 10) <= to,
    );
    const observations = posts.map((post) => {
      const metric = data.postMetrics
        .filter((m) => m.source === source && m.postId === post.id)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.syncedAt.localeCompare(b.syncedAt),
        )
        .at(-1);
      return { post, metric, rate: engagement(metric) };
    });
    const summary = channels.map((channel) => {
      const metrics = snapshots.filter((m) => m.channelId === channel.id);
      const first = metrics[0],
        last = metrics.at(-1);
      const rates = observations
        .filter((p) => p.post.channelId === channel.id)
        .map((p) => p.rate)
        .filter((rate): rate is number => rate !== null);
      const timed = data.projects.filter(
        (p) =>
          p.channelId === channel.id &&
          p.stage === "PUBLISHED" &&
          p.productionMinutes > 0 &&
          p.updatedAt.slice(0, 10) >= from &&
          p.updatedAt.slice(0, 10) <= to,
      );
      return {
        channel,
        followers: last?.followers ?? null,
        growth:
          first && last && first.date !== last.date
            ? last.followers - first.followers
            : null,
        growthRate:
          first && last && first.date !== last.date && first.followers > 0
            ? ((last.followers - first.followers) / first.followers) * 100
            : null,
        medianRate: median(rates),
        sampleSize: rates.length,
        production: median(timed.map((p) => p.productionMinutes)),
        timedCount: timed.length,
        lastSynced: last?.syncedAt ?? null,
      };
    });
    const observedDates = [...new Set(snapshots.map((m) => m.date))].sort();
    const chartDates = new Set([from, to, ...observedDates]);
    // Explicit null observations break the line across gaps, without inventing snapshots.
    for (let index = 1; index < observedDates.length; index++) {
      const previous = Date.parse(`${observedDates[index - 1]}T00:00:00Z`);
      const next = Date.parse(`${observedDates[index]}T00:00:00Z`);
      if (next - previous > 86_400_000)
        chartDates.add(
          new Date(previous + 86_400_000).toISOString().slice(0, 10),
        );
    }
    const chart = [...chartDates].sort().map((date) => {
      const row: Record<string, string | number | null> = {
        date,
        timestamp: Date.parse(`${date}T00:00:00Z`),
      };
      for (const channel of channels)
        row[channel.id] =
          snapshots
            .filter((m) => m.channelId === channel.id && m.date === date)
            .at(-1)?.followers ?? null;
      return row;
    });
    const formats = [
      ...new Set([
        "CAROUSEL",
        "REEL",
        ...observations.map((o) => o.post.format),
      ]),
    ].map((format) => {
      const rows = observations.filter((o) => o.post.format === format);
      const rates = rows
        .map((o) => o.rate)
        .filter((r): r is number => r !== null);
      return {
        name: format.charAt(0) + format.slice(1).toLowerCase(),
        rate: median(rates),
        sample: rates.length,
        total: rows.length,
      };
    });
    const categories = [...new Set(observations.map((o) => o.post.category))]
      .map((category) => {
        const rates = observations
          .filter((o) => o.post.category === category)
          .map((o) => o.rate)
          .filter((r): r is number => r !== null);
        return { name: category, rate: median(rates), sample: rates.length };
      })
      .sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
    const finances = data.finance.filter(
      (f) =>
        ids.has(f.channelId) &&
        (data.demo || f.source !== "DEMO") &&
        f.date.slice(0, 10) >= from &&
        f.date.slice(0, 10) <= to,
    );
    const money = [...new Set(finances.map((f) => f.currency))].map(
      (currency) => ({
        currency,
        revenue: finances
          .filter((f) => f.currency === currency && f.type === "REVENUE")
          .reduce((total, f) => total + f.amount, 0),
        expense: finances
          .filter((f) => f.currency === currency && f.type === "EXPENSE")
          .reduce((total, f) => total + f.amount, 0),
      }),
    );
    const rates = observations
      .map((o) => o.rate)
      .filter((r): r is number => r !== null);
    const growth = summary
      .map((s) => s.growth)
      .filter((g): g is number => g !== null);
    const production = data.projects.filter(
      (p) =>
        ids.has(p.channelId) &&
        p.stage === "PUBLISHED" &&
        p.productionMinutes > 0 &&
        p.updatedAt.slice(0, 10) >= from &&
        p.updatedAt.slice(0, 10) <= to,
    );
    return {
      from,
      to,
      source,
      channels,
      snapshots,
      observations,
      summary,
      chart,
      formats,
      categories,
      money,
      rates,
      totalGrowth: growth.length ? growth.reduce((a, b) => a + b, 0) : null,
      growthChannels: growth.length,
      medianRate: median(rates),
      production: median(production.map((p) => p.productionMinutes)),
      timedCount: production.length,
      lastSync:
        snapshots
          .map((m) => m.syncedAt)
          .sort()
          .at(-1) ?? null,
    };
  }, [data, channelId, period, customFrom, customTo]);

  async function action(
    key: string,
    body: Record<string, unknown>,
    message: string,
  ) {
    setBusy(key);
    setNotice(null);
    try {
      await mutate("/api/analytics", body);
      setNotice({ text: message, failed: false });
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
  if (loading) return <WorkspaceLoading />;
  if (!data || !computed) return <WorkspaceError />;
  const invalidRange = computed.from > computed.to;
  return (
    <div className="space-y-6">
      <header className="page-header">
        <div>
          <p className="eyebrow">MEASURE / LEARN / IMPROVE</p>
          <h1 className="page-title">Analytics</h1>
          <p className="mt-2 muted">
            Understand what resonates. Turn observations into considered
            experiments.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="select !w-auto"
            aria-label="Analytics channel"
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
          <select
            className="select !w-auto"
            aria-label="Analytics reporting period"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="custom">Custom period</option>
          </select>
        </div>
      </header>
      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs muted">
            From
            <input
              className="input"
              type="date"
              value={customFrom || computed.from}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs muted">
            To
            <input
              className="input"
              type="date"
              value={customTo || computed.to}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          {invalidRange && (
            <p className="text-xs text-red-600" role="alert">
              The start date must be on or before the end date.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] muted">
        <p className="flex items-center gap-2">
          <Badge>{data.demo ? "DEMO METRICS" : "META / STORED METRICS"}</Badge>
          {computed.from} — {computed.to}
          {period !== "custom" && " · through latest available snapshot"}
        </p>
        <p>
          Last sync:{" "}
          {computed.lastSync
            ? new Date(computed.lastSync).toLocaleString("en-US", {
                timeZone: "Asia/Seoul",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) + " KST"
            : "No synchronized data"}
        </p>
      </div>
      {notice && (
        <div
          role={notice.failed ? "alert" : "status"}
          className={`rounded-lg border p-3 text-sm ${notice.failed ? "border-red-400/40 bg-red-500/5 text-red-600" : "border-[var(--border)] bg-[var(--surface)]"}`}
        >
          {notice.text}
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          label="FOLLOWER CHANGE"
          value={
            computed.totalGrowth === null
              ? "—"
              : `${computed.totalGrowth > 0 ? "+" : ""}${number(computed.totalGrowth)}`
          }
          description={`${computed.growthChannels} of ${computed.channels.length} channels with comparable snapshots`}
        />
        <Metric
          label="MEDIAN ENGAGEMENT / REACH"
          value={
            computed.medianRate === null
              ? "—"
              : `${computed.medianRate.toFixed(2)}%`
          }
          description={`${computed.rates.length} posts with complete interaction and reach data`}
        />
        <Metric
          label="MEDIAN PRODUCTION TIME"
          value={
            computed.production === null
              ? "—"
              : `${number(computed.production)} min`
          }
          description={`${computed.timedCount} published projects with recorded time`}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel min-w-0">
          <div className="panel-header !block">
            <h2 className="font-semibold">Follower growth</h2>
            <p className="mt-1 text-xs muted">
              Daily stored snapshots. Missing days remain gaps.
            </p>
          </div>
          <div className="h-72 p-4">
            {new Set(computed.snapshots.map((m) => m.date)).size > 1 ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={computed.chart}
                  margin={{ left: 0, right: 12, top: 12, bottom: 0 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="timestamp"
                    type="number"
                    scale="time"
                    domain={["dataMin", "dataMax"]}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={45}
                    tick={{ fill: "var(--muted-text)", fontSize: 10 }}
                    tickFormatter={(d) =>
                      new Date(Number(d)).toISOString().slice(5, 10)
                    }
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    tick={{ fill: "var(--muted-text)", fontSize: 10 }}
                    tickFormatter={(n) =>
                      Number(n) >= 1000 ? `${Number(n) / 1000}k` : String(n)
                    }
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    labelFormatter={(value) =>
                      new Date(Number(value)).toISOString().slice(0, 10)
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />
                  {computed.channels.map((c) => (
                    <Line
                      key={c.id}
                      dataKey={c.id}
                      name={c.name}
                      type="linear"
                      stroke={c.accent}
                      dot={false}
                      strokeWidth={2}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <Empty
                title="A growth line needs two snapshots"
                detail="Synchronize authorized account metrics to begin comparing daily changes."
              />
            )}
          </div>
        </section>
        <section className="panel min-w-0">
          <div className="panel-header !block">
            <h2 className="font-semibold">Format performance</h2>
            <p className="mt-1 text-xs muted">
              Median engagement / reached account, by format.
            </p>
          </div>
          <div className="h-72 p-4">
            {computed.formats.some((f) => f.rate !== null) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={computed.formats}
                  margin={{ right: 15, left: -8, top: 18, bottom: 12 }}
                >
                  <CartesianGrid
                    vertical={false}
                    stroke="var(--border)"
                    strokeDasharray="3 3"
                  />
                  <XAxis
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-text)", fontSize: 11 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: "var(--muted-text)", fontSize: 10 }}
                    tickFormatter={(n) => `${n}%`}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(value) => [
                      `${Number(value).toFixed(2)}%`,
                      "Median engagement / reach",
                    ]}
                  />
                  <Bar
                    dataKey="rate"
                    fill="var(--accent)"
                    radius={[5, 5, 0, 0]}
                    maxBarSize={60}
                    isAnimationActive={false}
                  />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <Empty
                title="No comparable format metrics"
                detail="Complete likes, comments, saves, shares and reach are required."
              />
            )}
          </div>
          <p className="border-t border-[var(--border)] px-5 py-3 text-[11px] muted">
            {computed.formats
              .map((f) => `${f.name}: n=${f.sample}`)
              .join(" · ")}
            . Latest post snapshots; post ages may differ.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header !block">
          <h2 className="font-semibold">Compare channels fairly</h2>
          <p className="mt-1 text-xs muted">
            Relative follower growth and engagement per reach reduce the effect
            of account size.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">Channel</th>
                <th className="text-right">Followers</th>
                <th className="text-right">Growth</th>
                <th className="text-right">Relative growth</th>
                <th className="text-right">Median engagement / reach</th>
                <th className="text-right">Complete posts</th>
                <th className="text-right">Median production</th>
              </tr>
            </thead>
            <tbody>
              {computed.summary.map((s) => (
                <tr key={s.channel.id}>
                  <td>
                    <span className="flex items-center gap-2 font-medium">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: s.channel.accent }}
                      />
                      {s.channel.name}
                    </span>
                    <p className="mt-1 text-[11px] muted">{s.channel.handle}</p>
                  </td>
                  <td className="text-right tabular-nums">
                    {number(s.followers)}
                  </td>
                  <td className="text-right tabular-nums">
                    {s.growth !== null && s.growth > 0 ? "+" : ""}
                    {number(s.growth)}
                  </td>
                  <td className="text-right tabular-nums">
                    {s.growthRate === null
                      ? "—"
                      : `${s.growthRate > 0 ? "+" : ""}${s.growthRate.toFixed(2)}%`}
                  </td>
                  <td className="text-right tabular-nums">
                    {s.medianRate === null
                      ? "—"
                      : `${s.medianRate.toFixed(2)}%`}
                  </td>
                  <td className="text-right tabular-nums">{s.sampleSize}</td>
                  <td className="text-right tabular-nums">
                    {s.production === null
                      ? "—"
                      : `${number(s.production)} min`}
                    <p className="mt-1 text-[10px] muted">n={s.timedCount}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel">
          <div className="panel-header !block">
            <h2 className="font-semibold">Topic categories</h2>
            <p className="mt-1 text-xs muted">
              An observation, rather than a rule for the next story.
            </p>
          </div>
          {computed.categories.length ? (
            <div className="divide-y divide-[var(--border)]">
              {computed.categories.map((c) => (
                <div
                  key={c.name}
                  className="flex items-center justify-between gap-3 px-5 py-4"
                >
                  <div>
                    <p className="text-sm font-medium">{c.name}</p>
                    <p className="mt-1 text-[11px] muted">
                      {c.sample} complete post{c.sample === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {c.rate === null ? "—" : `${c.rate.toFixed(2)}%`}
                    </p>
                    <p className="mt-1 text-[10px] muted">
                      median engagement / reach
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No categorized post metrics"
              detail="Categories and authorized post snapshots will appear here."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-header !block">
            <h2 className="font-semibold">Revenue & production costs</h2>
            <p className="mt-1 text-xs muted">
              Only recorded financial entries, kept in their original currency.
            </p>
          </div>
          {computed.money.length ? (
            <div className="divide-y divide-[var(--border)]">
              {computed.money.map((m) => (
                <div className="grid grid-cols-3 gap-3 p-5" key={m.currency}>
                  <div>
                    <p className="text-[11px] muted">Currency</p>
                    <p className="mt-2 text-sm font-semibold">{m.currency}</p>
                  </div>
                  <div>
                    <p className="text-[11px] muted">Revenue</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {number(m.revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] muted">Expenses</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {number(m.expense)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="No financial records for this period"
              detail="Unavailable revenue and expenses are never replaced with estimates."
            />
          )}
        </section>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-xs leading-relaxed muted">
        <strong className="font-medium text-[var(--text)]">
          Reading these comparisons.
        </strong>{" "}
        Engagement / reach = (likes + comments + saves + shares) ÷ reach. Posts
        with incomplete metrics are excluded. Post tables use the latest
        available snapshot for posts published in the selected period; account
        metrics use daily snapshots within the period. Production time uses
        published projects updated during the period. Audience, post age, topic
        and distribution can affect comparisons. Correlations do not establish
        causes.
        {data.demo &&
          " All demo observations are illustrative and provide no evidence of actual account performance."}
      </div>
      <section className="panel">
        <div className="panel-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Lightbulb size={16} /> Weekly learning proposals
            </h2>
            <p className="mt-1 text-xs muted">
              Based on all stored evidence. Human approval is required; rules
              are never rewritten automatically.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              Refresh proposals
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() =>
                action(
                  "recommend",
                  { action: "recommend" },
                  "Weekly report job queued. Check the Analyst task in the Office, then refresh proposals for its confirmed result.",
                )
              }
            >
              <Sparkles size={13} />
              {busy === "recommend" ? "Queuing…" : "Generate proposals"}
            </Button>
          </div>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {data.recommendations.map((recommendation) => (
            <article className="p-5" key={recommendation.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="text-sm font-semibold">
                  {recommendation.title}
                </h3>
                <Badge>{recommendation.status.toLowerCase()}</Badge>
              </div>
              <p className="mt-3 max-w-4xl text-sm leading-relaxed muted">
                {recommendation.rationale}
              </p>
              {recommendation.experimentResult && (
                <div className="mt-3 rounded-lg bg-[var(--muted)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider muted">
                    Recorded experiment result
                  </p>
                  <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">
                    {recommendation.experimentResult}
                  </p>
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {recommendation.status === "PROPOSED" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!busy}
                      onClick={() =>
                        action(
                          recommendation.id,
                          {
                            action: "approve",
                            recommendationId: recommendation.id,
                          },
                          "Experiment proposal approved. Editorial and design rules remain subject to a separate human decision.",
                        )
                      }
                    >
                      <Check size={13} /> Approve experiment
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={!!busy}
                      onClick={() =>
                        action(
                          recommendation.id,
                          {
                            action: "reject",
                            recommendationId: recommendation.id,
                          },
                          "Proposal rejected.",
                        )
                      }
                    >
                      <X size={13} /> Reject
                    </Button>
                  </>
                )}
                {recommendation.status === "APPROVED" && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setExperiment(recommendation);
                      setResult(recommendation.experimentResult || "");
                    }}
                  >
                    <FlaskConical size={13} /> Record result
                  </Button>
                )}
              </div>
            </article>
          ))}
          {data.recommendations.length === 0 && (
            <Empty
              title="Room for your next experiment"
              detail="Generate proposals from stored evidence, then decide what is worth testing."
            />
          )}
        </div>
      </section>
      <Dialog
        open={!!experiment}
        onOpenChange={(open) => {
          if (!open) setExperiment(null);
        }}
      >
        <DialogContent>
          <DialogTitle className="text-xl font-semibold">
            Record an experiment result
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm muted">
            {experiment?.title}. Describe the observation window, sample size,
            quality tradeoffs and limitations.
          </DialogDescription>
          <form
            className="mt-5 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              if (
                experiment &&
                (await action(
                  experiment.id,
                  {
                    action: "record-experiment",
                    recommendationId: experiment.id,
                    result,
                  },
                  "Experiment result recorded.",
                ))
              )
                setExperiment(null);
            }}
          >
            <label className="block">
              <span className="field-label">Results & limitations</span>
              <textarea
                className="input mt-2 min-h-44 w-full"
                required
                minLength={10}
                maxLength={4000}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="What changed, what was measured, and what remains uncertain?"
              />
            </label>
            {notice?.failed && (
              <p role="alert" className="text-sm text-red-600">
                {notice.text}
              </p>
            )}
            <Button type="submit" disabled={!!busy || !result.trim()}>
              <Check size={14} /> Save result
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Metric({
  label,
  value,
  description,
}: {
  label: string;
  value: string;
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
function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state flex h-full min-h-36 flex-col items-center justify-center px-5 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-2 max-w-sm text-xs leading-relaxed muted">{detail}</p>
    </div>
  );
}
