import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { chromium } from "@playwright/test";

// Requires the real local application to be running. No provider fixtures or mock network responses.
const settings = parseEnv(
  readFileSync(process.env.MOVE_CHECK_ENV_FILE || ".env.desktop", "utf8"),
);
const origin = process.env.MOVE_CHECK_ORIGIN || settings.APP_URL;
const signin = await fetch(`${origin}/api/auth`, {
  method: "POST",
  headers: { Origin: origin, "Content-Type": "application/json" },
  body: JSON.stringify({
    email: settings.OPERATOR_1_EMAIL || "operator1@themove.local",
    password: settings.OPERATOR_1_PASSWORD,
  }),
});
assert(signin.ok, "실제 운영 로그인 실패");
const cookie = signin.headers.get("set-cookie")?.split(";")[0];
assert(cookie, "실제 운영 세션 없음");
async function workspace() {
  const r = await fetch(`${origin}/api/workspace`, {
    headers: { Cookie: cookie },
  });
  assert(r.ok);
  return (await r.json()).data;
}
let data;
const deadline = Date.now() + 120000;
while (Date.now() < deadline) {
  data = await workspace();
  assert(data.demo === false);
  assert.deepEqual(
    data.channels.map((c) => c.handle),
    ["@themovemag_"],
  );
  assert(data.accountMetrics.every((m) => m.source === "META"));
  if (
    data.topics.length &&
    !data.tasks.some(
      (t) =>
        t.kind === "NEWS_INGEST" && ["RUNNING", "QUEUED"].includes(t.status),
    )
  )
    break;
  if (data.tasks.find((t) => t.kind === "NEWS_INGEST")?.status === "FAILED")
    throw new Error("실제 뉴스 수집 실패. 출처별 실패 기록을 확인하세요.");
  await new Promise((resolve) => setTimeout(resolve, 1000));
}
assert(data.topics.length > 0, "실제 RSS 수집 결과가 없습니다.");
assert(data.sources.some((s) => s.lastFetchedAt));
assert(
  data.topics.every(
    (t) =>
      t.retrievedAt &&
      t.sourceUrl.startsWith("https://") &&
      !t.sourceUrl.includes("example.com"),
  ),
);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: "chrome" }),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/login`);
  await page
    .getByLabel("이메일")
    .fill(settings.OPERATOR_1_EMAIL || "operator1@themove.local");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(settings.OPERATOR_1_PASSWORD);
  await page.getByRole("button", { name: "작업 공간 열기" }).click();
  await page.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
  assert.equal(await page.getByText("데모 모드", { exact: true }).count(), 0);
  await page.goto(`${origin}/intelligence`);
  const candidates = page.getByRole("region", { name: "제작 후보" });
  await candidates
    .getByRole("heading", { name: "실제 뉴스 기반 제작 후보" })
    .waitFor();
  const article = candidates.locator("article").first();
  const title = await article.locator("h3").innerText();
  const sourceUrl = await article
    .getByRole("link", { name: "원문 확인" })
    .getAttribute("href");
  await article.getByRole("button", { name: "조사·제작 시작" }).click();
  await page
    .getByRole("heading", { name: "콘텐츠 스튜디오", exact: true })
    .waitFor();
  await page
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .click();
  assert((await page.getByLabel("출처 링크").inputValue()).includes(sourceUrl));
  assert(
    (await page.getByLabel("초안", { exact: true }).inputValue()).includes(
      "조사 준비",
    ),
  );
  await page.reload();
  await page
    .getByRole("button", { name: `${title} 열기`, exact: true })
    .waitFor();
  await page.goto(`${origin}/settings`);
  await page.getByRole("heading", { name: "Instagram 계정 연결" }).waitFor();
  assert.equal(
    await page.getByRole("button", { name: "채널 추가", exact: true }).count(),
    0,
  );
  assert.equal(errors.length, 0);
  const latest = await workspace();
  assert(
    latest.projects.some(
      (p) =>
        p.title === title &&
        p.stage === "RESEARCH" &&
        p.sourceUrls.includes(sourceUrl),
    ),
  );
  console.log(
    `실제 종단 검증 통과: 공개 RSS ${data.sources.filter((s) => s.lastFetchedAt).length}곳, 실제 기사 ${data.topics.length}개 → 화면 제작 후보 → 조사 준비서·출처 저장 → 재조회. 예시 지표 없음. 브라우저 오류 없음.`,
  );
} finally {
  await browser.close();
}
