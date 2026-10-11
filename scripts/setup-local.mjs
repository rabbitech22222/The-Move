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
  console.log("Created local .env with random keys; demo mode enabled.");
} else console.log("Existing .env preserved.");
