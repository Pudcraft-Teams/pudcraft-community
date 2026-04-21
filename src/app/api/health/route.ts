export const dynamic = "force-dynamic";

import { logger } from "@/lib/logger";

export function createHealthResponse(nowFactory: () => Date = () => new Date()): Response {
  try {
    return Response.json({ status: "ok", timestamp: nowFactory().toISOString() });
  } catch (error) {
    logger.error("[api/health] Unexpected GET error", error);
    return Response.json({ error: "服务器内部错误" }, { status: 500 });
  }
}

export async function GET() {
  return createHealthResponse();
}
