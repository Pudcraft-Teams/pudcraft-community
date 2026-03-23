"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { isPrivateServersEnabled } from "@/lib/features";
import type {
  ApplicationFormField,
  ServerJoinMode,
  ServerVisibility,
} from "@/lib/types";

// ─── Constants ───────────────────────────────────

const VISIBILITY_OPTIONS: { value: ServerVisibility; label: string; description: string }[] = [
  { value: "public", label: "完全公开", description: "所有人可见" },
  { value: "private", label: "私有", description: "不对外展示，仅通过邀请可访问" },
  { value: "unlisted", label: "半公开", description: "列表可见但隐藏地址，需申请或邀请加入" },
];

const JOIN_MODE_OPTIONS: { value: ServerJoinMode; label: string; description: string }[] = [
  { value: "open", label: "开放加入", description: "无需审核" },
  { value: "apply", label: "申请制", description: "玩家提交申请后审核" },
  { value: "invite", label: "邀请制", description: "仅通过邀请码加入" },
  {
    value: "apply_and_invite",
    label: "申请 + 邀请",
    description: "两种方式并行",
  },
];

const FIELD_TYPE_OPTIONS: { value: ApplicationFormField["type"]; label: string }[] = [
  { value: "text", label: "单行文本" },
  { value: "textarea", label: "多行文本" },
  { value: "select", label: "单选" },
  { value: "multiselect", label: "多选" },
];

const MAX_FORM_FIELDS = 10;

// ─── Props ───────────────────────────────────────

interface ServerSettingsProps {
  serverId: string;
  initialVisibility: string;
  initialDiscoverable: boolean;
  initialJoinMode: string;
  initialApplicationForm: ApplicationFormField[] | null;
  onSaved?: () => void;
}

// ─── Helpers ─────────────────────────────────────

function isValidVisibility(value: string): value is ServerVisibility {
  return value === "public" || value === "private" || value === "unlisted";
}

function isValidJoinMode(value: string): value is ServerJoinMode {
  return (
    value === "open" ||
    value === "apply" ||
    value === "invite" ||
    value === "apply_and_invite"
  );
}

function generateFieldKey(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function createEmptyField(): ApplicationFormField {
  return {
    key: generateFieldKey(),
    label: "",
    type: "text",
    required: true,
  };
}

function joinModeIncludesApply(joinMode: ServerJoinMode): boolean {
  return joinMode === "apply" || joinMode === "apply_and_invite";
}

// ─── Component ───────────────────────────────────

/**
 * 服务器隐私与加入设置面板。
 * 允许服主配置可见性、加入模式和申请表单。
 */
export function ServerSettings({
  serverId,
  initialVisibility,
  initialDiscoverable,
  initialJoinMode,
  initialApplicationForm,
  onSaved,
}: ServerSettingsProps) {
  const [visibility, setVisibility] = useState<ServerVisibility>(
    isValidVisibility(initialVisibility) ? initialVisibility : "public",
  );
  const [discoverable, setDiscoverable] = useState(initialDiscoverable);
  const [joinMode, setJoinMode] = useState<ServerJoinMode>(
    isValidJoinMode(initialJoinMode) ? initialJoinMode : "open",
  );
  const [formFields, setFormFields] = useState<ApplicationFormField[]>(
    initialApplicationForm ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const privateServersEnabled = isPrivateServersEnabled();

  // Reset joinMode and discoverable when switching to public
  useEffect(() => {
    if (visibility === "public") {
      setJoinMode("open");
      setDiscoverable(false);
    }
  }, [visibility]);

  // Clear success message after 3s
  useEffect(() => {
    if (!saveSuccess) {
      return;
    }

    const timer = setTimeout(() => {
      setSaveSuccess(false);
    }, 3000);

    return () => {
      clearTimeout(timer);
    };
  }, [saveSuccess]);

  const showJoinModeSelector = visibility !== "public";
  const showApplicationForm = joinModeIncludesApply(joinMode) && showJoinModeSelector;

  const canAddField = formFields.length < MAX_FORM_FIELDS;

  const hasChanges = useMemo(() => {
    const visChanged = visibility !== (isValidVisibility(initialVisibility) ? initialVisibility : "public");
    const discChanged = discoverable !== initialDiscoverable;
    const joinChanged = joinMode !== (isValidJoinMode(initialJoinMode) ? initialJoinMode : "open");
    const formChanged = JSON.stringify(formFields) !== JSON.stringify(initialApplicationForm ?? []);
    return visChanged || discChanged || joinChanged || formChanged;
  }, [visibility, discoverable, joinMode, formFields, initialVisibility, initialDiscoverable, initialJoinMode, initialApplicationForm]);

  // ─── Field management ───

  const handleAddField = useCallback(() => {
    if (!canAddField) {
      return;
    }
    setFormFields((prev) => [...prev, createEmptyField()]);
  }, [canAddField]);

  const handleRemoveField = useCallback((key: string) => {
    setFormFields((prev) => prev.filter((f) => f.key !== key));
  }, []);

  const handleFieldChange = useCallback(
    (key: string, patch: Partial<Omit<ApplicationFormField, "key">>) => {
      setFormFields((prev) =>
        prev.map((field) => {
          if (field.key !== key) {
            return field;
          }

          const updated = { ...field, ...patch };

          // Clear options when switching away from select/multiselect
          if (
            patch.type !== undefined &&
            patch.type !== "select" &&
            patch.type !== "multiselect"
          ) {
            delete updated.options;
          }

          return updated;
        }),
      );
    },
    [],
  );

  const handleOptionsChange = useCallback((key: string, optionsText: string) => {
    const options = optionsText
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setFormFields((prev) =>
      prev.map((field) => {
        if (field.key !== key) {
          return field;
        }
        return { ...field, options };
      }),
    );
  }, []);

  // ─── Save ───

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      // Validate form fields have labels
      if (showApplicationForm) {
        const emptyLabel = formFields.find((f) => !f.label.trim());
        if (emptyLabel) {
          throw new Error("表单字段名称不能为空");
        }

        const selectWithoutOptions = formFields.find(
          (f) => (f.type === "select" || f.type === "multiselect") && (!f.options || f.options.length === 0),
        );
        if (selectWithoutOptions) {
          throw new Error(`字段「${selectWithoutOptions.label}」为选择类型，必须填写选项`);
        }
      }

      const body: Record<string, unknown> = {
        visibility,
        discoverable: showJoinModeSelector ? discoverable : false,
        joinMode: showJoinModeSelector ? joinMode : "open",
        applicationForm: showApplicationForm ? formFields : null,
      };

      const response = await fetch(`/api/servers/${serverId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const result: unknown = await response.json().catch(() => ({}));
      const payload = typeof result === "object" && result !== null ? (result as Record<string, unknown>) : {};

      if (!response.ok) {
        const errorMessage = typeof payload.error === "string" ? payload.error : "保存失败";
        throw new Error(errorMessage);
      }

      setSaveSuccess(true);
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [visibility, discoverable, joinMode, formFields, serverId, showJoinModeSelector, showApplicationForm, onSaved]);

  if (!privateServersEnabled) {
    return null;
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">隐私与加入设置</h2>

      {/* ─── Visibility selector ─── */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-warm-800">服务器可见性</h3>
        <div className="mt-3 space-y-2">
          {VISIBILITY_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                visibility === option.value
                  ? "border-accent/30 bg-accent-muted/50"
                  : "border-warm-200 bg-surface hover:border-warm-300"
              }`}
            >
              <input
                type="radio"
                name="visibility"
                value={option.value}
                checked={visibility === option.value}
                onChange={() => {
                  setVisibility(option.value);
                }}
                className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
              />
              <div className="min-w-0">
                <p
                  className={`text-sm font-medium ${
                    visibility === option.value ? "text-accent" : "text-warm-800"
                  }`}
                >
                  {option.label}
                </p>
                <p className="mt-0.5 text-xs text-warm-500">{option.description}</p>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* ─── Discoverable toggle ─── */}
      {showJoinModeSelector && (
        <div className="mt-6">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-warm-200 bg-surface p-3 transition-colors hover:border-warm-300">
            <input
              type="checkbox"
              checked={discoverable}
              onChange={(e) => {
                setDiscoverable(e.target.checked);
              }}
              className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warm-800">
                在首页发现中展示
              </p>
              <p className="mt-0.5 text-xs text-warm-500">
                开启后，服务器会出现在首页列表中（地址仍然对非成员隐藏）。关闭则仅通过邀请链接或直接访问可见。
              </p>
            </div>
          </label>
        </div>
      )}

      {/* ─── Join mode selector ─── */}
      {showJoinModeSelector && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-warm-800">加入方式</h3>
          <div className="mt-3 space-y-2">
            {JOIN_MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  joinMode === option.value
                    ? "border-accent/30 bg-accent-muted/50"
                    : "border-warm-200 bg-surface hover:border-warm-300"
                }`}
              >
                <input
                  type="radio"
                  name="joinMode"
                  value={option.value}
                  checked={joinMode === option.value}
                  onChange={() => {
                    setJoinMode(option.value);
                  }}
                  className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      joinMode === option.value ? "text-accent" : "text-warm-800"
                    }`}
                  >
                    {option.label}
                  </p>
                  <p className="mt-0.5 text-xs text-warm-500">{option.description}</p>
                </div>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* ─── Application form builder ─── */}
      {showApplicationForm && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-warm-800">申请表单</h3>
            <span className="text-xs text-warm-500">
              {formFields.length}/{MAX_FORM_FIELDS} 个字段
            </span>
          </div>
          <p className="mt-1 text-xs text-warm-500">
            配置玩家提交申请时需要填写的表单字段。
          </p>

          {formFields.length > 0 && (
            <div className="mt-4 space-y-3">
              {formFields.map((field, index) => (
                <div
                  key={field.key}
                  className="rounded-xl border border-warm-200 bg-warm-50/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-warm-500">
                      字段 {index + 1}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        handleRemoveField(field.key);
                      }}
                      className="text-xs text-accent-hover transition-colors hover:text-accent-dark"
                    >
                      移除
                    </button>
                  </div>

                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {/* Label */}
                    <div>
                      <label className="text-xs font-medium text-warm-500">
                        字段名称
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => {
                          handleFieldChange(field.key, { label: e.target.value });
                        }}
                        placeholder="例如：游戏 ID"
                        maxLength={100}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-xs font-medium text-warm-500">
                        字段类型
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const newType = e.target.value as ApplicationFormField["type"];
                          handleFieldChange(field.key, { type: newType });
                        }}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        {FIELD_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Options for select/multiselect */}
                  {(field.type === "select" || field.type === "multiselect") && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-warm-500">
                        选项（用逗号分隔）
                      </label>
                      <input
                        type="text"
                        value={field.options?.join(", ") ?? ""}
                        onChange={(e) => {
                          handleOptionsChange(field.key, e.target.value);
                        }}
                        placeholder="例如：选项一, 选项二, 选项三"
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                  )}

                  {/* Required checkbox */}
                  <label className="mt-3 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) => {
                        handleFieldChange(field.key, { required: e.target.checked });
                      }}
                      className="h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
                    />
                    <span className="text-xs text-warm-500">必填</span>
                  </label>
                </div>
              ))}
            </div>
          )}

          {canAddField && (
            <button
              type="button"
              onClick={handleAddField}
              className="mt-3 w-full rounded-xl border border-dashed border-warm-300 px-4 py-2.5 text-sm text-warm-500 transition-colors hover:border-accent hover:text-accent"
            >
              + 添加字段
            </button>
          )}

          {formFields.length === 0 && (
            <p className="mt-3 text-xs text-warm-400">
              尚未添加任何字段。点击上方按钮添加申请表单字段。
            </p>
          )}
        </div>
      )}

      {/* ─── Save button & feedback ─── */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving || !hasChanges}
          className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSaving ? "保存中..." : "保存设置"}
        </button>

        {saveSuccess && (
          <span className="text-sm text-forest">设置已保存</span>
        )}

        {saveError && (
          <span className="text-sm text-accent-hover">{saveError}</span>
        )}
      </div>
    </section>
  );
}
