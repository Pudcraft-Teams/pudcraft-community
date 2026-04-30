export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";

import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getUserImageUrl } from "@/lib/user-image";

interface ProfileResponseData {
  id: string;
  misskeyId: string;
  misskeyUsername: string;
  name: string | null;
  image: string | null;
  bio: string | null;
}

/**
 * GET /api/user/profile
 * Returns the current authenticated user's profile. Profile fields
 * (name / image / bio / misskeyUsername) are sourced from the upstream
 * Misskey instance and re-synced on every login — they cannot be
 * mutated through this API.
 */
export async function GET() {
  const locale = await getRequestLocale();
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tUsers = await getTranslations({ locale, namespace: "errors.api.users" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }
    const userId = authResult.user.id;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        misskeyId: true,
        misskeyUsername: true,
        name: true,
        image: true,
        bio: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: tUsers("notFound") }, { status: 404 });
    }

    const data: ProfileResponseData = {
      id: user.id,
      misskeyId: user.misskeyId,
      misskeyUsername: user.misskeyUsername,
      name: user.name,
      image: getUserImageUrl(user.image),
      bio: user.bio,
    };

    return NextResponse.json({ data });
  } catch (error) {
    logger.error("[api/user/profile] Unexpected GET error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
