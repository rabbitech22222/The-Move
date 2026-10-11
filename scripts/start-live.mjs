import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { prepareLiveEnvironment } from "./prepare-live.mjs";
import { runCheckedProcess } from "./local-process.mjs";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
async function main() {
  if (Number(process.versions.node.split(".")[0]) < 24)
    throw new Error("Node.js 24 이상이 필요합니다.");
  const { filename, settings, port } = prepareLiveEnvironment(root);
  mkdirSync(path.join(root, ".move-runtime"), { recursive: true });
  const logFile = path.join(root, ".move-runtime", "live-setup.log");
  console.log(
    "실제 운영 공간을 준비합니다. 예시 지표와 데모 비밀번호는 사용하지 않습니다.",
  );
  console.log(
    "로그인 비밀번호와 API 설정은 .env.live에 있습니다. 이 파일은 공유하지 마세요.",
  );
  const env = {
    ...process.env,
    MOVE_ENV_FILE: ".env.live",
    MOVE_HTTP_PORT: String(port),
  };
  const run = (args, label, timeoutMs = 120000) =>
    runCheckedProcess({
      command: process.platform === "win32" ? "docker.exe" : "docker",
      args,
      cwd: root,
      env,
      label,
      logFile,
      timeoutMs,
    });
  await run(
    ["info", "--format", "{{.ServerVersion}}"],
    "Docker Desktop 실행 확인",
  );
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", () =>
      reject(
        new Error(
          `포트 ${port}를 사용 중입니다. 데모 실행 창을 종료한 뒤 다시 실행하세요.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
  const compose = [
    "compose",
    "--project-name",
    "the-move-live",
    "--env-file",
    filename,
  ];
  await run(
    [
      ...compose,
      "up",
      ...(process.argv.includes("--no-build") ? ["--no-build"] : ["--build"]),
      "--detach",
      "--wait",
      "--wait-timeout",
      "180",
    ],
    "데이터베이스·앱·게시 작업 처리기 준비",
    1800000,
  );
  const health = await fetch(`${settings.APP_URL}/api/health`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!health.ok)
    throw new Error(
      "앱 준비 상태를 확인하지 못했습니다. live-setup.log와 Docker 로그를 확인하세요.",
    );
  const origin = new URL(settings.APP_URL).origin;
  const signin = await fetch(`${origin}/api/auth`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/json" },
    body: JSON.stringify({
      email: settings.OPERATOR_1_EMAIL || "operator1@themove.local",
      password: settings.OPERATOR_1_PASSWORD,
    }),
    signal: AbortSignal.timeout(15000),
  });
  const cookie = signin.headers.get("set-cookie")?.split(";")[0];
  if (!signin.ok || !cookie)
    throw new Error(
      "앱은 실행했지만 로그인 검증에 실패했습니다. 기존 데이터베이스 비밀번호는 덮어쓰지 않으므로 실제 계정 비밀번호와 .env.live를 확인하세요.",
    );
  const response = await fetch(`${origin}/api/workspace`, {
    headers: { Cookie: cookie },
    signal: AbortSignal.timeout(15000),
  });
  const workspace = await response.json();
  if (!response.ok || workspace.data?.demo !== false)
    throw new Error("실제 운영 작업 공간의 데이터를 확인하지 못했습니다.");
  const existingTaskIds = new Set(workspace.data.tasks.map((task) => task.id));
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
    (task) => task.kind === "TOPIC_DEDUP" && !existingTaskIds.has(task.id),
  )?.id;
  if (!queued.ok || !taskId)
    throw new Error(
      "실제 작업 처리기 확인 요청을 등록하지 못했습니다. Redis 설정과 Docker 로그를 확인하세요.",
    );
  const deadline = Date.now() + 60000;
  let workerReady = false;
  while (Date.now() < deadline) {
    const status = await fetch(`${origin}/api/workspace`, {
      headers: { Cookie: cookie },
      signal: AbortSignal.timeout(15000),
    });
    const state = await status.json();
    const task = state.data?.tasks?.find((task) => task.id === taskId);
    if (task?.status === "FAILED")
      throw new Error(
        "작업 처리기 검증 작업이 실패했습니다. 오피스의 실제 실패 결과를 확인하세요.",
      );
    if (task?.status === "SUCCEEDED") {
      workerReady = true;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  if (!workerReady)
    throw new Error(
      "작업 처리기의 실제 작업 완료를 확인하지 못했습니다. Docker 처리기 로그를 확인하세요.",
    );
  console.log(
    "실제 운영 로그인·데이터베이스·Redis 작업 완료 확인. 외부 Canva·Meta 인증 및 게시 검증은 별도입니다.",
  );
  console.log(`실제 운영 앱 실행 완료: ${settings.APP_URL}`);
  console.log(
    "운영자 이메일: operator1@themove.local / operator2@themove.local. 비밀번호는 .env.live의 해당 OPERATOR 항목입니다.",
  );
  console.log(
    "설정에서 Canva·Meta를 인증하고 @themovemag_ 계정을 확인하세요. GPT 플러그인 인증은 이 앱으로 자동 전달되지 않습니다.",
  );
  console.log(
    "종료: 폴더에서 docker compose --project-name the-move-live --env-file .env.live down",
  );
  if (process.argv.includes("--check")) return;
  const command =
    process.platform === "win32"
      ? "rundll32.exe"
      : process.platform === "darwin"
        ? "open"
        : "xdg-open";
  const args =
    process.platform === "win32"
      ? ["url.dll,FileProtocolHandler", settings.APP_URL]
      : [settings.APP_URL];
  const browser = spawn(command, args, {
    shell: false,
    stdio: "ignore",
    detached: true,
  });
  browser.once("error", () =>
    console.log(
      "자동으로 브라우저를 열지 못했습니다. 위 실행 주소를 직접 입력하세요.",
    ),
  );
  browser.unref();
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
