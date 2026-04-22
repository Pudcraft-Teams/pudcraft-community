export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { flattenZodErrorWithLocale, getZodErrorMap } from "@/lib/i18nZod";
import { logger } from "@/lib/logger";
import { moderateContent } from "@/lib/moderation";
import { createTranslatedNotification } from "@/lib/notification";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/request-ip";
import { canViewServerDetails, isPrivilegedServerViewer } from "@/lib/server-access";
import { resolveServerCuid } from "@/lib/lookup";
import { getPublicUrl } from "@/lib/storage";
import type { ServerComment } from "@/lib/types";
import { createCommentSchema, queryCommentsSchema, serverLookupIdSchema } from "@/lib/validation";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface CommentNotificationParams {
  serverId: string;
  commentId: string;
  parentId: string | null;
  actorId: string;
  actorName: string;
}

function getActorDisplayName(name: string | null | undefined, fallback: string): string {
  if (typeof name !== "string") {
    return fallback;
  }

  const trimmed = name.trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

async function createCommentNotification({
  serverId,
  commentId,
  parentId,
  actorId,
  actorName,
}: CommentNotificationParams): Promise<void> {
  try {
    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        psid: true,
        ownerId: true,
        name: true,
      },
    });

    if (!server) {
      return;
    }

    if (parentId) {
      const parentComment = await prisma.serverComment.findUnique({
        where: { id: parentId },
        select: {
          authorId: true,
        },
      });

      if (parentComment && parentComment.authorId !== actorId) {
        await createTranslatedNotification({
          userId: parentComment.authorId,
          type: "comment_reply",
          titleKey: "commentReplyTitle",
          bodyKey: "commentReplyBody",
          params: { actor: actorName },
          link: `/servers/${server.psid}#comment-${commentId}`,
          serverId,
          commentId,
        });
      }

      return;
    }

    if (server.ownerId && server.ownerId !== actorId) {
      await createTranslatedNotification({
        userId: server.ownerId,
        type: "comment_reply",
        titleKey: "newCommentTitle",
        bodyKey: "newCommentBody",
        params: { actor: actorName, serverName: server.name },
        link: `/servers/${server.psid}#comment-${commentId}`,
        serverId,
        commentId,
      });
    }
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Failed to create notification", error);
  }
}

function mapComments(
  comments: Array<{
    id: string;
    content: string;
    createdAt: Date;
    author: {
      id: string;
      uid: number;
      name: string | null;
      image: string | null;
    };
    replies: Array<{
      id: string;
      content: string;
      createdAt: Date;
      author: {
        id: string;
        uid: number;
        name: string | null;
        image: string | null;
      };
    }>;
  }>,
): ServerComment[] {
  return comments.map((comment) => ({
    id: comment.id,
    content: comment.content,
    createdAt: comment.createdAt.toISOString(),
    author: {
      id: comment.author.id,
      uid: comment.author.uid,
      name: comment.author.name,
      image: getPublicUrl(comment.author.image),
    },
    replies: comment.replies.map((reply) => ({
      id: reply.id,
      content: reply.content,
      createdAt: reply.createdAt.toISOString(),
      author: {
        id: reply.author.id,
        uid: reply.author.uid,
        name: reply.author.name,
        image: getPublicUrl(reply.author.image),
      },
    })),
  }));
}

/**
 * GET /api/servers/:id/comments
 * Returns top-level comments (plus one layer of replies) with pagination.
 */
export async function GET(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  try {
    const { id } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const parsedQuery = queryCommentsSchema.safeParse(
      {
        page: searchParams.get("page") ?? undefined,
        limit: searchParams.get("limit") ?? undefined,
      },
      { errorMap: getZodErrorMap(locale) },
    );
    if (!parsedQuery.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsedQuery.error, locale),
        },
        { status: 400 },
      );
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        status: true,
        visibility: true,
        ownerId: true,
      },
    });
    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const session = await auth();
    let isMember = false;
    if (
      server.visibility !== "public" &&
      session?.user?.id &&
      !isPrivilegedServerViewer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: session.user.id,
        currentUserRole: session.user.role,
      })
    ) {
      isMember = await prisma.serverMember
        .findUnique({
          where: { unique_server_member: { serverId, userId: session.user.id } },
          select: { id: true },
        })
        .then((member) => member !== null);
    }

    if (
      !canViewServerDetails({
        status: server.status,
        visibility: server.visibility,
        ownerId: server.ownerId,
        currentUserId: session?.user?.id,
        currentUserRole: session?.user?.role,
        isMember,
      })
    ) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const { page, limit } = parsedQuery.data;
    const where = {
      serverId,
      parentId: null,
    };

    const [total, comments] = await Promise.all([
      prisma.serverComment.count({ where }),
      prisma.serverComment.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: {
            select: {
              id: true,
              uid: true,
              name: true,
              image: true,
            },
          },
          replies: {
            orderBy: { createdAt: "asc" },
            include: {
              author: {
                select: {
                  id: true,
                  uid: true,
                  name: true,
                  image: true,
                },
              },
            },
          },
        },
      }),
    ]);

    return NextResponse.json({
      comments: mapComments(comments),
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}

/**
 * POST /api/servers/:id/comments
 * Posts a comment or reply (two-layer max: root comment → reply).
 */
export async function POST(request: Request, { params }: RouteContext) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tServers = await getTranslations({ locale, namespace: "errors.api.servers" });
  const tComments = await getTranslations({ locale, namespace: "errors.api.comments" });
  const tUser = await getTranslations({ locale, namespace: "user.avatar" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const limitResult = await rateLimit(`comment:${userId}`, 5, 60);
    if (!limitResult.allowed) {
      return NextResponse.json({ error: tCommon("rateLimited") }, { status: 429 });
    }

    const { id } = await params;
    const parsedServerId = serverLookupIdSchema.safeParse(id);
    if (!parsedServerId.success) {
      return NextResponse.json({ error: tServers("invalidIdFormat") }, { status: 400 });
    }

    const serverId = await resolveServerCuid(parsedServerId.data);
    if (!serverId) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const server = await prisma.server.findUnique({
      where: { id: serverId },
      select: {
        id: true,
        status: true,
        visibility: true,
        ownerId: true,
      },
    });
    if (!server) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    let isMember = false;
    if (
      server.visibility !== "public" &&
      !isPrivilegedServerViewer({
        status: server.status,
        ownerId: server.ownerId,
        currentUserId: userId,
        currentUserRole: authResult.user.role,
      })
    ) {
      isMember = await prisma.serverMember
        .findUnique({
          where: { unique_server_member: { serverId, userId } },
          select: { id: true },
        })
        .then((member) => member !== null);
    }

    const canAccessCurrentServer = canViewServerDetails({
      status: server.status,
      visibility: server.visibility,
      ownerId: server.ownerId,
      currentUserId: userId,
      currentUserRole: authResult.user.role,
      isMember,
    });
    if (!canAccessCurrentServer) {
      return NextResponse.json({ error: tServers("notFound") }, { status: 404 });
    }

    const body = await request.json().catch(() => null);
    const parsedBody = createCommentSchema.safeParse(body);
    if (!parsedBody.success) {
      return NextResponse.json(
        {
          error: tCommon("validationFailed"),
          details: flattenZodErrorWithLocale(parsedBody.error, locale),
        },
        { status: 400 },
      );
    }

    const { content, parentId } = parsedBody.data;

    // ─── Content moderation ───
    const modResult = await moderateContent(content, "comment", {
      userId,
      userIp: getClientIp(request),
    });
    if (!modResult.passed) {
      return NextResponse.json(
        { error: tComments("contentModerated"), details: modResult.reason },
        { status: 422 },
      );
    }

    if (parentId) {
      const parent = await prisma.serverComment.findUnique({
        where: { id: parentId },
        select: {
          id: true,
          serverId: true,
          parentId: true,
        },
      });

      if (!parent || parent.serverId !== serverId) {
        return NextResponse.json({ error: tComments("replyTargetInvalid") }, { status: 400 });
      }

      if (parent.parentId) {
        return NextResponse.json({ error: tComments("replyDepthExceeded") }, { status: 400 });
      }
    }

    const comment = await prisma.serverComment.create({
      data: {
        content,
        serverId,
        authorId: userId,
        parentId: parentId ?? null,
      },
      include: {
        author: {
          select: {
            id: true,
            uid: true,
            name: true,
            image: true,
          },
        },
      },
    });

    const actorName = getActorDisplayName(authResult.user.name, tUser("fallbackName"));
    void createCommentNotification({
      serverId,
      commentId: comment.id,
      parentId: comment.parentId,
      actorId: userId,
      actorName,
    });

    return NextResponse.json(
      {
        data: {
          id: comment.id,
          content: comment.content,
          createdAt: comment.createdAt.toISOString(),
          parentId: comment.parentId,
          author: {
            id: comment.author.id,
            uid: comment.author.uid,
            name: comment.author.name,
            image: getPublicUrl(comment.author.image),
          },
        },
      },
      { status: 201 },
    );
  } catch (error) {
    logger.error("[api/servers/[id]/comments] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
