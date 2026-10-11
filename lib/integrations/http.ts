import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { ServiceError } from "../services/errors";
import {
  approvedSourceProxyFetch,
  hasEgressProxy,
  isApprovedProxyHost,
  isDnsUnavailable,
  providerFetch,
} from "./transport";

/** Restrict source fetches to globally routable hosts. DNS answers are pinned per request. */
export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const octets = address.split(".").map(Number);
    const [a, b, c] = octets;
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 192 && b === 88 && c === 99) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113)
    );
  }
  if (isIP(address) === 6) {
    const [left, right = ""] = address.toLowerCase().split("::");
    const start = left ? left.split(":") : [];
    const end = right ? right.split(":") : [];
    const groups = address.includes("::")
      ? [...start, ...Array(8 - start.length - end.length).fill("0"), ...end]
      : start;
    if (
      groups.length !== 8 ||
      groups.some((group) => !/^[0-9a-f]{1,4}$/.test(group))
    )
      return false;
    const integer = BigInt(
      `0x${groups.map((group) => group.padStart(4, "0")).join("")}`,
    );
    const prefix = (hex: string, bits: number) =>
      integer >> BigInt(128 - bits) ===
      BigInt(`0x${hex}`) >> BigInt(128 - bits);
    // Only global unicast 2000::/3; exclude special-purpose, documentation and transition ranges.
    return (
      prefix("20000000000000000000000000000000", 3) &&
      !prefix("20010000000000000000000000000000", 23) &&
      !prefix("20010db8000000000000000000000000", 32) &&
      !prefix("20020000000000000000000000000000", 16) &&
      !prefix("3fff0000000000000000000000000000", 20)
    );
  }
  return false;
}

export function validatePublicUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new ServiceError(
      "INVALID_URL",
      "A valid HTTPS source or media URL is required.",
    );
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443")
  ) {
    throw new ServiceError(
      "UNSAFE_URL",
      "Use a public HTTPS URL on port 443 without embedded credentials.",
    );
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    (isIP(hostname) && !isPublicAddress(hostname))
  ) {
    throw new ServiceError(
      "UNSAFE_URL",
      "Private, loopback, and reserved network destinations are not allowed.",
    );
  }
  return url;
}

export async function resolvePublicUrl(
  value: string,
): Promise<{ url: URL; address: string; family: number }> {
  const url = validatePublicUrl(value);
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const answers = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (
    !answers.length ||
    answers.some((answer) => !isPublicAddress(answer.address))
  ) {
    throw new ServiceError(
      "UNSAFE_URL",
      "The destination resolves to a private or reserved address.",
    );
  }
  return { url, ...answers[0] };
}

async function sourceViaProxy(
  syntaxUrl: URL,
  options: { maxBytes?: number; timeoutMs?: number },
  redirects: number,
): Promise<Response> {
  const response = await approvedSourceProxyFetch(
    syntaxUrl,
    options.timeoutMs ?? 15_000,
  );
  if ([301, 302, 303, 307, 308].includes(response.status)) {
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (redirects >= 3 || !location)
      throw new ServiceError(
        "UNSAFE_REDIRECT",
        "The source exceeded the allowed redirect limit.",
      );
    const next = validatePublicUrl(new URL(location, syntaxUrl).toString());
    if (!isApprovedProxyHost(next.hostname, "source"))
      throw new ServiceError(
        "UNSAFE_REDIRECT",
        "The source redirects to a host outside the administrator-approved proxy source list.",
      );
    return safeFetch(next.toString(), options, redirects + 1);
  }
  const reader = response.body?.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > (options.maxBytes ?? 2_000_000)) {
        await reader.cancel();
        throw new ServiceError(
          "RESPONSE_TOO_LARGE",
          "The source response exceeds the configured size limit.",
        );
      }
      parts.push(chunk.value);
    }
  }
  return new Response(new Uint8Array(Buffer.concat(parts)), {
    status: response.status,
    headers: response.headers,
  });
}

export async function safeFetch(
  value: string,
  options: { maxBytes?: number; timeoutMs?: number } = {},
  redirects = 0,
): Promise<Response> {
  const syntaxUrl = validatePublicUrl(value);
  let destination: Awaited<ReturnType<typeof resolvePublicUrl>>;
  try {
    destination = await resolvePublicUrl(value);
  } catch (error) {
    if (!isDnsUnavailable(error)) throw error;
    return sourceViaProxy(syntaxUrl, options, redirects);
  }
  if (hasEgressProxy() && isApprovedProxyHost(syntaxUrl.hostname, "source"))
    return sourceViaProxy(syntaxUrl, options, redirects);
  const { url, address, family } = destination;
  const maxBytes = options.maxBytes ?? 2_000_000;
  const result = await new Promise<{
    status: number;
    headers: Record<string, string>;
    body: Buffer;
  }>((resolve, reject) => {
    const req = request(
      url,
      {
        method: "GET",
        headers: {
          "User-Agent": "THE-MOVE-OS/0.1 (authorized-source-reader)",
          Accept: "application/rss+xml, application/xml, text/xml, */*",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, address, family),
      },
      (res) => {
        const parts: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > maxBytes)
            req.destroy(
              new ServiceError(
                "RESPONSE_TOO_LARGE",
                "The source response exceeds the configured size limit.",
              ),
            );
          else parts.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const [key, v] of Object.entries(res.headers))
            if (v !== undefined)
              headers[key] = Array.isArray(v) ? v.join(", ") : v;
          resolve({
            status: res.statusCode ?? 502,
            headers,
            body: Buffer.concat(parts),
          });
        });
      },
    );
    req.setTimeout(options.timeoutMs ?? 15_000, () =>
      req.destroy(
        new ServiceError(
          "SOURCE_TIMEOUT",
          "The source did not respond within the time limit.",
        ),
      ),
    );
    req.on("error", reject);
    req.end();
  });
  if ([301, 302, 303, 307, 308].includes(result.status)) {
    if (redirects >= 3 || !result.headers.location)
      throw new ServiceError(
        "UNSAFE_REDIRECT",
        "The source exceeded the allowed redirect limit.",
      );
    // Validate and resolve each destination independently; never forward authentication.
    return safeFetch(
      new URL(result.headers.location, url).toString(),
      options,
      redirects + 1,
    );
  }
  return new Response(new Uint8Array(result.body), {
    status: result.status,
    headers: result.headers,
  });
}

/** For provider-fetched media: proxy fallback trusts only explicitly verified public CDN hosts. */
export async function validatePublicDestination(value: string): Promise<URL> {
  const url = validatePublicUrl(value);
  try {
    return (await resolvePublicUrl(value)).url;
  } catch (error) {
    if (
      isDnsUnavailable(error) &&
      hasEgressProxy() &&
      isApprovedProxyHost(url.hostname, "media")
    )
      return url;
    if (isDnsUnavailable(error))
      throw new ServiceError(
        "MEDIA_NETWORK_UNAVAILABLE",
        "Direct media DNS is unavailable. Verify a public asset CDN and configure its exact hostname in MEDIA_PROXY_ALLOWED_HOSTS; private destinations are never permitted.",
      );
    throw error;
  }
}

export interface ApiRequestOptions {
  method?: "GET" | "POST";
  body?: unknown;
  token: string;
  retryReads?: boolean;
}
const apiHosts = new Set(["api.canva.com", "graph.facebook.com"]);

/** Fixed official endpoints; only reads retry automatically. Writes require reconciliation. */
export async function officialApi<T>(
  url: string,
  options: ApiRequestOptions,
): Promise<T> {
  const target = new URL(url);
  if (
    target.protocol !== "https:" ||
    !apiHosts.has(target.hostname) ||
    target.username ||
    target.password
  ) {
    throw new ServiceError(
      "INVALID_API_HOST",
      "The integration endpoint is not an approved official API host.",
    );
  }
  const read = !options.method || options.method === "GET";
  for (let attempt = 0; ; attempt++) {
    let response: Response;
    try {
      response = await providerFetch(target, {
        method: options.method ?? "GET",
        redirect: "error",
        signal: AbortSignal.timeout(20_000),
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
        },
        ...(options.body !== undefined
          ? { body: JSON.stringify(options.body) }
          : {}),
      });
    } catch {
      throw new ServiceError(
        read ? "API_UNAVAILABLE" : "API_OUTCOME_UNKNOWN",
        read
          ? "The provider request failed. Check connectivity and try again."
          : "The provider submission outcome is unknown. Reconcile the provider result before retrying.",
        502,
      );
    }
    if (
      read &&
      options.retryReads !== false &&
      attempt < 2 &&
      (response.status === 429 || response.status >= 500)
    ) {
      const delay = Math.min(
        10_000,
        Math.max(
          500,
          Number(response.headers.get("retry-after") ?? 0) * 1000 ||
            500 * 2 ** attempt,
        ),
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      continue;
    }
    if (!response.ok) {
      if (!read && response.status >= 500)
        throw new ServiceError(
          "API_OUTCOME_UNKNOWN",
          `The provider returned HTTP ${response.status} after submission. Reconcile its result before retrying.`,
          502,
        );
      // Avoid recording provider error payloads, which can contain sensitive query data.
      throw new ServiceError(
        response.status === 401 || response.status === 403
          ? "AUTHORIZATION_REQUIRED"
          : response.status === 429
            ? "RATE_LIMITED"
            : "API_REJECTED",
        `The provider returned HTTP ${response.status}. Check the required scopes, account permissions, and request configuration.`,
        response.status,
      );
    }
    try {
      return (await response.json()) as T;
    } catch {
      throw new ServiceError(
        read ? "INVALID_API_RESPONSE" : "API_OUTCOME_UNKNOWN",
        "The provider returned an unreadable result; reconcile submissions before retrying.",
        502,
      );
    }
  }
}
