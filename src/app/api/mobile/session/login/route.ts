import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { handleMobileLoginPost } from "@/lib/mobile/sessionFacade";

export async function POST(request: Request) {
  try {
    return await handleMobileLoginPost(request);
  } catch (error) {
    logger.error("[api/mobile/session/login] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
