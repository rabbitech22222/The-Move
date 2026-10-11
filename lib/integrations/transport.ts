import { EnvHttpProxyAgent, fetch as undiciFetch } from "undici";
import { isIP } from "node:net";
import { ServiceError } from "../services/errors";

const providerHosts = new Set([
  "api.canva.com",
  "graph.facebook.com",
  "api.openai.com",
]);
let proxyAgent: EnvHttpProxyAgent | undefined;

export function hasEgressProxy(): boolean {
  return Boolean(
    process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy,
  );
}

function dispatcher(): EnvHttpProxyAgent {
  return (proxyAgent ??= new EnvHttpProxyAgent());
}

function inputUrl(input: Parameters<typeof fetch>[0]): URL {
  return new URL(
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input
        : input.url,
  );
}

/** Proxy-aware server transport for a fixed set of official OAuth/API destinations. */
export const providerFetch: typeof fetch = async (input, init) => {
  const url = inputUrl(input);
  if (
    url.protocol !== "https:" ||
    !providerHosts.has(url.hostname) ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ServiceError(
      "INVALID_API_HOST",
      "The provider request is not directed to an approved official HTTPS API.",
    );
  }
  if (!hasEgressProxy())
    return globalThis.fetch(input, { ...init, redirect: "error" });
  return (await undiciFetch(
    input as never,
    { ...init, redirect: "error", dispatcher: dispatcher() } as never,
  )) as unknown as Response;
};

export function isApprovedProxyHost(
  hostname: string,
  type: "source" | "media",
): boolean {
  const configured =
    process.env[
      type === "source"
        ? "SOURCE_PROXY_ALLOWED_HOSTS"
        : "MEDIA_PROXY_ALLOWED_HOSTS"
    ] ?? "";
  const approved = configured
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  // Exact names only; no wildcard, suffix matching, IP address, port, path or credentials.
  return (
    !isIP(hostname) &&
    approved.includes(hostname.toLowerCase()) &&
    /^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(hostname)
  );
}

export function isDnsUnavailable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    ["EAI_AGAIN", "ENOTFOUND"].includes(
      String((error as { code?: string }).code),
    )
  );
}

/** Caller must run the public-URL syntax validator first and recheck every redirect. */
export async function approvedSourceProxyFetch(
  url: URL,
  timeoutMs: number,
): Promise<Response> {
  if (!hasEgressProxy() || !isApprovedProxyHost(url.hostname, "source"))
    throw new ServiceError(
      "SOURCE_NETWORK_UNAVAILABLE",
      "Direct source DNS is unavailable. An administrator may configure this verified public feed host in SOURCE_PROXY_ALLOWED_HOSTS for trusted egress proxy access.",
    );
  return (await undiciFetch(url, {
    redirect: "manual",
    dispatcher: dispatcher(),
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "User-Agent": "THE-MOVE-OS/0.1 (authorized-source-reader)",
      Accept: "application/rss+xml, application/xml, text/xml, */*",
    },
  })) as unknown as Response;
}
