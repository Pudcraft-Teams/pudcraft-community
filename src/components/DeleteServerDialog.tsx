"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";

interface DeleteApiResponse {
  error?: string;
}

interface DeleteServerDialogProps {
  serverId: string;
  serverName: string;
  redirectTo?: string;
  onDeleted?: (serverId: string) => void;
  buttonText?: string;
  triggerClassName?: string;
}

function toApiPayload(raw: unknown): DeleteApiResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 服务器删除确认对话框。
 * 支持遮罩点击/ESC 关闭，确认后调用 DELETE API。
 */
export function DeleteServerDialog({
  serverId,
  serverName,
  redirectTo,
  onDeleted,
  buttonText = "删除",
  triggerClassName = "m3-btn rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs text-rose-600 transition-colors hover:bg-rose-50",
}: DeleteServerDialogProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  const handleConfirmDelete = async () => {
    if (isDeleting) {
      return;
    }

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/servers/${serverId}`, {
        method: "DELETE",
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/console")}`);
        return;
      }

      if (!response.ok) {
        toast.error(payload.error ?? "删除失败，请稍后重试");
        return;
      }

      setOpen(false);
      onDeleted?.(serverId);
      toast.success("服务器已删除");

      if (redirectTo) {
        router.push(redirectTo);
        router.refresh();
      }
    } catch {
      toast.error("网络异常，删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
        }}
        className={triggerClassName}
      >
        {buttonText}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="关闭删除确认弹窗"
            className="absolute inset-0 bg-slate-900/30"
            onClick={() => setOpen(false)}
          />

          <div className="m3-surface relative w-full max-w-md p-6">
            <h3 className="text-lg font-semibold text-slate-900">确认删除</h3>
            <p className="mt-3 text-sm text-slate-600">
              确定要删除服务器「{serverName}」吗？此操作不可恢复。
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="m3-btn m3-btn-tonal"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="m3-btn m3-btn-danger disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isDeleting ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
