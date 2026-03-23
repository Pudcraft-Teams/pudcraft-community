"use client";

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
 * API Key 管理组件。
 * 服主可以在此生成或重置插件 API Key，密钥仅展示一次。
 */
export function ApiKeyManager({ serverId, hasApiKey: initialHasApiKey }: ApiKeyManagerProps) {
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
        throw new Error(payload.error ?? "生成 API Key 失败");
      }

      if (!payload.apiKey) {
        throw new Error("未收到 API Key");
      }

      setGeneratedKey(payload.apiKey);
      setHasApiKey(true);
    } catch (fetchError) {
      const message = fetchError instanceof Error ? fetchError.message : "生成 API Key 失败";
      setError(message);
    } finally {
      setIsGenerating(false);
    }
  }, [serverId]);

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
      setError("复制失败，请手动复制");
    }
  }, [generatedKey]);

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
        <h2 className="text-lg font-semibold text-warm-800">插件 API Key</h2>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
            hasApiKey
              ? "bg-forest-light text-forest-dark ring-1 ring-forest/20"
              : "bg-warm-100 text-warm-500 ring-1 ring-warm-200"
          }`}
        >
          {hasApiKey ? "已生成" : "未生成"}
        </span>
      </div>

      <p className="mt-2 text-sm text-warm-500">
        生成 API Key 后，可在 Minecraft 插件中配置，实现白名单自动同步。
      </p>

      {error && <p className="mt-3 text-sm text-accent-hover">{error}</p>}

      {/* Confirm dialog for reset */}
      {showConfirm && (
        <div className="mt-3 rounded-xl border border-accent-hover/20 bg-accent-muted px-4 py-3">
          <p className="text-sm font-medium text-warm-800">
            生成新密钥将使旧密钥失效，确定继续？
          </p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => void handleGenerate()}
              disabled={isGenerating}
              className="m3-btn m3-btn-primary text-sm"
            >
              {isGenerating ? "生成中..." : "确定"}
            </button>
            <button
              type="button"
              onClick={() => setShowConfirm(false)}
              className="m3-btn m3-btn-tonal text-sm"
            >
              取消
            </button>
          </div>
        </div>
      )}

      {/* Generated key display */}
      {generatedKey && (
        <div className="mt-4 space-y-3">
          <div className="rounded-xl border border-accent/30 bg-accent-muted px-4 py-3">
            <p className="mb-2 text-xs font-medium text-accent-hover">
              此密钥仅显示一次，请妥善保存
            </p>
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-lg bg-surface px-3 py-2 font-mono text-sm text-warm-800 ring-1 ring-warm-200">
                {generatedKey}
              </code>
              <button
                type="button"
                onClick={() => void handleCopy()}
                className="m3-btn m3-btn-tonal shrink-0 text-sm"
              >
                {copied ? "已复制" : "复制"}
              </button>
            </div>
          </div>

          {/* Plugin config hint */}
          <div className="rounded-xl border border-warm-200 bg-warm-50 px-4 py-3">
            <p className="mb-2 text-xs font-medium text-warm-500">插件配置示例</p>
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
          {isGenerating ? "生成中..." : hasApiKey ? "重新生成密钥" : "生成密钥"}
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
          完成
        </button>
      )}
    </section>
  );
}
