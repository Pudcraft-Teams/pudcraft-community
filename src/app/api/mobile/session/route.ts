import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { toMobileSessionUser } from "@/lib/mobile/sessionFacade";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || typeof session.user.uid !== "number") {
    return NextResponse.json({ error: "请先登录" }, { status: 401 });
  }

  return NextResponse.json({
    user: toMobileSessionUser({
      id: session.user.id,
      uid: session.user.uid,
      name: session.user.name ?? null,
      email: session.user.email ?? "",
      image: session.user.image ?? null,
      role: session.user.role ?? "user",
    }),
  });
}
