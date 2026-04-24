"use client";

import type Cropper from "cropperjs";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactCropper, { type ReactCropperElement } from "react-cropper";

interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
  imageFile: File | null;
  aspectRatio?: number;
  outputSize?: number;
  title?: string;
}

async function getCroppedFile(
  cropper: Cropper,
  outputSize: number,
  errorMessages: { cropFailed: string; blobFailed: string },
): Promise<File> {
  const canvas = cropper.getCroppedCanvas({
    width: outputSize,
    height: outputSize,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  if (!canvas) {
    throw new Error(errorMessages.cropFailed);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error(errorMessages.blobFailed));
          return;
        }

        resolve(nextBlob);
      },
      "image/png",
    );
  });

  return new File([blob], "image.png", {
    type: "image/png",
    lastModified: Date.now(),
  });
}

export function ImageCropDialog({
  open,
  onClose,
  onConfirm,
  imageFile,
  aspectRatio = 1,
  outputSize = 512,
  title,
}: ImageCropDialogProps) {
  const t = useTranslations("servers.common.imageCrop");
  const resolvedTitle = title ?? t("title");
  const cropperRef = useRef<ReactCropperElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const imageUrl = useMemo(() => {
    if (!imageFile) {
      return null;
    }

    return URL.createObjectURL(imageFile);
  }, [imageFile]);

  useEffect(() => {
    if (!imageUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(imageUrl);
    };
  }, [imageUrl]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setIsSubmitting(false);
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open || !imageFile || !imageUrl) {
    return null;
  }

  const handleConfirm = async () => {
    const cropper = cropperRef.current?.cropper;
    if (!cropper) {
      setError(t("cropperNotReady"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const file = await getCroppedFile(cropper, outputSize, {
        cropFailed: t("cropFailed"),
        blobFailed: t("blobFailed"),
      });
      onConfirm(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t("cropFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="mx-4 w-full max-w-lg overflow-y-auto rounded-xl bg-surface p-4 sm:p-6"
        style={{ maxHeight: "88vh" }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crop-dialog-title"
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 id="crop-dialog-title" className="text-lg font-semibold text-warm-800">{resolvedTitle}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-warm-400 transition-colors hover:bg-warm-100 hover:text-warm-800"
            aria-label={t("closeLabel")}
          >
            ✕
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-warm-200 bg-warm-100">
          <ReactCropper
            ref={cropperRef}
            src={imageUrl}
            className="max-h-[50vh] w-full"
            viewMode={1}
            aspectRatio={aspectRatio}
            dragMode="move"
            responsive
            restore={false}
            checkOrientation={false}
            guides={false}
            background={false}
            autoCropArea={1}
            movable
            zoomable
            scalable={false}
            rotatable={false}
            toggleDragModeOnDblclick={false}
          />
        </div>

        <p className="mt-3 text-xs text-warm-400">{t("tip")}</p>
        {error && <p className="mt-2 text-sm text-accent-hover">{error}</p>}

        <div className="sticky bottom-0 mt-5 flex justify-end gap-2 bg-surface pt-2">
          <button type="button" onClick={onClose} className="m3-btn m3-btn-tonal">
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? t("processing") : t("confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
