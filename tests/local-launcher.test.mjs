import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, readFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { findNpmCli, runCheckedProcess } from "../scripts/local-process.mjs";

describe("local setup process supervision", () => {
  it("executes the installed npm CLI directly without a command shell", async () => {
    let output = "";
    await runCheckedProcess({
      args: [findNpmCli(), "--version"], label: "npm check", timeoutMs: 10000,
      output: text => { output += text; },
    });
    expect(output).toMatch(/\d+\.\d+\.\d+/);
    expect(output).not.toContain("DEP0190");
  });

  it("finds npm in a Node installation directory containing spaces", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "move Node installation "));
    try {
      const cli = path.join(root, "node_modules/npm/bin/npm-cli.js");
      await mkdir(path.dirname(cli), { recursive: true });
      await writeFile(cli, "// fixture");
      expect(findNpmCli(path.join(root, "node.exe"), "", null)).toBe(await realpath(cli));
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("reports a failed process exit without calling it successful", async () => {
    let output = "";
    await expect(runCheckedProcess({
      args: ["-e", "process.exit(37)"], label: "failed install", timeoutMs: 10000,
      output: text => { output += text; },
    })).rejects.toThrow("37");
    expect(output).not.toContain("완료");
  });

  it("terminates a stalled process and exposes elapsed time and a timeout", async () => {
    let child;
    let output = "";
    await expect(runCheckedProcess({
      args: ["-e", "setInterval(() => {}, 1000)"], label: "stalled install",
      timeoutMs: 150, heartbeatMs: 30,
      onChild: current => { if (current) child = current; },
      output: text => { output += text; },
    })).rejects.toThrow("시간 제한");
    expect(output).toContain("실행 중");
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
    expect(output).not.toContain("완료");
  });

  it("rejects a missing executable instead of waiting indefinitely", async () => {
    await expect(runCheckedProcess({
      command: path.join(tmpdir(), "missing-move-executable"), args: [],
      label: "missing command", timeoutMs: 10000, output: () => {},
    })).rejects.toThrow("시작하지 못했습니다");
  });

  it("redacts URL credentials from console output and the diagnostic log", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "move-log-check-"));
    try {
      const logFile = path.join(root, "setup.log");
      let output = "";
      await runCheckedProcess({
        args: ["-e", 'console.log("https://fixture-user:fixture-password@example.com/package?token=fixture-token")'],
        label: "log check", logFile, output: text => { output += text; },
      });
      const log = await readFile(logFile, "utf8");
      for (const text of [output, log]) {
        expect(text).not.toContain("fixture-password");
        expect(text).not.toContain("fixture-token");
        expect(text).toContain("example.com");
      }
    } finally { await rm(root, { recursive: true, force: true }); }
  });
});
