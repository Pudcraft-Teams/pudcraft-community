import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";

interface ActiveUser {
  id: string;
  role: string;
  name: string | null;
}

interface ActiveUserSuccess {
  user: ActiveUser;
}

interface ActiveUserError {
  response: NextResponse<{ error: string }>;
}

export type ActiveUserResult = ActiveUserSuccess | ActiveUserError;

export function isActiveUserError(result: ActiveUserResult): result is ActiveUserError {
  return "response" in result;
}

/**
 * 统一登录态 + 封禁态校验。
 * 用于敏感 API：未登录返回 401，被封禁返回 403。
 */
export async function requireActiveUser(): Promise<ActiveUserResult> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return {
      response: NextResponse.json({ error: "请先登录" }, { status: 401 }),
    };
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, name: true, isBanned: true },
  });

  if (!user) {
    return {
      response: NextResponse.json({ error: "用户不存在" }, { status: 401 }),
    };
  }

  if (user.isBanned) {
    return {
      response: NextResponse.json({ error: "账号已被封禁" }, { status: 403 }),
    };
  }

  return {
    user: {
      id: user.id,
      role: user.role,
      name: user.name,
    },
  };
}
