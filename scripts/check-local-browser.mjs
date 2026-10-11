import { chromium } from "@playwright/test";

// CI-only browser verification. Ordinary local launch does not require Chrome
// or a downloaded Playwright browser; it opens the user's default browser.
export async function checkLocalBrowser(origin) {
  const browser = await chromium.launch({
    headless: true,
    ...(process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : { channel: "chrome" }),
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${origin}/login`);
    await page.getByRole("button", { name: "Enter workspace" }).click();
    await page.getByRole("heading", { name: "Dashboard", exact: true }).waitFor({ timeout: 30000 });
    await page.getByText("DEMO MODE", { exact: true }).waitFor();
    await page.goto(`${origin}/studio`);
    await page.getByRole("heading", { name: "Content studio", exact: true }).waitFor();
    await page.goto(`${origin}/office`);
    await page.getByRole("heading", { name: "Virtual office.", exact: true }).waitFor();
    if (errors.length) throw new Error(`Browser runtime error: ${errors[0]}`);
    console.log("브라우저 검증 완료: 로그인, 대시보드, Studio, Office. 실제 화면과 데모 표시 확인.");
  } finally { await browser.close(); }
}
