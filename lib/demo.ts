import type { WorkspaceData, Channel } from "./domain";

export const WORKSPACE_ID = "the-move";
export const demoOperators = [
  {
    id: "operator-1",
    name: "Operator 1",
    email: "operator1@themove.local",
    role: "ADMIN" as const,
  },
  {
    id: "operator-2",
    name: "Operator 2",
    email: "operator2@themove.local",
    role: "OPERATOR" as const,
  },
];

export function createWorkspaceBase(demo: boolean): WorkspaceData {
  const channels: Channel[] = [
    {
      id: "the-move",
      name: "THE MOVE",
      handle: "@themove",
      accent: "#ef4444",
      connected: false,
      guidelines:
        "Lead with a clear editorial angle. Attribute factual claims. Use concise headlines and preserve THE MOVE branding. Reels must use landscape-video placement in design DAHPcvVkH8k.",
      guidelineVersion: 1,
    },
    {
      id: "korea-coded",
      name: "Korea-coded",
      handle: "@koreacoded",
      accent: "#6366f1",
      connected: false,
      guidelines:
        "Explain Korean culture with context. Verify transliterations, dates and source credits. Avoid treating a trend as universal.",
      guidelineVersion: 1,
    },
    {
      id: "the-standard",
      name: "The Standard",
      handle: "@thestandard",
      accent: "#10b981",
      connected: false,
      guidelines:
        "Use precise, restrained language. Separate facts from opinions and include primary sources where possible.",
      guidelineVersion: 1,
    },
  ];
  return {
    demo,
    workspaceName: "THE MOVE OS",
    operators: [...demoOperators],
    channels,
    accountMetrics: [],
    posts: [],
    postMetrics: [],
    sources: [],
    topics: [],
    projects: [],
    templates: [
      {
        id: "move-carousel-1",
        name: "THE MOVE • Operator 1 carousel",
        channelId: "the-move",
        format: "CAROUSEL",
        operatorId: "operator-1",
        designId: "DAHPXU1IGDI",
        width: 1080,
        height: 1350,
        inspectedAt: null,
        fields: [],
        status: "UNINSPECTED",
        approved: true,
      },
      {
        id: "move-carousel-2",
        name: "THE MOVE • Operator 2 carousel",
        channelId: "the-move",
        format: "CAROUSEL",
        operatorId: "operator-2",
        designId: "DAHXJGy8do8",
        width: 1080,
        height: 1350,
        inspectedAt: null,
        fields: [],
        status: "UNINSPECTED",
        approved: true,
      },
      {
        id: "move-reel-landscape",
        name: "THE MOVE • Landscape video reel",
        channelId: "the-move",
        format: "REEL",
        operatorId: null,
        designId: "DAHPcvVkH8k",
        width: 1080,
        height: 1920,
        inspectedAt: null,
        fields: [],
        status: "UNINSPECTED",
        approved: true,
      },
    ],
    assets: [],
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

/** Illustrative fixtures, never imported into a non-demo workspace. No tasks,
 * successful integrations, approvals or employee activity are invented. */
export function createDemoData(now = new Date()): WorkspaceData {
  const data = createWorkspaceBase(true);
  const dateAt = (daysAgo: number) => {
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 12),
    );
    date.setUTCDate(date.getUTCDate() - daysAgo);
    return date;
  };
  const syncedAt = now.toISOString();
  const followerBases = [48200, 17600, 9100];
  for (const [index, channel] of data.channels.entries()) {
    for (let day = 89; day >= 0; day--) {
      const offset = 89 - day;
      const delta = 30 + index * 11 + (offset % 7) * 6;
      data.accountMetrics.push({
        id: `demo-account-${channel.id}-${day}`,
        channelId: channel.id,
        date: dateAt(day).toISOString().slice(0, 10),
        followers: followerBases[index] + offset * (35 + index * 13),
        followerDelta: day === 89 ? null : 35 + index * 13,
        views: 9000 + offset * 75 + delta * 35,
        reach: 6600 + offset * 50 + delta * 25,
        engagements: 360 + offset * 4 + index * 65,
        postsPublished: offset % 3 === 0 ? 1 : 0,
        source: "DEMO",
        syncedAt,
      });
    }
    for (let item = 0; item < 8; item++) {
      const postId = `demo-post-${channel.id}-${item}`;
      const postDate = dateAt(item * 4 + 1);
      data.posts.push({
        id: postId,
        channelId: channel.id,
        title: [
          "Demo · A new perspective on city life",
          "Demo · The details behind the trend",
          "Demo · Design worth a closer look",
          "Demo · Culture in motion",
        ][item % 4],
        format: item % 3 === 0 ? "REEL" : "CAROUSEL",
        category: ["Culture", "Design", "Lifestyle"][item % 3],
        publishedAt: postDate.toISOString(),
        permalink: null,
        source: "DEMO",
      });
      data.postMetrics.push({
        id: `demo-pm-${postId}`,
        postId,
        date: dateAt(0).toISOString().slice(0, 10),
        views: 8000 + item * 1330 + index * 450,
        reach: 6000 + item * 910 + index * 350,
        likes: 400 + item * 63,
        comments: 18 + item * 4,
        saves: 80 + item * 15,
        shares: 55 + item * 9,
        source: "DEMO",
        syncedAt,
      });
    }
  }
  data.sources = [
    {
      id: "demo-manual-source",
      name: "Demo example source (fixture)",
      url: "https://example.com/demo",
      type: "MANUAL",
      enabled: false,
      rights: "Illustrative demo fixture; no retrieved article or evidence.",
      lastFetchedAt: null,
      lastError: null,
    },
  ];
  data.topics = [
    "Independent spaces shaping city culture",
    "A closer look at contemporary Korean design",
    "Why typography changes how a story reads",
  ].map((title, index) => ({
    id: `demo-topic-${index}`,
    title: `Demo · ${title}`,
    category: ["Culture", "Design", "Editorial"][index],
    sourceId: "demo-manual-source",
    sourceUrl: `https://example.com/demo/topic-${index}`,
    publishedAt: null,
    retrievedAt: syncedAt,
    relevance: 70 + index * 5,
    confidence: "LOW",
    scoreExplanation:
      "Illustrative score only. Live scores use keyword matches and recency, with the weighting shown.",
    recommendedChannelId: data.channels[index].id,
    format: "CAROUSEL",
    status: "INBOX",
    uncertainClaims: [
      "This is a demo idea without verified research. Add real sources before approval.",
    ],
    rights: "Demo fixture, not a licensed source.",
  }));
  data.projects = [
    {
      id: "demo-project-1",
      title: "Demo · The city after hours",
      channelId: "the-move",
      operatorId: "operator-1",
      stage: "IDEA",
      format: "CAROUSEL",
      draftCopy: "",
      sourceUrls: [],
      dueAt: dateAt(-2).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-2",
      title: "Demo · Small spaces, big stories",
      channelId: "korea-coded",
      operatorId: "operator-2",
      stage: "RESEARCH",
      format: "CAROUSEL",
      draftCopy:
        "Working angle: explore the people behind independent spaces. Verify all claims and add primary sources.",
      sourceUrls: [],
      dueAt: dateAt(-3).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-3",
      title: "Demo · How good design travels",
      channelId: "the-standard",
      operatorId: "operator-1",
      stage: "DRAFT",
      format: "CAROUSEL",
      draftCopy:
        "A design story starts with one precise observation.\n\n[Add verified examples and source credits before review.]",
      sourceUrls: [],
      dueAt: dateAt(-4).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-4",
      title: "Demo · A moment in motion",
      channelId: "the-move",
      operatorId: "operator-2",
      stage: "DESIGN",
      format: "REEL",
      draftCopy:
        "Culture in motion.\n[Headline and source credit pending verification.]",
      sourceUrls: [],
      dueAt: dateAt(-1).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-5",
      title: "Demo · Objects with a point of view",
      channelId: "the-standard",
      operatorId: "operator-2",
      stage: "REVIEW",
      format: "CAROUSEL",
      draftCopy:
        "Editorial review fixture. No facts are approved; add research before proceeding.",
      sourceUrls: [],
      dueAt: dateAt(-2).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
  ];
  return data;
}
