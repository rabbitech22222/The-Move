import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceBase } from "../lib/demo";
import type { WorkspaceData } from "../lib/domain";
import * as http from "../lib/integrations/http";
import * as transport from "../lib/integrations/transport";
import { connectCanvaAccount } from "../lib/integrations/canva-account";
import { uploadCanvaAsset } from "../lib/services/canva-assets";
import { refreshCanvaDesign } from "../lib/services/canva";
import { saveIntegrationToken } from "../lib/credentials";
import { enqueueTask, processTask } from "../lib/jobs";
const fixture = vi.hoisted(() => ({ data: null as WorkspaceData | null }));
vi.mock("../lib/data", () => ({
  getWorkspaceData: async () => structuredClone(fixture.data!),
  mutateWorkspace: async (
    _actor: string,
    _action: string,
    _id: string,
    fn: (d: WorkspaceData) => void,
  ) => {
    fn(fixture.data!);
    return structuredClone(fixture.data!);
  },
}));
vi.mock("../lib/credentials", () => ({
  getIntegrationToken: async () => "fixture-token-never-sent-to-a-provider",
  saveIntegrationToken: vi.fn(async () => {}),
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  fixture.data = createWorkspaceBase(false);
  fixture.data.projects.push({
    id: "project",
    title: "Contract fixture production",
    channelId: "the-move",
    operatorId: "operator-1",
    stage: "DESIGN",
    format: "CAROUSEL",
    draftCopy: "Sourced fixture copy",
    sourceUrls: ["https://news.example.org/article"],
    dueAt: null,
    productionMinutes: 0,
    revisions: [],
    updatedAt: new Date().toISOString(),
  });
  fixture.data.assets.push({
    id: "asset",
    projectId: "project",
    kind: "IMAGE",
    url: "https://media.example.org/owned.png",
    credit: "Fixture owner approved",
    width: 1080,
    height: 1350,
    approved: true,
    createdAt: new Date().toISOString(),
  });
  vi.stubEnv("LOCAL_MODE", "true");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("REDIS_URL", "");
});
afterEach(() => vi.unstubAllEnvs());
describe("Canva account and upload contracts — provider responses are replaced", () => {
  it("does not accept a link to a different design as the generated editable result", async () => {
    fixture.data!.designs.push({
      id: "design",
      projectId: "project",
      templateId: "move-carousel-1",
      status: "QUEUED",
      externalId: "job:autofill111",
      editUrl: null,
      error: null,
      createdAt: new Date().toISOString(),
    });
    vi.spyOn(http, "officialApi").mockResolvedValue({
      job: {
        id: "autofill111",
        status: "success",
        result: {
          design: {
            id: "NEWDESIGN111",
            urls: {
              edit_url: "https://www.canva.com/design/DIFFERENT111/edit",
            },
          },
        },
      },
    });
    await expect(
      refreshCanvaDesign("design", "operator-1"),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    expect(fixture.data!.designs[0].editUrl).toBeNull();
    expect(fixture.data!.projects[0].stage).toBe("DESIGN");
  });
  it("rejects missing reference access and preserves existing credentials", async () => {
    vi.spyOn(http, "officialApi").mockRejectedValue(new Error("scope denied"));
    await expect(
      connectCanvaAccount("operator-1", "supplied-fixture-token"),
    ).rejects.toMatchObject({ code: "CANVA_REFERENCE_ACCESS_REQUIRED" });
    expect(saveIntegrationToken).not.toHaveBeenCalled();
    expect(fixture.data!.templates.every((t) => t.inspectedAt === null)).toBe(
      true,
    );
  });
  it("inspects actual source IDs and keeps an empty dataset in setup-required state", async () => {
    const get = vi
      .spyOn(http, "officialApi")
      .mockImplementation(async (value) => {
        const url = String(value);
        if (url.endsWith("/dataset")) return { dataset: {} };
        return {
          design: {
            id: url.split("/").at(-1),
            title: "Provider fixture title",
            page_count: 5,
            thumbnail: { url: "https://cdn.example.org/source.png" },
          },
        };
      });
    const result = await connectCanvaAccount(
      "operator-1",
      "supplied-fixture-token",
    );
    expect(result.accessible).toHaveLength(3);
    expect(result.failures).toHaveLength(3);
    expect(saveIntegrationToken).toHaveBeenCalledOnce();
    expect(
      fixture.data!.templates.every(
        (t) =>
          t.status === "SETUP_REQUIRED" &&
          t.configuration?.previewUrl &&
          t.configuration.inspectionError,
      ),
    ).toBe(true);
    expect(
      get.mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET",
      ),
    ).toBe(true);
  });
  it("blocks unapproved media before network activity", async () => {
    fixture.data!.assets[0].approved = false;
    const source = vi.spyOn(http, "safeFetch");
    const upload = vi.spyOn(transport, "providerFetch");
    await expect(uploadCanvaAsset("asset", "operator-1")).rejects.toMatchObject(
      { code: "ASSET_APPROVAL_REQUIRED" },
    );
    expect(source).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it("uploads bytes with the official metadata header and waits for a confirmed asset ID", async () => {
    vi.spyOn(http, "safeFetch").mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png" },
      }),
    );
    const upload = vi
      .spyOn(transport, "providerFetch")
      .mockResolvedValue(
        new Response(
          JSON.stringify({ job: { id: "job111", status: "in_progress" } }),
        ),
      );
    const waiting = await uploadCanvaAsset("asset", "operator-1");
    expect(waiting.canvaUploadJobId).toBe("job111");
    expect(waiting.canvaAssetId).toBeUndefined();
    expect(upload.mock.calls[0][0]).toBe(
      "https://api.canva.com/rest/v1/asset-uploads",
    );
    const init = upload.mock.calls[0][1]!;
    expect(init.headers).toMatchObject({
      "Content-Type": "application/octet-stream",
    });
    const metadata = JSON.parse(
      (init.headers as Record<string, string>)["Asset-Upload-Metadata"],
    );
    expect(Buffer.from(metadata.name_base64, "base64").toString()).toContain(
      "THE MOVE",
    );
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    vi.spyOn(http, "officialApi").mockResolvedValue({
      job: {
        id: "job111",
        status: "success",
        asset: { id: "MactualFixture111", type: "image" },
      },
    });
    const finished = await uploadCanvaAsset("asset", "operator-1", true);
    expect(finished.canvaAssetId).toBe("MactualFixture111");
    expect(upload).toHaveBeenCalledOnce();
  });
  it("prevents duplicate submission when the provider response is ambiguous", async () => {
    vi.spyOn(http, "safeFetch").mockResolvedValue(
      new Response("media-bytes", { headers: { "content-type": "image/png" } }),
    );
    const upload = vi
      .spyOn(transport, "providerFetch")
      .mockRejectedValue(new Error("connection ended"));
    await expect(uploadCanvaAsset("asset", "operator-1")).rejects.toMatchObject(
      { code: "API_OUTCOME_UNKNOWN" },
    );
    expect(fixture.data!.assets[0].canvaUploadJobId).toBe("pending");
    await expect(uploadCanvaAsset("asset", "operator-1")).rejects.toMatchObject(
      { code: "RECONCILIATION_REQUIRED" },
    );
    expect(upload).toHaveBeenCalledOnce();
  });
  it("does not store success for an asset type mismatch", async () => {
    fixture.data!.assets[0].canvaUploadJobId = "job111";
    vi.spyOn(http, "officialApi").mockResolvedValue({
      job: {
        id: "job111",
        status: "success",
        asset: { id: "video111", type: "video" },
      },
    });
    await expect(
      uploadCanvaAsset("asset", "operator-1", true),
    ).rejects.toMatchObject({ code: "INVALID_API_RESPONSE" });
    expect(fixture.data!.assets[0].canvaAssetId).toBeUndefined();
  });
  it("keeps the result task queued while Canva is processing and completes it only after the new design arrives", async () => {
    fixture.data!.designs.push({
      id: "design",
      projectId: "project",
      templateId: "move-carousel-1",
      status: "QUEUED",
      externalId: "job:autofill111",
      editUrl: null,
      error: null,
      createdAt: new Date().toISOString(),
    });
    const api = vi
      .spyOn(http, "officialApi")
      .mockResolvedValueOnce({
        job: { id: "autofill111", status: "in_progress" },
      });
    const task = await enqueueTask(
      "CANVA_RESULT",
      { designId: "design" },
      "operator-1",
    );
    const input = {
      taskId: task.id,
      kind: "CANVA_RESULT" as const,
      payload: { designId: "design" },
      actorId: "operator-1",
    };
    await expect(processTask(input)).rejects.toMatchObject({
      code: "CANVA_PROCESSING",
    });
    expect(fixture.data!.tasks[0].status).toBe("QUEUED");
    expect(fixture.data!.designs[0].editUrl).toBeNull();
    api.mockResolvedValueOnce({
      job: {
        id: "autofill111",
        status: "success",
        result: {
          design: {
            id: "NEWDESIGN111",
            urls: {
              edit_url: "https://www.canva.com/design/NEWDESIGN111/edit",
            },
          },
        },
      },
    });
    await processTask(input);
    expect(fixture.data!.tasks[0].status).toBe("SUCCEEDED");
    expect(fixture.data!.projects[0].stage).toBe("REVIEW");
    expect(fixture.data!.publications).toEqual([]);
    expect(
      api.mock.calls.every(
        ([, options]) => !options?.method || options.method === "GET",
      ),
    ).toBe(true);
  });
});
