import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { handleMobileSessionGet } from "@/lib/mobile/sessionFacade";
import { getPublicUrl } from "@/lib/storage";

export async function GET() {
  try {
    return await handleMobileSessionGet({
      authImpl: auth,
      loadUserById: async (userId) => {
        const user = await db.user.findUnique({
          where: { id: userId },
          select: {
            id: true,
            uid: true,
            name: true,
            email: true,
            image: true,
            role: true,
            isBanned: true,
          },
        });

        if (!user) {
          return null;
        }

        return {
          ...user,
          image: getPublicUrl(user.image),
        };
      },
    });
  } catch (error) {
    logger.error("[api/mobile/session] Unexpected GET error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
