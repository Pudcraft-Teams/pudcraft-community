import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { rateLimit } from "@/lib/rate-limit";
import { ImageValidationError, uploadServerIcon, validateImageFile } from "@/lib/storage";
import { buildServerContent } from "@/lib/serverContent";
import { createServerSchema, queryServersSchema } from "@/lib/validation";
import type { ServerListItem } from "@/lib/types";

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

function getClientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function duplicateServerResponse(existing: { id: string; name: string | null }) {
  return NextResponse.json(
    {
      error: "该服务器地址已被收录",
      existingServerId: existing.id,
      existingServerName: existing.name,
      hint: "如果你是这个服务器的管理员，可以去认领它",
    },
    { status: 409 },
  );
}

/**
 * GET /api/servers — 获取服务器列表。
 * 支持分页、标签过滤、关键词搜索与排序。
 */
export async function GET(request: Request) {
  try {
    const clientIp = getClientIp(request);
    const searchRate = await rateLimit(`search:${clientIp}`, 60, 60);
    if (!searchRate.allowed) {
      return NextResponse.json({ error: "请求过于频繁，请稍后再试" }, { status: 429 });
    }

    const { searchParams } = new URL(request.url);

    // ─── Zod 输入校验 ───
    const parsed = queryServersSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      pageSize: searchParams.get("pageSize") ?? undefined,
      tag: searchParams.get("tag") ?? undefined,
      search: searchParams.get("search") ?? undefined,
      sort: searchParams.get("sort") ?? undefined,
      ownerId: searchParams.get("ownerId") ?? undefined,
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
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
      // owner 查自己的服务器不限状态
      if (ownerId !== session?.user?.id) {
        where.status = "approved";
      }
    } else {
      // 普通访问只显示已通过审核的服务器
      where.status = "approved";
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

    // ─── 映射为 API 响应格式 ───
    const data: ServerListItem[] = servers.map((server) => ({
      id: server.id,
      name: server.name,
      host: server.host,
      port: server.port,
      description: server.description,
      tags: server.tags,
      iconUrl: server.iconUrl,
      favoriteCount: server.favoriteCount,
      isVerified: server.isVerified,
      verifiedAt: server.verifiedAt?.toISOString() ?? null,
      reviewStatus: server.status,
      rejectReason: server.rejectReason,
      status: {
        online: server.isOnline,
        playerCount: server.playerCount,
        maxPlayers: server.maxPlayers,
        motd: null,
        favicon: null,
        latencyMs: server.latency,
        checkedAt: (server.lastPingedAt ?? server.updatedAt).toISOString(),
      },
    }));

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
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * POST /api/servers — 提交服务器（支持图标上传）。
 * 需登录用户访问，图标上传失败时降级为无图标。
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const submitRate = await rateLimit(`server-submit:${userId}`, 5, 24 * 60 * 60);
    if (!submitRate.allowed) {
      return NextResponse.json({ error: "今日提交次数已达上限，请明天再试" }, { status: 429 });
    }

    const formData = await request.formData();
    const maxPlayersRaw = extractOptionalTextField(formData, "maxPlayers");

    const parsed = createServerSchema.safeParse({
      name: extractTextField(formData, "name"),
      address: extractTextField(formData, "address"),
      port: extractTextField(formData, "port"),
      version: extractTextField(formData, "version"),
      tags: extractTextField(formData, "tags"),
      description: extractTextField(formData, "description") ?? "",
      content: extractTextField(formData, "content") ?? "",
      maxPlayers: maxPlayersRaw,
      qqGroup: extractTextField(formData, "qqGroup") ?? "",
    });

    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { name, address, port, version, tags, description, content, maxPlayers, qqGroup } =
      parsed.data;
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
        name: true,
      },
    });
    if (existingServer) {
      return duplicateServerResponse(existingServer);
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

        return NextResponse.json(
          { error: "图标文件格式或大小无效" },
          { status: 400 },
        );
      }
    }

    let server;
    try {
      server = await prisma.server.create({
        data: {
          name,
          host: normalizedHost,
          port,
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
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
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
            name: true,
          },
        });
        if (duplicated) {
          return duplicateServerResponse(duplicated);
        }

        return NextResponse.json({ error: "该服务器地址已被收录" }, { status: 409 });
      }

      throw error;
    }

    let iconUrl: string | null = null;
    if (iconBuffer && iconMimeType) {
      try {
        iconUrl = await uploadServerIcon(iconBuffer, server.id, iconMimeType);
        await prisma.server.update({
          where: { id: server.id },
          data: { iconUrl },
        });
      } catch (error) {
        logger.error("[api/servers] Upload server icon failed", {
          serverId: server.id,
          reason: resolveErrorMessage(error, "unknown"),
        });
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "服务器已提交，等待管理员审核",
        data: {
          id: server.id,
          name: server.name,
          host: server.host,
          port: server.port,
          description: server.description,
          tags: server.tags,
          ownerId: server.ownerId,
          iconUrl,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("[api/servers] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
