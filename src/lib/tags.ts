import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const TAG_PATTERN = /#([\w\u4e00-\u9fff\u3400-\u4dbf\u3000-\u303f\uff00-\uffef]+)/g;
const MAX_TAGS_PER_POST = 5;

/** Extract unique hashtags from text content. Returns at most 5 tags, preserving original casing. */
export function extractTags(content: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = TAG_PATTERN.exec(content)) !== null) {
    const raw = match[1]!;
    const normalized = raw.toLowerCase();
    if (!seen.has(normalized)) {
      seen.add(normalized);
      tags.push(raw);
    }
    if (tags.length >= MAX_TAGS_PER_POST) break;
  }
  return tags;
}

/** Upsert tags and create PostTag links within a transaction. */
export async function linkTagsToPost(
  tx: TxClient,
  postId: string,
  rawTags: string[],
): Promise<void> {
  for (const raw of rawTags) {
    const normalized = raw.toLowerCase();
    const tag = await tx.tag.upsert({
      where: { name: normalized },
      create: { name: normalized, displayName: raw },
      update: {},
      select: { id: true },
    });
    await tx.postTag.upsert({
      where: { unique_post_tag: { postId, tagId: tag.id } },
      create: { postId, tagId: tag.id },
      update: {},
    });
    await tx.tag.update({
      where: { id: tag.id },
      data: { postCount: { increment: 1 } },
    });
  }
}

/** Remove all PostTag links for a post and decrement tag postCounts. */
export async function unlinkTagsFromPost(
  tx: TxClient,
  postId: string,
): Promise<void> {
  const postTags = await tx.postTag.findMany({
    where: { postId },
    select: { id: true, tagId: true },
  });
  if (postTags.length === 0) return;
  await tx.postTag.deleteMany({ where: { postId } });
  for (const pt of postTags) {
    const updated = await tx.tag.update({
      where: { id: pt.tagId },
      data: { postCount: { decrement: 1 } },
      select: { postCount: true },
    });
    if (updated.postCount < 0) {
      await tx.tag.update({ where: { id: pt.tagId }, data: { postCount: 0 } });
    }
  }
}
