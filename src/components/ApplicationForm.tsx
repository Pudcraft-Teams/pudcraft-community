"use client";

import { useCallback, useState } from "react";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import { useToast } from "@/hooks/useToast";
import type { ApplicationFormField } from "@/lib/types";

interface ApplicationFormProps {
  serverId: string;
  fields: ApplicationFormField[] | null;
  onSuccess?: () => void;
}

interface FieldErrors {
  mcUsername?: string;
  [key: string]: string | undefined;
}

const MC_USERNAME_REGEX = /^[a-zA-Z0-9_]+$/;

function extractError(payload: unknown): string | undefined {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  const maybeError = (payload as { error?: unknown }).error;
  return typeof maybeError === "string" ? maybeError : undefined;
}

/**
 * 动态入服申请表单。
 * 根据服务器配置的 applicationForm 字段渲染表单，
 * 始终包含 Minecraft 用户名输入。
 */
export function ApplicationForm({ serverId, fields, onSuccess }: ApplicationFormProps) {
  const { toast } = useToast();

  const [mcUsername, setMcUsername] = useState("");
  const [formData, setFormData] = useState<Record<string, string | string[]>>(() => {
    const initial: Record<string, string | string[]> = {};
    if (fields) {
      for (const field of fields) {
        if (field.type === "multiselect") {
          initial[field.key] = [];
        } else {
          initial[field.key] = "";
        }
      }
    }
    return initial;
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const updateField = useCallback((key: string, value: string | string[]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const toggleMultiselect = useCallback((key: string, option: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev[key]) ? (prev[key] as string[]) : [];
      const next = current.includes(option)
        ? current.filter((item) => item !== option)
        : [...current, option];
      return { ...prev, [key]: next };
    });
    setFieldErrors((prev) => ({ ...prev, [key]: undefined }));
  }, []);

  const validate = useCallback((): boolean => {
    const errors: FieldErrors = {};
    let valid = true;

    // MC Username validation
    const trimmedUsername = mcUsername.trim();
    if (trimmedUsername.length === 0) {
      errors.mcUsername = "请输入 Minecraft 用户名";
      valid = false;
    } else if (trimmedUsername.length < 3) {
      errors.mcUsername = "用户名至少 3 个字符";
      valid = false;
    } else if (trimmedUsername.length > 16) {
      errors.mcUsername = "用户名最多 16 个字符";
      valid = false;
    } else if (!MC_USERNAME_REGEX.test(trimmedUsername)) {
      errors.mcUsername = "用户名只能包含字母、数字和下划线";
      valid = false;
    }

    // Dynamic field validation
    if (fields) {
      for (const field of fields) {
        const value = formData[field.key];

        if (field.required) {
          if (field.type === "multiselect") {
            if (!Array.isArray(value) || value.length === 0) {
              errors[field.key] = `请选择${field.label}`;
              valid = false;
            }
          } else if (typeof value === "string" && value.trim().length === 0) {
            errors[field.key] = `请填写${field.label}`;
            valid = false;
          }
        }

        // Textarea max length
        if (field.type === "textarea" && typeof value === "string" && value.length > 500) {
          errors[field.key] = "最多 500 个字符";
          valid = false;
        }
      }
    }

    setFieldErrors(errors);
    return valid;
  }, [mcUsername, fields, formData]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) {
      return;
    }

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Build formData payload (only non-empty dynamic fields)
      const payload: Record<string, string | string[]> = {};
      if (fields) {
        for (const field of fields) {
          const value = formData[field.key];
          if (field.type === "multiselect") {
            if (Array.isArray(value) && value.length > 0) {
              payload[field.key] = value;
            }
          } else if (typeof value === "string" && value.trim().length > 0) {
            payload[field.key] = value.trim();
          }
        }
      }

      const response = await fetch(`/api/servers/${serverId}/applications`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mcUsername: mcUsername.trim(),
          formData: Object.keys(payload).length > 0 ? payload : undefined,
        }),
      });

      const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

      if (!response.ok) {
        const errorMessage = extractError(body) ?? "提交失败，请稍后重试";
        if (response.status === 409) {
          toast.error(errorMessage);
        } else {
          toast.error(errorMessage);
        }
        return;
      }

      setIsSuccess(true);
      onSuccess?.();
    } catch {
      toast.error("网络异常，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Success state
  if (isSuccess) {
    return (
      <div className="m3-surface p-6 text-center">
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-forest-light">
          <svg
            className="h-6 w-6 text-forest"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={2}
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold text-warm-800">申请已提交</h3>
        <p className="mt-1 text-sm text-warm-600">请等待服主审核，审核结果将通过站内通知告知。</p>
      </div>
    );
  }

  return (
    <form className="m3-surface p-6" onSubmit={handleSubmit} noValidate>
      <h3 className="mb-4 text-lg font-semibold text-warm-800">入服申请</h3>

      <fieldset disabled={isSubmitting} className="space-y-4 disabled:opacity-90">
        {/* MC Username - always shown, always required */}
        <div>
          <label htmlFor="mc-username" className="block text-sm font-medium text-warm-700">
            Minecraft 用户名
            <span className="ml-0.5 text-coral-hover">*</span>
          </label>
          <input
            id="mc-username"
            type="text"
            value={mcUsername}
            onChange={(event) => {
              setMcUsername(event.target.value);
              setFieldErrors((prev) => ({ ...prev, mcUsername: undefined }));
            }}
            className="m3-input mt-1.5 w-full"
            placeholder="你的 MC 游戏 ID"
            maxLength={16}
            autoComplete="off"
          />
          {fieldErrors.mcUsername && (
            <p className="mt-1 text-xs text-coral-hover">{fieldErrors.mcUsername}</p>
          )}
        </div>

        {/* Dynamic fields */}
        {fields?.map((field) => (
          <div key={field.key}>
            <label
              htmlFor={`field-${field.key}`}
              className="block text-sm font-medium text-warm-700"
            >
              {field.label}
              {field.required && <span className="ml-0.5 text-coral-hover">*</span>}
            </label>

            {field.type === "text" && (
              <input
                id={`field-${field.key}`}
                type="text"
                value={(formData[field.key] as string) ?? ""}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="m3-input mt-1.5 w-full"
                placeholder={field.placeholder}
                autoComplete="off"
              />
            )}

            {field.type === "textarea" && (
              <>
                <textarea
                  id={`field-${field.key}`}
                  value={(formData[field.key] as string) ?? ""}
                  onChange={(event) => updateField(field.key, event.target.value)}
                  className="m3-input mt-1.5 min-h-[100px] w-full"
                  placeholder={field.placeholder}
                  maxLength={500}
                />
                <p className="mt-1 text-xs text-warm-500">
                  {((formData[field.key] as string) ?? "").length}/500
                </p>
              </>
            )}

            {field.type === "select" && (
              <select
                id={`field-${field.key}`}
                value={(formData[field.key] as string) ?? ""}
                onChange={(event) => updateField(field.key, event.target.value)}
                className="m3-input mt-1.5 w-full"
              >
                <option value="">{field.placeholder ?? "请选择"}</option>
                {field.options?.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            )}

            {field.type === "multiselect" && (
              <div className="mt-1.5 flex flex-wrap gap-2">
                {field.options?.map((option) => {
                  const selected =
                    Array.isArray(formData[field.key]) &&
                    (formData[field.key] as string[]).includes(option);
                  return (
                    <label
                      key={option}
                      className={`flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                        selected
                          ? "border-coral bg-coral-light text-coral"
                          : "border-warm-200 bg-[#FFFAF6] text-warm-700 hover:border-warm-300"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggleMultiselect(field.key, option)}
                        className="sr-only"
                      />
                      {option}
                    </label>
                  );
                })}
              </div>
            )}

            {fieldErrors[field.key] && (
              <p className="mt-1 text-xs text-coral-hover">{fieldErrors[field.key]}</p>
            )}
          </div>
        ))}

        {/* Submit button */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="m3-btn m3-btn-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="inline-flex items-center gap-2">
                <LoadingSpinner size="sm" />
                提交中...
              </span>
            ) : (
              "提交申请"
            )}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
