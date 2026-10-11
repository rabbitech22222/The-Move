import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Post, PostMetric, Topic, WorkspaceData } from "../lib/domain";

const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  mutate: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("../lib/data", () => ({
  getWorkspaceData: mocks.get,
  mutateWorkspace: mocks.mutate,
}));
vi.mock("../lib/integrations/http", () => ({ safeFetch: mocks.fetch }));

import {
  canonicalSourceUrl,
  deduplicateTopics,
  evaluateEvidence,
  ingestSource,
  normalizeTitle,
  validateDraftProvenance,
  validateTopicRecommendations,
} from "../lib/services/intelligence";
import {
  summarizeAnalytics,
  weeklyRecommendations,
} from "../lib/services/analytics";

function fixture(): WorkspaceData {
  return {
    assets: [],
    demo: true,
    workspaceName: "Test workspace",
    operators: [
      {
        id: "operator",
        name: "Operator",
        email: "operator@example.test",
        role: "OPERATOR",
      },
    ],
    channels: [
      {
        id: "move",
        name: "THE MOVE",
        handle: "@themove",
        accent: "#b91c1c",
        connected: false,
        guidelines: "Report culture and design. Verify claims.",
        guidelineVersion: 1,
      },
    ],
    sources: [
      {
        id: "feed",
        name: "Culture source",
        url: "https://publisher.example/feed.xml",
        type: "RSS",
        enabled: true,
        rights:
          "Link and short attribution only. Media reproduction requires permission.",
        lastFetchedAt: null,
        lastError: null,
      },
    ],
    accountMetrics: [],
    posts: [],
    postMetrics: [],
    topics: [],
    projects: [],
    templates: [],
    designs: [],
    tasks: [],
    events: [],
    approvals: [],
    publications: [],
    finance: [],
    audit: [],
    recommendations: [],
  };
}

function topic(overrides: Partial<Topic> = {}): Topic {
  return {
    id: "topic-1",
    title: "Design exhibition opens in Seoul",
    category: "Culture",
    sourceId: "feed",
    sourceUrl: "https://publisher.example/story",
    publishedAt: null,
    retrievedAt: "2026-01-01T00:00:00.000Z",
    relevance: 20,
    confidence: "LOW",
    scoreExplanation: "One reference",
    recommendedChannelId: "move",
    format: "CAROUSEL",
    status: "INBOX",
    uncertainClaims: ["Headline only"],
    rights: "Link only",
    ...overrides,
  };
}

let workspace: WorkspaceData;
beforeEach(() => {
  vi.clearAllMocks();
  workspace = fixture();
  mocks.get.mockImplementation(async () => structuredClone(workspace));
  mocks.mutate.mockImplementation(
    async (
      _actor: string,
      _action: string,
      _entity: string,
      callback: (data: WorkspaceData) => void,
    ) => {
      const copy = structuredClone(workspace);
      await callback(copy);
      workspace = copy;
      return structuredClone(workspace);
    },
  );
});

describe("source normalization and evidence", () => {
  it("removes tracking while retaining identity parameters", () => {
    expect(
      canonicalSourceUrl(
        "https://Publisher.example/story?id=2&utm_source=news&fbclid=x#section",
      ),
    ).toBe("https://publisher.example/story?id=2");
    expect(canonicalSourceUrl("https://publisher.example/story?id=2")).not.toBe(
      canonicalSourceUrl("https://publisher.example/story?id=3"),
    );
  });

  it("rejects embedded credentials and unsafe URL schemes", () => {
    expect(() =>
      canonicalSourceUrl("https://secret:token@example.com/article"),
    ).toThrow("without embedded credentials");
    expect(() => canonicalSourceUrl("file:///etc/passwd")).toThrow(
      "HTTP or HTTPS",
    );
  });

  it("normalizes headline punctuation without discarding Korean text", () => {
    expect(normalizeTitle("  서울—Design: EXHIBITION! ")).toBe(
      "서울 design exhibition",
    );
  });

  it("does not equate multiple matching references with verified facts", () => {
    const result = evaluateEvidence(
      ["https://a.example/story", "https://b.example/story"],
      "2026-01-01",
      new Date("2026-01-11"),
    );
    expect(result.confidence).toBe("MEDIUM");
    expect(result.uncertainClaims.join(" ")).toContain(
      "not been independently fact-checked",
    );
    expect(result.uncertainClaims.join(" ")).toContain("syndicate");
    expect(result.uncertainClaims.join(" ")).toContain(
      "more than seven days old",
    );
  });

  it("flags unknown publication dates and keeps single-source confidence low", () => {
    const result = evaluateEvidence(["https://a.example/story"], null);
    expect(result.confidence).toBe("LOW");
    expect(result.uncertainClaims).toContain(
      "Publication date is unavailable.",
    );
  });
});

describe("RSS ingestion and editorial deduplication", () => {
  const xml =
    '<?xml version="1.0"?><rss version="2.0"><channel><title>Culture</title><link>https://publisher.example/</link><description>Culture news</description><item><title>Design exhibition opens in Seoul</title><link>https://publisher.example/story?utm_source=rss</link><pubDate>Wed, 01 Jan 2025 09:00:00 GMT</pubDate></item><item><title>Design exhibition opens in Seoul!</title><link>https://publisher.example/story?utm_source=second</link></item></channel></rss>';

  it("normalizes, deduplicates, attributes rights and supports idempotent ingestion", async () => {
    mocks.fetch.mockImplementation(async () => new Response(xml));
    expect(await ingestSource("feed", "operator")).toEqual({
      sourceId: "feed",
      added: 1,
      duplicates: 1,
    });
    expect(workspace.topics).toHaveLength(1);
    expect(workspace.topics[0].sourceUrl).toBe(
      "https://publisher.example/story",
    );
    expect(workspace.topics[0].rights).toBe(workspace.sources[0].rights);
    expect(workspace.topics[0].confidence).toBe("LOW");
    expect(workspace.topics[0].scoreExplanation).toContain(
      "not a probability of virality",
    );
    expect(workspace.topics[0].publishedAt).toBe("2025-01-01T09:00:00.000Z");
    expect(workspace.sources[0].lastFetchedAt).not.toBeNull();
    expect(await ingestSource("feed", "operator")).toEqual({
      sourceId: "feed",
      added: 0,
      duplicates: 2,
    });
  });

  it("creates an honest user-submitted reference without scraping the source", async () => {
    workspace.sources[0].type = "MANUAL";
    workspace.sources[0].name = "Operator-submitted reference";
    await ingestSource("feed", "operator");
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(workspace.topics[0].title).toBe("Operator-submitted reference");
    expect(workspace.topics[0].publishedAt).toBeNull();
  });

  it("records a failed synchronization rather than reporting successful ingestion", async () => {
    mocks.fetch.mockResolvedValue(new Response("unavailable", { status: 429 }));
    await expect(ingestSource("feed", "operator")).rejects.toThrow("HTTP 429");
    expect(workspace.sources[0].lastError).toContain("HTTP 429");
    expect(workspace.sources[0].lastFetchedAt).toBeNull();
    expect(workspace.topics).toHaveLength(0);
  });

  it("rejects unsafe XML entities without invoking a network-aware parser", async () => {
    mocks.fetch.mockResolvedValue(
      new Response(
        '<!DOCTYPE x [<!ENTITY remote SYSTEM "file:///etc/passwd">]><rss/>',
      ),
    );
    await expect(ingestSource("feed", "operator")).rejects.toThrow(
      "custom XML entities",
    );
  });

  it("keeps an existing saved editorial decision when removing duplicate topics", async () => {
    workspace.topics = [
      topic(),
      topic({
        id: "topic-saved",
        sourceUrl: "https://publisher.example/story?utm_campaign=dup",
        status: "SAVED",
      }),
    ];
    expect(await deduplicateTopics("operator")).toEqual({ removed: 1 });
    expect(workspace.topics[0].id).toBe("topic-saved");
  });

  it("preserves matching headlines from different publishers as separate research evidence", async () => {
    workspace.topics = [
      topic(),
      topic({
        id: "topic-corroborating",
        sourceUrl: "https://other-publisher.example/story",
      }),
    ];
    expect(await deduplicateTopics("operator")).toEqual({ removed: 0 });
    expect(workspace.topics).toHaveLength(2);
  });
});

describe("AI provenance guard", () => {
  it("retains required uncertainties even if the AI omits them", () => {
    const result = validateDraftProvenance(
      {
        draftCopy: "A provisional headline, pending verification.",
        sourceUrls: ["https://a.example/story"],
        uncertainClaims: [],
      },
      ["https://a.example/story"],
      ["The publication date is unknown."],
    );
    expect(result.uncertainClaims).toContain(
      "The publication date is unknown.",
    );
  });

  it("rejects invented references and refuses silently dropped evidence", () => {
    expect(() =>
      validateDraftProvenance(
        {
          draftCopy: "Draft",
          sourceUrls: ["https://invented.example/fact"],
          uncertainClaims: [],
        },
        ["https://a.example/story"],
        [],
      ),
    ).toThrow("invented source references");
    expect(() =>
      validateDraftProvenance(
        { draftCopy: "Draft", sourceUrls: [], uncertainClaims: [] },
        ["https://a.example/story"],
        [],
      ),
    ).toThrow("invented source references");
  });

  it("also rejects invented source links embedded in the generated copy", () => {
    expect(() =>
      validateDraftProvenance(
        {
          draftCopy: "See https://invented.example/claim for evidence.",
          sourceUrls: ["https://a.example/story"],
          uncertainClaims: [],
        },
        ["https://a.example/story"],
        [],
      ),
    ).toThrow("unsupported source link");
  });

  it("accepts only known topic and channel references for AI editorial proposals", () => {
    const proposal = {
      topicIds: ["topic-1"],
      sourceUrls: ["https://publisher.example/story"],
      channelId: "move",
      format: "CAROUSEL",
      angle: "<strong>Research exhibition context</strong>",
      reason:
        "Verify the opening date and credit requirements before drafting.",
    };
    const result = validateTopicRecommendations(
      { recommendations: [proposal] },
      [topic()],
      workspace.channels,
    );
    expect(result[0].angle).toBe("Research exhibition context");
    expect(() =>
      validateTopicRecommendations(
        { recommendations: [{ ...proposal, topicIds: ["invented-topic"] }] },
        [topic()],
        workspace.channels,
      ),
    ).toThrow("topic that was not supplied");
    expect(() =>
      validateTopicRecommendations(
        {
          recommendations: [
            { ...proposal, sourceUrls: ["https://invented.example/fact"] },
          ],
        },
        [topic()],
        workspace.channels,
      ),
    ).toThrow("invented recommendation source");
  });

  it("rejects too many AI proposals and unsupported links hidden in their reasoning", () => {
    const proposal = {
      topicIds: ["topic-1"],
      sourceUrls: ["https://publisher.example/story"],
      channelId: "move",
      format: "CAROUSEL",
      angle: "Research an angle",
      reason: "See https://invented.example/fact for confirmation.",
    };
    expect(() =>
      validateTopicRecommendations(
        { recommendations: Array.from({ length: 6 }, () => proposal) },
        [topic()],
        workspace.channels,
      ),
    ).toThrow("at most five");
    expect(() =>
      validateTopicRecommendations(
        { recommendations: [proposal] },
        [topic()],
        workspace.channels,
      ),
    ).toThrow("unsupported recommendation link");
  });
});

describe("fair and honest analytics", () => {
  function addPost(
    channelId: string,
    id: string,
    reach: number,
    likes: number,
    source: "DEMO" | "META" = "DEMO",
  ) {
    const post: Post = {
      id,
      channelId,
      title: "Recorded post",
      category: "Culture",
      format: "CAROUSEL",
      publishedAt: "2026-01-01T00:00:00.000Z",
      permalink: null,
      source,
    };
    const metric: PostMetric = {
      id: `metric-${id}`,
      postId: id,
      date: "2026-01-02",
      views: null,
      reach,
      likes,
      comments: 0,
      saves: 0,
      shares: 0,
      source,
      syncedAt: "2026-01-02T00:00:00.000Z",
    };
    workspace.posts.push(post);
    workspace.postMetrics.push(metric);
  }

  it("compares rates fairly across channel sizes and avoids duplicating lifetime metrics", () => {
    workspace.channels.push({
      ...workspace.channels[0],
      id: "large",
      name: "Large channel",
    });
    addPost("move", "small-post", 100, 10);
    addPost("large", "large-post", 10_000, 1_000);
    workspace.postMetrics.push({
      ...workspace.postMetrics[0],
      id: "old-metric",
      date: "2026-01-01",
      likes: 1,
    });
    const summary = summarizeAnalytics(workspace);
    expect(summary.channels[0].formats[0].medianEngagementRate).toBe(0.1);
    expect(summary.channels[1].formats[0].medianEngagementRate).toBe(0.1);
    expect(summary.channels[0].formats[0].sampleSize).toBe(1);
    expect(summary.isDemo).toBe(true);
  });

  it("excludes incomplete interactions rather than inventing missing zeros", () => {
    addPost("move", "partial", 100, 10);
    workspace.postMetrics[0].saves = null;
    const group = summarizeAnalytics(workspace).channels[0].formats[0];
    expect(group.medianEngagementRate).toBeNull();
    expect(group.sampleSize).toBe(0);
  });

  it("does not leak mock performance into a live account summary", () => {
    workspace.demo = false;
    addPost("move", "mock", 100, 50);
    expect(summarizeAnalytics(workspace).channels[0].formats).toEqual([]);
    expect(summarizeAnalytics(workspace).channels[0].followers).toBeNull();
  });

  it("proposes idempotent, labeled improvements without rewriting editorial rules", async () => {
    const originalGuidelines = workspace.channels[0].guidelines;
    const first = await weeklyRecommendations("operator");
    const second = await weeklyRecommendations("operator");
    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(workspace.recommendations).toHaveLength(1);
    expect(first[0].rationale).toContain("DEMO DATA");
    expect(first[0].rationale).toContain("not a causal conclusion");
    expect(first[0].status).toBe("PROPOSED");
    expect(workspace.channels[0].guidelines).toBe(originalGuidelines);
    expect(workspace.channels[0].guidelineVersion).toBe(1);
  });
});
