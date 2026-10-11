import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { createDemoData, createWorkspaceBase } from "../lib/demo";
import {
  getWorkspaceData,
  mutateWorkspace,
  findUserByEmail,
} from "../lib/data";

let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), "move-data-test-"));
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("MOVE_DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});

describe("explicit demo persistence", () => {
  it("labels every mock metric and keeps agents idle until real work is requested", () => {
    const data = createDemoData(new Date("2026-10-10T12:00:00Z"));
    expect(data.demo).toBe(true);
    expect(data.accountMetrics).toHaveLength(90);
    expect(
      data.accountMetrics.every((metric) => metric.source === "DEMO"),
    ).toBe(true);
    expect(data.posts.every((post) => post.source === "DEMO")).toBe(true);
    expect(data.tasks).toEqual([]);
    expect(data.events).toEqual([]);
    expect(data.approvals).toEqual([]);
    expect(data.channels.every((channel) => !channel.connected)).toBe(true);
  });
  it("never uses fixtures in the production base", () => {
    const data = createWorkspaceBase(false);
    expect(data.accountMetrics).toEqual([]);
    expect(data.posts).toEqual([]);
    expect(data.topics).toEqual([]);
    expect(data.projects).toEqual([]);
    expect(
      data.templates.find((template) => template.format === "REEL")?.designId,
    ).toBe("DAHPcvVkH8k");
    expect(
      data.templates.every(
        (template) =>
          template.status === "UNINSPECTED" && template.fields.length === 0,
      ),
    ).toBe(true);
  });
  it("persists concurrent mutations without losing writes", async () => {
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        mutateWorkspace("operator-1", "TEST", `${index}`, (data) => {
          data.recommendations.push({
            id: `recommendation-${index}`,
            title: "Human review proposal",
            rationale: "Test of persistence",
            status: "PROPOSED",
            createdAt: new Date().toISOString(),
            experimentResult: null,
          });
        }),
      ),
    );
    const data = await getWorkspaceData();
    expect(data.recommendations).toHaveLength(12);
    expect(data.audit).toHaveLength(12);
    expect(
      JSON.parse(await readFile(path.join(directory, "workspace.json"), "utf8"))
        .recommendations,
    ).toHaveLength(12);
  });
  it("serializes independent worker processes that share the demo store", async () => {
    const run = promisify(execFile);
    await Promise.all(
      Array.from({ length: 3 }, (_, index) => {
        const script = `const { mutateWorkspace } = require('./lib/data.ts'); (async () => { for(let i=0;i<4;i++) await mutateWorkspace('system', 'WORKER_TEST', '${index}', data => { data.recommendations.push({id:'worker-${index}-'+i,title:'Fixture',rationale:'Persistence check',status:'PROPOSED',createdAt:new Date().toISOString(),experimentResult:null}); }); })().catch(error => { console.error(error.message); process.exitCode=1; });`;
        return run(
          process.execPath,
          ["node_modules/tsx/dist/cli.mjs", "--eval", script],
          {
            env: {
              ...process.env,
              DEMO_MODE: "true",
              MOVE_DATA_DIR: directory,
            },
          },
        );
      }),
    );
    const data = await getWorkspaceData();
    expect(data.recommendations).toHaveLength(12);
    expect(new Set(data.recommendations.map((entry) => entry.id)).size).toBe(
      12,
    );
    expect(data.audit).toHaveLength(12);
  }, 20_000);

  it("reads older demo snapshots without inventing media or replacing the file", async () => {
    const old = createDemoData() as Partial<ReturnType<typeof createDemoData>>;
    delete old.assets;
    const original = JSON.stringify(old);
    await writeFile(path.join(directory, "workspace.json"), original);
    const data = await getWorkspaceData();
    expect(data.assets).toEqual([]);
    expect(await readFile(path.join(directory, "workspace.json"), "utf8")).toBe(
      original,
    );
  });
  it("rejects corrupt assets instead of silently clearing them", async () => {
    const corrupted = { ...createDemoData(), assets: "invalid" };
    const original = JSON.stringify(corrupted);
    await writeFile(path.join(directory, "workspace.json"), original);
    await expect(getWorkspaceData()).rejects.toThrow("Invalid demo assets");
    expect(await readFile(path.join(directory, "workspace.json"), "utf8")).toBe(
      original,
    );
  });
  it("does not replace corrupt local data", async () => {
    await writeFile(path.join(directory, "workspace.json"), "corrupt");
    await expect(getWorkspaceData()).rejects.toThrow();
    expect(await readFile(path.join(directory, "workspace.json"), "utf8")).toBe(
      "corrupt",
    );
  });
  it("rolls back failed mutations without partial writes or audit success", async () => {
    await expect(
      mutateWorkspace("operator-1", "FAIL", "test", (data) => {
        data.workspaceName = "Incorrect";
        throw new Error("Failed action");
      }),
    ).rejects.toThrow("Failed action");
    const data = await getWorkspaceData();
    expect(data.workspaceName).toBe("THE MOVE OS");
    expect(data.audit).toEqual([]);
  });
  it("supplies demo authentication only in explicit demo mode", async () => {
    const demo = await findUserByEmail("operator1@themove.local");
    expect(demo?.passwordHash).toMatch(/^scrypt:[a-f0-9]+:[a-f0-9]+$/);
    vi.stubEnv("DEMO_MODE", "false");
    vi.stubEnv("DATABASE_URL", "");
    expect(await findUserByEmail("operator1@themove.local")).toBeNull();
    await expect(getWorkspaceData()).rejects.toThrow("DATABASE_URL");
  });
});
