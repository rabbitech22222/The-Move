import { getIntegrationToken, saveIntegrationToken } from "../credentials";
import { getWorkspaceData, mutateWorkspace } from "../data";
import { ServiceError } from "../services/errors";
import { officialApi } from "./http";
import { metaApiBase } from "./meta";
export const THE_MOVE_USERNAME = "themovemag_";
export const THE_MOVE_HANDLE = "@themovemag_";
export function assertTheMoveIdentity(
  account: { id?: string; username?: string },
  expectedId?: string,
) {
  if (
    !account.id ||
    !/^\d+$/.test(account.id) ||
    account.username?.toLowerCase() !== THE_MOVE_USERNAME ||
    (expectedId && account.id !== expectedId)
  )
    throw new ServiceError(
      "ACCOUNT_MISMATCH",
      "인증된 계정이 @themovemag_와 일치하지 않습니다. 해당 계정의 관리 권한으로 다시 연결하세요.",
      409,
    );
}
export async function verifyTheMoveAccount(accountId: string, token: string) {
  const account = await officialApi<{ id: string; username: string }>(
    `${metaApiBase()}/${encodeURIComponent(accountId)}?fields=id,username`,
    { token },
  );
  assertTheMoveIdentity(account, accountId);
  return account;
}
/** Discovers only accounts returned by the authorized Facebook Pages endpoint. */
export async function connectTheMoveAccount(
  actorId: string,
  accountId?: string,
  suppliedToken?: string,
  expiresIn?: number,
) {
  const token = suppliedToken || (await getIntegrationToken("meta"));
  if (!token)
    throw new ServiceError(
      "DISCONNECTED",
      "설정에서 Meta 계정 인증을 먼저 진행하세요.",
      409,
    );
  if (!accountId) {
    let after: string | undefined;
    const matches = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const result = await officialApi<{
        data?: {
          instagram_business_account?: { id: string; username: string };
        }[];
        paging?: { next?: string; cursors?: { after?: string } };
      }>(
        `${metaApiBase()}/me/accounts?fields=instagram_business_account{id,username}&limit=100${after ? `&after=${encodeURIComponent(after)}` : ""}`,
        { token },
      );
      if (!Array.isArray(result.data))
        throw new ServiceError(
          "INVALID_API_RESPONSE",
          "Meta 계정 목록 응답을 확인할 수 없습니다.",
          502,
        );
      for (const item of result.data) {
        const account = item.instagram_business_account;
        if (
          account?.username?.toLowerCase() === THE_MOVE_USERNAME &&
          /^\d+$/.test(account.id)
        )
          matches.add(account.id);
      }
      if (!result.paging?.next) break;
      after = result.paging.cursors?.after;
      if (!after || page === 9)
        throw new ServiceError(
          "ACCOUNT_LIST_INCOMPLETE",
          "계정 목록을 모두 확인하지 못했습니다. @themovemag_의 프로페셔널 계정 ID를 직접 입력하세요.",
          409,
        );
    }
    if (matches.size !== 1)
      throw new ServiceError(
        "ACCOUNT_NOT_AUTHORIZED",
        "인증된 페이지에서 @themovemag_를 찾지 못했습니다. 연결된 Facebook 페이지의 관리 권한과 Instagram 프로페셔널 계정 설정을 확인하세요.",
        409,
      );
    accountId = [...matches][0];
  }
  const account = await verifyTheMoveAccount(accountId, token);
  if (suppliedToken)
    await saveIntegrationToken("meta", suppliedToken, undefined, expiresIn);
  await mutateWorkspace(
    actorId,
    "META_ACCOUNT_IDENTITY_VERIFIED",
    "the-move",
    (data) => {
      const channel = data.channels.find((c) => c.id === "the-move");
      if (!channel)
        throw new ServiceError("NOT_FOUND", "THE MOVE 채널이 없습니다.", 404);
      if (
        data.channels.some(
          (c) => c.id !== channel.id && c.platformAccountId === account.id,
        )
      )
        throw new ServiceError(
          "DUPLICATE_ACCOUNT",
          "이 계정은 다른 채널에 이미 연결되어 있습니다.",
          409,
        );
      channel.handle = THE_MOVE_HANDLE;
      channel.platformAccountId = account.id;
      channel.connected = true;
    },
  );
  return { id: account.id, handle: THE_MOVE_HANDLE };
}
export async function requireTheMoveChannel(channelId: string) {
  const data = await getWorkspaceData();
  const channel = data.channels.find((c) => c.id === channelId);
  if (
    channelId !== "the-move" ||
    !channel?.connected ||
    !channel.platformAccountId
  )
    throw new ServiceError(
      "ACCOUNT_REQUIRED",
      "현재 실제 연동 대상은 @themovemag_뿐입니다. 설정에서 계정을 확인하고 연결하세요.",
      409,
    );
  return channel;
}
