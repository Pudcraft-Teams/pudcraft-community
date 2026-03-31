export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { isPrivateServersEnabled } from "@/lib/features";
import { logger } from "@/lib/logger";
import { resolveServerCuid } from "@/lib/lookup";
import { canAccessServer } from "@/lib/server-access";
import { getPublicUrl } from "@/lib/storage";
import {
  serverLookupIdSchema,
  createApplicationSchema,
  queryApplicationsSchema,
} from "@/lib/validation";
import type { ServerApplicationItem } from "@/lib/types";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/servers/:id/applications
 * Player submits an application to join a server.
 */
export async function POST(request: Request, { params }: RouteContext) {
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: "该功能未启用" }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, ownerId: true, joinMode: true, status: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    const canAccessCurrentServer = canAccessServer({
      status: server.status,
      ownerId: server.ownerId,
      currentUserId: authResult.user.id,
      currentUserRole: authResult.user.role,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    // Server must support applications
    if (server.joinMode !== "apply" && server.joinMode !== "apply_and_invite") {
      return NextResponse.json({ error: "该服务器不接受入服申请" }, { status: 400 });
    }

    // Check for existing application or membership
    const existingApplication = await prisma.serverApplication.findUnique({
      where: { unique_server_application: { serverId: server.id, userId } },
      select: { id: true, status: true },
    });

    if (existingApplication) {
      if (existingApplication.status === "pending") {
        return NextResponse.json({ error: "你已提交过申请，请等待审核" }, { status: 409 });
      }
      if (existingApplication.status === "approved") {
        return NextResponse.json({ error: "你已是该服务器成员" }, { status: 409 });
      }
    }

    // Validate request body
    const body = await request.json().catch(() => null);
    const parsed = createApplicationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { mcUsername, formData } = parsed.data;

    // Store mcUsername alongside formData for later retrieval
    const storedFormData = { ...formData, mcUsername };

    // If a rejected application already exists, update it to pending
    if (existingApplication && existingApplication.status === "rejected") {
      const updated = await prisma.serverApplication.update({
        where: { id: existingApplication.id },
        data: {
          status: "pending",
          formData: storedFormData,
          reviewNote: null,
          reviewedBy: null,
        },
      });

      return NextResponse.json({ data: { id: updated.id } }, { status: 201 });
    }

    const application = await prisma.serverApplication.create({
      data: {
        serverId: server.id,
        userId,
        formData: storedFormData,
      },
    });

    return NextResponse.json({ data: { id: application.id } }, { status: 201 });
  } catch (err) {
    logger.error("[api/servers/[id]/applications] Unexpected POST error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * GET /api/servers/:id/applications
 * Server owner lists applications (with status filter and pagination).
 */
export async function GET(request: Request, { params }: RouteContext) {
  try {
    if (!isPrivateServersEnabled()) {
      return NextResponse.json({ error: "该功能未启用" }, { status: 404 });
    }

    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const { id } = await params;
    const parsedId = serverLookupIdSchema.safeParse(id);
    if (!parsedId.success) {
      return NextResponse.json({ error: "无效的服务器 ID 格式" }, { status: 400 });
    }

    const cuid = await resolveServerCuid(parsedId.data);
    if (!cuid) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    // Check server ownership
    const server = await prisma.server.findUnique({
      where: { id: cuid },
      select: { id: true, ownerId: true },
    });

    if (!server) {
      return NextResponse.json({ error: "服务器未找到" }, { status: 404 });
    }

    if (server.ownerId !== userId) {
      return NextResponse.json({ error: "无权限" }, { status: 403 });
    }

    // Parse query params
    const { searchParams } = new URL(request.url);
    const parsedQuery = queryApplicationsSchema.safeParse({
      page: searchParams.get("page") ?? undefined,
      limit: searchParams.get("limit") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });

    if (!parsedQuery.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsedQuery.error.flatten() },
        { status: 400 },
      );
    }

    const { page, limit, status } = parsedQuery.data;

    const where: { serverId: string; status?: string } = { serverId: server.id };
    if (status !== "all") {
      where.status = status;
    }

    const [total, applications] = await Promise.all([
      prisma.serverApplication.count({ where }),
      prisma.serverApplication.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: {
            select: { id: true, name: true, image: true },
          },
          reviewer: {
            select: { name: true },
          },
        },
      }),
    ]);

    const data: ServerApplicationItem[] = applications.map((app) => {
      const rawFormData = app.formData as Record<string, unknown> | null;
      const mcUsername =
        typeof rawFormData?.mcUsername === "string" ? rawFormData.mcUsername : "";

      // Build formData without mcUsername for response
      let responseFormData: Record<string, string | string[]> | null = null;
      if (rawFormData) {
        const cleaned: Record<string, string | string[]> = {};
        for (const [key, value] of Object.entries(rawFormData)) {
          if (key === "mcUsername") continue;
          if (typeof value === "string") {
            cleaned[key] = value;
          } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
            cleaned[key] = value as string[];
          }
        }
        responseFormData = Object.keys(cleaned).length > 0 ? cleaned : null;
      }

      return {
        id: app.id,
        userId: app.user.id,
        userName: app.user.name,
        userImage: getPublicUrl(app.user.image),
        mcUsername,
        status: app.status as ServerApplicationItem["status"],
        formData: responseFormData,
        reviewNote: app.reviewNote,
        reviewerName: app.reviewer?.name ?? null,
        createdAt: app.createdAt.toISOString(),
        updatedAt: app.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({
      data,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err) {
    logger.error("[api/servers/[id]/applications] Unexpected GET error", err);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
