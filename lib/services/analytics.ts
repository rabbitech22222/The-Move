import { koreanLabel } from "../korean";
import { getWorkspaceData, mutateWorkspace } from "../data";
import type { Project, Recommendation, WorkspaceData } from "../domain";

export interface PerformanceGroup {
  key: string;
  sampleSize: number;
  medianEngagementRate: number | null;
  medianReach: number | null;
}
export interface ChannelAnalytics {
  channelId: string;
  name: string;
  followers: number | null;
  followerChange: number | null;
  snapshotFrom: string | null;
  snapshotTo: string | null;
  lastSyncedAt: string | null;
  formats: PerformanceGroup[];
  categories: PerformanceGroup[];
  medianProductionMinutes: number | null;
  timedProjectCount: number;
}
export interface AnalyticsSummary {
  source: "DEMO" | "META";
  isDemo: boolean;
  channels: ChannelAnalytics[];
  limitations: string[];
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function productionTime(projects: Project[]) {
  const values = projects
    .filter(
      (project) =>
        project.stage === "PUBLISHED" && project.productionMinutes > 0,
    )
    .map((project) => project.productionMinutes);
  return {
    medianProductionMinutes: median(values),
    timedProjectCount: values.length,
  };
}

/** Compare engagement per reached account, rather than rewarding larger accounts for raw volume. */
export function summarizeAnalytics(data: WorkspaceData): AnalyticsSummary {
  const source = data.demo ? "DEMO" : "META";
  const channels = data.channels.map((channel): ChannelAnalytics => {
    const snapshots = data.accountMetrics
      .filter(
        (metric) => metric.channelId === channel.id && metric.source === source,
      )
      .sort((a, b) => a.date.localeCompare(b.date));
    const first = snapshots[0];
    const latest = snapshots.at(-1);
    const posts = data.posts.filter(
      (post) => post.channelId === channel.id && post.source === source,
    );
    const observations = posts.map((post) => {
      const metric = data.postMetrics
        .filter((entry) => entry.postId === post.id && entry.source === source)
        .sort(
          (a, b) =>
            a.date.localeCompare(b.date) ||
            a.syncedAt.localeCompare(b.syncedAt),
        )
        .at(-1);
      const interactions = metric && [
        metric.likes,
        metric.comments,
        metric.saves,
        metric.shares,
      ];
      const complete =
        interactions &&
        interactions.every(
          (value) => value !== null && Number.isFinite(value) && value >= 0,
        );
      const rate =
        complete &&
        metric?.reach !== null &&
        metric?.reach !== undefined &&
        metric.reach > 0
          ? (interactions as number[]).reduce(
              (total, value) => total + value,
              0,
            ) / metric.reach
          : null;
      return { post, rate, reach: metric?.reach ?? null };
    });
    function groupBy(field: "format" | "category"): PerformanceGroup[] {
      return [...new Set(observations.map((entry) => entry.post[field]))].map(
        (key) => {
          const selected = observations.filter(
            (entry) => entry.post[field] === key,
          );
          const rates = selected
            .map((entry) => entry.rate)
            .filter((rate): rate is number => rate !== null);
          return {
            key,
            sampleSize: rates.length,
            medianEngagementRate: median(rates),
            medianReach: median(
              selected
                .map((entry) => entry.reach)
                .filter((reach): reach is number => reach !== null),
            ),
          };
        },
      );
    }
    return {
      channelId: channel.id,
      name: channel.name,
      followers: latest?.followers ?? null,
      followerChange:
        first && latest && first.id !== latest.id
          ? latest.followers - first.followers
          : null,
      snapshotFrom: first?.date ?? null,
      snapshotTo: latest?.date ?? null,
      lastSyncedAt: latest?.syncedAt ?? null,
      formats: groupBy("format"),
      categories: groupBy("category"),
      ...productionTime(
        data.projects.filter((project) => project.channelId === channel.id),
      ),
    };
  });
  return {
    source,
    isDemo: data.demo,
    channels,
    limitations: [
      "Engagement rate = (likes + comments + saves + shares) / reach, using the latest stored post snapshot. Incomplete metrics are excluded, not replaced by zero.",
      "Sample size counts posts with complete metrics. Different post ages, distribution and audiences may affect comparisons.",
      "Observed associations do not establish causation. Recommendations require a human-approved experiment; editorial and design rules are never changed automatically.",
      ...(data.demo
        ? [
            "All performance observations are explicitly labeled DEMO and cannot be used as evidence of actual account performance.",
          ]
        : []),
    ],
  };
}

export async function weeklyRecommendations(
  actorId: string,
): Promise<Recommendation[]> {
  const data = await getWorkspaceData();
  const summary = summarizeAnalytics(data);
  const now = new Date();
  const weekStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  weekStart.setUTCDate(
    weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7),
  );
  const week = weekStart.toISOString().slice(0, 10);
  const label = summary.isDemo
    ? "예시 데이터 — 실제 성과를 뒷받침하지 않는 제안입니다. "
    : "저장된 인증 계정 데이터입니다. ";
  const candidates: Recommendation[] = [];
  function propose(key: string, title: string, rationale: string) {
    candidates.push({
      id: `weekly-${week}-${key}`,
      title,
      rationale: `${label}${rationale} 관찰에 따른 제안이며 원인을 단정하지 않습니다. 실험 실행이나 규칙 변경에는 사람의 승인이 필요합니다.`,
      status: "PROPOSED",
      createdAt: now.toISOString(),
      experimentResult: null,
    });
  }
  for (const channel of summary.channels) {
    const formats = channel.formats
      .filter(
        (group) => group.sampleSize >= 3 && group.medianEngagementRate !== null,
      )
      .sort((a, b) => b.medianEngagementRate! - a.medianEngagementRate!);
    if (formats.length >= 2) {
      const best = formats[0];
      const other = formats.at(-1)!;
      propose(
        `${channel.channelId}-format`,
        `${channel.name}: ${koreanLabel(best.key)}와 ${koreanLabel(other.key)} 비교 실험`,
        `최신 기록의 도달 대비 반응 중앙값은 ${koreanLabel(best.key)} ${(best.medianEngagementRate! * 100).toFixed(2)}% (표본 ${best.sampleSize}개), ${koreanLabel(other.key)} ${(other.medianEngagementRate! * 100).toFixed(2)}% (표본 ${other.sampleSize}개)입니다. 형식을 선택하기 전 같은 주제와 관찰 기간으로 비교하세요.`,
      );
    } else {
      propose(
        `${channel.channelId}-evidence`,
        `${channel.name}: 비교 가능한 게시물 근거 수집`,
        `형식 비교에는 각 형식별 도달과 반응 지표가 완전한 게시물 3개 이상이 필요합니다. 현재 표본: ${channel.formats.map((group) => `${koreanLabel(group.key)} ${group.sampleSize}개`).join(", ") || "완전한 지표 없음"}. 인증된 지표를 동기화하고 게시 후 경과 시간을 기록하세요.`,
      );
    }
    if (
      channel.timedProjectCount >= 3 &&
      channel.medianProductionMinutes !== null
    ) {
      propose(
        `${channel.channelId}-production`,
        `${channel.name}: 제작 과정 실험 기록`,
        `게시 완료 프로젝트 ${channel.timedProjectCount}개에 제작 시간이 기록되어 있으며 중앙값은 ${channel.medianProductionMinutes.toFixed(0)}분입니다. 제작 과정 변경 하나를 제안하고 품질, 시간과 운영자 의견을 기록하세요. 이는 직원 활동 측정이나 생산성 원인 증명이 아닙니다.`,
      );
    }
  }
  await mutateWorkspace(
    actorId,
    "analytics.weekly-recommendations",
    week,
    (current) => {
      for (const recommendation of candidates)
        if (
          !current.recommendations.some(
            (entry) => entry.id === recommendation.id,
          )
        )
          current.recommendations.push(recommendation);
    },
  );
  const updated = await getWorkspaceData();
  return updated.recommendations.filter((entry) =>
    candidates.some((candidate) => candidate.id === entry.id),
  );
}
