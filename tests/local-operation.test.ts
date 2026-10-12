import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {
  getWorkspaceData,
  mutateWorkspace,
  findUserByEmail,
} from "../lib/data";
import { verifyPassword } from "../lib/auth";
import { enqueueTask } from "../lib/jobs";
import { runLocalJobOnce } from "../lib/local-worker";
import { saveIntegrationToken, getIntegrationToken } from "../lib/credentials";
import { saveOAuthClient, getOAuthClient } from "../lib/integration-config";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "move-real-local-"));
  vi.stubEnv("LOCAL_MODE", "true");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("MOVE_DATA_DIR", directory);
  vi.stubEnv("REDIS_URL", "");
  vi.stubEnv("OPERATOR_1_PASSWORD", "first-local-test-password");
  vi.stubEnv("OPERATOR_2_PASSWORD", "second-local-test-password");
  vi.stubEnv("TOKEN_ENCRYPTION_KEY", "a".repeat(64));
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("real local operation without Docker or Redis", () => {
  it("encrypts OAuth application secrets, preserves them across reads and does not expose them in workspace data", async () => {
    vi.stubEnv("CANVA_CLIENT_ID", "");
    vi.stubEnv("CANVA_CLIENT_SECRET", "");
    await getWorkspaceData();
    await saveOAuthClient("canva", {
      clientId: "fixture-public-client-id",
      secret: "fixture-client-secret",
    });
    expect(await getOAuthClient("canva")).toEqual({
      clientId: "fixture-public-client-id",
      secret: "fixture-client-secret",
    });
    expect(
      await readFile(path.join(directory, "oauth-apps.json"), "utf8"),
    ).not.toContain("fixture-client-secret");
    expect(JSON.stringify(await getWorkspaceData())).not.toContain(
      "fixture-client-secret",
    );
  });
  it("starts a single account with no example metrics, hashes distinct operator credentials and preserves them", async () => {
    const data = await getWorkspaceData();
    expect(data.demo).toBe(false);
    expect(data.channels.map((c) => c.handle)).toEqual(["@themovemag_"]);
    expect(data.accountMetrics).toEqual([]);
    expect(data.posts).toEqual([]);
    expect(data.topics).toEqual([]);
    expect(data.sources.filter((s) => s.enabled)).toHaveLength(3);
    const user = await findUserByEmail("operator1@themove.local");
    expect(
      verifyPassword("first-local-test-password", user!.passwordHash),
    ).toBe(true);
    expect(JSON.stringify(data)).not.toContain("first-local-test-password");
    expect(
      await readFile(path.join(directory, "users.json"), "utf8"),
    ).not.toContain("first-local-test-password");
    vi.stubEnv("OPERATOR_1_PASSWORD", "changed-config-password");
    expect((await findUserByEmail(user!.email))!.passwordHash).toBe(
      user!.passwordHash,
    );
  });
  it("executes durable queued work only once even if two workers race", async () => {
    const task = await enqueueTask("TOPIC_DEDUP", {}, "operator-1");
    expect(task.isDemo).toBe(false);
    expect(task.status).toBe("QUEUED");
    await Promise.all([runLocalJobOnce(), runLocalJobOnce()]);
    const data = await getWorkspaceData();
    expect(data.tasks.find((t) => t.id === task.id)?.status).toBe("SUCCEEDED");
    expect(data.tasks.find((t) => t.id === task.id)?.localJob).toBeUndefined();
    expect(
      data.events.filter(
        (e) => e.taskId === task.id && e.status === "SUCCEEDED",
      ),
    ).toHaveLength(1);
    expect(await runLocalJobOnce()).toBe(false);
  });
  it("keeps future jobs pending across reads rather than executing them immediately", async () => {
    const task = await enqueueTask("TOPIC_DEDUP", {}, "operator-1");
    await mutateWorkspace("operator-1", "TEST_FUTURE_JOB", task.id, (data) => {
      data.tasks[0].localJob!.dueAt = Date.now() + 60000;
    });
    expect(await runLocalJobOnce()).toBe(false);
    expect((await getWorkspaceData()).tasks[0].status).toBe("QUEUED");
  });
  it("encrypts actual local integration storage and never includes credentials in workspace responses", async () => {
    await getWorkspaceData();
    await saveIntegrationToken("meta", "fixture-access-not-a-real-token");
    expect(
      await readFile(path.join(directory, "credentials.json"), "utf8"),
    ).not.toContain("fixture-access-not-a-real-token");
    expect(await getIntegrationToken("meta")).toBe(
      "fixture-access-not-a-real-token",
    );
    expect(JSON.stringify(await getWorkspaceData())).not.toContain(
      "fixture-access-not-a-real-token",
    );
  });
});
