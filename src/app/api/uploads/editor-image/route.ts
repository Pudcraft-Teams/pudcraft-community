export const dynamic = "force-dynamic";

import { NextResponse } from "next/server";
import { getTranslations } from "next-intl/server";
import { getRequestLocale } from "@/i18n/locale";
import { isActiveUserError, requireActiveUser } from "@/lib/auth-guard";
import { translateImageValidationError } from "@/lib/i18nImage";
import { logger } from "@/lib/logger";
import { getClientIp } from "@/lib/request-ip";
import {
  getPublicUrl,
  ImageModerationError,
  ImageValidationError,
  imageUploadConstraints,
  uploadEditorImage,
  validateImageFile,
} from "@/lib/storage";

/**
 * POST /api/uploads/editor-image
 * Uploads an image for the Markdown editor and returns an embeddable URL.
 */
export async function POST(request: Request) {
  const locale = await getRequestLocale(request);
  const tCommon = await getTranslations({ locale, namespace: "errors.api" });
  const tUploads = await getTranslations({ locale, namespace: "errors.api.uploads" });
  try {
    const authResult = await requireActiveUser();
    if (isActiveUserError(authResult)) {
      return authResult.response;
    }

    const formData = await request.formData();
    const imageField = formData.get("image");

    if (!(imageField instanceof File) || imageField.size <= 0) {
      return NextResponse.json({ error: tUploads("imageRequired") }, { status: 400 });
    }

    if (imageField.size > imageUploadConstraints.maxFileSizeBytes) {
      return NextResponse.json({ error: tUploads("imageTooLarge") }, { status: 413 });
    }

    const imageBuffer = Buffer.from(await imageField.arrayBuffer());
    const imageMimeType = imageField.type;

    try {
      validateImageFile(imageBuffer, imageMimeType);
    } catch (error) {
      if (error instanceof ImageValidationError) {
        return NextResponse.json(
          { error: translateImageValidationError(error, tUploads) },
          { status: error.status },
        );
      }

      return NextResponse.json({ error: tUploads("imageInvalid") }, { status: 400 });
    }

    let imageKey: string;
    try {
      imageKey = await uploadEditorImage(imageBuffer, authResult.user.id, imageMimeType, {
        userId: authResult.user.id,
        userIp: getClientIp(request),
      });
    } catch (error) {
      if (error instanceof ImageValidationError) {
        return NextResponse.json(
          { error: translateImageValidationError(error, tUploads) },
          { status: error.status },
        );
      }
      if (error instanceof ImageModerationError) {
        return NextResponse.json(
          { error: tUploads("imageModerated"), details: error.category ?? null },
          { status: error.status },
        );
      }
      logger.error("[api/uploads/editor-image] Upload failed", {
        userId: authResult.user.id,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.json({ error: tUploads("imageUploadFailed") }, { status: 500 });
    }

    return NextResponse.json({ data: { url: getPublicUrl(imageKey) } });
  } catch (error) {
    logger.error("[api/uploads/editor-image] Unexpected POST error", error);
    return NextResponse.json({ error: tCommon("internal") }, { status: 500 });
  }
}
