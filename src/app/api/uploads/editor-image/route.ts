export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import {
  getPublicUrl,
  ImageModerationError,
  ImageValidationError,
  uploadEditorImage,
  validateImageFile,
} from "@/lib/storage";

/**
 * POST /api/uploads/editor-image
 * 上传编辑器图片，返回可插入 Markdown 的 URL。
 */
export async function POST(request: Request) {
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }

    const formData = await request.formData();
    const imageField = formData.get("image");

    if (!(imageField instanceof File) || imageField.size <= 0) {
      return NextResponse.json({ error: "请选择图片文件" }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await imageField.arrayBuffer());
    const imageMimeType = imageField.type;

    try {
      validateImageFile(imageBuffer, imageMimeType);
    } catch (error) {
      if (error instanceof ImageValidationError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      return NextResponse.json({ error: "图片格式或大小无效" }, { status: 400 });
    }

    let imageKey: string;
    try {
      imageKey = await uploadEditorImage(imageBuffer, authResult.user.id, imageMimeType, {
        userId: authResult.user.id,
        userIp: getClientIp(request),
      });
    } catch (error) {
      if (error instanceof ImageModerationError) {
        return NextResponse.json(
          { error: "图片包含违规内容，请更换图片", detail: error.message },
          { status: error.status },
        );
      }
      logger.error("[api/uploads/editor-image] Upload failed", {
        userId: authResult.user.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({ error: "图片上传失败，请稍后重试" }, { status: 500 });
    }

    return NextResponse.json({ data: { url: getPublicUrl(imageKey) } });
  } catch (error) {
    logger.error("[api/uploads/editor-image] Unexpected POST error", error);
    return NextResponse.json({ error: "服务器内部错误" }, { status: 500 });
  }
}
