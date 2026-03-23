export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { requireAdmin, isAdminError } from "@/lib/admin";
import { adminMergeTagsSchema } from "@/lib/validation";

/**
 * POST /api/admin/tags/merge — 合并两个话题。
 * 将 source 的所有帖子关联转移到 target，然后删除 source。
 */
export async function POST(request: Request) {
  try {
    const adminResult = await requireAdmin();
    if (isAdminError(adminResult)) {
      return NextResponse.json({ error: adminResult.error }, { status: adminResult.status });
    }

    const body: unknown = await request.json();
    const parsed = adminMergeTagsSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { sourceId, targetId } = parsed.data;

    if (sourceId === targetId) {
      return NextResponse.json({ error: "不能合并相同的话题" }, { status: 400 });
    }

    const [source, target] = await Promise.all([
      prisma.tag.findUnique({ where: { id: sourceId } }),
      prisma.tag.findUnique({ where: { id: targetId } }),
    ]);

    if (!source) {
      return NextResponse.json({ error: "源话题不存在" }, { status: 404 });
    }
    if (!target) {
      return NextResponse.json({ error: "目标话题不存在" }, { status: 404 });
    }

    const updatedTag = await prisma.$transaction(async (tx) => {
      // 1. Get all PostTag rows for source
      const sourcePostTags = await tx.postTag.findMany({
        where: { tagId: sourceId },
      });

      // 2. For each, check if target already has a PostTag for that postId
      for (const postTag of sourcePostTags) {
        const existing = await tx.postTag.findUnique({
          where: {
            unique_post_tag: {
              postId: postTag.postId,
              tagId: targetId,
            },
          },
        });

        if (existing) {
          // Duplicate: delete the source PostTag
          await tx.postTag.delete({ where: { id: postTag.id } });
        } else {
          // No duplicate: update to point to target
          await tx.postTag.update({
            where: { id: postTag.id },
            data: { tagId: targetId },
          });
        }
      }

      // 3. Merge aliases: add source's name + source's aliases to target's aliases
      const mergedAliases = new Set(target.aliases);
      mergedAliases.add(source.name);
      for (const alias of source.aliases) {
        mergedAliases.add(alias);
      }
      // Remove target's own name from aliases if present
      mergedAliases.delete(target.name);

      // 4. Recount target's postCount
      const newPostCount = await tx.postTag.count({ where: { tagId: targetId } });

      // 5. Update target tag
      const updated = await tx.tag.update({
        where: { id: targetId },
        data: {
          aliases: Array.from(mergedAliases),
          postCount: newPostCount,
        },
      });

      // 6. Delete source tag
      await tx.tag.delete({ where: { id: sourceId } });

      return updated;
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updatedTag.id,
        name: updatedTag.name,
        displayName: updatedTag.displayName,
        aliases: updatedTag.aliases,
        postCount: updatedTag.postCount,
        createdAt: updatedTag.createdAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[api/admin/tags/merge] POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
