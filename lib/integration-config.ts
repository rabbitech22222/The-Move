import { readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { encryptToken, decryptToken, type Provider } from "./credentials";
import { withLocalFileLock } from "./data";
import { usesLocalFiles } from "./runtime";
import { prisma } from "./prisma";
import { ServiceError } from "./services/errors";

export interface OAuthClient {
  clientId: string;
  secret: string;
}
const filename = () =>
  path.resolve(process.env.MOVE_DATA_DIR || ".move-data", "oauth-apps.json");
async function localRecords(): Promise<Partial<Record<Provider, string>>> {
  try {
    return JSON.parse(await readFile(filename(), "utf8"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw error;
  }
}
export async function getOAuthClient(
  provider: Provider,
): Promise<OAuthClient | null> {
  const clientId =
    process.env[provider === "canva" ? "CANVA_CLIENT_ID" : "META_APP_ID"];
  const secret =
    process.env[
      provider === "canva" ? "CANVA_CLIENT_SECRET" : "META_APP_SECRET"
    ];
  if (clientId && secret) return { clientId, secret };
  const encrypted = usesLocalFiles()
    ? (await localRecords())[provider]
    : (
        await prisma.integrationCredential.findUnique({
          where: {
            workspaceId_provider: {
              workspaceId: "the-move",
              provider: `${provider}:oauth-app`,
            },
          },
        })
      )?.encryptedToken;
  return encrypted
    ? (JSON.parse(decryptToken(encrypted)) as OAuthClient)
    : null;
}
export async function saveOAuthClient(provider: Provider, config: OAuthClient) {
  const encrypted = encryptToken(JSON.stringify(config));
  if (usesLocalFiles())
    await withLocalFileLock(async () => {
      const records = await localRecords();
      records[provider] = encrypted;
      const temporary = `${filename()}.${randomUUID()}.tmp`;
      await writeFile(temporary, JSON.stringify(records), { mode: 0o600 });
      await rename(temporary, filename());
    }, filename());
  else
    await prisma.integrationCredential.upsert({
      where: {
        workspaceId_provider: {
          workspaceId: "the-move",
          provider: `${provider}:oauth-app`,
        },
      },
      create: {
        workspaceId: "the-move",
        provider: `${provider}:oauth-app`,
        encryptedToken: encrypted,
      },
      update: { encryptedToken: encrypted },
    });
}
export async function resolvedOAuthConfig(provider: Provider) {
  const client = await getOAuthClient(provider);
  if (!client || !process.env.APP_URL)
    throw new ServiceError(
      "OAUTH_SETUP_REQUIRED",
      "설정에서 공식 개발자 앱의 클라이언트 ID·비밀 키와 콜백 주소를 먼저 설정하세요.",
      409,
    );
  return {
    ...client,
    redirectUri: `${process.env.APP_URL.replace(/\/$/, "")}/api/oauth/${provider}/callback`,
  };
}
