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
    ? "DEMO DATA — illustrative recommendation only. "
    : "Stored authorized account data. ";
  const candidates: Recommendation[] = [];
  function propose(key: string, title: string, rationale: string) {
    candidates.push({
      id: `weekly-${week}-${key}`,
      title,
      rationale: `${label}${rationale} This is an observational proposal, not a causal conclusion. Human approval is required before changing any rule or running an experiment.`,
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
        `${channel.name}: test ${best.key.toLowerCase()} against ${other.key.toLowerCase()}`,
        `Latest available post snapshots show median engagement/reach of ${(best.medianEngagementRate! * 100).toFixed(2)}% for ${best.key} (n=${best.sampleSize}) and ${(other.medianEngagementRate! * 100).toFixed(2)}% for ${other.key} (n=${other.sampleSize}). Compare matched topics and equal observation windows before adopting a format preference.`,
      );
    } else {
      propose(
        `${channel.channelId}-evidence`,
        `${channel.name}: collect comparable post evidence`,
        `Format comparisons require at least three posts with complete reach and interaction metrics in each compared format. Currently available: ${channel.formats.map((group) => `${group.key} n=${group.sampleSize}`).join(", ") || "no complete post metrics"}. Synchronize authorized metrics and record post age before drawing conclusions.`,
      );
    }
    if (
      channel.timedProjectCount >= 3 &&
      channel.medianProductionMinutes !== null
    ) {
      propose(
        `${channel.channelId}-production`,
        `${channel.name}: document a production experiment`,
        `${channel.timedProjectCount} published projects have manually recorded production time; median ${channel.medianProductionMinutes.toFixed(0)} minutes. Propose one workflow change and record quality, time and operator feedback; this does not measure employee activity or demonstrate a productivity cause.`,
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
