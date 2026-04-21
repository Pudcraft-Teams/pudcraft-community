"use client";

import { useTranslations } from "next-intl";
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

const REPORT_CATEGORY_KEYS: { key: ReportCategory; labelKey: string }[] = [
  { key: "misinformation", labelKey: "categoryMisinformation" },
  { key: "pornography", labelKey: "categoryPornography" },
  { key: "harassment", labelKey: "categoryHarassment" },
  { key: "fraud", labelKey: "categoryFraud" },
  { key: "other", labelKey: "categoryOther" },
];

const TARGET_TYPE_TITLE_KEYS: Record<ReportDialogProps["targetType"], string> = {
  server: "titleServer",
  comment: "titleComment",
  user: "titleUser",
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
 * Report dialog — lets users report a server, comment, or user,
 * choose a category, and optionally add a short description.
 */
export function ReportDialog({
  targetType,
  targetId,
  open,
  onClose,
}: ReportDialogProps) {
  const { toast } = useToast();
  const t = useTranslations("reports.dialog");
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
        toast.error(payload.error ?? t("submitFailed"));
        return;
      }

      toast.success(t("submitSuccess"));
      onClose();
    } catch {
      toast.error(t("networkError"));
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
          {t(TARGET_TYPE_TITLE_KEYS[targetType])}
        </h3>

        <div className="mb-4 flex flex-wrap gap-2">
          {REPORT_CATEGORY_KEYS.map((cat) => (
            <button
              key={cat.key}
              type="button"
              onClick={() => setCategory(cat.key)}
              className={`m3-chip text-sm ${category === cat.key ? "m3-chip-active" : ""}`}
            >
              {t(cat.labelKey)}
            </button>
          ))}
        </div>

        <textarea
          value={description}
          onChange={(event) =>
            setDescription(event.target.value.slice(0, 500))
          }
          placeholder={t("descriptionPlaceholder")}
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
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={loading || !category}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? t("submitting") : t("submit")}
          </button>
        </div>
      </div>
    </div>
  );
}
