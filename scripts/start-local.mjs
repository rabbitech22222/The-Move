import { prepareDesktop } from "./prepare-desktop.mjs";
import { applicationHash } from "./application-hash.mjs";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
} from "node:fs";
import { createHash } from "node:crypto";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  findNpmCli,
  runCheckedProcess,
  terminateOwnedChild,
} from "./local-process.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const port = Number(
  process.env.MOVE_LOCAL_PORT || process.env.MOVE_DEMO_PORT || 3000,
);
const origin = `http://localhost:${port}`;
const checkBrowser = process.argv.includes("--check-browser");
const checkOnly = process.argv.includes("--check") || checkBrowser;
let server;
let worker;
const demo = process.argv.includes("--demo");
let setupChild;
const runtime = path.join(root, ".move-runtime");
const logFile = path.join(runtime, "setup.log");
const installMarker = path.join(runtime, "dependencies.sha256");

async function setupStep(label, args, timeoutMs = 120000, extraEnv = {}) {
  await runCheckedProcess({
    args,
    cwd: root,
    label,
    logFile,
    timeoutMs,
    env: {
      ...process.env,
      ...extraEnv,
      npm_config_cache:
        process.env.npm_config_cache || path.join(runtime, "npm-cache"),
    },
    onChild: (child) => {
      setupChild = child;
    },
  });
}

async function stop() {
  await Promise.all(
    [setupChild, worker, server]
      .filter(
        (child) =>
          child?.pid && child.exitCode === null && child.signalCode === null,
      )
      .map(async (child) => {
        const stopped = once(child, "exit");
        terminateOwnedChild(child);
        const timeout = setTimeout(
          () => terminateOwnedChild(child, "SIGKILL"),
          5000,
        );
        await stopped;
        clearTimeout(timeout);
      }),
  );
}

async function main() {
  assert(
    Number(process.versions.node.split(".")[0]) >= 24,
    "Node.js 24 이상을 설치한 다음 실행 파일을 다시 여세요: https://nodejs.org/en/download",
  );
  assert(
    Number.isInteger(port) && port >= 1024 && port <= 65535,
    "MOVE_LOCAL_PORT에 1024~65535 범위의 포트를 입력하세요.",
  );
  mkdirSync(runtime, { recursive: true });
  writeFileSync(
    logFile,
    `THE MOVE OS 로컬 실행 ${new Date().toISOString()}\nNode ${process.versions.node} / ${process.platform} ${process.arch}\n`,
    { mode: 0o600 },
  );
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () =>
      reject(
        new Error(
          `${port} 포트가 사용 중입니다. 기존 앱을 종료하고 다시 실행하세요.`,
        ),
      ),
    );
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise((resolve) => probe.close(resolve));

  const npmCli = findNpmCli();
  const lockHash = createHash("sha256")
    .update(readFileSync(path.join(root, "package-lock.json")))
    .digest("hex");
  const previousInstall = existsSync(installMarker)
    ? readFileSync(installMarker, "utf8").trim()
    : "";
  const required = [
    "next/dist/bin/next",
    "prisma/build/index.js",
    "@prisma/client/package.json",
    "@prisma/adapter-pg/package.json",
    "dotenv/package.json",
  ];
  if (
    previousInstall !== lockHash ||
    required.some((file) => !existsSync(path.join(root, "node_modules", file)))
  ) {
    rmSync(installMarker, { force: true });
    console.log(
      "패키지를 설치합니다. 10초마다 실행 상태를 표시하며, 다운로드 로그를 아래에 출력합니다.",
    );
    // The demo explicitly generates the supported JS Prisma client below.
    // Skipping lifecycle scripts avoids downloading unused native Prisma engines.
    // npm still verifies package-lock integrity and HTTPS certificates.
    await setupStep(
      "[1/4] 패키지 설치",
      [
        npmCli,
        "ci",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--loglevel=http",
        "--fetch-timeout=30000",
        "--fetch-retries=1",
        "--fetch-retry-mintimeout=1000",
        "--fetch-retry-maxtimeout=4000",
      ],
      600000,
    );
    writeFileSync(installMarker, lockHash, { mode: 0o600 });
  } else {
    console.log("[1/4] 검증된 패키지 설치를 재사용합니다.");
  }
  await setupStep("[2/4] 로컬 설정 준비", [
    path.join(root, "scripts/setup-local.mjs"),
  ]);
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  await setupStep("[3/4] 데이터 클라이언트 생성", [
    path.join(root, "node_modules/prisma/build/index.js"),
    "generate",
  ]);
  assert(
    process.env.SESSION_SECRET?.length >= 32,
    "로컬 .env의 SESSION_SECRET 설정을 확인하세요.",
  );
  const desktop = demo ? {} : prepareDesktop(root);
  const env = {
    ...process.env,
    ...desktop,
    LOCAL_MODE: demo ? "false" : "true",
    DEMO_MODE: demo ? "true" : "false",
    APP_URL: origin,
    REDIS_URL: "",
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  // Reuse securely injected API credentials when the private local setting is blank.
  for (const name of [
    "META_ACCESS_TOKEN",
    "CANVA_ACCESS_TOKEN",
    "OPENAI_API_KEY",
    "META_APP_ID",
    "META_APP_SECRET",
    "CANVA_CLIENT_ID",
    "CANVA_CLIENT_SECRET",
  ])
    if (!desktop[name] && process.env[name]) env[name] = process.env[name];
  const cli = path.join(root, "node_modules/next/dist/bin/next");
  const buildMarker = path.join(runtime, "application.sha256");
  const expectedBuild = applicationHash(root);
  if (
    !existsSync(path.join(root, ".next/BUILD_ID")) ||
    !existsSync(buildMarker) ||
    readFileSync(buildMarker, "utf8").trim() !== expectedBuild
  ) {
    rmSync(buildMarker, { force: true });
    await setupStep("[4/4] 실제 운영 앱 빌드", [cli, "build"], 300000, env);
    writeFileSync(buildMarker, applicationHash(root), { mode: 0o600 });
  } else console.log("[4/4] 검증된 운영 빌드를 재사용합니다.");
  if (!demo) {
    worker = spawn(
      process.execPath,
      ["--import", "tsx", path.join(root, "scripts/local-worker.ts")],
      { cwd: root, env, stdio: "inherit" },
    );
    worker.on("error", () =>
      console.error("로컬 작업 처리기를 시작하지 못했습니다."),
    );
  }
  server = spawn(
    process.execPath,
    [cli, "start", "--hostname", "127.0.0.1", "--port", String(port)],
    {
      cwd: root,
      env,
      stdio: "inherit",
    },
  );
  server.on("error", () =>
    console.error("앱 실행 프로세스를 시작하지 못했습니다."),
  );
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null)
      throw new Error("앱이 시작 전에 종료되었습니다. 위 오류를 확인하세요.");
    try {
      const health = await fetch(`${origin}/api/health`, {
        signal: AbortSignal.timeout(2000),
      });
      if (health.ok) {
        ready = true;
        break;
      }
    } catch {
      /* Starting. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(ready, "앱 시작이 지연되고 있습니다. 위 오류를 확인하세요.");
  const login = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: desktop.OPERATOR_1_EMAIL || "operator1@themove.local",
      password: demo ? "move-demo-2026" : desktop.OPERATOR_1_PASSWORD,
    }),
    signal: AbortSignal.timeout(15000),
  });
  assert(login.ok, "운영자 로그인 확인에 실패했습니다.");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "운영자 로그인 세션을 생성하지 못했습니다.");
  const workspace = await fetch(`${origin}/api/workspace`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(15000),
  });
  const data = (await workspace.json()).data;
  assert(
    workspace.ok &&
      data?.demo === demo &&
      data.channels.length === 1 &&
      data.channels[0].handle === "@themovemag_",
    "THE MOVE 단일 운영 공간을 읽지 못했습니다.",
  );
  if (!demo)
    assert(
      data.accountMetrics.every((metric) => metric.source === "META"),
      "예시 지표가 실제 운영에 섞였습니다.",
    );
  if (!demo) {
    console.log(
      "작업 처리기의 실제 작업 완료를 확인합니다. 첫 뉴스 수집이 진행 중이면 함께 기다립니다.",
    );
    const baseline = new Set(data.tasks.map((task) => task.id));
    const queued = await fetch(`${origin}/api/jobs`, {
      method: "POST",
      headers: {
        Cookie: cookie,
        Origin: origin,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ kind: "TOPIC_DEDUP" }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await queued.json();
    const taskId = result.data?.tasks?.find(
      (task) => task.kind === "TOPIC_DEDUP" && !baseline.has(task.id),
    )?.id;
    assert(
      queued.ok && taskId,
      "실제 작업 처리기 확인 요청을 등록하지 못했습니다.",
    );
    const workerDeadline = Date.now() + 90000;
    let completed = false;
    let nextMessage = Date.now() + 10000;
    while (Date.now() < workerDeadline) {
      const response = await fetch(`${origin}/api/workspace`, {
        headers: { Cookie: cookie },
        signal: AbortSignal.timeout(15000),
      });
      const current = (await response.json()).data;
      const task = current?.tasks.find((task) => task.id === taskId);
      assert(
        task?.status !== "FAILED",
        "실제 작업이 실패했습니다. 오피스 기록을 확인하세요.",
      );
      if (task?.status === "SUCCEEDED") {
        completed = true;
        break;
      }
      assert(
        worker && worker.exitCode === null,
        "로컬 작업 처리기가 종료되었습니다. 위 오류를 확인하세요.",
      );
      if (Date.now() > nextMessage) {
        console.log(
          "뉴스 수집·작업 처리 검증 진행 중. 출처별 결과는 정보 수집 화면에 기록합니다.",
        );
        nextMessage = Date.now() + 10000;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    assert(
      completed,
      "로컬 작업 처리기의 완료를 확인하지 못했습니다. 앱을 종료한 뒤 실행 로그와 오피스 상태를 확인하세요.",
    );
    console.log("실제 운영 로그인·저장·작업 처리 완료 확인.");
  }
  console.log("로그인 화면을 확인합니다.");
  const loginPage = await fetch(`${origin}/login`, {
    signal: AbortSignal.timeout(30000),
  });
  assert(
    loginPage.ok && (await loginPage.text()).includes("작업 공간 열기"),
    "로그인 화면이 준비되지 않았습니다. 위 서버 오류를 확인하세요.",
  );
  if (checkBrowser) {
    const { checkLocalBrowser } = await import("./check-local-browser.mjs");
    await checkLocalBrowser(origin, {
      demo,
      email: desktop.OPERATOR_1_EMAIL || "operator1@themove.local",
      password: demo ? "move-demo-2026" : desktop.OPERATOR_1_PASSWORD,
    });
  }
  console.log(`\nTHE MOVE OS 실행 완료: ${origin}`);
  console.log(
    demo
      ? "예시 모드입니다. 실제 계정 작업에는 기본 실행기를 사용하세요."
      : "초기 로그인 정보: .move-local/login.txt. 뉴스는 자동 수집되며 Instagram 연결 여부와 관계없이 편집할 수 있습니다.",
  );
  console.log("이 창을 열어 둔 채 사용하세요. 종료하려면 Ctrl+C를 누르세요.\n");
  if (checkOnly) {
    console.log("실제 앱 시작, 로그인, 작업 공간 조회 검증 완료.");
    await stop();
    return;
  }
  const browser =
    process.platform === "darwin"
      ? spawn("open", [`${origin}/login`], { stdio: "ignore" })
      : process.platform === "win32"
        ? spawn(
            "rundll32.exe",
            ["url.dll,FileProtocolHandler", `${origin}/login`],
            { stdio: "ignore" },
          )
        : spawn("xdg-open", [`${origin}/login`], { stdio: "ignore" });
  browser.on("error", () =>
    console.log(`브라우저 주소창에 ${origin}/login 을 입력하세요.`),
  );
  browser.unref();
  const [code] = await once(server, "exit");
  process.exitCode = code || 0;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void stop().then(() => process.exit(0));
  });
main().catch(async (error) => {
  console.error(
    error instanceof Error ? error.message : "실행에 실패했습니다.",
  );
  await stop();
  process.exitCode = 1;
});
