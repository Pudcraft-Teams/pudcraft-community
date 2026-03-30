import type { PrismaClient } from "@prisma/client";

type TxClient = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

const TAG_PATTERN = /#([\p{L}\p{N}_]+)/gu;
const MAX_TAGS_PER_POST = 5;

/** Extract unique hashtags from text content. Returns at most 5 tags, preserving original casing. */
export function extractTags(content: string): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];
  for (const match of content.matchAll(TAG_PATTERN)) {
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

function normalizeTagList(rawTags: string[]): string[] {
  const seen = new Set<string>();
  const tags: string[] = [];

  for (const rawTag of rawTags) {
    const trimmed = rawTag.trim();
    const cleaned = trimmed.match(/^[\p{L}\p{N}_]+/u)?.[0] ?? "";
    if (!cleaned) {
      continue;
    }

    const normalized = cleaned.toLowerCase();
    if (seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    tags.push(cleaned);

    if (tags.length >= MAX_TAGS_PER_POST) {
      break;
    }
  }

  return tags;
}

export function resolvePostTags(input: {
  content?: string | null;
  tags?: string[] | null;
}): string[] {
  const normalizedTags = normalizeTagList(input.tags ?? []);
  if (normalizedTags.length > 0) {
    return normalizedTags;
  }

  return extractTags(input.content ?? "");
}

/** Create tags and link to post within a transaction, avoiding double-counting. */
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
    const existingPostTag = await tx.postTag.findUnique({
      where: { unique_post_tag: { postId, tagId: tag.id } },
    });
    if (!existingPostTag) {
      await tx.postTag.create({
        data: { postId, tagId: tag.id },
      });
      await tx.tag.update({
        where: { id: tag.id },
        data: { postCount: { increment: 1 } },
      });
    }
  }
}

export async function replaceTagsForPost(
  tx: TxClient,
  postId: string,
  rawTags: string[],
): Promise<void> {
  await unlinkTagsFromPost(tx, postId);

  if (rawTags.length === 0) {
    return;
  }

  await linkTagsToPost(tx, postId, rawTags);
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
