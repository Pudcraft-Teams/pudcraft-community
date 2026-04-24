export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import {
  getFallbackModpackName,
  hashFileBuffer,
  ModpackError,
  parseMrpackFile,
  validateMrpackFile,
} from "@/lib/modpack";
import { moderateFields } from "@/lib/moderation";
import { getClientIp } from "@/lib/request-ip";
import { canAccessServer } from "@/lib/server-access";
import { canSeeServerAddress } from "@/lib/server-membership";
import { resolveServerCuid } from "@/lib/lookup";
import { deleteObject, uploadModpack } from "@/lib/storage";
import { serverLookupIdSchema, uploadModpackSchema } from "@/lib/validation";

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

type ModpackErrorKeyLookup = (key: string, params?: Record<string, string | number>) => string;

function resolveModpackErrorMessage(
  error: unknown,
  fallback: string,
  translateModpackKey: ModpackErrorKeyLookup,
): string {
  if (error instanceof ModpackError) {
    return translateModpackKey(error.key, error.params);
  }
  return resolveErrorMessage(error, fallback);
}

/**
 * GET /api/servers/:id/modpack — 获取服务器整合包版本列表（新到旧）。
 * 公开访问仅允许已通过审核服务器，owner / admin 例外。
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const resolvedServerId = await resolveServerCuid(parsedId.data);
    if (!resolvedServerId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: resolvedServerId },
      select: {
        id: true,
        ownerId: true,
        status: true,
        visibility: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
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
        { error: tServers("modpackNotFoundForServer") },
        { status: 403 },
      );
    }

    const canView = await canSeeServerAddress(
      { visibility: server.visibility, ownerId: server.ownerId },
      session?.user?.id,
      session?.user?.role,
      server.id,
    );
    if (!canView) {
      return NextResponse.json(
        { error: tServers("modpackMemberOnly") },
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
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/modpack — 上传 Modrinth .mrpack（仅 owner）。
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const locale = await getRequestLocale(request);
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tAuth = await getTranslations({ locale, namespace: "errors.api.auth" });
  const tModpacks = await getTranslations({ locale, namespace: "errors.api.modpacks" });
  const translateModpackKey: ModpackErrorKeyLookup = (key, params) => {
    try {
      // params is runtime-typed; tModpacks's signature narrows per key,
      // but we accept any key at runtime and let `next-intl` resolve it.
      return tModpacks(
        key as never,
        (params ?? {}) as never,
      );
    } catch {
      return key;
    }
  };
  let uploadedFileKey: string | null = null;

  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const resolvedServerId = await resolveServerCuid(parsedId.data);
    if (!resolvedServerId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: resolvedServerId },
      select: {
        id: true,
        ownerId: true,
        isVerified: true,
      },
    });

    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    if (!server.ownerId || server.ownerId !== userId) {
      return NextResponse.json({ error: tAuth("forbidden") }, { status: 403 });
    }

    if (!server.isVerified) {
      return NextResponse.json({ error: tServers("modpackRequireVerified") }, { status: 403 });
    }

    const formData = await request.formData();
    const fileField = formData.get("file");
    if (!(fileField instanceof File) || fileField.size <= 0) {
      return NextResponse.json({ error: tServers("modpackFileRequired") }, { status: 400 });
    }

    try {
      validateMrpackFile(fileField.name, fileField.size);
    } catch (error) {
      return NextResponse.json(
        {
          error: resolveModpackErrorMessage(
            error,
            tServers("modpackFileCheckFailed"),
            translateModpackKey,
          ),
        },
        { status: 400 },
      );
    }

    const parsedMeta = uploadModpackSchema.safeParse({
      version: extractTextField(formData, "version"),
      loader: extractTextField(formData, "loader"),
      gameVersion: extractTextField(formData, "gameVersion"),
    }, {
      errorMap: getZodErrorMap(locale),
    });
    if (!parsedMeta.success) {
      return NextResponse.json(
        {
          error: tServers("modpackParamInvalid"),
          details: flattenZodErrorWithLocale(parsedMeta.error, locale),
        },
        { status: 400 },
      );
    }

    const fileBuffer = Buffer.from(await fileField.arrayBuffer());

    let parsedPack;
    try {
      parsedPack = await parseMrpackFile(fileBuffer);
    } catch (error) {
      return NextResponse.json(
        {
          error: resolveModpackErrorMessage(
            error,
            tServers("modpackStructureInvalid"),
            translateModpackKey,
          ),
        },
        { status: 400 },
      );
    }
    const hashes = hashFileBuffer(fileBuffer);

    const fallbackName = getFallbackModpackName(fileField.name) || tModpacks("fallbackName");
    // Content moderation.
    const modResult = await moderateFields(
      {
        名称: parsedPack.name || fallbackName,
        描述: parsedPack.summary ?? "",
      },
      "modpack",
      { userId, userIp: getClientIp(request) },
    );
    if (!modResult.passed) {
      return NextResponse.json(
        { error: tServers("modpackContentModerated"), details: modResult.reason },
        { status: 422 },
      );
    }

    uploadedFileKey = await uploadModpack(fileBuffer, server.id);

    const modpack = await prisma.modpack.create({
      data: {
        serverId: server.id,
        uploaderId: userId,
        name: parsedPack.name || fallbackName,
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
    return NextResponse.json({ error: tServers("modpackUploadFailed") }, { status: 500 });
  }
}
