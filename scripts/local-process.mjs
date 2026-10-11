import { spawn } from "node:child_process";
import { appendFileSync, existsSync, realpathSync } from "node:fs";
import path from "node:path";

export function terminateOwnedChild(child, signal = "SIGTERM") {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform !== "win32") { child.kill(signal); return; }
  // Windows does not deliver SIGTERM to Node's handlers. Stop the process tree
  // created by this launcher, using its exact PID rather than a process name.
  const killer = spawn(path.join(process.env.SystemRoot || "C:\\Windows", "System32/taskkill.exe"),
    ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore", shell: false, windowsHide: true });
  killer.once("error", () => child.kill("SIGKILL"));
}

export function findNpmCli(nodePath = process.execPath, searchPath = process.env.PATH || "", npmExecPath = process.env.npm_execpath) {
  const directories = [path.dirname(nodePath), ...searchPath.split(path.delimiter).filter(Boolean)];
  const candidates = [npmExecPath];
  for (const directory of directories) {
    candidates.push(
      path.join(directory, "node_modules/npm/bin/npm-cli.js"),
      path.resolve(directory, "../lib/node_modules/npm/bin/npm-cli.js"),
      path.join(directory, "npm"),
    );
  }
  for (const candidate of candidates) {
    if (!candidate || !existsSync(candidate)) continue;
    const resolved = realpathSync(candidate);
    if (path.basename(resolved) === "npm-cli.js") return resolved;
  }
  throw new Error("npm을 찾지 못했습니다. Node.js 공식 설치 파일로 Node.js 24 이상을 다시 설치하세요.");
}

export function redactOutput(text) {
  return text
    .replace(/(https?:\/\/)[^\s/]+@/gi, "$1[credentials]@")
    .replace(/((?:token|password|secret|api_key)=)[^\s&]+/gi, "$1[redacted]");
}

export function runCheckedProcess({ command = process.execPath, args, cwd, env = process.env, label, logFile, timeoutMs = 600000, heartbeatMs = 10000, onChild, output = (text) => process.stdout.write(text) }) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    let finished = false;
    let timeoutError;
    let forceKill;
    const record = (text) => {
      const safe = redactOutput(text);
      if (logFile) appendFileSync(logFile, safe);
      output(safe);
    };
    record(`\n${label} 시작\n`);
    // Execute npm-cli.js with Node directly, including on Windows. No cmd shell,
    // shell concatenation, or arguments embedded in a command string.
    const child = spawn(command, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], shell: false });
    onChild?.(child);
    child.stdout.on("data", chunk => record(chunk.toString()));
    child.stderr.on("data", chunk => record(chunk.toString()));
    const heartbeat = setInterval(() => {
      record(`${label} 실행 중 — ${Math.round((Date.now() - started) / 1000)}초 경과\n`);
    }, heartbeatMs);
    const timeout = setTimeout(() => {
      timeoutError = new Error(`${label} 시간 제한을 초과했습니다. 인터넷 연결을 확인한 뒤 다시 실행하세요. 설치 로그: ${logFile || "위 출력"}`);
      record(`${timeoutError.message}\n`);
      terminateOwnedChild(child);
      forceKill = setTimeout(() => terminateOwnedChild(child, "SIGKILL"), 5000);
    }, timeoutMs);
    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      clearTimeout(forceKill);
      onChild?.(null);
      if (error) reject(error);
      else { record(`${label} 완료\n`); resolve(); }
    };
    child.once("error", () => finish(new Error(`${label} 프로세스를 시작하지 못했습니다. 실행 파일과 설치 경로를 확인하세요.`)));
    child.once("close", (code, signal) => finish(timeoutError || (code === 0 ? null : new Error(`${label} 실패 (${code ?? signal}). 설치 로그: ${logFile || "위 출력"}`))));
  });
}
