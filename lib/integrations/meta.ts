import { randomUUID } from "node:crypto";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { getIntegrationToken } from "../credentials";
import type { AccountMetric, PostMetric } from "../domain";
import { officialApi } from "./http";
import { ServiceError } from "../services/errors";

export function metaApiBase(): string {
  const version = process.env.META_GRAPH_VERSION ?? "v23.0";
  if (!/^v\d+\.\d+$/.test(version))
    throw new ServiceError(
      "INVALID_CONFIGURATION",
      "META_GRAPH_VERSION must be a supported Graph API version such as v23.0.",
    );
  return `https://graph.facebook.com/${version}`;
}

interface InstagramMedia {
  id: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  permalink?: string;
  timestamp?: string;
}
interface Insight {
  name: string;
  values?: { value: number }[];
  total_value?: { value: number };
}

function numerical(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
}
export function readInsight(
  response: { data?: Insight[] },
  name: string,
): number | null {
  const insight = response.data?.find((item) => item.name === name);
  return numerical(
    insight?.total_value?.value ?? insight?.values?.at(-1)?.value,
  );
}

export async function syncInstagramMetrics(
  channelId: string,
  actorId: string,
): Promise<{
  channelId: string;
  snapshots: number;
  posts: number;
  unavailable: string[];
}> {
  const data = await getWorkspaceData();
  const channel = data.channels.find((c) => c.id === channelId);
  if (!channel)
    throw new ServiceError("NOT_FOUND", "The channel was not found.", 404);
  if (!channel.platformAccountId)
    throw new ServiceError(
      "ACCOUNT_REQUIRED",
      "Configure the authorized Instagram professional account ID for this channel.",
      409,
    );
  const token = await getIntegrationToken("meta");
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "Connect Meta with authorized Instagram account and insights permissions.",
      409,
    );
  const { verifyTheMoveAccount } = await import("./the-move-account");
  if (channelId !== "the-move")
    throw new ServiceError(
      "ACCOUNT_SCOPE",
      "현재 실제 연결 대상은 @themovemag_뿐입니다.",
      409,
    );
  await verifyTheMoveAccount(channel.platformAccountId, token);
  const accountId = encodeURIComponent(channel.platformAccountId);
  const base = metaApiBase();
  const account = await officialApi<{ id: string; followers_count?: number }>(
    `${base}/${accountId}?fields=id,followers_count`,
    { token },
  );
  const followers = numerical(account.followers_count);
  if (followers === null)
    throw new ServiceError(
      "METRICS_UNAVAILABLE",
      "Meta did not return an authorized follower count. No snapshot was fabricated.",
      409,
    );
  const now = new Date();
  // Snapshot is dated when observed; metric window is the current UTC day up to synchronization.
  const start = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );
  const end = Math.floor(now.getTime() / 1000) * 1000;
  const date = new Date(start).toISOString().slice(0, 10);
  const unavailable: string[] = [];
  const values: Record<string, number | null> = {};
  // Fetch independently: unsupported metrics stay null instead of being replaced with zero.
  for (const metric of ["views", "reach", "total_interactions"]) {
    try {
      const response = await officialApi<{ data?: Insight[] }>(
        `${base}/${accountId}/insights?metric=${metric}&period=day&metric_type=total_value&since=${start / 1000}&until=${end / 1000}`,
        { token },
      );
      values[metric] = readInsight(response, metric);
      if (values[metric] === null) unavailable.push(metric);
    } catch (error) {
      if (
        error instanceof ServiceError &&
        ["AUTHORIZATION_REQUIRED", "RATE_LIMITED", "API_UNAVAILABLE"].includes(
          error.code,
        )
      )
        throw error;
      values[metric] = null;
      unavailable.push(metric);
    }
  }
  const media: InstagramMedia[] = [];
  let after: string | undefined;
  let completeWindow = false;
  for (let page = 0; page < 4; page++) {
    const response = await officialApi<{
      data: InstagramMedia[];
      paging?: { cursors?: { after?: string }; next?: string };
    }>(
      `${base}/${accountId}/media?fields=id,caption,media_type,media_product_type,permalink,timestamp&limit=25${after ? `&after=${encodeURIComponent(after)}` : ""}`,
      { token },
    );
    if (!Array.isArray(response.data))
      throw new ServiceError(
        "INVALID_API_RESPONSE",
        "Meta returned an invalid media list.",
        502,
      );
    media.push(...response.data);
    if (
      !response.paging?.next ||
      response.data.some(
        (post) => post.timestamp && Date.parse(post.timestamp) < start,
      )
    ) {
      completeWindow = true;
      break;
    }
    after = response.paging.cursors?.after;
    if (!after) break;
  }
  const postMetrics: PostMetric[] = [];
  for (const post of media.slice(0, 20)) {
    const metrics: Record<string, number | null> = {};
    for (const metric of [
      "views",
      "reach",
      "likes",
      "comments",
      "saved",
      "shares",
    ]) {
      try {
        const result = await officialApi<{ data?: Insight[] }>(
          `${base}/${encodeURIComponent(post.id)}/insights?metric=${metric}`,
          { token },
        );
        metrics[metric] = readInsight(result, metric);
      } catch (error) {
        if (
          error instanceof ServiceError &&
          [
            "AUTHORIZATION_REQUIRED",
            "RATE_LIMITED",
            "API_UNAVAILABLE",
          ].includes(error.code)
        )
          throw error;
        metrics[metric] = null;
      }
    }
    postMetrics.push({
      id: randomUUID(),
      postId: `meta-${post.id}`,
      date,
      views: metrics.views ?? null,
      reach: metrics.reach,
      likes: metrics.likes,
      comments: metrics.comments,
      saves: metrics.saved,
      shares: metrics.shares,
      source: "META",
      syncedAt: now.toISOString(),
    });
  }
  const postsPublished = completeWindow
    ? media.filter(
        (post) =>
          post.timestamp &&
          Date.parse(post.timestamp) >= start &&
          Date.parse(post.timestamp) < end,
      ).length
    : null;
  if (!completeWindow)
    unavailable.push("postsPublished (media pagination incomplete)");
  await mutateWorkspace(
    actorId,
    "META_METRICS_SYNCHRONIZED",
    channelId,
    (draft) => {
      const previous = draft.accountMetrics
        .filter(
          (m) =>
            m.channelId === channelId && m.source === "META" && m.date < date,
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      const snapshot: AccountMetric = {
        id: randomUUID(),
        channelId,
        date,
        followers,
        followerDelta: previous ? followers - previous.followers : null,
        views: values.views ?? null,
        reach: values.reach,
        engagements: values.total_interactions,
        postsPublished,
        source: "META",
        syncedAt: now.toISOString(),
      };
      draft.accountMetrics = draft.accountMetrics.filter(
        (m) =>
          !(
            m.channelId === channelId &&
            m.source === "META" &&
            m.date === date
          ),
      );
      draft.accountMetrics.push(snapshot);
      const target = draft.channels.find((c) => c.id === channelId)!;
      target.connected = true;
      for (const post of media) {
        if (
          !post.id ||
          !post.timestamp ||
          !Number.isFinite(Date.parse(post.timestamp))
        )
          continue;
        const id = `meta-${post.id}`;
        if (!draft.posts.some((p) => p.id === id))
          draft.posts.push({
            id,
            channelId,
            title: post.caption?.slice(0, 120) || "Instagram post",
            format:
              post.media_product_type === "REELS"
                ? "REEL"
                : post.media_type === "CAROUSEL_ALBUM"
                  ? "CAROUSEL"
                  : post.media_type === "VIDEO"
                    ? "VIDEO"
                    : "IMAGE",
            category: "Uncategorized",
            publishedAt: post.timestamp,
            permalink: post.permalink ?? null,
            source: "META",
          });
      }
      for (const metric of postMetrics) {
        if (!draft.posts.some((p) => p.id === metric.postId)) continue;
        draft.postMetrics = draft.postMetrics.filter(
          (m) =>
            !(
              m.postId === metric.postId &&
              m.date === date &&
              m.source === "META"
            ),
        );
        draft.postMetrics.push(metric);
      }
    },
  );
  return { channelId, snapshots: 1, posts: media.length, unavailable };
}
