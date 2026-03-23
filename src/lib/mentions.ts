import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

const MENTION_PATTERN = /@\[([^\]]+)\]\(uid:(\d+)\)/g;

/**
 * Extract mentioned user UIDs from post content.
 * Parses the @[Name](uid:123) format.
 */
export function extractMentionedUids(content: string): number[] {
  const uids = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = MENTION_PATTERN.exec(content)) !== null) {
    const uid = Number(match[2]);
    if (uid > 0) uids.add(uid);
  }

  return [...uids];
}

/**
 * Send MENTION notifications to mentioned users (fire-and-forget).
 * Skips the post author (don't notify yourself).
 */
export function notifyMentionedUsers(
  postId: string,
  authorId: string,
  content: string,
): void {
  const uids = extractMentionedUids(content);
  if (uids.length === 0) return;

  // Fire-and-forget: don't block post creation
  void (async () => {
    try {
      // Resolve UIDs to user IDs
      const users = await prisma.user.findMany({
        where: { uid: { in: uids }, isBanned: false },
        select: { id: true, uid: true },
      });

      // Filter out the author
      const recipients = users.filter((u) => u.id !== authorId);
      if (recipients.length === 0) return;

      // Create notifications
      await prisma.notification.createMany({
        data: recipients.map((u) => ({
          recipientId: u.id,
          type: "MENTION" as const,
          sourceUserId: authorId,
          postId,
        })),
      });
    } catch (err) {
      logger.warn("[mentions] Failed to send mention notifications", err);
    }
  })();
}
