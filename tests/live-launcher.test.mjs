import { describe, expect, it } from "vitest";
import {
  mkdtempSync,
  copyFileSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { prepareLiveEnvironment } from "../scripts/prepare-live.mjs";

describe("isolated live environment setup", () => {
  it("creates independent operator credentials and preserves all existing settings on rerun", () => {
    const root = mkdtempSync(path.join(tmpdir(), "move-live-"));
    try {
      copyFileSync(".env.example", path.join(root, ".env.example"));
      const first = prepareLiveEnvironment(root);
      expect(first.settings.DEMO_MODE).toBe("false");
      expect(first.settings.OPERATOR_1_PASSWORD).not.toBe(
        first.settings.OPERATOR_2_PASSWORD,
      );
      expect(first.settings.OPERATOR_1_PASSWORD.length).toBeGreaterThanOrEqual(
        12,
      );
      expect(first.settings.TOKEN_ENCRYPTION_KEY).toMatch(/^[a-f0-9]{64}$/);
      const saved =
        readFileSync(first.filename, "utf8") +
        "\nCANVA_CLIENT_ID=provided-app-id\n";
      writeFileSync(first.filename, saved);
      expect(prepareLiveEnvironment(root).settings.CANVA_CLIENT_ID).toBe(
        "provided-app-id",
      );
      expect(readFileSync(first.filename, "utf8")).toBe(saved);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
  it("rejects demo mode rather than silently converting persistent data", () => {
    const root = mkdtempSync(path.join(tmpdir(), "move-live-"));
    try {
      copyFileSync(".env.example", path.join(root, ".env.example"));
      const prepared = prepareLiveEnvironment(root);
      writeFileSync(
        prepared.filename,
        readFileSync(prepared.filename, "utf8").replace(
          "DEMO_MODE=false",
          "DEMO_MODE=true",
        ),
      );
      expect(() => prepareLiveEnvironment(root)).toThrow(/DEMO_MODE/);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
