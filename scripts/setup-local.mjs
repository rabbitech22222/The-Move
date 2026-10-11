import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env")) {
  const data = readFileSync(".env.example", "utf8")
    .replace(
      /^SESSION_SECRET=$/m,
      `SESSION_SECRET=${randomBytes(48).toString("hex")}`,
    )
    .replace(
      /^TOKEN_ENCRYPTION_KEY=$/m,
      `TOKEN_ENCRYPTION_KEY=${randomBytes(32).toString("hex")}`,
    );
  writeFileSync(".env", data, { mode: 0o600 });
  console.log("임의 보안 키로 로컬 .env를 만들었습니다. 데모 모드를 사용합니다.");
} else console.log("기존 .env 설정을 유지합니다.");
