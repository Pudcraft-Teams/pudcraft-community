"use client";

import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/hooks/useToast";

interface DeleteModpackButtonProps {
  modpackId: string;
  modpackName: string;
  onDeleted?: (modpackId: string) => void;
  className?: string;
}

interface DeleteApiPayload {
  error?: string;
}

function toApiPayload(raw: unknown): DeleteApiPayload {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 整合包删除按钮。
 */
export function DeleteModpackButton({
  modpackId,
  modpackName,
  onDeleted,
  className = "rounded-lg border border-rose-200 px-3 py-1.5 text-xs font-medium text-rose-600 transition-colors hover:bg-rose-50",
}: DeleteModpackButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    const confirmed = window.confirm(`确定删除整合包「${modpackName}」吗？此操作不可恢复。`);
    if (!confirmed) {
      return;
    }

    setIsDeleting(true);
    try {
      const response = await fetch(`/api/modpacks/${modpackId}`, {
        method: "DELETE",
      });
      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (response.status === 401) {
        router.replace(`/login?callbackUrl=${encodeURIComponent(pathname || "/")}`);
        return;
      }

      if (!response.ok) {
        toast.error(payload.error ?? "删除失败，请稍后重试");
        return;
      }

      onDeleted?.(modpackId);
      toast.success("整合包已删除");
      router.refresh();
    } catch {
      toast.error("网络异常，删除失败");
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isDeleting}
      className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {isDeleting ? "删除中..." : "删除"}
    </button>
  );
}
