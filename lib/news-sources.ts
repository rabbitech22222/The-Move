import type { Source } from "./domain";
export function defaultNewsSources(): Source[] {
  return [
    ["yna-culture", "연합뉴스 · 문화", "https://www.yna.co.kr/rss/culture.xml"],
    [
      "yna-industry",
      "연합뉴스 · 산업",
      "https://www.yna.co.kr/rss/industry.xml",
    ],
    ["donga-culture", "동아일보 · 문화", "https://rss.donga.com/culture.xml"],
  ].map(([id, name, url]) => ({
    id,
    name,
    url,
    type: "RSS",
    enabled: true,
    rights:
      "공개 RSS 제목·발행일·원문 링크를 편집 조사에 사용합니다. 기사 전문·사진·영상의 재사용 허가는 포함되지 않습니다. 제작 전 원문 사실 확인과 자료 사용 권한을 확인하세요.",
    lastFetchedAt: null,
    lastError: null,
  }));
}
