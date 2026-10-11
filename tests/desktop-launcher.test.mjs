import { describe, expect, it } from "vitest";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareDesktop } from "../scripts/prepare-desktop.mjs";
describe("default real desktop configuration", () => {
  it("creates private real-operation settings in a spaced path and preserves subsequent edits", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "THE MOVE desktop "));
    try {
      await writeFile(
        path.join(root, ".env.example"),
        await readFile(".env.example", "utf8"),
      );
      const first = prepareDesktop(root);
      expect(first.DEMO_MODE).toBe("false");
      expect(first.LOCAL_MODE).toBe("true");
      expect(first.REDIS_URL).toBe("");
      expect(first.OPERATOR_1_PASSWORD).not.toBe(first.OPERATOR_2_PASSWORD);
      expect(first.SESSION_SECRET).not.toBe(first.TOKEN_ENCRYPTION_KEY);
      expect(first.MOVE_DATA_DIR).toBe(path.join(root, ".move-local"));
      const filename = path.join(root, ".env.desktop");
      await writeFile(
        filename,
        (await readFile(filename, "utf8")) +
          "\nOPENAI_API_KEY=fixture-key-no-provider-call\n",
      );
      const next = prepareDesktop(root);
      expect(next.SESSION_SECRET).toBe(first.SESSION_SECRET);
      expect(next.OPENAI_API_KEY).toBe("fixture-key-no-provider-call");
      expect(
        await readFile(path.join(root, ".move-local/login.txt"), "utf8"),
      ).toContain(first.OPERATOR_1_PASSWORD);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
