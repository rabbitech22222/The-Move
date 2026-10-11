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
    : new Intl.NumberFormat("ko-KR").format(Math.round(value));
const compact = (value: number) =>
  new Intl.NumberFormat("ko-KR", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
const nullableSum = (values: (number | null)[]) =>
  values.length > 0 && values.every((v) => v !== null)
    ? values.reduce<number>((total, v) => total + (v ?? 0), 0)
    : null;
const toDate = (date: string) => date.slice(0, 10);
const stageLabels: Record<string, string> = {
  IDEA: "아이디어",
  RESEARCH: "조사",
  DRAFT: "초안",
  DESIGN: "디자인",
  REVIEW: "검토 중",
  APPROVED: "승인 완료",
  SCHEDULED: "게시 예약",
  PUBLISHED: "게시 완료",
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
        <div className="empty-state">작업 공간을 불러오지 못했습니다.</div>
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
            m.source === "DEMO" ? "데모 · 예시 데이터" : "Meta Instagram API",
          ),
        ),
      ].join(", ")
    : "동기화된 출처 없음";
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
          <p className="eyebrow">편집 현황</p>
          <h1 className="page-title">
            대시보드
            <span className="inline-block w-1.5 h-1.5 bg-[var(--accent)] rounded-full ml-1.5" />
          </h1>
          <p className="page-description">
            채널과 콘텐츠 제작 현황을 한눈에 확인하세요.
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
            {refreshing ? "새로고침 중" : "작업 공간 새로고침"}
          </Button>
          <Button variant="outline" asChild size="sm" className="!text-[10px]">
            <Link href="/analytics">
              분석 보기
              <ArrowUpRight size={12} />
            </Link>
          </Button>
        </div>
      </div>
      <WorkspaceError />
      {!data.demo && (
        <section className="panel p-5 mb-6" aria-label="실제 작업 시작">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">THE MOVE · 지금 시작할 작업</h2>
              <p className="text-sm muted mt-2">
                수집한 실제 뉴스 {data.topics.length}개 · 진행 중인 편집
                프로젝트{" "}
                {data.projects.filter((p) => p.stage !== "PUBLISHED").length}개
              </p>
            </div>
            <Button asChild>
              <Link href="/intelligence">
                뉴스·제작 후보 확인 <ArrowRight size={14} />
              </Link>
            </Button>
          </div>
          {!data.channels[0]?.connected && (
            <p className="text-sm mt-4 muted">
              @themovemag_ 인증이 완료되지 않아 Instagram 지표는 아직 없습니다.{" "}
              <Link className="underline" href="/settings">
                계정 인증·지표 수집
              </Link>
              을 진행하세요. 뉴스 조사와 편집 작업은 지금 시작할 수 있습니다.
            </p>
          )}
          {data.topics.length > 0 && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {[...data.topics]
                .filter((t) => t.status !== "DISMISSED")
                .sort((a, b) => b.relevance - a.relevance)
                .slice(0, 4)
                .map((t) => (
                  <Link
                    key={t.id}
                    className="text-sm border border-[var(--border)] rounded p-3 hover:bg-[var(--muted)]"
                    href="/intelligence"
                  >
                    {t.title}
                    <span className="block mt-1 text-xs muted">
                      {data.sources.find((s) => s.id === t.sourceId)?.name} ·
                      실제 출처 조사 후보
                    </span>
                  </Link>
                ))}
            </div>
          )}
        </section>
      )}
      <div className="flex justify-between items-center gap-3 flex-wrap mb-6">
        <div className="filter-row">
          <div className="relative">
            <select
              aria-label="보고서 채널"
              className="select !text-[11px] !w-44 !pr-8 appearance-none"
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
            <ChevronDown
              size={12}
              className="absolute right-3 top-3 pointer-events-none muted"
            />
          </div>
          <div className="period-switch" aria-label="보고 기간">
            {["7", "30", "90", "custom"].map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={period === p ? "active" : ""}
              >
                {p === "custom" ? "직접 선택" : `${p}일`}
              </button>
            ))}
          </div>
          {period === "custom" && (
            <div className="flex gap-2 items-center">
              <input
                className="input !text-[10px] !w-32"
                type="date"
                aria-label="보고 시작일"
                value={start}
                max={end}
                onChange={(e) => setStart(e.target.value)}
              />
              <span className="muted">–</span>
              <input
                className="input !text-[10px] !w-32"
                type="date"
                aria-label="보고 종료일"
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
          {data.demo ? "예시 기록:" : "마지막 동기화:"}{" "}
          {report.syncedAt
            ? new Date(report.syncedAt).toLocaleString("ko-KR", {
                month: "short",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })
            : "동기화 전"}
        </div>
      </div>
      {data.demo && (
        <div className="status-banner !mb-5 !text-[10px]">
          <Radio size={13} className="mt-0.5 shrink-0" />
          <span>
            <strong className="font-semibold text-[var(--text)]">
              현재 데모 작업 공간입니다.
            </strong>{" "}
            아래 지표와 게시물은 예시입니다. 설정에서 인증된 계정을 연결해야
            실제 데이터를 볼 수 있습니다.
          </span>
          <Link
            href="/settings"
            className="ml-auto shrink-0 text-[var(--text)] flex items-center gap-1"
          >
            연결 설정
            <ArrowRight size={11} />
          </Link>
        </div>
      )}
      <div className="stat-grid">
        <Stat
          title="전체 팔로워"
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
                <span>최근 일별 변화</span>
              </>
            ) : (
              <>일별 변화 확인 불가</>
            )
          }
          demo={data.demo}
        />
        <Stat
          title="콘텐츠 조회수"
          value={number(report.views)}
          icon={<Eye size={14} />}
          footer={
            <>
              {number(publishedCount)} {data.demo ? "예시 " : ""}게시물 · 선택
              기간
            </>
          }
          demo={data.demo}
        />
        <Stat
          title="계정 도달"
          value={number(report.reach)}
          icon={<ScanLine size={14} />}
          footer={<>일별 도달 합계 · 중복 포함</>}
          demo={data.demo}
        />
        <Stat
          title="반응률"
          value={
            report.engagementRate === null
              ? "—"
              : `${report.engagementRate.toFixed(2)}%`
          }
          icon={<Heart size={14} />}
          footer={<>반응 수 ÷ 일별 도달</>}
          demo={data.demo}
        />
      </div>
      <div className="dashboard-chart-grid">
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">팔로워 추이</h2>
              <p className="panel-subtitle">
                일별 계정 기록:{" "}
                {report.channels.length === 1
                  ? report.channels[0].name
                  : "선택한 전체 채널"}
              </p>
            </div>
            <div className="text-[9px] muted flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent)]" />
              팔로워
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
                        "ko-KR",
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
                        "ko-KR",
                        { month: "long", day: "numeric" },
                      )
                    }
                    formatter={(value) => [
                      number(Number(value)),
                      data.demo ? "예시 팔로워" : "팔로워",
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
              이 기간의 계정 기록이 없습니다.
            </div>
          )}
          <div className="border-t border-[var(--border)] px-5 py-3 text-[9px] muted flex justify-between gap-3">
            <span>출처: {source}</span>
            <span>
              {report.startDate} — {report.endDate}
            </span>
          </div>
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">제작 흐름</h2>
              <p className="panel-subtitle">아이디어부터 최종 승인까지</p>
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
              개 제작 중
            </span>
            <Link
              href="/studio"
              className="flex items-center gap-1 text-[10px] font-medium"
            >
              스튜디오 열기
              <ArrowRight size={12} />
            </Link>
          </div>
        </section>
      </div>
      <section className="panel mb-[23px]">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">채널 현황</h2>
            <p className="panel-subtitle">
              한 작업 공간에서 채널을 관리합니다.
            </p>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-1 text-[10px] muted"
          >
            채널 관리
            <ArrowUpRight size={12} />
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>채널</th>
                <th>팔로워</th>
                <th>일별 변화</th>
                <th>조회수</th>
                <th>반응</th>
                <th>게시물</th>
                <th>연결</th>
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
                        {channel.connected ? "연결됨" : "연결 안 됨"}
                        {data.demo && (
                          <span className="demo-label !text-[7px] !py-0.5 ml-1">
                            예시
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
              <h2 className="panel-title">주요 성과 콘텐츠</h2>
              <p className="panel-subtitle">
                확인된 게시물 조회수 순{data.demo ? " · 예시 게시물" : ""}
              </p>
            </div>
            <Link
              href="/analytics"
              className="text-[10px] muted flex items-center gap-1"
            >
              더 보기
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
                    {post.format === "REEL" ? "릴스" : "카드"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="m-0 text-[11px] font-medium truncate">
                      {post.title}
                    </p>
                    <p className="m-0 text-[9px] muted mt-1">
                      {data.channels.find((c) => c.id === post.channelId)?.name}{" "}
                      · {post.format === "REEL" ? "릴스" : "캐러셀"} ·{" "}
                      {new Date(post.publishedAt).toLocaleDateString("ko-KR", {
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[12px] m-0 font-medium tabular-nums">
                      {number(metric?.views ?? null)}
                    </p>
                    <p className="text-[9px] muted m-0 mt-1">조회</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              이 기간의 게시물 조회수 데이터가 없습니다.
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">제작 요약</h2>
              <p className="panel-subtitle">게시를 위한 제작 기록</p>
            </div>
            <Clock3 size={15} className="muted" />
          </div>
          <div className="px-[22px] pb-5 space-y-4">
            <div className="flex justify-between">
              <span className="text-[10px] muted">기간 내 게시</span>
              <span className="text-[11px] font-medium">
                {number(publishedCount)} 개 게시물
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] muted">게시 빈도</span>
              <span className="text-[11px] font-medium">
                {dailyFrequency === null ? "—" : dailyFrequency.toFixed(1)} / 일
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[10px] muted">기록된 제작 시간</span>
              <span className="text-[11px] font-medium">
                {(
                  report.projects.reduce(
                    (sum, p) => sum + p.productionMinutes,
                    0,
                  ) / 60
                ).toFixed(1)}{" "}
                시간
              </span>
            </div>
            <div className="border-t border-[var(--border)] pt-3">
              {report.finance.length ? (
                [...new Set(report.finance.map((entry) => entry.currency))].map(
                  (currency) => (
                    <div key={currency} className="space-y-2 mb-2">
                      <div className="flex justify-between">
                        <span className="text-[10px] muted">
                          수익 · {currency}
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
                          비용 · {currency}
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
                  <span className="text-[10px] muted">수익 / 비용</span>
                  <span className="text-[10px]">아직 기록 없음</span>
                </div>
              )}
            </div>
            <p className="text-[9px] muted leading-relaxed">
              제작 시간은 프로젝트에 기록한 시간입니다. 재무 데이터는 기록이
              있을 때만 표시합니다.
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
      {demo && <span className="sr-only">데모 예시 데이터</span>}
    </section>
  );
}
