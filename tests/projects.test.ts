import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { getWorkspaceData } from "../lib/data";
import { projectAction } from "../lib/services/projects";
import {
  assertPublicationApproved,
  publicationFingerprint,
} from "../lib/services/publishing";
describe("editorial approval invariants", () => {
  let directory: string;
  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), "move-editorial-"));
    process.env.DEMO_MODE = "true";
    process.env.MOVE_DATA_DIR = directory;
  });
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
    delete process.env.MOVE_DATA_DIR;
  });
  it("enforces sourced draft, stage order, explicit approval and edit invalidation", async () => {
    const initial = await getWorkspaceData(),
      actor = initial.operators[0].id;
    let workspace = await projectAction(actor, {
      action: "create",
      title: "Approval guard test",
      channelId: initial.channels[0].id,
      operatorId: actor,
      format: "REEL",
    });
    const id = workspace.projects.find(
      (p) => p.title === "Approval guard test",
    )!.id;
    await expect(
      projectAction(actor, {
        action: "transition",
        projectId: id,
        stage: "PUBLISHED",
      }),
    ).rejects.toThrow();
    await expect(
      projectAction(actor, {
        action: "transition",
        projectId: id,
        stage: "REVIEW",
      }),
    ).rejects.toThrow();
    for (const stage of ["RESEARCH", "DRAFT", "DESIGN", "REVIEW"] as const)
      await projectAction(actor, {
        action: "transition",
        projectId: id,
        stage,
      });
    await expect(
      projectAction(actor, { action: "approve", projectId: id }),
    ).rejects.toThrow("sourced draft");
    await projectAction(actor, {
      action: "update",
      projectId: id,
      draftCopy: "Verified draft references the supplied source.",
      sourceUrls: ["https://example.com/editorial-fixture"],
    });
    workspace = await projectAction(actor, {
      action: "approve",
      projectId: id,
    });
    const approved = workspace.projects.find((p) => p.id === id)!;
    expect(approved.stage).toBe("APPROVED");
    expect(
      workspace.approvals.find((a) => a.projectId === id)?.revisionAt,
    ).toBe(approved.updatedAt);
    const timeOnly = await projectAction(actor, {
      action: "track-time",
      projectId: id,
      minutes: 12,
    });
    expect(timeOnly.approvals.filter((a) => a.projectId === id)).toHaveLength(
      1,
    );
    expect(timeOnly.projects.find((p) => p.id === id)?.updatedAt).toBe(
      approved.updatedAt,
    );
    workspace = await projectAction(actor, {
      action: "update",
      projectId: id,
      draftCopy: "A changed draft requires a new review.",
    });
    expect(workspace.projects.find((p) => p.id === id)?.stage).toBe("REVIEW");
    expect(workspace.approvals.filter((a) => a.projectId === id)).toHaveLength(
      0,
    );
  });
  it("a content approval alone never authorizes publication", async () => {
    const data = await getWorkspaceData();
    const project = {
      ...data.projects[0],
      stage: "APPROVED" as const,
      draftCopy: "reviewed content",
      sourceUrls: ["https://example.com/fixture"],
    };
    expect(() =>
      assertPublicationApproved(project, [
        {
          id: "test",
          projectId: project.id,
          actorId: data.operators[0].id,
          kind: "EDITORIAL",
          approvedAt: project.updatedAt,
          revisionAt: project.updatedAt,
        },
      ]),
    ).toThrow();
    expect(
      publicationFingerprint("https://example.com/a.mp4", "caption"),
    ).not.toBe(publicationFingerprint("https://example.com/b.mp4", "caption"));
    expect(
      publicationFingerprint("https://example.com/a.mp4", "caption"),
    ).not.toBe(publicationFingerprint("https://example.com/a.mp4", "changed"));
  });
});
