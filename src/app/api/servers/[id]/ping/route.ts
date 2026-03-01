import { NextResponse } from "next/server";
import { serverIdSchema } from "@/lib/validation";

/**
 * GET /api/servers/:id/ping
 * 轻量端点，供前端测量往返延迟用。
 * 不查数据库，只做 ID 格式校验后立即返回。
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const parsed = serverIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "无效的服务器 ID" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
