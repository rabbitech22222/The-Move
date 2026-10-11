import { defaultNewsSources } from "./news-sources";
import type { WorkspaceData, Channel } from "./domain";

export const WORKSPACE_ID = "the-move";
export const demoOperators = [
  {
    id: "operator-1",
    name: "운영자 1",
    email: "operator1@themove.local",
    role: "ADMIN" as const,
  },
  {
    id: "operator-2",
    name: "운영자 2",
    email: "operator2@themove.local",
    role: "OPERATOR" as const,
  },
];

export function createWorkspaceBase(demo: boolean): WorkspaceData {
  const channels: Channel[] = [
    {
      id: "the-move",
      name: "THE MOVE",
      handle: "@themovemag_",
      accent: "#ef4444",
      connected: false,
      guidelines:
        "명확한 편집 관점으로 시작합니다. 사실 주장에는 출처를 표기합니다. 간결한 제목과 THE MOVE 브랜드를 유지합니다. 릴스는 DAHPcvVkH8k의 가로 영상 배치만 사용합니다.",
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
    sources: demo ? [] : defaultNewsSources(),
    topics: [],
    projects: [],
    templates: [
      {
        id: "move-carousel-1",
        name: "THE MOVE · 운영자 1 캐러셀",
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
        name: "THE MOVE · 운영자 2 캐러셀",
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
        name: "THE MOVE · 가로 영상 릴스",
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
          "예시 · 도시 생활의 새로운 시선",
          "예시 · 유행을 만드는 작은 차이",
          "예시 · 자세히 볼 만한 디자인",
          "예시 · 움직이는 문화",
        ][item % 4],
        format: item % 3 === 0 ? "REEL" : "CAROUSEL",
        category: ["문화", "디자인", "라이프스타일"][item % 3],
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
      name: "데모 예시 출처",
      url: "https://example.com/demo",
      type: "MANUAL",
      enabled: false,
      rights: "데모용 예시입니다. 실제로 수집한 기사나 근거가 아닙니다.",
      lastFetchedAt: null,
      lastError: null,
    },
  ];
  data.topics = [
    "도시 문화를 만드는 독립 공간",
    "한국 현대 디자인 살펴보기",
    "타이포그래피가 읽기에 미치는 영향",
  ].map((title, index) => ({
    id: `demo-topic-${index}`,
    title: `예시 · ${title}`,
    category: ["문화", "디자인", "편집"][index],
    sourceId: "demo-manual-source",
    sourceUrl: `https://example.com/demo/topic-${index}`,
    publishedAt: null,
    retrievedAt: syncedAt,
    relevance: 70 + index * 5,
    confidence: "LOW",
    scoreExplanation:
      "예시 점수입니다. 실제 점수는 키워드 일치와 최신성을 기준으로 산정하며 가중치를 설명합니다.",
    recommendedChannelId: "the-move",
    format: "CAROUSEL",
    status: "INBOX",
    uncertainClaims: [
      "검증된 조사 자료가 없는 데모 아이디어입니다. 승인 전 실제 출처를 추가하세요.",
    ],
    rights: "이용 허가를 받은 출처가 아닌 데모 예시입니다.",
  }));
  data.projects = [
    {
      id: "demo-project-1",
      title: "예시 · 도시의 늦은 시간",
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
      title: "예시 · 작은 공간의 큰 이야기",
      channelId: "the-move",
      operatorId: "operator-2",
      stage: "RESEARCH",
      format: "CAROUSEL",
      draftCopy:
        "편집 방향: 독립 공간을 만드는 사람들을 조사합니다. 모든 주장을 검증하고 1차 출처를 추가하세요.",
      sourceUrls: [],
      dueAt: dateAt(-3).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-3",
      title: "예시 · 좋은 디자인의 확산",
      channelId: "the-move",
      operatorId: "operator-1",
      stage: "DRAFT",
      format: "CAROUSEL",
      draftCopy:
        "디자인 이야기는 정확한 관찰에서 시작합니다.\n\n[검토 전 검증된 사례와 출처를 추가하세요.]",
      sourceUrls: [],
      dueAt: dateAt(-4).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-4",
      title: "예시 · 움직임 속의 순간",
      channelId: "the-move",
      operatorId: "operator-2",
      stage: "DESIGN",
      format: "REEL",
      draftCopy: "움직이는 문화.\n[제목과 출처를 검증하세요.]",
      sourceUrls: [],
      dueAt: dateAt(-1).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
    {
      id: "demo-project-5",
      title: "예시 · 관점이 담긴 사물",
      channelId: "the-move",
      operatorId: "operator-2",
      stage: "REVIEW",
      format: "CAROUSEL",
      draftCopy:
        "편집 검토 예시입니다. 승인된 사실이 없으므로 조사 자료를 추가하세요.",
      sourceUrls: [],
      dueAt: dateAt(-2).toISOString(),
      productionMinutes: 0,
      revisions: [],
      updatedAt: syncedAt,
    },
  ];
  return data;
}
