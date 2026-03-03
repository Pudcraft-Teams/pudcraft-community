export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  getFallbackModpackName,
  hashFileBuffer,
  parseMrpackFile,
  validateMrpackFile,
} from "@/lib/modpack";
import { moderateFields } from "@/lib/moderation";
import { getClientIp } from "@/lib/request-ip";
import { canAccessServer } from "@/lib/server-access";
import { deleteObject, uploadModpack } from "@/lib/storage";
import { serverIdSchema, uploadModpackSchema } from "@/lib/validation";

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

/**
 * GET /api/servers/:id/modpack — 获取服务器整合包版本列表（新到旧）。
 * 公开访问仅允许已通过审核服务器，owner / admin 例外。
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const parsedId = serverIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const server = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        ownerId: true,
        status: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const session = await auth();
    const canAccessCurrentServer = canAccessServer({
      status: server.status,
      ownerId: server.ownerId,
      currentUserId: session?.user?.id,
      currentUserRole: session?.user?.role,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json(
        { error: "服务器未通过审核，整合包暂不可公开访问" },
        { status: 403 },
      );
    }

    const modpacks = await prisma.modpack.findMany({
      where: { serverId: server.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        serverId: true,
        uploaderId: true,
        name: true,
        version: true,
        loader: true,
        gameVersion: true,
        summary: true,
        fileSize: true,
        sha1: true,
        sha512: true,
        modsCount: true,
        hasOverrides: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      data: modpacks,
    });
  } catch (error) {
    logger.error("[api/servers/[id]/modpack] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/modpack — 上传 Modrinth .mrpack（仅 owner）。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let uploadedFileKey: string | null = null;

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

    const server = await prisma.server.findUnique({
      where: { id: parsedId.data },
      select: {
        id: true,
        ownerId: true,
        isVerified: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    if (!server.isVerified) {
      return NextResponse.json({ error: "请先完成服务器认领认证，再上传整合包" }, { status: 403 });
    }

    const formData = await request.formData();
    const fileField = formData.get("file");
    if (!(fileField instanceof File) || fileField.size <= 0) {
      return NextResponse.json({ error: "请选择要上传的 .mrpack 文件" }, { status: 400 });
    }

    try {
      validateMrpackFile(fileField.name, fileField.size);
    } catch (error) {
      return NextResponse.json(
        { error: resolveErrorMessage(error, "整合包文件校验失败") },
        { status: 400 },
      );
    }

    const parsedMeta = uploadModpackSchema.safeParse({
      version: extractTextField(formData, "version"),
      loader: extractTextField(formData, "loader"),
      gameVersion: extractTextField(formData, "gameVersion"),
    });
    if (!parsedMeta.success) {
      return NextResponse.json(
        { error: "参数校验失败", details: parsedMeta.error.flatten() },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await fileField.arrayBuffer());

    let parsedPack;
    try {
      parsedPack = await parseMrpackFile(fileBuffer);
    } catch (error) {
      return NextResponse.json(
        { error: resolveErrorMessage(error, "整合包结构不合法") },
        { status: 400 },
      );
    }
    const hashes = hashFileBuffer(fileBuffer);

    // ─── 内容审查 ───
    const modResult = await moderateFields(
      {
        名称: parsedPack.name || getFallbackModpackName(fileField.name),
        描述: parsedPack.summary ?? "",
      },
      "modpack",
      { userId, userIp: getClientIp(request) },
    );
    if (!modResult.passed) {
      return NextResponse.json(
        { error: "内容包含违规信息", detail: modResult.reason },
        { status: 422 },
      );
    }

    uploadedFileKey = await uploadModpack(fileBuffer, server.id);

    const modpack = await prisma.modpack.create({
      data: {
        serverId: server.id,
        uploaderId: userId,
        name: parsedPack.name || getFallbackModpackName(fileField.name),
        version: parsedMeta.data.version ?? parsedPack.version,
        loader: parsedMeta.data.loader ?? parsedPack.loader,
        gameVersion: parsedMeta.data.gameVersion ?? parsedPack.gameVersion,
        summary: parsedPack.summary,
        fileKey: uploadedFileKey,
        fileSize: fileBuffer.byteLength,
        sha1: hashes.sha1,
        sha512: hashes.sha512,
        mrIndex: parsedPack.mrIndex as Prisma.InputJsonValue,
        modsCount: parsedPack.modsCount,
        hasOverrides: parsedPack.hasOverrides,
      },
      select: {
        id: true,
        serverId: true,
        name: true,
        version: true,
        loader: true,
        gameVersion: true,
        summary: true,
        fileSize: true,
        modsCount: true,
        hasOverrides: true,
        createdAt: true,
      },
    });

    return NextResponse.json(
      {
        success: true,
        data: modpack,
      },
      { status: 201 },
    );
  } catch (error) {
    if (uploadedFileKey) {
      try {
        await deleteObject(uploadedFileKey);
      } catch (cleanupError) {
        logger.warn("[api/servers/[id]/modpack] cleanup uploaded file failed", {
          fileKey: uploadedFileKey,
          reason: resolveErrorMessage(cleanupError, "unknown"),
        });
      }
    }

    logger.error("[api/servers/[id]/modpack] Unexpected POST error", error);
    return NextResponse.json({ error: "整合包上传失败，请稍后重试" }, { status: 500 });
  }
}
