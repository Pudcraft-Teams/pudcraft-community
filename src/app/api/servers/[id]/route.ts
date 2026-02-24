import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { deleteFile, getObjectKeyFromUrl, uploadServerIcon, validateImageFile } from "@/lib/storage";
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

async function deleteIconIfExists(iconUrl: string | null): Promise<void> {
  if (!iconUrl) {
    return;
  }

  const key = getObjectKeyFromUrl(iconUrl);
  if (!key) {
    return;
  }

  try {
    await deleteFile(key);
  } catch (error) {
    logger.warn("[api/servers/[id]] delete old icon failed", {
      iconUrl,
      reason: resolveErrorMessage(error, "unknown"),
    });
  }
}

/**
 * GET /api/servers/:id — 获取单个服务器详情。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // ─── Zod 校验 ───
    const parsed = serverIdSchema.safeParse(id);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "无效的服务器 ID 格式" },
        { status: 400 },
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: parsed.data },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
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
      iconUrl: server.iconUrl,
      imageUrl: server.imageUrl,
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      createdAt: server.createdAt.toISOString(),
      updatedAt: server.updatedAt.toISOString(),
      status: {
        online: server.isOnline,
        playerCount: server.playerCount,
        maxPlayers: server.maxPlayers,
        motd: null,
        favicon: null,
        latencyMs: server.latency,
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
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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

    const iconField = formData.get("icon");
    let iconBuffer: Buffer | null = null;
    let iconMimeType: string | null = null;

    if (iconField instanceof File && iconField.size > 0) {
      iconBuffer = Buffer.from(await iconField.arrayBuffer());
      iconMimeType = iconField.type;
      try {
        validateImageFile(iconBuffer, iconMimeType);
      } catch (error) {
        return NextResponse.json(
          { error: resolveErrorMessage(error, "图标文件格式或大小无效") },
          { status: 400 },
        );
      }
    }

    const updateInput = parsed.data;

    const existingMetadata = extractServerContentMetadata(existing.content);
    const nextVersion =
      updateInput.version ??
      existingMetadata.version ??
      "未知";
    const nextBody =
      updateInput.content !== undefined ? updateInput.content : existingMetadata.body;
    const nextMaxPlayers =
      updateInput.maxPlayers !== undefined
        ? updateInput.maxPlayers
        : (existingMetadata.maxPlayers ?? existing.maxPlayers);
    const nextQqGroup =
      updateInput.qqGroup !== undefined ? (updateInput.qqGroup || undefined) : (existingMetadata.qqGroup ?? undefined);
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

    let nextIconUrl: string | null | undefined = undefined;
    let warning: string | undefined;

    if (updateInput.removeIcon) {
      nextIconUrl = null;
    }

    if (iconBuffer && iconMimeType) {
      try {
        const uploadedUrl = await uploadServerIcon(iconBuffer, existing.id, iconMimeType);
        nextIconUrl = uploadedUrl;
      } catch (error) {
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
        ? (updateInput.description || null)
        : existing.description,
      tags: hasField(updateInput, "tags") ? updateInput.tags : existing.tags,
      content: nextContent,
    };

    if (nextIconUrl !== undefined) {
      nextData.iconUrl = nextIconUrl;
    }

    nextData.maxPlayers = nextMaxPlayers;

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
          updatedAt: true,
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "该服务器地址和端口已存在，请勿重复设置" },
          { status: 409 },
        );
      }

      throw error;
    }

    const shouldDeleteOldIcon =
      existing.iconUrl &&
      (nextIconUrl === null || (typeof nextIconUrl === "string" && nextIconUrl !== existing.iconUrl));
    if (shouldDeleteOldIcon) {
      await deleteIconIfExists(existing.iconUrl);
    }

    return NextResponse.json({
      success: true,
      warning,
      data: updatedServer,
    });
  } catch (err) {
    logger.error("[api/servers/[id]] Unexpected PATCH error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * DELETE /api/servers/:id — 删除服务器。
 * 仅服务器 owner 可删除。
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

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
      },
    });

    if (!existing) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (!existing.ownerId || existing.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    await prisma.server.delete({
      where: { id: existing.id },
    });

    await deleteIconIfExists(existing.iconUrl);

    return NextResponse.json({
      success: true,
      message: "服务器已删除",
    });
  } catch (err) {
    logger.error("[api/servers/[id]] Unexpected DELETE error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
