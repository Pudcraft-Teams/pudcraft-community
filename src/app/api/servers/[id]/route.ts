export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { canAccessServer } from "@/lib/server-access";
import { getClientIp } from "@/lib/request-ip";
import {
  deleteFile,
  deleteObject,
  getPublicUrl,
  ImageModerationError,
  ImageValidationError,
  uploadServerIcon,
  validateImageFile,
} from "@/lib/storage";
import { moderateFields } from "@/lib/moderation";
import { buildServerContent, extractServerContentMetadata } from "@/lib/serverContent";
import { serverIdSchema, updateServerSchema } from "@/lib/validation";
import type { ServerDetail } from "@/lib/types";

function extractTextField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function resolveErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ZodError) {
    return error.issues[0]?.message ?? fallback;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return fallback;
}

function hasField<T extends object>(object: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(object, key);
}

async function deleteServerAssetIfExists(
  keyOrUrl: string | null,
  assetLabel: "icon" | "image",
): Promise<void> {
  if (!keyOrUrl) {
    return;
  }

  try {
    await deleteFile(keyOrUrl);
  } catch (error) {
    logger.warn("[api/servers/[id]] delete server asset failed", {
      asset: assetLabel,
      key: keyOrUrl,
      reason: resolveErrorMessage(error, "unknown"),
    });
  }
}

/**
 * GET /api/servers/:id — 获取单个服务器详情。
 * 未通过审核的服务器只有 owner 和管理员可访问。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;

    // ─── Zod 校验 ───
    const parsed = serverIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await prisma.server.findUnique({
      where: { id: parsed.data },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    // ─── 审核状态访问控制 ───
    if (server.status !== "approved") {
      const session = await auth();
      const canAccessCurrentServer = canAccessServer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: session?.user?.id,
        currentUserRole: session?.user?.role,
      });
      if (!canAccessCurrentServer) {
        return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
      }
    }

    const data: ServerDetail = {
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      description: server.description,
      content: server.content,
      ownerId: server.ownerId,
      tags: server.tags,
      iconUrl: getPublicUrl(server.iconUrl),
      imageUrl: getPublicUrl(server.imageUrl),
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      reviewStatus: server.status,
      rejectReason: server.rejectReason,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      status: {
        online: server.isOnline,
        playerCount: server.playerCount,
        maxPlayers: server.maxPlayers,
        motd: null,
        favicon: null,
        checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
      },
    };

    return NextResponse.json({ data });
  } catch (err) {
    logger.error("[api/servers/[id]] Unexpected error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/servers/:id — 编辑服务器信息。
 * 仅服务器 owner 可编辑，图标上传失败时降级保留原图标。
 */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const existing = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        ownerId: true,
        name: true,
        host: true,
        port: true,
        description: true,
        tags: true,
        content: true,
        iconUrl: true,
        maxPlayers: true,
        status: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (!existing.ownerId || existing.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const formData = await request.formData();
    const payload: Record<string, string> = {};
    const textualFields = [
      "name",
      "address",
      "port",
      "version",
      "tags",
      "description",
      "content",
      "maxPlayers",
      "qqGroup",
      "removeIcon",
    ] as const;
    for (const field of textualFields) {
      const value = extractTextField(formData, field);
      if (value !== undefined) {
        payload[field] = value;
      }
    }

    const parsed = updateServerSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // ─── 文本内容审查 ───
    const fieldsToModerate: Record<string, string> = {};
    if (hasField(parsed.data, "name") && parsed.data.name) {
      fieldsToModerate["名称"] = parsed.data.name;
    }
    if (hasField(parsed.data, "description") && parsed.data.description) {
      fieldsToModerate["描述"] = parsed.data.description;
    }
    if (hasField(parsed.data, "tags") && parsed.data.tags) {
      fieldsToModerate["标签"] = parsed.data.tags.join(" ");
    }

    if (Object.keys(fieldsToModerate).length > 0) {
      const modResult = await moderateFields(fieldsToModerate, "server", {
        userId,
        userIp: getClientIp(request),
      });
      if (!modResult.passed) {
        return NextResponse.json(
          { error: "内容包含违规信息，请修改后重新提交", detail: modResult.reason },
          { status: 422 },
        );
      }
    }

    const iconField = formData.get("icon");
    let iconBuffer: Buffer | null = null;
    let iconMimeType: string | null = null;

    if (iconField instanceof File && iconField.size > 0) {
      iconBuffer = Buffer.from(await iconField.arrayBuffer());
      iconMimeType = iconField.type;
      try {
        validateImageFile(iconBuffer, iconMimeType);
      } catch (error) {
        if (error instanceof ImageValidationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }

        return NextResponse.json({ error: "图标文件格式或大小无效" }, { status: 400 });
      }
    }

    const updateInput = parsed.data;

    const existingMetadata = extractServerContentMetadata(existing.content);
    const nextVersion = updateInput.version ?? existingMetadata.version ?? "未知";
    const nextBody =
      updateInput.content !== undefined ? updateInput.content : existingMetadata.body;
    const nextMaxPlayers =
      updateInput.maxPlayers !== undefined
        ? updateInput.maxPlayers
        : (existingMetadata.maxPlayers ?? existing.maxPlayers);
    const nextQqGroup =
      updateInput.qqGroup !== undefined
        ? updateInput.qqGroup || undefined
        : (existingMetadata.qqGroup ?? undefined);
    const shouldRebuildContent =
      hasField(updateInput, "version") ||
      hasField(updateInput, "content") ||
      hasField(updateInput, "maxPlayers") ||
      hasField(updateInput, "qqGroup") ||
      existingMetadata.version !== null ||
      existingMetadata.maxPlayers !== null ||
      existingMetadata.qqGroup !== null;

    const nextContent = shouldRebuildContent
      ? buildServerContent({
          version: nextVersion,
          content: nextBody || undefined,
          maxPlayers: nextMaxPlayers,
          qqGroup: nextQqGroup,
        })
      : (existing.content ?? null);

    let nextIconKey: string | null | undefined = undefined;
    let warning: string | undefined;

    if (updateInput.removeIcon) {
      nextIconKey = null;
    }

    if (iconBuffer && iconMimeType) {
      try {
        const uploadedKey = await uploadServerIcon(iconBuffer, existing.id, iconMimeType, {
          userId,
          userIp: getClientIp(request),
        });
        nextIconKey = uploadedKey;
      } catch (error) {
        if (error instanceof ImageModerationError) {
          return NextResponse.json(
            { error: "图标包含违规内容，请更换图片", detail: error.message },
            { status: error.status },
          );
        }
        warning = "图标上传失败，已保留原图标";
        logger.error("[api/servers/[id]] upload icon failed", {
          serverId: existing.id,
          reason: resolveErrorMessage(error, "unknown"),
        });
      }
    }

    const nextData: Prisma.ServerUpdateInput = {
      name: hasField(updateInput, "name") ? updateInput.name : existing.name,
      host: hasField(updateInput, "address") ? updateInput.address : existing.host,
      port: hasField(updateInput, "port") ? updateInput.port : existing.port,
      description: hasField(updateInput, "description")
        ? updateInput.description || null
        : existing.description,
      tags: hasField(updateInput, "tags") ? updateInput.tags : existing.tags,
      content: nextContent,
    };

    if (nextIconKey !== undefined) {
      nextData.iconUrl = nextIconKey;
    }

    nextData.maxPlayers = nextMaxPlayers;

    // 被拒绝后允许服主编辑并重新进入待审核队列。
    const needsResubmitForReview = existing.status === "rejected";
    if (needsResubmitForReview) {
      nextData.status = "pending";
      nextData.rejectReason = null;
    }

    let updatedServer;
    try {
      updatedServer = await prisma.server.update({
        where: { id: existing.id },
        data: nextData,
        select: {
          id: true,
          name: true,
          host: true,
          port: true,
          description: true,
          content: true,
          tags: true,
          iconUrl: true,
          status: true,
          rejectReason: true,
          updatedAt: true,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json(
          { error: "该服务器地址和端口已存在，请勿重复设置" },
          { status: 409 },
        );
      }

      throw error;
    }

    const shouldDeleteOldIcon =
      existing.iconUrl &&
      (nextIconKey === null ||
        (typeof nextIconKey === "string" && nextIconKey !== existing.iconUrl));
    if (shouldDeleteOldIcon) {
      await deleteServerAssetIfExists(existing.iconUrl, "icon");
    }

    return NextResponse.json({
      success: true,
      warning,
      resubmittedForReview: needsResubmitForReview,
      data: updatedServer,
    });
  } catch (err) {
    logger.error("[api/servers/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/servers/:id — 删除服务器。
 * 服务器 owner 和管理员可删除。
 */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;
    const userRole = authResult.user.role;

    const { id } = await params;
    const parsedId = serverIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const existing = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        ownerId: true,
        iconUrl: true,
        imageUrl: true,
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const isAdmin = userRole === "admin";
    if (!isAdmin && (!existing.ownerId || existing.ownerId !== userId)) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    const modpackFiles = await prisma.modpack.findMany({
      where: { serverId: existing.id },
      select: { fileKey: true },
    });

    await prisma.$transaction([
      prisma.notification.deleteMany({
        where: { serverId: existing.id },
      }),
      prisma.server.delete({
        where: { id: existing.id },
      }),
    ]);

    await deleteServerAssetIfExists(existing.iconUrl, "icon");
    await deleteServerAssetIfExists(existing.imageUrl, "image");
    for (const item of modpackFiles) {
      try {
        await deleteObject(item.fileKey);
      } catch (error) {
        logger.warn("[api/servers/[id]] delete modpack file failed", {
          serverId: existing.id,
          fileKey: item.fileKey,
          reason: resolveErrorMessage(error, "unknown"),
        });
      }
    }

    return NextResponse.json({
      success: true,
      message: "服务器已删除",
    });
  } catch (err) {
    logger.error("[api/servers/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
