import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getWorkspaceData } from "../lib/data";
import { projectAction } from "../lib/services/projects";
import {
  validateManualDesignLink,
  registerManualDesign,
} from "../lib/services/canva";
let directory: string;
beforeEach(async () => {
  directory = await mkdtemp(path.join(tmpdir(), "move-canva-manual-"));
  vi.stubEnv("DEMO_MODE", "true");
  vi.stubEnv("MOVE_DATA_DIR", directory);
});
afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(directory, { recursive: true, force: true });
});
describe("manual Canva alternative", () => {
  it.each([
    "https://www.canva.com/design/DAHPcvVkH8k/edit",
    "https://www.canva.com/design/DAHPXU1IGDI/edit",
    "https://www.canva.com.evil.test/design/NEW/edit",
    "http://www.canva.com/design/NEW/edit",
    "https://secret:token@www.canva.com/design/NEW/edit",
    "https://www.canva.com/design/NEW/view",
  ])("rejects protected or unsafe editable link %s", (url) => {
    expect(() => validateManualDesignLink(url)).toThrow();
  });
  it("stores a new operator-submitted copy in review, with no claimed API generation", async () => {
    const data = await getWorkspaceData();
    const actor = data.operators[0].id;
    let workspace = await projectAction(actor, {
      action: "create",
      title: "Manual reel fixture",
      channelId: "the-move",
      operatorId: actor,
      format: "REEL",
      sourceUrls: ["https://example.com/manual-reference"],
      draftCopy: "A sourced draft awaiting human visual review.",
    });
    const project = workspace.projects.find(
      (p) => p.title === "Manual reel fixture",
    )!;
    const template = data.templates.find((t) => t.designId === "DAHPcvVkH8k")!;
    await expect(
      registerManualDesign(
        project.id,
        template.id,
        {
          editUrl: "https://www.canva.com/design/NEW_MANUAL_FIXTURE/edit",
          pageCount: 1,
          preservedLayout: true,
        },
        actor,
      ),
    ).rejects.toMatchObject({ code: "INVALID_STAGE" });
    for (const stage of ["RESEARCH", "DRAFT", "DESIGN"] as const)
      await projectAction(actor, {
        action: "transition",
        projectId: project.id,
        stage,
      });
    const design = await registerManualDesign(
      project.id,
      template.id,
      {
        editUrl:
          "https://www.canva.com/design/NEW_MANUAL_FIXTURE/edit?utm_source=test",
        pageCount: 1,
        preservedLayout: true,
      },
      actor,
    );
    expect(design.status).toBe("MANUAL_REVIEW");
    expect(design.error).toContain("확인되지 않았습니다");
    expect(design.editUrl).not.toContain("utm_source");
    workspace = await getWorkspaceData();
    expect(workspace.projects.find((p) => p.id === project.id)?.stage).toBe(
      "REVIEW",
    );
    expect(
      workspace.approvals.filter((a) => a.projectId === project.id),
    ).toHaveLength(0);
    expect(
      workspace.audit.some((a) => a.action === "CANVA_MANUAL_COPY_SUBMITTED"),
    ).toBe(true);
    await expect(
      registerManualDesign(
        project.id,
        template.id,
        { editUrl: design.editUrl!, pageCount: 1, preservedLayout: true },
        actor,
      ),
    ).rejects.toMatchObject({ code: "DUPLICATE_DESIGN" });
  });
});
