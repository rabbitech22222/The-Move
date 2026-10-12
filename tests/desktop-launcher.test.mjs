import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { prepareDesktop } from "../scripts/prepare-desktop.mjs";
import { applicationHash } from "../scripts/application-hash.mjs";
describe("default real desktop configuration", () => {
  it("rebuilds when application sources change and excludes private state and generated type files from the cache key", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "move-build-cache-"));
    try {
      await mkdir(path.join(root, "app"));
      await writeFile(
        path.join(root, "app/page.tsx"),
        "export default function Page(){return null}",
      );
      const initial = applicationHash(root);
      await writeFile(
        path.join(root, ".env.desktop"),
        "TOKEN_ENCRYPTION_KEY=fixture-private-value",
      );
      await writeFile(path.join(root, "next-env.d.ts"), "generated file");
      expect(applicationHash(root)).toBe(initial);
      await writeFile(
        path.join(root, "app/page.tsx"),
        "export default function Page(){return <main>changed</main>}",
      );
      expect(applicationHash(root)).not.toBe(initial);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
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
