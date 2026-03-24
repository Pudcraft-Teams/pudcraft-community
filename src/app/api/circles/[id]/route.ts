export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { resolveCircleId } from "@/lib/circle-utils";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import { moderateFields } from "@/lib/moderation";
import { unlinkTagsFromPost } from "@/lib/tags";
import { updateCircleSchema } from "@/lib/validation";
import type { CircleDetail, CircleRoleType } from "@/lib/types";

/** cuid 格式检测：c 开头 + 20-30 位小写字母数字 */
const CUID_PATTERN = /^c[a-z0-9]{20,30}$/;

/**
 * 根据参数查找圈子详情（含 creator）：cuid 格式按 id 查，否则按 slug 查。
 * 仅用于 GET 详情接口，需要完整数据。
 */
async function resolveCircleDetail(param: string) {
  const isCuid = CUID_PATTERN.test(param);
  return prisma.circle.findUnique({
    where: isCuid ? { id: param } : { slug: param },
    include: {
      creator: {
        select: { id: true, uid: true, name: true, image: true },
      },
      server: {
        select: { id: true, psid: true, name: true, iconUrl: true },
      },
    },
  });
}

/**
 * GET /api/circles/:id — 获取圈子详情。
 * 支持 cuid 和 slug 两种方式查找。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const circle = await resolveCircleDetail(id);
    if (!circle) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    const session = await auth();

    // --- 查询当前用户的成员状态 ---
    let isMember = false;
    let memberRole: CircleRoleType | null = null;
    if (session?.user?.id) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId: session.user.id,
            circleId: circle.id,
          },
        },
        select: { role: true },
      });
      if (membership) {
        isMember = true;
        memberRole = membership.role;
      }
    }

    const data: CircleDetail = {
      id: circle.id,
      name: circle.name,
      slug: circle.slug,
      description: circle.description,
      icon: circle.icon,
      banner: circle.banner,
      memberCount: circle.memberCount,
      postCount: circle.postCount,
      creatorId: circle.creatorId,
      creator: circle.creator,
      server: circle.server,
      isMember,
      memberRole,
      createdAt: circle.createdAt.toISOString(),
    };

    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[api/circles/[id]] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PUT /api/circles/:id — 更新圈子信息。
 * 仅圈子 OWNER 可操作。
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // --- 权限检查：站点管理员或圈子 OWNER ---
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId,
          },
        },
        select: { role: true },
      });

      if (membership?.role !== "OWNER") {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
    }

    const body = await request.json().catch(() => null);
    const parsed = updateCircleSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // --- 内容审查（仅审查有变更的字段） ---
    const fieldsToModerate: Record<string, string> = {};
    if (parsed.data.name) {
      fieldsToModerate["名称"] = parsed.data.name;
    }
    if (parsed.data.description !== undefined && parsed.data.description !== null) {
      fieldsToModerate["简介"] = parsed.data.description;
    }

    if (Object.keys(fieldsToModerate).length > 0) {
      const clientIp = getClientIp(request);
      const modResult = await moderateFields(fieldsToModerate, "server", {
        userId,
        userIp: clientIp,
      });
      if (!modResult.passed) {
        return NextResponse.json(
          { error: "内容包含违规信息，请修改后重新提交", detail: modResult.reason },
          { status: 422 },
        );
      }
    }

    // --- 构建更新数据 ---
    const updateData: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) {
      updateData.name = parsed.data.name;
    }
    if (parsed.data.description !== undefined) {
      updateData.description = parsed.data.description || null;
    }
    if (parsed.data.icon !== undefined) {
      updateData.icon = parsed.data.icon;
    }
    if (parsed.data.banner !== undefined) {
      updateData.banner = parsed.data.banner;
    }

    const updated = await prisma.circle.update({
      where: { id: circleId },
      data: updateData,
    });

    return NextResponse.json({
      success: true,
      data: {
        id: updated.id,
        name: updated.name,
        slug: updated.slug,
        description: updated.description,
        icon: updated.icon,
        banner: updated.banner,
        memberCount: updated.memberCount,
        postCount: updated.postCount,
        createdAt: updated.createdAt.toISOString(),
        updatedAt: updated.updatedAt.toISOString(),
      },
    });
  } catch (err) {
    logger.error("[api/circles/[id]] Unexpected PUT error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/circles/:id — 删除圈子。
 * 圈子 OWNER 或站点管理员可操作，级联删除成员关系等。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id } = await params;

    const circleId = await resolveCircleId(id);
    if (!circleId) {
      return NextResponse.json({ error: "圈子未找到" }, { status: 404 });
    }

    // --- 权限检查：OWNER 或站点管理员 ---
    const isAdmin = userRole === "admin";
    if (!isAdmin) {
      const membership = await prisma.circleMembership.findUnique({
        where: {
          unique_circle_membership: {
            userId,
            circleId,
          },
        },
        select: { role: true },
      });

      if (membership?.role !== "OWNER") {
        return NextResponse.json({ error: "无权限" }, { status: 403 });
      }
    }

    // Clean up tag counts for all posts in this circle
    const postsWithTags = await prisma.post.findMany({
      where: {
        circleId,
        postTags: { some: {} },
      },
      select: { id: true },
    });

    if (postsWithTags.length > 0) {
      await prisma.$transaction(async (tx) => {
        for (const post of postsWithTags) {
          await unlinkTagsFromPost(tx, post.id);
        }
      });
    }

    await prisma.circle.delete({
      where: { id: circleId },
    });

    return NextResponse.json({
      success: true,
      message: "圈子已删除",
    });
  } catch (err) {
    logger.error("[api/circles/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
