"use client";

import { useTranslations } from "next-intl";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useConfirm } from "@/components/ConfirmDialog";
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
  className = "rounded-lg border border-coral-hover/30 px-3 py-1.5 text-xs font-medium text-coral-hover transition-colors hover:bg-coral-light",
}: DeleteModpackButtonProps) {
  const t = useTranslations("modpacks");
  const router = useRouter();
  const pathname = usePathname();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    if (isDeleting) {
      return;
    }

    const confirmed = await confirm({
      title: t("deleteConfirmTitle"),
      message: t("deleteConfirmMessage", { name: modpackName }),
      confirmText: t("deleteConfirmAction"),
      danger: true,
    });
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
        toast.error(payload.error ?? t("deleteFailed"));
        return;
      }

      onDeleted?.(modpackId);
      toast.success(t("deleteSuccess"));
      router.refresh();
    } catch {
      toast.error(t("deleteNetworkError"));
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
      {isDeleting ? t("deleting") : t("delete")}
    </button>
  );
}
