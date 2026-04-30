import { createHash } from "node:crypto";

import type {
  ApplicationFormBranchRule,
  ApplicationFormEvaluationResult,
  ApplicationFormField,
  ApplicationFormOption,
  ApplicationFormSettings,
  OwnerFormConfig,
  PlayerFormField,
  PlayerFormOption,
  PlayerFormView,
} from "@/lib/types";

/** Single source of truth — also re-exported for tests / settings PUT / editor UI. */
export const MAX_FORM_FIELDS = 30;
export const MAX_APPLICATION_FORM_BYTES = 32 * 1024;
export const MAX_FORM_OPTIONS = 20;
export const MAX_BRANCH_RULES_PER_FIELD = 3;

const FIELD_TYPES: ReadonlyArray<ApplicationFormField["type"]> = [
  "text",
  "textarea",
  "select",
  "multiselect",
];

const seenV0Servers = new Set<string>();

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string");
}

function coerceOption(input: unknown): ApplicationFormOption | null {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (!trimmed) return null;
    return { value: trimmed, label: trimmed };
  }
  if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    const valueRaw = record.value;
    const labelRaw = record.label;
    const value = typeof valueRaw === "string" ? valueRaw.trim() : "";
    const label = typeof labelRaw === "string" && labelRaw.trim() ? labelRaw.trim() : value;
    if (!value) return null;
    const option: ApplicationFormOption = { value, label };
    if (typeof record.points === "number" && Number.isFinite(record.points)) {
      option.points = record.points;
    }
    if (record.correct === true) option.correct = true;
    if (record.autoReject === true) option.autoReject = true;
    return option;
  }
  return null;
}

function coerceField(input: unknown): ApplicationFormField | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const key = typeof record.key === "string" ? record.key.trim() : "";
  const label = typeof record.label === "string" ? record.label.trim() : "";
  const typeRaw = record.type;
  const type = typeof typeRaw === "string" && (FIELD_TYPES as readonly string[]).includes(typeRaw)
    ? (typeRaw as ApplicationFormField["type"])
    : null;
  if (!key || !label || !type) return null;

  const required = record.required === true;
  const placeholderRaw = record.placeholder;
  const placeholder = typeof placeholderRaw === "string" && placeholderRaw.trim()
    ? placeholderRaw.trim()
    : undefined;

  let options: ApplicationFormOption[] | undefined;
  if (Array.isArray(record.options)) {
    const normalized: ApplicationFormOption[] = [];
    for (const raw of record.options) {
      const option = coerceOption(raw);
      if (option) normalized.push(option);
    }
    options = normalized;
  }

  return {
    key,
    label,
    type,
    required,
    ...(placeholder ? { placeholder } : {}),
    ...(options ? { options } : {}),
  };
}

function coerceSettings(input: unknown): ApplicationFormSettings {
  const fallback: ApplicationFormSettings = {
    passingScore: null,
    showScoreToPlayerOnReject: false,
    showRejectReasonToPlayerOnReject: false,
  };
  if (!input || typeof input !== "object") return fallback;
  const record = input as Record<string, unknown>;
  const passingScore =
    typeof record.passingScore === "number" && Number.isFinite(record.passingScore)
      ? record.passingScore
      : null;
  return {
    passingScore,
    showScoreToPlayerOnReject: record.showScoreToPlayerOnReject === true,
    showRejectReasonToPlayerOnReject: record.showRejectReasonToPlayerOnReject === true,
  };
}

function coerceBranchRule(input: unknown): ApplicationFormBranchRule | null {
  if (!input || typeof input !== "object") return null;
  const record = input as Record<string, unknown>;
  const targetFieldKey =
    typeof record.targetFieldKey === "string" ? record.targetFieldKey.trim() : "";
  const whenFieldKey =
    typeof record.whenFieldKey === "string" ? record.whenFieldKey.trim() : "";
  if (!targetFieldKey || !whenFieldKey) return null;
  const allowedValues = isStringArray(record.allowedValues)
    ? Array.from(new Set(record.allowedValues.filter((v) => v.length > 0)))
    : [];
  if (allowedValues.length === 0) return null;
  return { targetFieldKey, whenFieldKey, allowedValues };
}

/**
 * Accepts `null`, the legacy v0 `ApplicationFormField[]` array shape, or the v1 object shape.
 * Returns canonical `OwnerFormConfig` or `null` (when the form is empty).
 *
 * Side effect: on first encounter of a v0 array per process per `serverId`, fires `logger.warn` so we
 * can track the long tail of unmigrated forms. (No external logger import here — we keep this
 * module Node-only-side-effect-free; callers that care can wrap with their own warn.)
 */
export function normalizeApplicationFormDocument(
  input: unknown,
  context?: { serverId?: string; onLegacyEncounter?: (serverId: string) => void },
): OwnerFormConfig | null {
  if (input === null || input === undefined) return null;

  if (Array.isArray(input)) {
    const fields = input
      .map(coerceField)
      .filter((f): f is ApplicationFormField => f !== null);
    if (fields.length === 0) return null;
    if (context?.serverId && !seenV0Servers.has(context.serverId)) {
      seenV0Servers.add(context.serverId);
      context.onLegacyEncounter?.(context.serverId);
    }
    return {
      version: 1,
      fields,
      settings: coerceSettings(undefined),
      branching: [],
    };
  }

  if (typeof input === "object") {
    const record = input as Record<string, unknown>;
    const versionRaw = record.version;
    if (versionRaw !== undefined && versionRaw !== 1) {
      return null;
    }
    const fieldsArray = Array.isArray(record.fields) ? record.fields : [];
    const fields = fieldsArray
      .map(coerceField)
      .filter((f): f is ApplicationFormField => f !== null);
    if (fields.length === 0) return null;
    const settings = coerceSettings(record.settings);
    const branchingArray = Array.isArray(record.branching) ? record.branching : [];
    const branching = branchingArray
      .map(coerceBranchRule)
      .filter((b): b is ApplicationFormBranchRule => b !== null);
    return { version: 1, fields, settings, branching };
  }

  return null;
}

/** Stable JSON shape for storage — keys ordered by definition order, no extra props. */
export function serializeApplicationFormDocument(doc: OwnerFormConfig): unknown {
  return {
    version: doc.version,
    fields: doc.fields.map((field) => ({
      key: field.key,
      label: field.label,
      type: field.type,
      required: field.required,
      ...(field.placeholder ? { placeholder: field.placeholder } : {}),
      ...(field.options
        ? {
            options: field.options.map((opt) => ({
              value: opt.value,
              label: opt.label,
              ...(typeof opt.points === "number" ? { points: opt.points } : {}),
              ...(opt.correct === true ? { correct: true } : {}),
              ...(opt.autoReject === true ? { autoReject: true } : {}),
            })),
          }
        : {}),
    })),
    settings: {
      passingScore: doc.settings.passingScore,
      showScoreToPlayerOnReject: doc.settings.showScoreToPlayerOnReject,
      showRejectReasonToPlayerOnReject: doc.settings.showRejectReasonToPlayerOnReject,
    },
    branching: doc.branching.map((rule) => ({
      targetFieldKey: rule.targetFieldKey,
      whenFieldKey: rule.whenFieldKey,
      allowedValues: [...rule.allowedValues],
    })),
  };
}

/**
 * Canonical JSON serializer — recursively sorts object keys alphabetically, preserves array order.
 * Used by `computeFormContentHash` to produce deterministic hashes regardless of insertion order
 * (Postgres jsonb does NOT preserve insertion order; raw `JSON.stringify` would refuse legitimate
 * resubmits when a form round-trips through storage).
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value ?? null);
  }
  if (typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJsonStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonicalJsonStringify(record[k])}`)
    .join(",")}}`;
}

/** SHA-256 truncated to 32 hex chars (16 bytes — collision-safe at expected scale). */
export function computeFormContentHash(input: unknown): string {
  const normalized = normalizeApplicationFormDocument(input);
  if (!normalized) {
    return createHash("sha256").update("null").digest("hex").slice(0, 32);
  }
  const canonical = canonicalJsonStringify(serializeApplicationFormDocument(normalized));
  return createHash("sha256").update(canonical).digest("hex").slice(0, 32);
}

/** Used by editor pre-flight AND server Zod-boundary check; ensures byte-count parity. */
export function measureDocumentBytes(doc: OwnerFormConfig): number {
  return Buffer.byteLength(JSON.stringify(serializeApplicationFormDocument(doc)), "utf8");
}

/**
 * Validates the branching graph: every rule's `whenFieldKey` MUST appear earlier in `fields[]`
 * than its `targetFieldKey`. Returns the index of the first invalid rule (or `null` if all valid).
 */
export function validateBranchingGraph(
  fields: ApplicationFormField[],
  branching: ApplicationFormBranchRule[],
): { valid: true } | { valid: false; ruleIndex: number; rule: ApplicationFormBranchRule } {
  const indexByKey = new Map<string, number>();
  fields.forEach((field, index) => indexByKey.set(field.key, index));
  for (let i = 0; i < branching.length; i += 1) {
    const rule = branching[i];
    const targetIdx = indexByKey.get(rule.targetFieldKey);
    const whenIdx = indexByKey.get(rule.whenFieldKey);
    if (targetIdx === undefined || whenIdx === undefined) {
      return { valid: false, ruleIndex: i, rule };
    }
    if (whenIdx >= targetIdx) {
      return { valid: false, ruleIndex: i, rule };
    }
  }
  return { valid: true };
}

/**
 * Project an `OwnerFormConfig` to a `PlayerFormView` — strips ALL gating data
 * (points / correct / autoReject / passingScore / transparency toggles / branching).
 *
 * This is the load-bearing security touch site. Use at every API boundary that ships
 * `applicationForm` to a non-owner viewer.
 */
export function pickPlayerFormView(doc: OwnerFormConfig | null): PlayerFormView | null {
  if (!doc) return null;
  return {
    version: 1,
    fields: doc.fields.map((field): PlayerFormField => {
      const projection: PlayerFormField = {
        key: field.key,
        label: field.label,
        type: field.type,
        required: field.required,
      };
      if (field.placeholder) projection.placeholder = field.placeholder;
      if (field.options) {
        projection.options = field.options.map(
          (opt): PlayerFormOption => ({ value: opt.value, label: opt.label }),
        );
      }
      return projection;
    }),
  };
}

/**
 * Strip internal keys from a `formData` payload before shipping to a non-owner viewer.
 * Removes both the legacy `mcUsername` (already stripped ad-hoc at one site) and the
 * iteration-2 `_evaluation` key. Single chokepoint — any future endpoint that ships
 * `formData` MUST call this.
 */
export function stripInternalFormDataKeys(
  formData: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!formData || typeof formData !== "object") return null;
  const copy = { ...formData };
  delete copy.mcUsername;
  delete copy._evaluation;
  return copy;
}

/** Read the embedded evaluation result without exposing it. Returns `null` for legacy v0 applications. */
export function readEmbeddedEvaluation(
  formData: Record<string, unknown> | null | undefined,
): ApplicationFormEvaluationResult | null {
  if (!formData || typeof formData !== "object") return null;
  const evalRaw = (formData as Record<string, unknown>)._evaluation;
  if (!evalRaw || typeof evalRaw !== "object") return null;
  const record = evalRaw as Record<string, unknown>;
  const result = record.result;
  if (
    result !== "hard_disqualify" &&
    result !== "score_below_threshold" &&
    result !== "pending_review"
  ) {
    return null;
  }
  const evaluatedAt =
    typeof record.evaluatedAt === "string" ? record.evaluatedAt : new Date(0).toISOString();
  const score = typeof record.score === "number" ? record.score : undefined;
  const passingScore =
    typeof record.passingScore === "number"
      ? record.passingScore
      : record.passingScore === null
        ? null
        : undefined;
  const offendingFieldKey =
    typeof record.offendingFieldKey === "string" ? record.offendingFieldKey : undefined;
  return {
    result: result as ApplicationFormEvaluationResult["result"],
    ...(score !== undefined ? { score } : {}),
    ...(passingScore !== undefined ? { passingScore } : {}),
    ...(offendingFieldKey ? { offendingFieldKey } : {}),
    evaluatedAt,
  };
}
