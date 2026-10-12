import { defineConfig } from "@playwright/test";
const origin = process.env.MOVE_E2E_ORIGIN || "http://localhost:3111";
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 45000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: origin,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    screenshot: "only-on-failure",
    launchOptions: {
      executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command: "node scripts/start-local.mjs --demo",
    env: {
      MOVE_LOCAL_PORT: new URL(origin).port || "3111",
      MOVE_DATA_DIR: ".move-runtime/e2e-data",
    },
    url: `${origin}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 300000,
  },
});
