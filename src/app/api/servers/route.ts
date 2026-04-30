export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getTranslations } from "next-intl/server";
import { ZodError } from "zod";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { translateImageValidationError } from "@/lib/i18nImage";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { generateAndReservePsid } from "@/lib/numeric-id";
import { getClientIp } from "@/lib/request-ip";
import { rateLimit } from "@/lib/rate-limit";
import { getAutoApprovedSubmissionState, getRejectedSubmissionState } from "@/lib/server-access";
import { buildServerStatusResponse } from "@/lib/serverStatus";
import {
  getPublicUrl,
  ImageModerationError,
  ImageValidationError,
  uploadServerIcon,
  validateImageFile,
} from "@/lib/storage";
import { moderateFields } from "@/lib/moderation";
import { moderateImage } from "@/lib/image-moderation";
import { buildServerContent } from "@/lib/serverContent";
import { createServerSchema, queryServersSchema } from "@/lib/validation";
import type { ServerListItem, ServerVisibility, ServerJoinMode } from "@/lib/types";

function extractTextField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function extractOptionalTextField(formData: FormData, key: string): string | undefined {
  const value = extractTextField(formData, key);
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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

function duplicateServerResponse(
  existing: { id: string; psid: number; name: string | null },
  messages: { error: string; hint: string },
) {
  return NextResponse.json(
    {
      error: messages.error,
      existingServerId: existing.id,
      existingServerPsid: existing.psid,
      existingServerName: existing.name,
      hint: messages.hint,
    },
    { status: 409 },
  );
}

/**
 * GET /api/servers — 获取服务器列表。
 * 支持分页、标签过滤、关键词搜索与排序。
 */
export async function GET(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  try {
    const clientIp = getClientIp(request);
    const searchRate = await rateLimit(`search:${clientIp}`, 60, 60);
    if (!searchRate.allowed) {
      return NextResponse.json({ error: tCommon("rateLimited") }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);

    // ─── Zod 输入校验 ───
    const parsed = queryServersSchema.safeParse(
      {
        page: searchParams.get("page") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
        pageSize: searchParams.get("pageSize") ?? undefined,
        tag: searchParams.get("tag") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        sort: searchParams.get("sort") ?? undefined,
        ownerId: searchParams.get("ownerId") ?? undefined,
      },
      { errorMap: getZodErrorMap(locale) },
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsed.error, locale),
        },
        { status: 400 },
      );
    }

    const { page, limit, pageSize, tag, search, sort, ownerId } = parsed.data;
    const take = pageSize ?? limit;

    // ─── 获取当前用户 session（用于审核状态过滤） ───
    const session = await auth();

    // ─── 构建 Prisma where 条件 ───
    const where: Prisma.ServerWhereInput = {};

    if (tag) {
      where.tags = { has: tag };
    }

    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    if (ownerId) {
      where.ownerId = ownerId;
      if (ownerId !== session?.user?.id) {
        where.status = "approved";
        if (session?.user?.role !== "admin") {
          where.visibility = "public";
        }
      }
    } else {
      // 普通访问只显示已通过审核的服务器，排除未开启「首页发现」的私有服务器
      where.status = "approved";
      where.NOT = { visibility: "private", discoverable: false };
    }

    const orderBy: Prisma.ServerOrderByWithRelationInput[] = [{ isOnline: "desc" }];
    switch (sort) {
      case "popular":
        orderBy.push({ favoriteCount: "desc" }, { createdAt: "desc" });
        break;
      case "players":
        orderBy.push({ playerCount: "desc" }, { createdAt: "desc" });
        break;
      case "name":
        orderBy.push({ name: "asc" });
        break;
      case "newest":
      default:
        orderBy.push({ createdAt: "desc" });
        break;
    }

    // ─── 并行查询总数和数据 ───
    const [total, servers] = await Promise.all([
      prisma.server.count({ where }),
      prisma.server.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy,
      }),
    ]);

    const totalPages = Math.max(1, Math.ceil(total / take));

    // ─── 批量检查非公开服务器成员关系（unlisted + discoverable private） ───
    const nonPublicServerIds = servers
      .filter((s) => s.visibility !== "public")
      .map((s) => s.id);
    let memberServerIds: Set<string> = new Set();
    if (session?.user?.id && nonPublicServerIds.length > 0) {
      const memberships = await prisma.serverMember.findMany({
        where: { userId: session.user.id, serverId: { in: nonPublicServerIds } },
        select: { serverId: true },
      });
      memberServerIds = new Set(memberships.map((m) => m.serverId));
    }

    // ─── 映射为 API 响应格式 ───
    const data: ServerListItem[] = servers.map((server) => {
      const isAdmin = session?.user?.role === "admin";
      const isOwner = session?.user?.id === server.ownerId;
      const isMember = memberServerIds.has(server.id);
      const canSeeAddress =
        server.visibility === "public" || isAdmin || isOwner || isMember;

      return {
        id: server.id,
        psid: server.psid,
        name: server.name,
        host: canSeeAddress ? server.host : "hidden",
        port: canSeeAddress ? server.port : 0,
        description: server.description,
        tags: server.tags,
        iconUrl: getPublicUrl(server.iconUrl),
        favoriteCount: server.favoriteCount,
        isVerified: server.isVerified,
        verifiedAt: server.verifiedAt?.toISOString() ?? null,
        reviewStatus: server.status,
        rejectReason: server.rejectReason,
        visibility: server.visibility as ServerVisibility,
        joinMode: server.joinMode as ServerJoinMode,
        status: buildServerStatusResponse(server),
      };
    });

    return NextResponse.json({
      data,
      servers: data,
      total,
      page,
      totalPages,
      limit: take,
      sort,
      pagination: {
        page,
        pageSize: take,
        total,
        totalPages,
      },
    });
  } catch (err) {
    logger.error("[api/servers] Unexpected error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * POST /api/servers — 提交服务器（支持图标上传）。
 * 需登录用户访问，图标上传失败时降级为无图标。
 */
export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tUploads = await getTranslations({ locale, namespace: "errors.api.uploads" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const submitRate = await rateLimit(`server-submit:${userId}`, 5, 24 * 60 * 60);
    if (!submitRate.allowed) {
      return NextResponse.json({ error: tServers("submitRateLimited") }, { status: 429 });
    }

    const formData = await request.formData();
    const maxPlayersRaw = extractOptionalTextField(formData, "maxPlayers");

    const parsed = createServerSchema.safeParse(
      {
        name: extractTextField(formData, "name"),
        address: extractTextField(formData, "address"),
        port: extractTextField(formData, "port"),
        version: extractTextField(formData, "version"),
        tags: extractTextField(formData, "tags"),
        description: extractTextField(formData, "description") ?? "",
        content: extractTextField(formData, "content") ?? "",
        maxPlayers: maxPlayersRaw,
        qqGroup: extractTextField(formData, "qqGroup") ?? "",
        visibility: extractOptionalTextField(formData, "visibility"),
      },
      { errorMap: getZodErrorMap(locale) },
    );

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsed.error, locale),
        },
        { status: 400 },
      );
    }

    const { name, address, port, version, tags, description, content, maxPlayers, qqGroup, visibility } =
      parsed.data;

    // ─── 内容审查 ───
    const clientIpForMod = getClientIp(request);
    const fieldsToModerate: Record<string, string> = {
      名称: name,
      描述: description ?? "",
      标签: tags?.join(" ") ?? "",
    };
    if (content?.trim()) {
      fieldsToModerate["详介"] = content;
    }
    const modResult = await moderateFields(fieldsToModerate, "server", {
      userId,
      userIp: clientIpForMod,
    });
    if (!modResult.passed) {
      return NextResponse.json(
        { error: tServers("contentModerated"), details: modResult.reason },
        { status: 422 },
      );
    }

    const normalizedHost = address.toLowerCase().trim();

    const existingServer = await prisma.server.findFirst({
      where: {
        host: {
          equals: normalizedHost,
          mode: "insensitive",
        },
        port,
      },
      select: {
        id: true,
        psid: true,
        name: true,
      },
    });
    if (existingServer) {
      return duplicateServerResponse(existingServer, {
        error: tServers("duplicateAddress"),
        hint: tServers("duplicateAddressHint"),
      });
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
          return NextResponse.json(
            { error: translateImageValidationError(error, tUploads) },
            { status: error.status },
          );
        }

        return NextResponse.json({ error: tServers("iconInvalid") }, { status: 400 });
      }
    }

    let iconKey: string | null = null;
    let server;
    try {
      server = await prisma.$transaction(async (tx) => {
        const psid = await generateAndReservePsid(tx);
        return tx.server.create({
          data: {
            name,
            host: normalizedHost,
            port,
            psid,
            description: description || null,
            content: buildServerContent({
              version,
              content: content || undefined,
              maxPlayers: typeof maxPlayers === "number" ? maxPlayers : undefined,
              qqGroup: qqGroup || undefined,
            }),
            tags,
            ownerId: userId,
            maxPlayers: typeof maxPlayers === "number" ? maxPlayers : 0,
            visibility: visibility ?? "public",
            status: "pending",
            reviewStatus: "unreviewed",
          },
        });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const duplicated = await prisma.server.findFirst({
          where: {
            host: {
              equals: normalizedHost,
              mode: "insensitive",
            },
            port,
          },
          select: {
            id: true,
            psid: true,
            name: true,
          },
        });
        if (duplicated) {
          return duplicateServerResponse(duplicated, {
            error: tServers("duplicateAddress"),
            hint: tServers("duplicateAddressHint"),
          });
        }

        return NextResponse.json({ error: tServers("duplicateAddress") }, { status: 409 });
      }

      throw error;
    }

    // ─── 图标上传 + 图片内容审查 ───
    if (iconBuffer && iconMimeType) {
      try {
        iconKey = await uploadServerIcon(iconBuffer, server.id, iconMimeType, {
          userId,
          userIp: clientIpForMod,
        });
        await prisma.server.update({
          where: { id: server.id },
          data: { iconUrl: iconKey },
        });
      } catch (error) {
        if (error instanceof ImageValidationError) {
          logger.info("[api/servers] Server icon failed validation", {
            serverId: server.id,
            reason: error.message,
          });
        } else if (error instanceof ImageModerationError) {
          logger.info("[api/servers] Server icon rejected by moderation during upload", {
            serverId: server.id,
            reason: error.message,
          });
        } else {
          logger.error("[api/servers] Upload server icon failed", {
            serverId: server.id,
            reason: resolveErrorMessage(error, "unknown"),
          });
        }
        iconKey = null;
      }
    }

    // ─── 图片内容审查（对已上传的图标 URL 执行） ───
    if (iconKey) {
      const iconUrl = getPublicUrl(iconKey);
      if (iconUrl) {
        const imgModResult = await moderateImage(iconUrl, "server-icon", {
          contentId: server.id,
          userId,
          userIp: clientIpForMod,
        });
        if (!imgModResult.passed) {
          const rejectReason = imgModResult.reason ?? tServers("contentModerated");
          await prisma.server.update({
            where: { id: server.id },
            data: getRejectedSubmissionState(rejectReason),
          });
          return NextResponse.json(
            { error: tServers("contentModerated"), details: rejectReason },
            { status: 422 },
          );
        }
      }
    }

    // ─── 自动通过审核（text + image moderation both passed） ───
    const finalServer = await prisma.server.update({
      where: { id: server.id },
      data: getAutoApprovedSubmissionState(),
    });

    return NextResponse.json(
      {
        success: true,
        message: tServers("submitted"),
        data: {
          id: finalServer.id,
          psid: finalServer.psid,
          name: finalServer.name,
          host: finalServer.host,
          port: finalServer.port,
          description: finalServer.description,
          tags: finalServer.tags,
          ownerId: finalServer.ownerId,
          reviewStatus: finalServer.reviewStatus,
          iconUrl: getPublicUrl(iconKey),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[api/servers] Unexpected POST error", err);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
