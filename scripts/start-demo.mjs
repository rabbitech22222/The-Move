import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
const port = Number(process.env.MOVE_DEMO_PORT || 3000);
const origin = `http://localhost:${port}`;
const checkOnly = process.argv.includes("--check");
let server;

async function runNpm(args) {
  const child = spawn(process.platform === "win32" ? "npm.cmd" : "npm", args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      npm_config_cache: process.env.npm_config_cache || path.join(root, ".move-runtime", "npm-cache"),
    },
  });
  const [code] = await once(child, "exit");
  if (code !== 0) throw new Error(`npm ${args.join(" ")} failed.`);
}

async function stop() {
  if (!server || server.exitCode !== null) return;
  const stopped = once(server, "exit");
  server.kill("SIGTERM");
  const timeout = setTimeout(() => server.kill("SIGKILL"), 5000);
  await stopped;
  clearTimeout(timeout);
}

async function main() {
  assert(Number(process.versions.node.split(".")[0]) >= 24,
    "Node.js 24 이상을 설치한 다음 실행 파일을 다시 여세요: https://nodejs.org/en/download");
  assert(Number.isInteger(port) && port >= 1024 && port <= 65535, "MOVE_DEMO_PORT must be a valid port.");
  const probe = createServer();
  await new Promise((resolve, reject) => {
    probe.once("error", () => reject(new Error(`${port} 포트가 사용 중입니다. 기존 앱을 종료하고 다시 실행하세요.`)));
    probe.listen(port, "127.0.0.1", resolve);
  });
  await new Promise(resolve => probe.close(resolve));

  if (!existsSync(path.join(root, "node_modules/next/package.json"))) {
    console.log("처음 실행에 필요한 패키지를 설치합니다. 잠시 기다려 주세요.");
    await runNpm(["ci"]);
  }
  await runNpm(["run", "setup:local"]);
  const { config } = await import("dotenv");
  config({ path: path.join(root, ".env"), quiet: true });
  await runNpm(["run", "db:generate"]);
  assert(process.env.SESSION_SECRET?.length >= 32, "로컬 .env의 SESSION_SECRET 설정을 확인하세요.");
  const env = {
    ...process.env,
    DEMO_MODE: "true",
    APP_URL: origin,
    REDIS_URL: "",
    NODE_ENV: "development",
    NEXT_TELEMETRY_DISABLED: "1",
  };
  const cli = path.join(root, "node_modules/next/dist/bin/next");
  server = spawn(process.execPath, [cli, "dev", "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env, stdio: "inherit",
  });
  server.on("error", () => console.error("앱 실행 프로세스를 시작하지 못했습니다."));
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error("앱이 시작 전에 종료되었습니다. 위 오류를 확인하세요.");
    try {
      const health = await fetch(`${origin}/api/health`, { signal: AbortSignal.timeout(2000) });
      if (health.ok) { ready = true; break; }
    } catch { /* Starting. */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  assert(ready, "앱 시작이 지연되고 있습니다. 위 오류를 확인하세요.");
  const login = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({ email: "operator1@themove.local", password: "move-demo-2026" }),
    signal: AbortSignal.timeout(15000),
  });
  assert(login.ok, "데모 로그인 확인에 실패했습니다.");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  assert(cookie, "데모 로그인 세션을 생성하지 못했습니다.");
  const workspace = await fetch(`${origin}/api/workspace`, {
    headers: { Cookie: cookie }, signal: AbortSignal.timeout(15000),
  });
  const data = (await workspace.json()).data;
  assert(workspace.ok && data?.demo && data.channels.length >= 3, "데모 작업 공간을 읽지 못했습니다.");
  console.log(`\nTHE MOVE OS 실행 완료: ${origin}`);
  console.log("로그인 화면에서 Enter workspace를 누르세요. 이메일과 데모 비밀번호가 미리 입력되어 있습니다.");
  console.log("이 창을 열어 둔 채 사용하세요. 종료하려면 Ctrl+C를 누르세요.\n");
  if (checkOnly) {
    console.log("실제 앱 시작, 로그인, 작업 공간 조회 검증 완료.");
    await stop();
    return;
  }
  const browser = process.platform === "darwin"
    ? spawn("open", [`${origin}/login`], { stdio: "ignore" })
    : process.platform === "win32"
      ? spawn("rundll32.exe", ["url.dll,FileProtocolHandler", `${origin}/login`], { stdio: "ignore" })
      : spawn("xdg-open", [`${origin}/login`], { stdio: "ignore" });
  browser.on("error", () => console.log(`브라우저 주소창에 ${origin}/login 을 입력하세요.`));
  browser.unref();
  const [code] = await once(server, "exit");
  process.exitCode = code || 0;
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => { void stop().then(() => process.exit(0)); });
main().catch(async error => {
  console.error(error instanceof Error ? error.message : "실행에 실패했습니다.");
  await stop();
  process.exitCode = 1;
});
