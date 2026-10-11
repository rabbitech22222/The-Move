import { randomBytes } from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { parseEnv } from "node:util";
export function prepareLiveEnvironment(root) {
  const filename = path.join(root, ".env.live");
  if (!existsSync(filename)) {
    let source = readFileSync(path.join(root, ".env.example"), "utf8");
    const settings = {
      DEMO_MODE: "false",
      APP_URL: "http://localhost:3000",
      SESSION_SECRET: randomBytes(48).toString("hex"),
      TOKEN_ENCRYPTION_KEY: randomBytes(32).toString("hex"),
      OPERATOR_1_PASSWORD: randomBytes(18).toString("hex"),
      OPERATOR_2_PASSWORD: randomBytes(18).toString("hex"),
      POSTGRES_PASSWORD: randomBytes(24).toString("hex"),
    };
    settings.DATABASE_URL = `postgresql://move:${settings.POSTGRES_PASSWORD}@localhost:5432/the_move?schema=public`;
    for (const [name, value] of Object.entries(settings)) {
      const expression = new RegExp(`^${name}=.*$`, "m");
      source = expression.test(source)
        ? source.replace(expression, `${name}=${value}`)
        : `${source}\n${name}=${value}\n`;
    }
    writeFileSync(
      filename,
      "# 실제 운영용 로컬 설정. 비밀 값을 Git이나 채팅에 공유하지 마세요.\n" +
        source,
      { mode: 0o600, flag: "wx" },
    );
  }
  const settings = parseEnv(readFileSync(filename, "utf8"));
  if (settings.DEMO_MODE !== "false")
    throw new Error(
      ".env.live의 DEMO_MODE는 false여야 합니다. 데모 데이터로 실제 게시할 수 없습니다.",
    );
  for (const name of ["OPERATOR_1_PASSWORD", "OPERATOR_2_PASSWORD"])
    if (!settings[name] || settings[name].length < 12)
      throw new Error(`${name}에 12자 이상의 별도 비밀번호가 필요합니다.`);
  if (settings.OPERATOR_1_PASSWORD === settings.OPERATOR_2_PASSWORD)
    throw new Error("두 운영자의 비밀번호는 서로 달라야 합니다.");
  if (
    !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(
      settings.APP_URL ?? "",
    )
  )
    throw new Error(
      "이 실행기는 내 컴퓨터용입니다. APP_URL은 http://localhost:포트 형식으로 설정하세요.",
    );
  const port = Number(new URL(settings.APP_URL).port || 80);
  return { filename, settings, port };
}
