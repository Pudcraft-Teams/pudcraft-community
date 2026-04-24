"use client";

import { useTranslations } from "next-intl";
import { useCallback, useState } from "react";

interface ApiKeyManagerProps {
  serverId: string;
  hasApiKey: boolean;
}

interface GenerateResponse {
  success?: boolean;
  apiKey?: string;
  message?: string;
  error?: string;
}

function parseGenerateResponse(raw: unknown): GenerateResponse {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }

  const payload = raw as Record<string, unknown>;
  return {
    success: typeof payload.success === "boolean" ? payload.success : undefined,
    apiKey: typeof payload.apiKey === "string" ? payload.apiKey : undefined,
    message: typeof payload.message === "string" ? payload.message : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
  };
}

/**
 * API Key management component.
 * Owners can generate or regenerate the plugin API key; the key is shown once.
 */
export function ApiKeyManager({ serverId, hasApiKey: initialHasApiKey }: ApiKeyManagerProps) {
  const t = useTranslations("console.apiKey");
  const [hasApiKey, setHasApiKey] = useState(initialHasApiKey);
  const [generatedKey, setGeneratedKey] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    setError(null);
    setShowConfirm(false);

    try {
      const response = await fetch(`/api/servers/${serverId}/api-key`, {
        method: "POST",
      });
      const payload = parseGenerateResponse(await response.json().catch(() => ({})));

      if (!response.ok || !payload.success) {
        throw new Error(payload.error ?? t("generateFailed"));
      }

      if (!payload.apiKey) {
        throw new Error(t("keyMissing"));
      }

      setGeneratedKey(payload.apiKey);
      setHasApiKey(true);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : t("generateFailed");
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [serverId, t]);

  const handleCopy = useCallback(async () => {
    if (!generatedKey) return;

    try {
      await navigator.clipboard.writeText(generatedKey);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Fallback: select text for manual copy
      setError(t("copyFailed"));
    }
  }, [generatedKey, t]);

  const handleRequestGenerate = useCallback(() => {
    if (hasApiKey) {
      setShowConfirm(true);
    } else {
      void handleGenerate();
    }
  }, [hasApiKey, handleGenerate]);

  return (
    <section className="m3-surface p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            hasApiKey
              ? "bg-forest-light text-forest-dark ring-1 ring-forest/20"
              : "bg-warm-100 text-warm-500 ring-1 ring-warm-200"
          }`}
        >
          {hasApiKey ? t("badgeGenerated") : t("badgeNotGenerated")}
        </span>
      </div>

      <p className="mt-2 text-sm text-warm-500">{t("description")}</p>

      {error && <p className="mt-3 text-sm text-accent-hover">{error}</p>}

      {/* Confirm dialog for reset */}
      {showConfirm && (
        <div className="mt-3 rounded-xl border border-accent-hover/20 bg-accent-muted px-4 py-3">
          <p className="text-sm font-medium text-warm-800">{t("resetConfirm")}</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              className="m3-btn m3-btn-primary text-sm"
            >
              {isGenerating ? t("generating") : t("confirm")}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="m3-btn m3-btn-tonal text-sm"
            >
              {t("cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Generated key display */}
      {generatedKey && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-accent/30 bg-accent-muted px-4 py-3">
            <p className="mb-2 text-xs font-medium text-accent-hover">{t("keyOnceWarning")}</p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm text-warm-800 ring-1 ring-warm-200">
                {generatedKey}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="m3-btn m3-btn-tonal shrink-0 text-sm"
              >
                {copied ? t("copied") : t("copy")}
              </button>
            </div>
          </div>

          {/* Plugin config hint */}
          <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
            <p className="mb-2 text-xs font-medium text-warm-500">{t("configExampleTitle")}</p>
            <pre className="overflow-x-auto whitespace-pre rounded-lg bg-surface px-3 py-2 font-mono text-xs text-warm-800 ring-1 ring-warm-200">
              {`platformUrl: https://your-domain.com\napiKey: ${generatedKey}`}
            </pre>
          </div>
        </div>
      )}

      {/* Generate/reset button (hidden when confirm dialog is shown) */}
      {!showConfirm && !generatedKey && (
        <button
          type="button"
          onClick={handleRequestGenerate}
          disabled={isGenerating}
          className="m3-btn m3-btn-primary mt-4 text-sm"
        >
          {isGenerating ? t("generating") : hasApiKey ? t("regenerate") : t("generate")}
        </button>
      )}

      {/* Show reset button after key was revealed */}
      {generatedKey && (
        <button
          type="button"
          onClick={() => {
            setGeneratedKey(null);
            setShowConfirm(false);
          }}
          className="m3-btn m3-btn-tonal mt-3 text-sm"
        >
          {t("done")}
        </button>
      )}
    </section>
  );
}
