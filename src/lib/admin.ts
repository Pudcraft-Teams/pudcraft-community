import { auth } from "./auth";
import { db } from "./db";

interface AdminSuccess {
  userId: string;
}

interface AdminError {
  error: string;
  status: number;
}

export type RequireAdminResult = AdminSuccess | AdminError;

export function isAdminError(result: RequireAdminResult): result is AdminError {
  return "error" in result;
}

export async function requireAdmin(): Promise<RequireAdminResult> {
  const session = await auth();

  if (!session?.user?.id) {
    return { error: "请先登录", status: 401 };
  }

  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { role: true, isBanned: true },
  });

  if (user?.isBanned) {
    return { error: "账号已被封禁", status: 403 };
  }

  if (!user || user.role !== "admin") {
    return { error: "无管理员权限", status: 403 };
  }

  return { userId: session.user.id };
}
