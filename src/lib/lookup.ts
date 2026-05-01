/**
 * PSID / public-user-id resolution.
 *
 * - Server identifiers: 6-digit PSID maps to a Server.id (cuid). Other strings
 *   are treated as cuids and returned unchanged.
 * - User identifiers: the public slug is the upstream Misskey id. We accept
 *   either a local cuid (legacy internal links) or a Misskey id and return
 *   the local cuid that callers use elsewhere.
 */

import { prisma } from "@/lib/db";

const PSID_REGEX = /^\d{6}$/;

/** True for the 6-digit PSID format. */
export function isPsidFormat(id: string): boolean {
  return PSID_REGEX.test(id);
}

/**
 * 解析服务器 ID：6 位数字按 PSID 查 DB 返回 CUID，否则原样返回。
 * 若 PSID 不存在返回 null。
 */
export async function resolveServerCuid(idOrPsid: string): Promise<string | null> {
  if (isPsidFormat(idOrPsid)) {
    const server = await prisma.server.findUnique({
      where: { psid: Number(idOrPsid) },
      select: { id: true },
    });
    return server?.id ?? null;
  }
  return idOrPsid;
}

/**
 * 解析用户 ID：先按 misskeyId 查找，命中即返回本地 cuid；
 * 未命中再按本地 cuid 直查。两者都失败返回 null。
 *
 * 这样既支持公开 URL `/u/{misskeyId}`，也兼容内部仍持有 cuid 的链接。
 */
export async function resolveUserCuid(idOrMisskeyId: string): Promise<string | null> {
  const byMisskey = await prisma.user.findUnique({
    where: { misskeyId: idOrMisskeyId },
    select: { id: true },
  });
  if (byMisskey) {
    return byMisskey.id;
  }
  const byCuid = await prisma.user.findUnique({
    where: { id: idOrMisskeyId },
    select: { id: true },
  });
  return byCuid?.id ?? null;
}
