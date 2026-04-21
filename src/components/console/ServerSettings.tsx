"use client";

import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { isPrivateServersEnabled } from "@/lib/features";
import type {
  ApplicationFormField,
  ServerJoinMode,
  ServerVisibility,
} from "@/lib/types";

// ─── Constants ───────────────────────────────────

const VISIBILITY_OPTION_KEYS: ServerVisibility[] = ["public", "private", "unlisted"];
const JOIN_MODE_OPTION_KEYS: ServerJoinMode[] = ["open", "apply", "invite", "apply_and_invite"];
const FIELD_TYPE_OPTION_KEYS: ApplicationFormField["type"][] = [
  "text",
  "textarea",
  "select",
  "multiselect",
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

function resolveVisibilityCopy(
  value: ServerVisibility,
  t: ReturnType<typeof useTranslations>,
): { label: string; description: string } {
  if (value === "public") {
    return { label: t("visibilityPublicLabel"), description: t("visibilityPublicDescription") };
  }
  if (value === "private") {
    return { label: t("visibilityPrivateLabel"), description: t("visibilityPrivateDescription") };
  }
  return { label: t("visibilityUnlistedLabel"), description: t("visibilityUnlistedDescription") };
}

function resolveJoinModeCopy(
  value: ServerJoinMode,
  t: ReturnType<typeof useTranslations>,
): { label: string; description: string } {
  if (value === "open") {
    return { label: t("joinModeOpenLabel"), description: t("joinModeOpenDescription") };
  }
  if (value === "apply") {
    return { label: t("joinModeApplyLabel"), description: t("joinModeApplyDescription") };
  }
  if (value === "invite") {
    return { label: t("joinModeInviteLabel"), description: t("joinModeInviteDescription") };
  }
  return {
    label: t("joinModeApplyInviteLabel"),
    description: t("joinModeApplyInviteDescription"),
  };
}

function resolveFieldTypeLabel(
  value: ApplicationFormField["type"],
  t: ReturnType<typeof useTranslations>,
): string {
  if (value === "text") return t("fieldTypeText");
  if (value === "textarea") return t("fieldTypeTextarea");
  if (value === "select") return t("fieldTypeSelect");
  return t("fieldTypeMultiselect");
}

// ─── Component ───────────────────────────────────

/**
 * Privacy and join-flow settings panel.
 * Allows owners to configure visibility, join mode, and application form fields.
 */
export function ServerSettings({
  serverId,
  initialVisibility,
  initialDiscoverable,
  initialJoinMode,
  initialApplicationForm,
  onSaved,
}: ServerSettingsProps) {
  const t = useTranslations("console.settings");
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
          throw new Error(t("emptyLabelError"));
        }

        const selectWithoutOptions = formFields.find(
          (f) => (f.type === "select" || f.type === "multiselect") && (!f.options || f.options.length === 0),
        );
        if (selectWithoutOptions) {
          throw new Error(t("selectOptionsRequired", { label: selectWithoutOptions.label }));
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
        const errorMessage = typeof payload.error === "string" ? payload.error : t("saveFailed");
        throw new Error(errorMessage);
      }

      setSaveSuccess(true);
      onSaved?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : t("saveFailed");
      setSaveError(message);
    } finally {
      setIsSaving(false);
    }
  }, [visibility, discoverable, joinMode, formFields, serverId, showJoinModeSelector, showApplicationForm, onSaved, t]);

  if (!privateServersEnabled) {
    return null;
  }

  return (
    <section className="m3-surface p-4 sm:p-5">
      <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>

      {/* ─── Visibility selector ─── */}
      <div className="mt-5">
        <h3 className="text-sm font-semibold text-warm-800">{t("visibilityHeading")}</h3>
        <div className="mt-3 space-y-2">
          {VISIBILITY_OPTION_KEYS.map((optionKey) => {
            const copy = resolveVisibilityCopy(optionKey, t);
            return (
              <label
                key={optionKey}
                className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                  visibility === optionKey
                    ? "border-accent/30 bg-accent-muted/50"
                    : "border-warm-200 bg-surface hover:border-warm-300"
                }`}
              >
                <input
                  type="radio"
                  name="visibility"
                  value={optionKey}
                  checked={visibility === optionKey}
                  onChange={() => {
                    setVisibility(optionKey);
                  }}
                  className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
                />
                <div className="min-w-0">
                  <p
                    className={`text-sm font-medium ${
                      visibility === optionKey ? "text-accent" : "text-warm-800"
                    }`}
                  >
                    {copy.label}
                  </p>
                  <p className="mt-0.5 text-xs text-warm-500">{copy.description}</p>
                </div>
              </label>
            );
          })}
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
              <p className="text-sm font-medium text-warm-800">{t("discoverableTitle")}</p>
              <p className="mt-0.5 text-xs text-warm-500">{t("discoverableDescription")}</p>
            </div>
          </label>
        </div>
      )}

      {/* ─── Join mode selector ─── */}
      {showJoinModeSelector && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-warm-800">{t("joinModeHeading")}</h3>
          <div className="mt-3 space-y-2">
            {JOIN_MODE_OPTION_KEYS.map((optionKey) => {
              const copy = resolveJoinModeCopy(optionKey, t);
              return (
                <label
                  key={optionKey}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors ${
                    joinMode === optionKey
                      ? "border-accent/30 bg-accent-muted/50"
                      : "border-warm-200 bg-surface hover:border-warm-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="joinMode"
                    value={optionKey}
                    checked={joinMode === optionKey}
                    onChange={() => {
                      setJoinMode(optionKey);
                    }}
                    className="mt-0.5 h-4 w-4 border-warm-300 text-accent focus:ring-accent-hover"
                  />
                  <div className="min-w-0">
                    <p
                      className={`text-sm font-medium ${
                        joinMode === optionKey ? "text-accent" : "text-warm-800"
                      }`}
                    >
                      {copy.label}
                    </p>
                    <p className="mt-0.5 text-xs text-warm-500">{copy.description}</p>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* ─── Application form builder ─── */}
      {showApplicationForm && (
        <div className="mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-warm-800">{t("formHeading")}</h3>
            <span className="text-xs text-warm-500">
              {t("formCounter", { count: formFields.length, max: MAX_FORM_FIELDS })}
            </span>
          </div>
          <p className="mt-1 text-xs text-warm-500">{t("formHint")}</p>

          {formFields.length > 0 && (
            <div className="mt-4 space-y-3">
              {formFields.map((field, index) => (
                <div
                  key={field.key}
                  className="rounded-xl border border-warm-200 bg-warm-50/50 p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-warm-500">
                      {t("fieldLabel", { index: index + 1 })}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        handleRemoveField(field.key);
                      }}
                      className="text-xs text-accent-hover transition-colors hover:text-accent-dark"
                    >
                      {t("fieldRemove")}
                    </button>
                  </div>

                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    {/* Label */}
                    <div>
                      <label className="text-xs font-medium text-warm-500">
                        {t("fieldNameLabel")}
                      </label>
                      <input
                        type="text"
                        value={field.label}
                        onChange={(e) => {
                          handleFieldChange(field.key, { label: e.target.value });
                        }}
                        placeholder={t("fieldNamePlaceholder")}
                        maxLength={100}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 placeholder:text-warm-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>

                    {/* Type */}
                    <div>
                      <label className="text-xs font-medium text-warm-500">
                        {t("fieldTypeLabel")}
                      </label>
                      <select
                        value={field.type}
                        onChange={(e) => {
                          const newType = e.target.value as ApplicationFormField["type"];
                          handleFieldChange(field.key, { type: newType });
                        }}
                        className="mt-1 w-full rounded-lg border border-warm-200 bg-surface px-3 py-2 text-sm text-warm-800 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                      >
                        {FIELD_TYPE_OPTION_KEYS.map((optionKey) => (
                          <option key={optionKey} value={optionKey}>
                            {resolveFieldTypeLabel(optionKey, t)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Options for select/multiselect */}
                  {(field.type === "select" || field.type === "multiselect") && (
                    <div className="mt-3">
                      <label className="text-xs font-medium text-warm-500">
                        {t("fieldOptionsLabel")}
                      </label>
                      <input
                        type="text"
                        value={field.options?.join(", ") ?? ""}
                        onChange={(e) => {
                          handleOptionsChange(field.key, e.target.value);
                        }}
                        placeholder={t("fieldOptionsPlaceholder")}
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
                    <span className="text-xs text-warm-500">{t("fieldRequired")}</span>
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
              {t("addField")}
            </button>
          )}

          {formFields.length === 0 && (
            <p className="mt-3 text-xs text-warm-400">{t("emptyFieldsHint")}</p>
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
          {isSaving ? t("saving") : t("save")}
        </button>

        {saveSuccess && (
          <span className="text-sm text-forest">{t("saved")}</span>
        )}

        {saveError && (
          <span className="text-sm text-accent-hover">{saveError}</span>
        )}
      </div>
    </section>
  );
}
