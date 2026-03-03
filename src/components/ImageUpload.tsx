"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ImageCropDialog } from "@/components/ImageCropDialog";

interface ImageUploadProps {
  value: string | null;
  onChange: (file: File | null) => void;
  shape?: "circle" | "rounded";
  size?: number;
  outputSize?: number;
  placeholder?: ReactNode;
  maxFileSize?: number;
  capture?: "user" | "environment";
}

const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024;

export function ImageUpload({
  value,
  onChange,
  shape = "rounded",
  size = 96,
  outputSize = 512,
  placeholder,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
  capture,
}: ImageUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [openCropDialog, setOpenCropDialog] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null;
    }

    return URL.createObjectURL(selectedFile);
  }, [selectedFile]);

  useEffect(() => {
    if (!previewUrl) {
      return;
    }

    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const displaySrc = previewUrl ?? value;
  const shapeClass = shape === "circle" ? "rounded-full" : "rounded-xl";
  const isAvatarWithImage = shape === "circle" && !!displaySrc;

  const validateBeforeCrop = (file: File): string | null => {
    if (!ALLOWED_TYPES.has(file.type)) {
      return "请选择 PNG、JPG、WebP 或 GIF 格式的图片";
    }

    if (file.size > maxFileSize) {
      return `原图大小不能超过 ${Math.round(maxFileSize / (1024 * 1024))}MB`;
    }

    return null;
  };

  const startCrop = (file: File) => {
    const validationError = validateBeforeCrop(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    setPendingFile(file);
    setOpenCropDialog(true);
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      startCrop(file);
    }

    event.currentTarget.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragActive(false);

    const file = event.dataTransfer.files[0];
    if (file) {
      startCrop(file);
    }
  };

  const handleRemoveSelected = () => {
    setSelectedFile(null);
    setError(null);
    onChange(null);
  };

  const defaultPlaceholder =
    shape === "circle" ? (
      <div className="flex flex-col items-center gap-2">
        <div
          className={`flex items-center justify-center bg-teal-600 text-xl font-semibold text-white ${shapeClass}`}
          style={{ width: size, height: size }}
        >
          +
        </div>
        <span className="text-xs text-slate-600">点击上传头像</span>
      </div>
    ) : (
      <div className="flex flex-col items-center gap-1 text-slate-500">
        <span className="text-lg">⬆</span>
        <span className="text-xs">点击上传</span>
      </div>
    );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragActive(true);
        }}
        onDragLeave={() => setIsDragActive(false)}
        onDrop={handleDrop}
        className={
          isAvatarWithImage
            ? "inline-flex cursor-pointer"
            : `cursor-pointer rounded-xl border border-dashed px-4 py-6 text-center transition-colors ${
                isDragActive
                  ? "border-[#cbe5eb] bg-[#e2f4f7]"
                  : "border-slate-300 bg-slate-50 hover:border-slate-400"
              }`
        }
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          capture={capture}
          onChange={handleInputChange}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-3">
          {displaySrc ? (
            isAvatarWithImage ? (
              <div className="group relative">
                <Image
                  src={displaySrc}
                  alt="图片预览"
                  width={size}
                  height={size}
                  unoptimized
                  className={`object-cover ${shapeClass}`}
                  style={{ width: size, height: size }}
                />
                <div
                  className={`absolute inset-0 flex items-center justify-center bg-black/45 text-lg text-white opacity-0 transition-opacity group-hover:opacity-100 ${shapeClass}`}
                >
                  编辑
                </div>
              </div>
            ) : (
              <Image
                src={displaySrc}
                alt="图片预览"
                width={size}
                height={size}
                unoptimized
                className={`object-cover ${shapeClass}`}
                style={{ width: size, height: size }}
              />
            )
          ) : (
            (placeholder ?? defaultPlaceholder)
          )}
        </div>
      </div>

      {shape !== "circle" && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="m3-btn m3-btn-tonal rounded-lg px-2.5 py-1 text-xs"
          >
            {displaySrc ? "更换图片" : "选择图片"}
          </button>
          {selectedFile && (
            <button
              type="button"
              onClick={handleRemoveSelected}
              className="m3-btn m3-btn-tonal rounded-lg px-2.5 py-1 text-xs"
            >
              移除已选图片
            </button>
          )}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      <ImageCropDialog
        open={openCropDialog}
        onClose={() => {
          setOpenCropDialog(false);
          setPendingFile(null);
        }}
        imageFile={pendingFile}
        aspectRatio={1}
        outputSize={outputSize}
        onConfirm={(croppedFile) => {
          setSelectedFile(croppedFile);
          setOpenCropDialog(false);
          setPendingFile(null);
          setError(null);
          onChange(croppedFile);
        }}
      />
    </div>
  );
}
