import type { ImageValidationError } from "@/lib/storage";

type UploadsTranslator = (key: string) => string;

/**
 * Translate an ImageValidationError's `code` into a user-facing message
 * via the `errors.api.uploads` namespace. The error's raw `.message` is
 * intentionally developer-facing and must not be returned directly.
 */
export function translateImageValidationError(
  error: ImageValidationError,
  tUploads: UploadsTranslator,
): string {
  switch (error.code) {
    case "FILE_TOO_LARGE":
      return tUploads("imageTooLarge");
    case "INVALID_IMAGE_TYPE":
      return tUploads("imageUnsupportedType");
    case "INVALID_IMAGE_DIMENSIONS":
      return tUploads("imageDimensionsTooLarge");
    default:
      return tUploads("imageInvalid");
  }
}
