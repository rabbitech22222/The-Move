import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import assert from "node:assert/strict";
import { chromium } from "@playwright/test";
const settings = parseEnv(
  readFileSync(process.env.MOVE_CHECK_ENV_FILE || ".env.desktop", "utf8"),
);
const origin = process.env.MOVE_CHECK_ORIGIN || settings.APP_URL;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROMIUM_PATH
    ? { executablePath: process.env.CHROMIUM_PATH }
    : { channel: "chrome" }),
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${origin}/login`);
  await page
    .getByLabel("이메일")
    .fill(settings.OPERATOR_1_EMAIL || "operator1@themove.local");
  await page
    .getByLabel("비밀번호", { exact: true })
    .fill(settings.OPERATOR_1_PASSWORD);
  await page.getByRole("button", { name: "작업 공간 열기" }).click();
  await page.getByRole("heading", { name: "대시보드", exact: true }).waitFor();
  await page.goto(`${origin}/settings`);
  await page
    .getByRole("heading", { name: "Canva 실제 계정 연결·원본 검사" })
    .waitFor();
  await page
    .getByText("Canva Connect 공식 개발자 앱 설정", { exact: true })
    .click();
  assert.equal(
    await page
      .getByLabel("Canva 클라이언트 비밀 키", { exact: true })
      .getAttribute("type"),
    "password",
  );
  assert.equal(
    await page
      .getByLabel("Canva 클라이언트 비밀 키", { exact: true })
      .inputValue(),
    "",
  );
  const config = await (
    await page.request.get(`${origin}/api/settings`)
  ).json();
  assert(!JSON.stringify(config).includes(settings.OPERATOR_1_PASSWORD));
  assert.equal(
    config.data.integrations.canva.callbackUrl,
    `${origin}/api/oauth/canva/callback`,
  );
  await page.goto(`${origin}/canva`);
  await page.getByRole("region", { name: "실제 연결·제작 흐름" }).waitFor();
  if (!config.data.integrations.canva.configured)
    assert(
      await page
        .getByRole("button", { name: "Canva에서 생성", exact: true })
        .isDisabled(),
    );
  assert.equal(errors.length, 0);
  console.log(
    "실제 로컬 연결 UI 확인: 비데모 로그인, OAuth 앱 설정·비밀 입력, 실제 콜백 주소, Canva 연결→원본→제작 단계와 미인증 생성 차단. 외부 계정 연결 성공을 뜻하지 않습니다.",
  );
} finally {
  await browser.close();
}
