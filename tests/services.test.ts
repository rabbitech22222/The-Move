import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { lookup } from "node:dns/promises";
import { createDemoData } from "../lib/demo";
import type { WorkspaceData } from "../lib/domain";
import * as http from "../lib/integrations/http";
import * as transport from "../lib/integrations/transport";
import { readInsight } from "../lib/integrations/meta";
import {
  validateCopyLayout,
  validateTemplate,
  generateCanvaDesign,
} from "../lib/services/canva";
import {
  assertPublicationApproved,
  publicationFingerprint,
  publishScheduledPublication,
} from "../lib/services/publishing";
import { ServiceError } from "../lib/services/errors";

const fixture = vi.hoisted(() => ({ data: null as WorkspaceData | null }));
vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
vi.mock("../lib/data", () => ({
  getWorkspaceData: vi.fn(async () => structuredClone(fixture.data!)),
  mutateWorkspace: vi.fn(
    async (
      actorId: string,
      action: string,
      entityId: string,
      mutation: (data: WorkspaceData) => void,
    ) => {
      mutation(fixture.data!);
      fixture.data!.audit.unshift({
        id: crypto.randomUUID(),
        actorId,
        action,
        entityId,
        at: new Date().toISOString(),
        details: `${action} ${entityId}`,
      });
      return structuredClone(fixture.data!);
    },
  ),
}));
vi.mock("../lib/credentials", () => ({
  getIntegrationToken: vi.fn(async () => "test-token-not-a-secret"),
}));

beforeEach(() => {
  vi.restoreAllMocks();
  fixture.data = createDemoData();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy transport guardrails", () => {
  const dnsUnavailable = () =>
    Object.assign(new Error("DNS unavailable"), { code: "EAI_AGAIN" });
  it("requires an exact administrator-approved source hostname when DNS is unavailable", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    await expect(
      http.safeFetch("https://rss.example.org/feed"),
    ).rejects.toMatchObject({ code: "SOURCE_NETWORK_UNAVAILABLE" });
  });
  it("allows a bounded response from an approved proxy feed without inventing a DNS address", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "rss.example.org");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    const proxy = vi
      .spyOn(transport, "approvedSourceProxyFetch")
      .mockResolvedValueOnce(new Response("<rss>actual metadata</rss>"));
    const response = await http.safeFetch("https://rss.example.org/feed");
    expect(await response.text()).toContain("actual metadata");
    expect(proxy).toHaveBeenCalledTimes(1);
  });
  it("blocks unapproved proxy redirect destinations", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "rss.example.org");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    vi.spyOn(transport, "approvedSourceProxyFetch").mockResolvedValueOnce(
      new Response(null, {
        status: 302,
        headers: { location: "https://unapproved.example.org/feed" },
      }),
    );
    await expect(
      http.safeFetch("https://rss.example.org/feed"),
    ).rejects.toMatchObject({ code: "UNSAFE_REDIRECT" });
  });
  it("enforces the same response byte limit through the proxy", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "rss.example.org");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    vi.spyOn(transport, "approvedSourceProxyFetch").mockResolvedValueOnce(
      new Response("too many bytes"),
    );
    await expect(
      http.safeFetch("https://rss.example.org/feed", { maxBytes: 5 }),
    ).rejects.toMatchObject({ code: "RESPONSE_TOO_LARGE" });
  });
  it("never bypasses a known private DNS answer even for an approved hostname", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "rss.example.org");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "10.1.1.1", family: 4 },
    ] as never);
    const proxy = vi.spyOn(transport, "approvedSourceProxyFetch");
    await expect(
      http.safeFetch("https://rss.example.org/feed"),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
    expect(proxy).not.toHaveBeenCalled();
  });
  it("validates exact media CDN configuration on DNS-unavailable cloud hosts", async () => {
    vi.stubEnv("MEDIA_PROXY_ALLOWED_HOSTS", "cdn.example.org");
    vi.stubEnv("HTTPS_PROXY", "http://trusted-proxy.invalid:8080");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    expect(
      (await http.validatePublicDestination("https://cdn.example.org/reel.mp4"))
        .hostname,
    ).toBe("cdn.example.org");
    vi.mocked(lookup).mockRejectedValueOnce(dnsUnavailable());
    await expect(
      http.validatePublicDestination(
        "https://cdn.example.org.evil.test/reel.mp4",
      ),
    ).rejects.toMatchObject({ code: "MEDIA_NETWORK_UNAVAILABLE" });
  });
  it("rejects wildcard/suffix lookalikes and arbitrary provider hosts", async () => {
    vi.stubEnv("SOURCE_PROXY_ALLOWED_HOSTS", "*.example.org,rss.example.org");
    expect(transport.isApprovedProxyHost("other.example.org", "source")).toBe(
      false,
    );
    expect(
      transport.isApprovedProxyHost("rss.example.org.evil.test", "source"),
    ).toBe(false);
    await expect(
      transport.providerFetch("https://api.openai.com.evil.test/v1/responses"),
    ).rejects.toMatchObject({ code: "INVALID_API_HOST" });
  });
});

describe("public URL security", () => {
  it.each([
    "0.0.0.0",
    "10.0.0.1",
    "127.0.0.1",
    "169.254.169.254",
    "172.31.2.1",
    "192.168.1.1",
    "100.64.1.1",
    "198.19.1.1",
    "203.0.113.1",
    "224.0.0.1",
    "::1",
    "fc00::1",
    "fe80::1",
    "2001:0db8::1",
    "2001:0000::1",
    "2002:808:808::1",
    "3fff::1",
  ])("blocks private/reserved address %s", (address) => {
    expect(http.isPublicAddress(address)).toBe(false);
  });
  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "2606:4700:4700::1111",
    "2001:4860:4860::8888",
  ])("accepts global address %s", (address) => {
    expect(http.isPublicAddress(address)).toBe(true);
  });
  it.each([
    "http://example.com",
    "https://localhost",
    "https://127.1",
    "https://2130706433",
    "https://[::ffff:127.0.0.1]",
    "https://example.com:8443",
    "https://user:pass@example.com",
  ])("rejects unsafe URL %s", (url) => {
    expect(() => http.validatePublicUrl(url)).toThrow(ServiceError);
  });
  it("keeps valid article query parameters", () => {
    expect(
      http.validatePublicUrl("https://example.com/article?id=12").search,
    ).toBe("?id=12");
  });
  it("never sends an integration token to an arbitrary API host", async () => {
    await expect(
      http.officialApi("https://example.com/private", { token: "test" }),
    ).rejects.toMatchObject({ code: "INVALID_API_HOST" });
  });
  it("rejects mixed public/private DNS answers before making an HTTPS request", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ] as never);
    await expect(
      http.safeFetch("https://rss.example.org/feed"),
    ).rejects.toMatchObject({ code: "UNSAFE_URL" });
  });
  it("binds a resolved public destination to the checked DNS answer", async () => {
    vi.mocked(lookup).mockResolvedValueOnce([
      { address: "8.8.8.8", family: 4 },
    ] as never);
    expect(
      await http.resolvePublicUrl("https://rss.example.org/feed"),
    ).toMatchObject({ address: "8.8.8.8", family: 4 });
  });
  it("treats provider 5xx submissions as ambiguous without automatically retrying", async () => {
    const fetchCall = vi
      .spyOn(transport, "providerFetch")
      .mockResolvedValue(new Response("{}", { status: 503 }));
    await expect(
      http.officialApi("https://api.canva.com/rest/v1/autofills", {
        token: "test",
        method: "POST",
        body: {},
      }),
    ).rejects.toMatchObject({ code: "API_OUTCOME_UNKNOWN" });
    expect(fetchCall).toHaveBeenCalledTimes(1);
  });
});

describe("honest metrics", () => {
  it("distinguishes an observed zero from unavailable metric data", () => {
    expect(
      readInsight(
        { data: [{ name: "reach", total_value: { value: 0 } }] },
        "reach",
      ),
    ).toBe(0);
    expect(readInsight({ data: [] }, "reach")).toBeNull();
    expect(
      readInsight(
        { data: [{ name: "reach", total_value: { value: -1 } }] },
        "reach",
      ),
    ).toBeNull();
  });
});

describe("Canva preservation and capability checks", () => {
  it("requires the exact approved landscape-video reference for THE MOVE reels", () => {
    const template = fixture.data!.templates.find((t) => t.format === "REEL")!;
    expect(() =>
      validateTemplate(template, { format: "REEL", channelId: "the-move" }),
    ).not.toThrow();
    expect(() =>
      validateTemplate(
        { ...template, designId: "OTHER" },
        { format: "REEL", channelId: "the-move" },
      ),
    ).toThrow(/DAHPcvVkH8k/);
    expect(() =>
      validateTemplate(
        { ...template, height: 1080 },
        { format: "REEL", channelId: "the-move" },
      ),
    ).toThrow(/1080/);
  });
  it("rejects estimated text overflow before sending an autofill request", () => {
    expect(() =>
      validateCopyLayout({ HEADLINE: { type: "text", text: "x".repeat(111) } }),
    ).toThrow(/copy limit/);
    expect(() =>
      validateCopyLayout({
        BODY: { type: "text", text: "Readable sourced copy" },
      }),
    ).not.toThrow();
  });
  it("returns an actionable manual reel workflow without creating a provider design", async () => {
    const call = vi.spyOn(http, "officialApi");
    const project = fixture.data!.projects.find(
      (p) => p.id === "demo-project-4",
    )!;
    project.draftCopy = "Verified draft";
    project.sourceUrls = ["https://example.com/research"];
    await expect(
      generateCanvaDesign(project.id, "move-reel-landscape", "operator-1"),
    ).rejects.toMatchObject({ code: "SETUP_REQUIRED" });
    expect(call).not.toHaveBeenCalled();
    expect(fixture.data!.designs).toHaveLength(0);
  });
});

function preparePublication() {
  const data = fixture.data!;
  data.demo = false;
  const project = data.projects.find((p) => p.id === "demo-project-4")!;
  project.stage = "SCHEDULED";
  project.draftCopy = "Reviewed sourced copy.";
  project.sourceUrls = ["https://example.com/research"];
  data.channels.find((c) => c.id === project.channelId)!.platformAccountId =
    "authorized-account";
  data.publications = [
    {
      id: "publication-1",
      projectId: project.id,
      scheduledAt: new Date(Date.now() - 1000).toISOString(),
      status: "SCHEDULED",
      platformPostId: null,
      error: null,
      mediaUrl: "https://example.com/approved-reel.mp4",
      caption: "Reviewed sourced copy.",
    },
  ];
  data.approvals = [
    {
      id: "editorial-approval",
      projectId: project.id,
      kind: "EDITORIAL",
      actorId: "operator-1",
      approvedAt: new Date().toISOString(),
      revisionAt: project.updatedAt,
    },
    {
      id: "approval-1",
      projectId: project.id,
      kind: "PUBLICATION",
      actorId: "operator-1",
      approvedAt: new Date().toISOString(),
      revisionAt: project.updatedAt,
      payloadHash: publicationFingerprint(
        data.publications[0].mediaUrl,
        data.publications[0].caption,
      ),
    },
  ];
  vi.spyOn(http, "validatePublicDestination").mockResolvedValue(
    new URL("https://example.com/approved-reel.mp4"),
  );
  return { data, project };
}

describe("publication approval and duplicate prevention", () => {
  it("binds human publication approval to the exact media URL and caption", async () => {
    const { data } = preparePublication();
    data.publications[0].caption = "Changed after human approval";
    const call = vi.spyOn(http, "officialApi");
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
    expect(call).not.toHaveBeenCalled();
  });
  it("rejects legacy approvals without an approved payload fingerprint", async () => {
    const { data } = preparePublication();
    delete data.approvals.find((a) => a.kind === "PUBLICATION")!.payloadHash;
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "APPROVAL_REQUIRED" });
  });
  it("invalidates publication permission whenever the project revision changes", () => {
    const { data, project } = preparePublication();
    expect(() =>
      assertPublicationApproved(project, data.approvals),
    ).not.toThrow();
    project.updatedAt = new Date(Date.now() + 1000).toISOString();
    expect(() => assertPublicationApproved(project, data.approvals)).toThrow(
      /current project revision/,
    );
  });
  it("does not publish from demo mode even when token and approval exist", async () => {
    const { data } = preparePublication();
    data.demo = true;
    const call = vi.spyOn(http, "officialApi");
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "DEMO_PUBLICATION_DISABLED" });
    expect(call).not.toHaveBeenCalled();
  });
  it("records publishing only after Meta returns the real post ID", async () => {
    const { data, project } = preparePublication();
    const call = vi
      .spyOn(http, "officialApi")
      .mockResolvedValueOnce({ id: "container-1" })
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockImplementationOnce(async () => {
        expect(data.publications[0].status).toBe("RUNNING");
        expect(project.stage).toBe("SCHEDULED");
        return { id: "confirmed-post-1" };
      });
    const result = await publishScheduledPublication(
      "publication-1",
      "operator-1",
    );
    expect(result.status).toBe("PUBLISHED");
    expect(result.platformPostId).toBe("confirmed-post-1");
    expect(call).toHaveBeenCalledTimes(3);
    expect(data.posts.some((p) => p.id === "meta-confirmed-post-1")).toBe(true);
  });
  it("blocks retry after an ambiguous media_publish response", async () => {
    const { data } = preparePublication();
    const call = vi
      .spyOn(http, "officialApi")
      .mockResolvedValueOnce({ id: "container-1" })
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockRejectedValueOnce(
        new ServiceError("API_OUTCOME_UNKNOWN", "Provider outcome unknown."),
      );
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "API_OUTCOME_UNKNOWN" });
    expect(data.publications[0].status).toBe("RUNNING");
    expect(data.publications[0].platformPostId).toBeNull();
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "RECONCILIATION_REQUIRED" });
    expect(call).toHaveBeenCalledTimes(3);
  });
  it("resumes an existing processing container without creating another", async () => {
    const { data } = preparePublication();
    const call = vi
      .spyOn(http, "officialApi")
      .mockResolvedValueOnce({ id: "container-1" })
      .mockResolvedValueOnce({ status_code: "IN_PROGRESS" });
    await expect(
      publishScheduledPublication("publication-1", "operator-1"),
    ).rejects.toMatchObject({ code: "CONTAINER_PROCESSING" });
    expect(data.publications[0].status).toBe("RUNNING");
    call
      .mockResolvedValueOnce({ status_code: "FINISHED" })
      .mockResolvedValueOnce({ id: "confirmed-post-1" });
    await publishScheduledPublication("publication-1", "operator-1");
    expect(call).toHaveBeenCalledTimes(4);
    expect(
      call.mock.calls.filter(
        ([url]) => url.includes("/media?") || url.endsWith("/media"),
      ),
    ).toHaveLength(1);
  });
});
