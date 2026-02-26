import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import {
  deleteFile,
  getObjectKeyFromUrl,
  ImageValidationError,
  uploadAvatar,
  validateImageFile,
} from "@/lib/storage";
import { updateProfileSchema } from "@/lib/validation";

interface ProfileResponseData {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  bio: string | null;
}

function extractTextField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" ? value : undefined;
}

function hasOwnProperty<T extends object>(value: T, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

/**
 * GET /api/user/profile
 * 获取当前登录用户资料。
 */
export async function GET() {
  try {
    const session = await auth();
    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: "请先登录" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const data: ProfileResponseData = {
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      bio: user.bio,
    };

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("[api/user/profile] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

/**
 * PATCH /api/user/profile
 * 更新当前登录用户资料（昵称、简介、头像）。
 */
export async function PATCH(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const existingUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
      },
    });

    if (!existingUser) {
      return NextResponse.json({ error: "用户不存在" }, { status: 404 });
    }

    const formData = await request.formData();
    const payload: Record<string, string> = {};
    const name = extractTextField(formData, "name");
    const bio = extractTextField(formData, "bio");

    if (name !== undefined) {
      payload.name = name;
    }
    if (bio !== undefined) {
      payload.bio = bio;
    }

    const parsed = updateProfileSchema.safeParse(payload);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "校验失败", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const avatarField = formData.get("avatar");
    let avatarBuffer: Buffer | null = null;
    let avatarMimeType: string | null = null;

    if (avatarField instanceof File && avatarField.size > 0) {
      avatarBuffer = Buffer.from(await avatarField.arrayBuffer());
      avatarMimeType = avatarField.type;
      try {
        validateImageFile(avatarBuffer, avatarMimeType);
      } catch (error) {
        if (error instanceof ImageValidationError) {
          return NextResponse.json({ error: error.message }, { status: error.status });
        }

        return NextResponse.json({ error: "头像文件格式或大小无效" }, { status: 400 });
      }
    }

    const data: Prisma.UserUpdateInput = {};

    if (hasOwnProperty(parsed.data, "name")) {
      data.name = parsed.data.name ?? null;
    }

    if (hasOwnProperty(parsed.data, "bio")) {
      data.bio = parsed.data.bio && parsed.data.bio.length > 0 ? parsed.data.bio : null;
    }

    let nextImageUrl: string | null | undefined;
    if (avatarBuffer && avatarMimeType) {
      try {
        nextImageUrl = await uploadAvatar(avatarBuffer, existingUser.id, avatarMimeType);
        data.image = nextImageUrl;
      } catch (error) {
        logger.error("[api/user/profile] Upload avatar failed", {
          userId: existingUser.id,
          reason: error instanceof Error ? error.message : "unknown",
        });
        return NextResponse.json({ error: "头像上传失败，请稍后重试" }, { status: 500 });
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({
        data: {
          id: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          image: existingUser.image,
          bio: existingUser.bio,
        } satisfies ProfileResponseData,
      });
    }

    const updated = await prisma.user.update({
      where: { id: existingUser.id },
      data,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        bio: true,
      },
    });

    if (
      typeof nextImageUrl === "string" &&
      existingUser.image &&
      existingUser.image !== nextImageUrl
    ) {
      const oldKey = getObjectKeyFromUrl(existingUser.image);
      const newKey = getObjectKeyFromUrl(nextImageUrl);
      if (oldKey && oldKey !== newKey) {
        try {
          await deleteFile(oldKey);
        } catch (error) {
          logger.warn("[api/user/profile] delete old avatar failed", {
            userId: existingUser.id,
            key: oldKey,
            reason: error instanceof Error ? error.message : "unknown",
          });
        }
      }
    }

    return NextResponse.json({
      data: {
        id: updated.id,
        name: updated.name,
        email: updated.email,
        image: updated.image,
        bio: updated.bio,
      } satisfies ProfileResponseData,
    });
  } catch (error) {
    logger.error("[api/user/profile] Unexpected PATCH error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
