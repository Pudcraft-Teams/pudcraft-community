"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_FORM_FIELDS } from "@/lib/applicationFormDocument";
import type {
  ApplicationFormField,
  ApplicationFormOption,
  ApplicationFormSettings,
  OwnerFormConfig,
} from "@/lib/types";

interface ApplicationFormEditorProps {
  serverId: string;
  serverPsid: number | null;
  joinMode: string;
  initialApplicationForm: OwnerFormConfig | null;
  onSaved?: () => void;
}

/**
 * Surface field types in the editor: `text`, `textarea`, and `choice` (which
 * unifies the underlying `select` / `multiselect` types — the user picks
 * "choice" and then opts into "allow multiple" via a toggle).
 */
type DisplayFieldType = "text" | "textarea" | "choice";
const DISPLAY_FIELD_TYPES: DisplayFieldType[] = ["text", "textarea", "choice"];

function fieldDisplayType(field: ApplicationFormField): DisplayFieldType {
  if (field.type === "text" || field.type === "textarea") return field.type;
  return "choice";
}

function isChoiceField(field: ApplicationFormField): boolean {
  return field.type === "select" || field.type === "multiselect";
}

const DEFAULT_SETTINGS: ApplicationFormSettings = {
  passingScore: null,
  showScoreToPlayerOnReject: false,
  showRejectReasonToPlayerOnReject: false,
};

function generateFieldKey(): string {
  return `field_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function generateOptionValue(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

function createEmptyField(): ApplicationFormField {
  return {
    key: generateFieldKey(),
    label: "",
    type: "text",
    required: true,
  };
}

function createEmptyOption(): ApplicationFormOption {
  const value = generateOptionValue();
  return { value, label: "" };
}

function fieldTypeIcon(type: ApplicationFormField["type"]): string {
  if (type === "text") return "Aa";
  if (type === "textarea") return "¶";
  return "☑";
}

function optionScoreValue(opt: ApplicationFormOption): number {
  if (typeof opt.points === "number") return opt.points;
  if (opt.correct === true) return 1;
  return 0;
}

/**
 * Best-case points the player can earn from one choice question. Mirrors the
 * runtime `computeMaxScore` semantics so the live hint stays consistent with
 * what the server actually scores. `autoReject` options never count.
 *
 * - Single-choice (`select`): best is picking the highest-scoring safe option.
 * - Multi-choice (`multiselect`): best is picking every positive-scoring option.
 */
function computeFieldMaxPoints(field: ApplicationFormField): number {
  if (!field.options) return 0;
  const safe = field.options.filter((opt) => opt.autoReject !== true);
  if (safe.length === 0) return 0;
  if (field.type === "select") {
    return Math.max(0, ...safe.map(optionScoreValue));
  }
  return safe
    .map(optionScoreValue)
    .filter((s) => s > 0)
    .reduce((a, b) => a + b, 0);
}

/** Best-effort detection of "this form already uses scoring/gating". */
function detectScoringConfigured(form: OwnerFormConfig | null): boolean {
  if (!form) return false;
  if (form.settings?.passingScore !== null && form.settings?.passingScore !== undefined) return true;
  if (form.settings?.showScoreToPlayerOnReject) return true;
  if (form.settings?.showRejectReasonToPlayerOnReject) return true;
  for (const field of form.fields) {
    for (const option of field.options ?? []) {
      if (option.correct === true) return true;
      if (option.autoReject === true) return true;
      if (typeof option.points === "number") return true;
    }
  }
  return false;
}

function readSettings(form: OwnerFormConfig | null): ApplicationFormSettings {
  if (!form?.settings) return { ...DEFAULT_SETTINGS };
  return {
    passingScore: form.settings.passingScore ?? null,
    showScoreToPlayerOnReject: form.settings.showScoreToPlayerOnReject ?? false,
    showRejectReasonToPlayerOnReject:
      form.settings.showRejectReasonToPlayerOnReject ?? false,
  };
}

/**
 * Build the OwnerFormConfig payload sent to PUT /settings.
 * When `scoringEnabled` is false we strip every gating field from options and
 * reset settings to defaults — owner can flip the flag without losing field
 * structure but enabling/disabling has predictable persisted semantics.
 */
function buildPayload(
  fields: ApplicationFormField[],
  settings: ApplicationFormSettings,
  scoringEnabled: boolean,
): OwnerFormConfig {
  const cleanedFields = fields.map((field) => {
    if (!field.options) return { ...field };
    const options = field.options.map((option) => {
      if (!scoringEnabled) {
        const { value, label } = option;
        return { value, label };
      }
      const next: ApplicationFormOption = { value: option.value, label: option.label };
      if (typeof option.points === "number") next.points = option.points;
      if (option.correct === true) next.correct = true;
      if (option.autoReject === true) next.autoReject = true;
      return next;
    });
    return { ...field, options };
  });

  return {
    version: 1,
    fields: cleanedFields,
    settings: scoringEnabled ? { ...settings } : { ...DEFAULT_SETTINGS },
    branching: [],
  };
}

export function ApplicationFormEditor({
  serverId,
  serverPsid,
  joinMode,
  initialApplicationForm,
  onSaved,
}: ApplicationFormEditorProps) {
  const t = useTranslations("console.form");
  const tApply = useTranslations("servers.apply");
  const [fields, setFields] = useState<ApplicationFormField[]>(
    initialApplicationForm?.fields ?? [],
  );
  const [settings, setSettings] = useState<ApplicationFormSettings>(() =>
    readSettings(initialApplicationForm),
  );
  const [scoringEnabled, setScoringEnabled] = useState<boolean>(() =>
    detectScoringConfigured(initialApplicationForm),
  );
  const [activeFieldKey, setActiveFieldKey] = useState<string | null>(
    initialApplicationForm?.fields[0]?.key ?? null,
  );
  const [scoringExpanded, setScoringExpanded] = useState<boolean>(() =>
    detectScoringConfigured(initialApplicationForm),
  );
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const isApplyMode = joinMode === "apply" || joinMode === "apply_and_invite";

  useEffect(() => {
    if (!saveSuccess) return;
    const id = setTimeout(() => setSaveSuccess(false), 2000);
    return () => clearTimeout(id);
  }, [saveSuccess]);

  const initialPayload = useMemo(
    () =>
      JSON.stringify(
        buildPayload(
          initialApplicationForm?.fields ?? [],
          readSettings(initialApplicationForm),
          detectScoringConfigured(initialApplicationForm),
        ),
      ),
    [initialApplicationForm],
  );
  const currentPayload = useMemo(
    () => JSON.stringify(buildPayload(fields, settings, scoringEnabled)),
    [fields, settings, scoringEnabled],
  );
  const hasChanges = currentPayload !== initialPayload;
  const canAddField = fields.length < MAX_FORM_FIELDS;

  const addField = useCallback(() => {
    if (!canAddField) return;
    const next = createEmptyField();
    setFields((prev) => [...prev, next]);
    setActiveFieldKey(next.key);
  }, [canAddField]);

  const removeField = useCallback((key: string) => {
    setFields((prev) => prev.filter((f) => f.key !== key));
    setActiveFieldKey((prev) => (prev === key ? null : prev));
  }, []);

  const moveField = useCallback((key: string, direction: -1 | 1) => {
    setFields((prev) => {
      const idx = prev.findIndex((f) => f.key === key);
      if (idx === -1) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
  }, []);

  const patchField = useCallback(
    (key: string, patch: Partial<Omit<ApplicationFormField, "key">>) => {
      setFields((prev) =>
        prev.map((field) => {
          if (field.key !== key) return field;
          const updated = { ...field, ...patch };
          if (
            patch.type !== undefined &&
            patch.type !== "select" &&
            patch.type !== "multiselect"
          ) {
            delete updated.options;
          }
          if (
            patch.type !== undefined &&
            (patch.type === "select" || patch.type === "multiselect") &&
            !updated.options
          ) {
            updated.options = [createEmptyOption(), createEmptyOption()];
          }
          return updated;
        }),
      );
    },
    [],
  );

  const addOption = useCallback((fieldKey: string) => {
    setFields((prev) =>
      prev.map((field) => {
        if (field.key !== fieldKey) return field;
        const options = [...(field.options ?? []), createEmptyOption()];
        return { ...field, options };
      }),
    );
  }, []);

  const removeOption = useCallback((fieldKey: string, optionValue: string) => {
    setFields((prev) =>
      prev.map((field) => {
        if (field.key !== fieldKey) return field;
        const options = (field.options ?? []).filter((o) => o.value !== optionValue);
        return { ...field, options };
      }),
    );
  }, []);

  const patchOption = useCallback(
    (
      fieldKey: string,
      optionValue: string,
      patch: Partial<Omit<ApplicationFormOption, "value">>,
    ) => {
      setFields((prev) =>
        prev.map((field) => {
          if (field.key !== fieldKey) return field;
          const options = (field.options ?? []).map((o) =>
            o.value === optionValue ? { ...o, ...patch } : o,
          );
          return { ...field, options };
        }),
      );
    },
    [],
  );

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const emptyLabel = fields.find((f) => !f.label.trim());
      if (emptyLabel) {
        throw new Error(t("errorEmptyLabel"));
      }
      const optionRequired = fields.find(
        (f) => (f.type === "select" || f.type === "multiselect") && (f.options ?? []).length < 2,
      );
      if (optionRequired) {
        throw new Error(t("errorOptionsMin", { label: optionRequired.label }));
      }
      const optionEmpty = fields.find((f) =>
        (f.options ?? []).some((o) => !o.label.trim()),
      );
      if (optionEmpty) {
        throw new Error(t("errorOptionEmpty", { label: optionEmpty.label }));
      }

      if (
        scoringEnabled &&
        settings.passingScore !== null &&
        !Number.isFinite(settings.passingScore)
      ) {
        throw new Error(t("errorPassingScoreInvalid"));
      }

      const payload = buildPayload(fields, settings, scoringEnabled);

      const response = await fetch(`/api/servers/${serverId}/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ applicationForm: payload }),
      });

      const result = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      if (!response.ok) {
        const errorMessage = typeof result.error === "string" ? result.error : t("errorSaveFailed");
        throw new Error(errorMessage);
      }
      setSaveSuccess(true);
      onSaved?.();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : t("errorSaveFailed"));
    } finally {
      setIsSaving(false);
    }
  }, [fields, settings, scoringEnabled, serverId, t, onSaved]);

  if (!isApplyMode) {
    return (
      <section className="m3-surface p-6 text-center">
        <h2 className="text-lg font-semibold text-warm-800">{t("disabledTitle")}</h2>
        <p className="mt-2 text-sm text-warm-500">{t("disabledHint")}</p>
        <Link
          href={`/console/${serverId}/settings`}
          className="m3-btn m3-btn-tonal mt-4 inline-flex"
        >
          {t("disabledGoToSettings")}
        </Link>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <section className="m3-surface flex flex-wrap items-start justify-between gap-3 p-4 sm:p-5">
        <div>
          <h2 className="text-lg font-semibold text-warm-800">{t("title")}</h2>
          <p className="mt-1 max-w-xl text-sm text-warm-500">{t("subtitle")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-warm-500" aria-live="polite">
            {t("counter", { count: fields.length, max: MAX_FORM_FIELDS })}
          </span>
          {saveSuccess && (
            <span className="text-xs text-forest" role="status">
              {t("saved")}
            </span>
          )}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={isSaving || !hasChanges}
            className="m3-btn m3-btn-primary disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSaving ? t("saving") : t("save")}
          </button>
        </div>
      </section>

      {saveError && (
        <div className="m3-alert-error" role="alert">
          {saveError}
        </div>
      )}

      {/* Scoring config */}
      <ScoringPanel
        scoringEnabled={scoringEnabled}
        scoringExpanded={scoringExpanded}
        settings={settings}
        onToggleEnabled={(next) => {
          setScoringEnabled(next);
          if (next) setScoringExpanded(true);
        }}
        onToggleExpanded={() => setScoringExpanded((prev) => !prev)}
        onPatchSettings={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        {/* Left: editor */}
        <section
          className="m3-surface p-4 sm:p-5"
          aria-label={t("editorRegionLabel")}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-warm-800">{t("fieldsHeading")}</h3>
            <span className="text-xs text-warm-500">
              {t("counter", { count: fields.length, max: MAX_FORM_FIELDS })}
            </span>
          </div>

          {fields.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-warm-300 bg-warm-50/40 px-4 py-8 text-center">
              <p className="text-sm text-warm-500">{t("emptyTitle")}</p>
              <p className="mt-1 text-xs text-warm-400">{t("emptyHint")}</p>
              <button
                type="button"
                onClick={addField}
                className="m3-btn m3-btn-tonal mt-4"
              >
                {t("addFirstField")}
              </button>
            </div>
          ) : (
            <ul className="mt-4 space-y-2">
              {fields.map((field, index) => (
                <FieldCard
                  key={field.key}
                  index={index}
                  total={fields.length}
                  field={field}
                  active={field.key === activeFieldKey}
                  scoringEnabled={scoringEnabled}
                  onActivate={() => setActiveFieldKey(field.key)}
                  onMove={(direction) => moveField(field.key, direction)}
                  onRemove={() => removeField(field.key)}
                  onPatch={(patch) => patchField(field.key, patch)}
                  onAddOption={() => addOption(field.key)}
                  onRemoveOption={(optionValue) => removeOption(field.key, optionValue)}
                  onPatchOption={(optionValue, patch) =>
                    patchOption(field.key, optionValue, patch)
                  }
                />
              ))}
            </ul>
          )}

          {fields.length > 0 && (
            <button
              type="button"
              onClick={addField}
              disabled={!canAddField}
              className="mt-3 w-full rounded-xl border border-dashed border-warm-300 px-4 py-2.5 text-sm text-warm-500 transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
            >
              {canAddField ? t("addField") : t("addFieldDisabled", { max: MAX_FORM_FIELDS })}
            </button>
          )}
        </section>

        {/* Right: preview */}
        <section
          className="m3-surface p-4 sm:p-5 lg:sticky lg:top-4 lg:self-start"
          aria-label={t("previewRegionLabel")}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-warm-800">{t("previewHeading")}</h3>
            {serverPsid !== null && (
              <Link
                href={`/servers/${serverPsid}/apply`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-accent hover:text-accent-hover"
              >
                {t("openLivePage")} ↗
              </Link>
            )}
          </div>
          <p className="mt-1 text-xs text-warm-500">{t("previewHint")}</p>
          <div className="mt-4 rounded-xl border border-warm-200 bg-warm-50/40 p-4">
            <p className="text-sm font-semibold text-warm-800">{tApply("formHeading")}</p>
            <div className="mt-3 space-y-3">
              <PreviewField
                label={tApply("mcUsernameLabel")}
                required
              >
                <input
                  className="m3-input mt-1.5 w-full"
                  type="text"
                  placeholder={tApply("mcUsernamePlaceholder")}
                  disabled
                />
              </PreviewField>

              {fields.length === 0 ? (
                <p className="text-xs text-warm-400">{t("previewEmpty")}</p>
              ) : (
                fields.map((field) => (
                  <PreviewField
                    key={field.key}
                    label={field.label || t("previewUnnamedField")}
                    required={field.required}
                  >
                    {field.type === "text" && (
                      <input
                        className="m3-input mt-1.5 w-full"
                        type="text"
                        placeholder={field.placeholder}
                        disabled
                      />
                    )}
                    {field.type === "textarea" && (
                      <textarea
                        className="m3-input mt-1.5 min-h-[80px] w-full"
                        placeholder={field.placeholder}
                        disabled
                      />
                    )}
                    {field.type === "select" && (
                      <select className="m3-input mt-1.5 w-full" disabled>
                        <option>{field.placeholder ?? tApply("selectPlaceholder")}</option>
                        {(field.options ?? []).map((opt) => (
                          <option key={opt.value}>{opt.label || t("previewUnnamedOption")}</option>
                        ))}
                      </select>
                    )}
                    {field.type === "multiselect" && (
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        {(field.options ?? []).length === 0 && (
                          <p className="text-xs text-warm-400">{t("previewNoOptions")}</p>
                        )}
                        {(field.options ?? []).map((opt) => (
                          <span
                            key={opt.value}
                            className="rounded-lg border border-warm-200 bg-surface px-3 py-1.5 text-xs text-warm-500"
                          >
                            {opt.label || t("previewUnnamedOption")}
                          </span>
                        ))}
                      </div>
                    )}
                  </PreviewField>
                ))
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

interface ScoringPanelProps {
  scoringEnabled: boolean;
  scoringExpanded: boolean;
  settings: ApplicationFormSettings;
  onToggleEnabled: (next: boolean) => void;
  onToggleExpanded: () => void;
  onPatchSettings: (patch: Partial<ApplicationFormSettings>) => void;
}

function ScoringPanel({
  scoringEnabled,
  scoringExpanded,
  settings,
  onToggleEnabled,
  onToggleExpanded,
  onPatchSettings,
}: ScoringPanelProps) {
  const t = useTranslations("console.form");

  const passingScoreInputValue =
    settings.passingScore === null || settings.passingScore === undefined
      ? ""
      : String(settings.passingScore);

  return (
    <section className="m3-surface overflow-hidden">
      <button
        type="button"
        onClick={onToggleExpanded}
        className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-warm-50/40 sm:p-5"
      >
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-warm-800">{t("scoringPanelTitle")}</h3>
          <p className="mt-1 text-xs text-warm-500">
            {scoringEnabled ? t("scoringEnabledHint") : t("scoringDisabledHint")}
          </p>
        </div>
        <span
          className={`mt-0.5 inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ${
            scoringEnabled
              ? "bg-accent-muted text-accent-hover"
              : "bg-warm-100 text-warm-500"
          }`}
        >
          {scoringEnabled ? t("scoringStatusOn") : t("scoringStatusOff")}
          <span aria-hidden className="ml-1.5">
            {scoringExpanded ? "▴" : "▾"}
          </span>
        </span>
      </button>

      {scoringExpanded && (
        <div className="border-t border-warm-200 p-4 sm:p-5">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="checkbox"
              checked={scoringEnabled}
              onChange={(e) => onToggleEnabled(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warm-800">{t("scoringEnableLabel")}</p>
              <p className="mt-0.5 text-xs text-warm-500">{t("scoringEnableDescription")}</p>
            </div>
          </label>

          {scoringEnabled && (
            <div className="mt-5 space-y-4">
              <div>
                <label className="block">
                  <span className="text-xs font-medium text-warm-500">{t("passingScoreLabel")}</span>
                  <div className="mt-1.5 flex items-center gap-2">
                    <div className="relative">
                      <input
                        type="number"
                        value={passingScoreInputValue}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === "") {
                            onPatchSettings({ passingScore: null });
                            return;
                          }
                          const parsed = Number(raw);
                          if (!Number.isFinite(parsed)) return;
                          const clamped = Math.max(0, Math.min(100, Math.trunc(parsed)));
                          onPatchSettings({ passingScore: clamped });
                        }}
                        placeholder={t("passingScorePlaceholder")}
                        className="m3-input w-28 pr-8 text-center"
                        step={1}
                        min={0}
                        max={100}
                      />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-warm-500">
                        %
                      </span>
                    </div>
                    {settings.passingScore !== null && (
                      <button
                        type="button"
                        onClick={() => onPatchSettings({ passingScore: null })}
                        className="text-xs text-accent transition-colors hover:text-accent-hover"
                      >
                        {t("passingScoreClear")}
                      </button>
                    )}
                  </div>
                </label>
                <p className="mt-1 text-xs text-warm-500">
                  {settings.passingScore === null
                    ? t("passingScoreUnsetHint")
                    : t("passingScoreSetHint", { score: settings.passingScore })}
                </p>
              </div>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings.showScoreToPlayerOnReject}
                  onChange={(e) =>
                    onPatchSettings({ showScoreToPlayerOnReject: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-800">{t("showScoreLabel")}</p>
                  <p className="mt-0.5 text-xs text-warm-500">{t("showScoreDescription")}</p>
                </div>
              </label>

              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={settings.showRejectReasonToPlayerOnReject}
                  onChange={(e) =>
                    onPatchSettings({ showRejectReasonToPlayerOnReject: e.target.checked })
                  }
                  className="mt-0.5 h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
                />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-warm-800">{t("showRejectReasonLabel")}</p>
                  <p className="mt-0.5 text-xs text-warm-500">{t("showRejectReasonDescription")}</p>
                </div>
              </label>

              <div className="rounded-lg border border-warm-200 bg-warm-50/40 p-3">
                <p className="text-xs font-medium text-warm-700">{t("scoringRulesHeading")}</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-xs text-warm-500">
                  <li>{t("scoringRuleCorrect")}</li>
                  <li>{t("scoringRulePoints")}</li>
                  <li>{t("scoringRuleAutoReject")}</li>
                  <li>{t("scoringRuleThreshold")}</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

interface FieldCardProps {
  index: number;
  total: number;
  field: ApplicationFormField;
  active: boolean;
  scoringEnabled: boolean;
  onActivate: () => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onPatch: (patch: Partial<Omit<ApplicationFormField, "key">>) => void;
  onAddOption: () => void;
  onRemoveOption: (optionValue: string) => void;
  onPatchOption: (
    optionValue: string,
    patch: Partial<Omit<ApplicationFormOption, "value">>,
  ) => void;
}

function FieldCard({
  index,
  total,
  field,
  active,
  scoringEnabled,
  onActivate,
  onMove,
  onRemove,
  onPatch,
  onAddOption,
  onRemoveOption,
  onPatchOption,
}: FieldCardProps) {
  const t = useTranslations("console.form");
  const hasOptions = field.type === "select" || field.type === "multiselect";

  return (
    <li
      className={`rounded-xl border bg-warm-50/50 p-3 transition-colors ${
        active ? "border-accent/40 bg-accent-muted/20" : "border-warm-200"
      }`}
      onClick={onActivate}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span
          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warm-100 text-sm font-medium text-warm-500"
          aria-hidden
        >
          {fieldTypeIcon(field.type)}
        </span>
        <span className="text-xs font-medium text-warm-500" aria-label={t("indexAriaLabel")}>
          #{index + 1}
        </span>
        <span className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(-1);
            }}
            disabled={index === 0}
            aria-label={t("moveUp")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-800 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMove(1);
            }}
            disabled={index === total - 1}
            aria-label={t("moveDown")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-warm-500 transition-colors hover:bg-warm-100 hover:text-warm-800 disabled:cursor-not-allowed disabled:opacity-30"
          >
            ↓
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            aria-label={t("removeField")}
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-warm-500 transition-colors hover:bg-coral-light hover:text-coral-hover"
          >
            ✕
          </button>
        </span>
      </div>

      {/* Body grid */}
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <label className="block">
          <span className="text-xs font-medium text-warm-500">{t("fieldLabel")}</span>
          <input
            type="text"
            value={field.label}
            onChange={(e) => onPatch({ label: e.target.value })}
            placeholder={t("fieldLabelPlaceholder")}
            maxLength={100}
            className="m3-input mt-1 w-full"
            onClick={(e) => e.stopPropagation()}
          />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-warm-500">{t("fieldType")}</span>
          <select
            value={fieldDisplayType(field)}
            onChange={(e) => {
              const nextDisplay = e.target.value as DisplayFieldType;
              if (nextDisplay === "choice") {
                if (!isChoiceField(field)) onPatch({ type: "select" });
              } else {
                onPatch({ type: nextDisplay });
              }
            }}
            className="m3-input mt-1 w-full"
            onClick={(e) => e.stopPropagation()}
          >
            {DISPLAY_FIELD_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(`fieldType_${type}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {isChoiceField(field) && (
        <label
          className="mt-3 flex items-center gap-2"
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={field.type === "multiselect"}
            onChange={(e) =>
              onPatch({ type: e.target.checked ? "multiselect" : "select" })
            }
            className="h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
          />
          <span className="text-xs text-warm-500">{t("allowMultipleLabel")}</span>
        </label>
      )}

      {(field.type === "text" || field.type === "textarea") && (
        <label className="mt-3 block">
          <span className="text-xs font-medium text-warm-500">{t("fieldPlaceholder")}</span>
          <input
            type="text"
            value={field.placeholder ?? ""}
            onChange={(e) => onPatch({ placeholder: e.target.value || undefined })}
            placeholder={t("fieldPlaceholderHint")}
            maxLength={200}
            className="m3-input mt-1 w-full"
            onClick={(e) => e.stopPropagation()}
          />
        </label>
      )}

      {hasOptions && scoringEnabled && (
        <p className="mt-3 rounded-lg border border-warm-200 bg-warm-50/40 px-3 py-2 text-xs text-warm-500">
          {t("totalPointsHint", { max: computeFieldMaxPoints(field) })}
        </p>
      )}

      {hasOptions && (
        <fieldset className="mt-3">
          <legend className="text-xs font-medium text-warm-500">
            {t("optionsHeading")}
          </legend>
          {scoringEnabled && (
            <p className="mt-1 text-[11px] text-warm-400">{t("optionsScoringHint")}</p>
          )}
          <ul className="mt-2 space-y-1.5">
            {(field.options ?? []).map((option, optionIndex) => (
              <li
                key={option.value}
                className="flex flex-wrap items-center gap-2 sm:flex-nowrap"
              >
                <span
                  className="w-5 shrink-0 text-right text-xs text-warm-400"
                  aria-hidden
                >
                  {optionIndex + 1}.
                </span>
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => onPatchOption(option.value, { label: e.target.value })}
                  placeholder={t("optionPlaceholder")}
                  maxLength={100}
                  className="m3-input min-w-[140px] flex-1"
                  onClick={(e) => e.stopPropagation()}
                />
                {scoringEnabled && (
                  <span
                    className="flex items-center gap-1 rounded-lg border border-warm-200 bg-surface px-1.5 py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="number"
                      value={
                        typeof option.points === "number" ? String(option.points) : ""
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === "") {
                          onPatchOption(option.value, { points: undefined });
                          return;
                        }
                        const parsed = Number(raw);
                        if (!Number.isFinite(parsed)) return;
                        onPatchOption(option.value, {
                          points: Math.max(-99, Math.min(99, Math.trunc(parsed))),
                        });
                      }}
                      placeholder={t("scoringPointsPlaceholder")}
                      title={t("scoringPointsLabel")}
                      aria-label={t("scoringPointsLabel")}
                      step={1}
                      min={-99}
                      max={99}
                      className="m3-input w-14 px-1 text-center text-xs"
                    />
                    <ScoringToggleButton
                      label={t("scoringCorrectLabel")}
                      icon="✓"
                      active={option.correct === true}
                      onChange={(next) =>
                        onPatchOption(option.value, { correct: next || undefined })
                      }
                    />
                    <ScoringToggleButton
                      label={t("scoringAutoRejectLabel")}
                      icon="⊘"
                      tone="danger"
                      active={option.autoReject === true}
                      onChange={(next) =>
                        onPatchOption(option.value, { autoReject: next || undefined })
                      }
                    />
                  </span>
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveOption(option.value);
                  }}
                  aria-label={t("removeOption")}
                  className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-warm-500 transition-colors hover:bg-coral-light hover:text-coral-hover"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddOption();
            }}
            className="mt-2 text-xs text-accent transition-colors hover:text-accent-hover"
          >
            + {t("addOption")}
          </button>
        </fieldset>
      )}

      <label
        className="mt-3 flex items-center gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          type="checkbox"
          checked={field.required}
          onChange={(e) => onPatch({ required: e.target.checked })}
          className="h-4 w-4 rounded border-warm-300 text-accent focus:ring-accent-hover"
        />
        <span className="text-xs text-warm-500">{t("required")}</span>
      </label>
    </li>
  );
}

function ScoringToggleButton({
  label,
  icon,
  active,
  tone = "accent",
  onChange,
}: {
  label: string;
  icon: string;
  active: boolean;
  tone?: "accent" | "danger";
  onChange: (next: boolean) => void;
}) {
  const activeClasses =
    tone === "danger"
      ? "bg-coral-light text-coral-hover"
      : "bg-accent-muted text-accent-hover";
  return (
    <button
      type="button"
      onClick={() => onChange(!active)}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className={`inline-flex h-6 w-6 items-center justify-center rounded-md text-xs font-medium transition-colors ${
        active ? activeClasses : "bg-warm-100 text-warm-500 hover:bg-warm-200"
      }`}
    >
      {icon}
    </button>
  );
}

function PreviewField({
  label,
  required,
  children,
}: {
  label: string;
  required: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <span className="block text-sm font-medium text-warm-800">
        {label}
        {required && <span className="ml-0.5 text-accent-hover">*</span>}
      </span>
      {children}
    </div>
  );
}
