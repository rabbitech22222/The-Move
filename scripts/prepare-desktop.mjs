import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
export function prepareDesktop(root) {
  const filename = path.join(root, ".env.desktop");
  if (!existsSync(filename)) {
    const settings = {
      DEMO_MODE: "false",
      LOCAL_MODE: "true",
      MOVE_DATA_DIR: ".move-local",
      APP_URL: "http://localhost:3000",
      REDIS_URL: "",
      SESSION_SECRET: randomBytes(48).toString("hex"),
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      OPERATOR_1_PASSWORD: randomBytes(18).toString("hex"),
      OPERATOR_2_PASSWORD: randomBytes(18).toString("hex"),
    };
    let source = readFileSync(path.join(root, ".env.example"), "utf8");
    for (const [name, value] of Object.entries(settings)) {
      const pattern = new RegExp(`^${name}=.*$`, "m");
      source = pattern.test(source)
        ? source.replace(pattern, `${name}=${value}`)
        : `${source}\n${name}=${value}\n`;
    }
    writeFileSync(filename, source, { mode: 0o600, flag: "wx" });
  }
  const settings = parseEnv(readFileSync(filename, "utf8"));
  if (settings.DEMO_MODE !== "false" || settings.LOCAL_MODE !== "true")
    throw new Error(
      ".env.desktop은 실제 로컬 운영 전용입니다. DEMO_MODE=false, LOCAL_MODE=true를 확인하세요.",
    );
  if (
    !settings.OPERATOR_1_PASSWORD ||
    !settings.OPERATOR_2_PASSWORD ||
    settings.OPERATOR_1_PASSWORD.length < 12 ||
    settings.OPERATOR_2_PASSWORD.length < 12 ||
    settings.OPERATOR_1_PASSWORD === settings.OPERATOR_2_PASSWORD
  )
    throw new Error("서로 다른 운영자 비밀번호가 필요합니다.");
  const directory = path.resolve(root, settings.MOVE_DATA_DIR || ".move-local");
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const login = path.join(directory, "login.txt");
  if (!existsSync(login))
    writeFileSync(
      login,
      `THE MOVE OS 내 컴퓨터 로그인\n이 파일은 공유하지 마세요. 기존 계정의 비밀번호를 변경하는 파일이 아닙니다.\n\n운영자 1: ${settings.OPERATOR_1_EMAIL || "operator1@themove.local"}\n비밀번호: ${settings.OPERATOR_1_PASSWORD}\n\n운영자 2: ${settings.OPERATOR_2_EMAIL || "operator2@themove.local"}\n비밀번호: ${settings.OPERATOR_2_PASSWORD}\n`,
      { mode: 0o600, flag: "wx" },
    );
  return { ...settings, MOVE_DATA_DIR: directory };
}
