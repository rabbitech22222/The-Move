import { providerFetch } from "@/lib/integrations/transport";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/prisma";
export type Provider = "canva" | "meta";
interface Credential {
  encryptedToken: string;
  encryptedRefreshToken: string | null;
  expiresAt: string | null;
}
function key() {
  const value = process.env.TOKEN_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value))
    throw new Error(
      "TOKEN_ENCRYPTION_KEY must be a random 32-byte hexadecimal key.",
    );
  return Buffer.from(value, "hex");
}
export function encryptToken(token: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  return [
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    data.toString("base64url"),
  ].join(".");
}
export function decryptToken(encoded: string) {
  const parts = encoded.split(".");
  if (parts.length !== 3) throw new Error("Invalid encrypted credential");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(),
    Buffer.from(parts[0], "base64url"),
  );
  decipher.setAuthTag(Buffer.from(parts[1], "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[2], "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
const file = () =>
  path.resolve(process.env.MOVE_DATA_DIR || ".move-data", "credentials.json");
async function readLocal(): Promise<Partial<Record<Provider, Credential>>> {
  try {
    return JSON.parse(await readFile(file(), "utf8"));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}
let writeChain: Promise<void> = Promise.resolve();
export async function saveIntegrationToken(
  provider: Provider,
  token: string,
  refreshToken?: string,
  expiresIn?: number,
) {
  const record: Credential = {
    encryptedToken: encryptToken(token),
    encryptedRefreshToken: refreshToken ? encryptToken(refreshToken) : null,
    expiresAt: expiresIn
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null,
  };
  if (process.env.DEMO_MODE === "true") {
    const save = writeChain.then(async () => {
      const data = await readLocal();
      data[provider] = record;
      await mkdir(path.dirname(file()), { recursive: true });
      const temporary = `${file()}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, JSON.stringify(data), { mode: 0o600 });
      await rename(temporary, file());
    });
    writeChain = save.catch(() => {});
    await save;
  } else {
    await prisma.integrationCredential.upsert({
      where: { workspaceId_provider: { workspaceId: "the-move", provider } },
      create: {
        workspaceId: "the-move",
        provider,
        ...record,
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
      },
      update: {
        ...record,
        expiresAt: record.expiresAt ? new Date(record.expiresAt) : null,
      },
    });
  }
}
async function stored(provider: Provider): Promise<Credential | null> {
  if (process.env.DEMO_MODE === "true")
    return (await readLocal())[provider] || null;
  const value = await prisma.integrationCredential.findUnique({
    where: { workspaceId_provider: { workspaceId: "the-move", provider } },
  });
  return value
    ? {
        encryptedToken: value.encryptedToken,
        encryptedRefreshToken: value.encryptedRefreshToken,
        expiresAt: value.expiresAt?.toISOString() || null,
      }
    : null;
}
export async function getIntegrationToken(
  provider: Provider,
): Promise<string | null> {
  const record = await stored(provider);
  if (record) {
    if (
      record.expiresAt &&
      new Date(record.expiresAt).getTime() <= Date.now() + 30_000
    ) {
      if (
        provider === "canva" &&
        record.encryptedRefreshToken &&
        process.env.CANVA_CLIENT_ID &&
        process.env.CANVA_CLIENT_SECRET
      ) {
        const r = await providerFetch(
          "https://api.canva.com/rest/v1/oauth/token",
          {
            method: "POST",
            headers: {
              Authorization: `Basic ${Buffer.from(`${process.env.CANVA_CLIENT_ID}:${process.env.CANVA_CLIENT_SECRET}`).toString("base64")}`,
              "Content-Type": "application/x-www-form-urlencoded",
            },
            body: new URLSearchParams({
              grant_type: "refresh_token",
              refresh_token: decryptToken(record.encryptedRefreshToken),
            }),
            signal: AbortSignal.timeout(20000),
          },
        );
        if (!r.ok)
          throw new Error("Canva token refresh failed; reconnect in Settings.");
        const token = await r.json();
        if (typeof token.access_token !== "string")
          throw new Error("Canva returned no access token.");
        await saveIntegrationToken(
          provider,
          token.access_token,
          token.refresh_token,
          token.expires_in,
        );
        return token.access_token;
      }
      throw new Error(
        `${provider} authorization expired; reconnect in Settings.`,
      );
    }
    return decryptToken(record.encryptedToken);
  }
  return (
    process.env[
      provider === "canva" ? "CANVA_ACCESS_TOKEN" : "META_ACCESS_TOKEN"
    ] || null
  );
}
export async function credentialStatus(provider: Provider) {
  const r = await stored(provider);
  return {
    configured:
      !!r ||
      !!process.env[
        provider === "canva" ? "CANVA_ACCESS_TOKEN" : "META_ACCESS_TOKEN"
      ],
    expired: !!r?.expiresAt && new Date(r.expiresAt).getTime() < Date.now(),
  };
}
