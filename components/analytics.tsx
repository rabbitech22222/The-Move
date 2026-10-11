"use client";
import { koreanLabel } from "@/lib/korean";

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
    : new Intl.NumberFormat("ko-KR", { maximumFractionDigits: 0 }).format(
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
        name: koreanLabel(format),
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
          err instanceof Error ? err.message : "작업을 완료하지 못했습니다.",
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
          <p className="eyebrow">측정 / 학습 / 개선</p>
          <h1 className="page-title">분석</h1>
          <p className="mt-2 muted">
            성과를 살펴보고 근거를 바탕으로 개선 실험을 제안합니다.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <select
            className="select !w-auto"
            aria-label="분석할 채널"
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="all">전체 채널</option>
            {data.channels.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            className="select !w-auto"
            aria-label="분석 기간"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          >
            <option value="7">최근 7일</option>
            <option value="30">최근 30일</option>
            <option value="90">최근 90일</option>
            <option value="custom">직접 기간 선택</option>
          </select>
        </div>
      </header>
      {period === "custom" && (
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs muted">
            시작일
            <input
              className="input"
              type="date"
              value={customFrom || computed.from}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-xs muted">
            종료일
            <input
              className="input"
              type="date"
              value={customTo || computed.to}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
          {invalidRange && (
            <p className="text-xs text-red-600" role="alert">
              시작일은 종료일보다 늦을 수 없습니다.
            </p>
          )}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] muted">
        <p className="flex items-center gap-2">
          <Badge>{data.demo ? "예시 지표" : "Meta / 저장된 지표"}</Badge>
          {computed.from} — {computed.to}
          {period !== "custom" && " · 최근 저장된 기록까지"}
        </p>
        <p>
          마지막 동기화:{" "}
          {computed.lastSync
            ? new Date(computed.lastSync).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              }) + " 한국 표준시"
            : "동기화된 데이터 없음"}
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
          label="팔로워 변화"
          value={
            computed.totalGrowth === null
              ? "—"
              : `${computed.totalGrowth > 0 ? "+" : ""}${number(computed.totalGrowth)}`
          }
          description={`${computed.channels.length}개 채널 중 비교 가능한 기록이 있는 ${computed.growthChannels}개`}
        />
        <Metric
          label="도달 대비 반응 중앙값"
          value={
            computed.medianRate === null
              ? "—"
              : `${computed.medianRate.toFixed(2)}%`
          }
          description={`반응·도달 지표가 완전한 게시물 ${computed.rates.length}개`}
        />
        <Metric
          label="제작 시간 중앙값"
          value={
            computed.production === null
              ? "—"
              : `${number(computed.production)}분`
          }
          description={`제작 시간이 기록된 게시 완료 프로젝트 ${computed.timedCount}개`}
        />
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="panel min-w-0">
          <div className="panel-header !block">
            <h2 className="font-semibold">팔로워 추이</h2>
            <p className="mt-1 text-xs muted">
              저장된 일별 기록입니다. 기록이 없는 날짜는 비워 둡니다.
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
                title="추이를 보려면 기록이 2개 이상 필요합니다"
                detail="인증된 계정의 지표를 동기화하면 일별 변화를 비교할 수 있습니다."
              />
            )}
          </div>
        </section>
        <section className="panel min-w-0">
          <div className="panel-header !block">
            <h2 className="font-semibold">형식별 성과</h2>
            <p className="mt-1 text-xs muted">
              콘텐츠 형식별 도달 대비 반응의 중앙값입니다.
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
                      "도달 대비 반응 중앙값",
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
                title="비교할 형식별 지표 없음"
                detail="좋아요·댓글·저장·공유·도달 지표가 모두 필요합니다."
              />
            )}
          </div>
          <p className="border-t border-[var(--border)] px-5 py-3 text-[11px] muted">
            {computed.formats
              .map((f) => `${f.name}: n=${f.sample}`)
              .join(" · ")}
            . 게시물별 최신 기록이며 게시 후 경과 시간이 다를 수 있습니다.
          </p>
        </section>
      </div>
      <section className="panel">
        <div className="panel-header !block">
          <h2 className="font-semibold">채널 규모를 고려한 비교</h2>
          <p className="mt-1 text-xs muted">
            팔로워 증가율과 도달 대비 반응으로 계정 규모 차이를 고려합니다.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th className="text-left">채널</th>
                <th className="text-right">팔로워</th>
                <th className="text-right">증감</th>
                <th className="text-right">증가율</th>
                <th className="text-right">도달 대비 반응 중앙값</th>
                <th className="text-right">지표가 완전한 게시물</th>
                <th className="text-right">제작 시간 중앙값</th>
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
                    {s.production === null ? "—" : `${number(s.production)}분`}
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
            <h2 className="font-semibold">주제 분류</h2>
            <p className="mt-1 text-xs muted">
              분석 결과는 관찰 기록이며 편집 규칙으로 자동 적용되지 않습니다.
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
                      {c.sample} 비교 가능한 게시물{c.sample === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold tabular-nums">
                      {c.rate === null ? "—" : `${c.rate.toFixed(2)}%`}
                    </p>
                    <p className="mt-1 text-[10px] muted">
                      도달 대비 반응 중앙값
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="분류된 게시물 지표 없음"
              detail="주제 분류와 인증된 게시물 지표가 여기에 표시됩니다."
            />
          )}
        </section>
        <section className="panel">
          <div className="panel-header !block">
            <h2 className="font-semibold">수익 및 제작 비용</h2>
            <p className="mt-1 text-xs muted">
              기록된 금액만 원래 통화로 표시합니다.
            </p>
          </div>
          {computed.money.length ? (
            <div className="divide-y divide-[var(--border)]">
              {computed.money.map((m) => (
                <div className="grid grid-cols-3 gap-3 p-5" key={m.currency}>
                  <div>
                    <p className="text-[11px] muted">통화</p>
                    <p className="mt-2 text-sm font-semibold">{m.currency}</p>
                  </div>
                  <div>
                    <p className="text-[11px] muted">수익</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {number(m.revenue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] muted">비용</p>
                    <p className="mt-2 text-sm font-semibold tabular-nums">
                      {number(m.expense)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Empty
              title="이 기간의 재무 기록 없음"
              detail="알 수 없는 수익과 비용은 추정치로 대체하지 않습니다."
            />
          )}
        </section>
      </div>
      <div className="rounded-xl border border-[var(--border)] bg-[var(--muted)]/30 p-4 text-xs leading-relaxed muted">
        <strong className="font-medium text-[var(--text)]">
          비교 지표 해석 안내
        </strong>{" "}
        도달 대비 반응 = (좋아요 + 댓글 + 저장 + 공유) ÷ 도달입니다. 지표가
        불완전한 게시물은 제외합니다. 게시물은 선택 기간에 게시된 콘텐츠의 최신
        기록을, 계정은 기간 내 일별 기록을 사용합니다. 제작 시간은 해당 기간에
        갱신된 게시 완료 프로젝트를 기준으로 합니다. 독자 구성, 게시 후 경과
        시간, 주제와 배포 방식이 비교에 영향을 줄 수 있습니다. 상관관계만으로
        원인을 단정하지 않습니다.
        {data.demo &&
          " 모든 데모 분석은 예시이며 실제 계정 성과의 근거가 아닙니다."}
      </div>
      <section className="panel">
        <div className="panel-header flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-semibold">
              <Lightbulb size={16} /> 주간 개선 제안
            </h2>
            <p className="mt-1 text-xs muted">
              저장된 근거를 바탕으로 제안합니다. 사람의 승인이 필요하며 규칙을
              자동 변경하지 않습니다.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="ghost" size="sm" onClick={() => void refresh()}>
              제안 새로고침
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!!busy}
              onClick={() =>
                action(
                  "recommend",
                  { action: "recommend" },
                  "주간 보고서를 대기열에 추가했습니다. 오피스에서 분석 담당 작업을 확인한 뒤 제안을 새로고침하세요.",
                )
              }
            >
              <Sparkles size={13} />
              {busy === "recommend" ? "대기열에 등록 중…" : "개선 제안 생성"}
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
                <Badge>{koreanLabel(recommendation.status)}</Badge>
              </div>
              <p className="mt-3 max-w-4xl text-sm leading-relaxed muted">
                {recommendation.rationale}
              </p>
              {recommendation.experimentResult && (
                <div className="mt-3 rounded-lg bg-[var(--muted)] p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider muted">
                    기록된 실험 결과
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
                          "실험 제안을 승인했습니다. 편집 및 디자인 규칙 변경은 별도로 승인해야 합니다.",
                        )
                      }
                    >
                      <Check size={13} /> 실험 승인
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
                          "제안을 반려했습니다.",
                        )
                      }
                    >
                      <X size={13} /> 반려
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
                    <FlaskConical size={13} /> 결과 기록
                  </Button>
                )}
              </div>
            </article>
          ))}
          {data.recommendations.length === 0 && (
            <Empty
              title="다음 실험을 준비하세요"
              detail="저장된 근거로 제안을 생성하고 실험할 내용을 선택하세요."
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
            실험 결과 기록
          </DialogTitle>
          <DialogDescription className="mt-2 text-sm muted">
            {experiment?.title}. 관찰 기간, 표본 수, 품질 변화와 한계를
            작성하세요.
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
                  "실험 결과를 기록했습니다.",
                ))
              )
                setExperiment(null);
            }}
          >
            <label className="block">
              <span className="field-label">결과 및 한계</span>
              <textarea
                className="input mt-2 min-h-44 w-full"
                required
                minLength={10}
                maxLength={4000}
                value={result}
                onChange={(e) => setResult(e.target.value)}
                placeholder="무엇을 바꾸고 측정했나요? 아직 불확실한 점은 무엇인가요?"
              />
            </label>
            {notice?.failed && (
              <p role="alert" className="text-sm text-red-600">
                {notice.text}
              </p>
            )}
            <Button type="submit" disabled={!!busy || !result.trim()}>
              <Check size={14} /> 결과 저장
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
