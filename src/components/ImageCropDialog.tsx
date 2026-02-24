"use client";

import type Cropper from "cropperjs";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactCropper, { type ReactCropperElement } from "react-cropper";

interface ImageCropDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (croppedFile: File) => void;
  imageFile: File | null;
  aspectRatio?: number;
  outputSize?: number;
  quality?: number;
  title?: string;
}

function clampQuality(value: number): number {
  if (value < 0) {
    return 0;
  }

  if (value > 1) {
    return 1;
  }

  return value;
}

async function getCroppedFile(
  cropper: Cropper,
  outputSize: number,
  quality: number,
): Promise<File> {
  const canvas = cropper.getCroppedCanvas({
    width: outputSize,
    height: outputSize,
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  });

  if (!canvas) {
    throw new Error("裁切失败，请重试");
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (nextBlob) => {
        if (!nextBlob) {
          reject(new Error("无法生成图片，请重试"));
          return;
        }

        resolve(nextBlob);
      },
      "image/webp",
      clampQuality(quality),
    );
  });

  return new File([blob], "image.webp", {
    type: "image/webp",
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
  quality = 0.8,
  title = "裁切图片",
}: ImageCropDialogProps) {
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
      setError("裁切器未就绪，请稍后再试");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const file = await getCroppedFile(cropper, outputSize, quality);
      onConfirm(file);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "裁切失败，请重试");
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
        className="mx-4 w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 sm:p-6"
        style={{ maxHeight: "88vh" }}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
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

        <p className="mt-3 text-xs text-slate-500">提示：拖动图片调整显示区域</p>
        {error && <p className="mt-2 text-sm text-red-500">{error}</p>}

        <div className="sticky bottom-0 mt-5 flex justify-end gap-2 bg-white pt-2">
          <button type="button" onClick={onClose} className="m3-btn m3-btn-tonal">
            取消
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "处理中..." : "确认裁切"}
          </button>
        </div>
      </div>
    </div>
  );
}
