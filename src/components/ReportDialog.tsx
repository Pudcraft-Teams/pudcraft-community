"use client";

import { useEffect, useState } from "react";
import { useToast } from "@/hooks/useToast";

type ReportCategory =
  | "misinformation"
  | "pornography"
  | "harassment"
  | "fraud"
  | "other";

interface ReportDialogProps {
  targetType: "server" | "comment" | "user";
  targetId: string;
  open: boolean;
  onClose: () => void;
}

interface ReportApiResponse {
  error?: string;
}

const REPORT_CATEGORIES: { key: ReportCategory; label: string }[] = [
  { key: "misinformation", label: "虚假信息" },
  { key: "pornography", label: "色情低俗" },
  { key: "harassment", label: "骚扰攻击" },
  { key: "fraud", label: "广告欺诈" },
  { key: "other", label: "其他" },
];

const TARGET_TYPE_LABELS: Record<ReportDialogProps["targetType"], string> = {
  server: "服务器",
  comment: "评论",
  user: "用户",
};

function toApiPayload(raw: unknown): ReportApiResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * 举报弹窗组件。
 * 支持举报服务器、评论或用户，可选择举报分类并填写补充说明。
 */
export function ReportDialog({
  targetType,
  targetId,
  open,
  onClose,
}: ReportDialogProps) {
  const { toast } = useToast();
  const [category, setCategory] = useState<ReportCategory | null>(null);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, open]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setCategory(null);
      setDescription("");
      setLoading(false);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleSubmit = async () => {
    if (loading || !category) {
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetType,
          targetId,
          category,
          description: description.trim() || undefined,
        }),
      });

      const payload = toApiPayload(await response.json().catch(() => ({})));

      if (!response.ok) {
        toast.error(payload.error ?? "举报提交失败，请稍后重试");
        return;
      }

      toast.success("举报已提交，感谢反馈");
      onClose();
    } catch {
      toast.error("网络异常，举报提交失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-warm-800/30"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="m3-surface mx-4 w-full max-w-md rounded-2xl p-6"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="report-dialog-title"
      >
        <h3
          id="report-dialog-title"
          className="mb-4 text-lg font-semibold text-warm-800"
        >
          举报{TARGET_TYPE_LABELS[targetType]}
        </h3>

        <div className="mb-4 flex flex-wrap gap-2">
          {REPORT_CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`m3-chip text-sm ${category === cat.key ? "m3-chip-active" : ""}`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(event) =>
            setDescription(event.target.value.slice(0, 500))
          }
          placeholder="补充说明（可选）"
          maxLength={500}
          rows={3}
          className="m3-input mb-4 w-full resize-none"
        />

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="m3-btn m3-btn-tonal"
          >
            取消
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !category}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "提交中..." : "提交举报"}
          </button>
        </div>
      </div>
    </div>
  );
}
