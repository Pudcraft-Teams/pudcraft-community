import type {
  ApplicationFormBranchRule,
  ApplicationFormEvaluationResult,
  ApplicationFormField,
  ApplicationFormOption,
  ApplicationFormSettings,
  OwnerFormConfig,
} from "@/lib/types";

export type AnswerMap = Record<string, string | string[]>;

function answerToValueSet(answer: string | string[] | undefined): Set<string> {
  if (answer === undefined) return new Set();
  if (Array.isArray(answer)) return new Set(answer);
  return new Set([answer]);
}

/**
 * Score awarded for a single selected option. Field type is irrelevant —
 * single-choice and multi-choice questions share the same per-option scoring
 * shape. Explicit `points` wins; `correct` is the legacy "+1" shorthand.
 *
 * Non-selected options contribute `0`. `autoReject` short-circuits the
 * evaluator before this is called, so we don't special-case it here.
 */
function getOptionScore(opt: ApplicationFormOption): number {
  if (typeof opt.points === "number") return opt.points;
  if (opt.correct === true) return 1;
  return 0;
}

/** Maximum a single field can contribute to the total. See `computeMaxScore` for context. */
function fieldMaxScore(field: ApplicationFormField): number {
  if (!field.options) return 0;
  const safeOptions = field.options.filter((opt) => opt.autoReject !== true);
  if (safeOptions.length === 0) return 0;
  if (field.type === "select") {
    // Single-choice: best-case is picking the highest-scoring safe option.
    return Math.max(0, ...safeOptions.map(getOptionScore));
  }
  // multiselect: best-case is picking every positive option.
  return safeOptions
    .map(getOptionScore)
    .filter((s) => s > 0)
    .reduce((a, b) => a + b, 0);
}

/**
 * Compute the set of fields visible given a document and current answers.
 * A field is hidden iff it has a branching rule whose `whenFieldKey` answer does NOT
 * include any of the rule's `allowedValues`. Multiple rules on the same target field
 * are AND-combined (all must pass for the field to show).
 */
export function computeVisibleFields(
  doc: OwnerFormConfig,
  answers: AnswerMap,
): ApplicationFormField[] {
  const rulesByTarget = new Map<string, ApplicationFormBranchRule[]>();
  for (const rule of doc.branching) {
    const list = rulesByTarget.get(rule.targetFieldKey) ?? [];
    list.push(rule);
    rulesByTarget.set(rule.targetFieldKey, list);
  }
  return doc.fields.filter((field) => {
    const rules = rulesByTarget.get(field.key);
    if (!rules || rules.length === 0) return true;
    return rules.every((rule) => {
      const valueSet = answerToValueSet(answers[rule.whenFieldKey]);
      return rule.allowedValues.some((v) => valueSet.has(v));
    });
  });
}

/** Does this field carry any scoring intent? */
function fieldHasScoring(field: ApplicationFormField): boolean {
  if (!field.options) return false;
  return field.options.some(
    (opt) => opt.correct === true || typeof opt.points === "number",
  );
}

/** Sum of points for the player's selected answers across visible scoring fields. */
export function computeScore(
  visibleFields: ApplicationFormField[],
  answers: AnswerMap,
): { total: number; hasScoring: boolean } {
  let total = 0;
  let hasScoring = false;
  for (const field of visibleFields) {
    if (!field.options) continue;
    if (!fieldHasScoring(field)) continue;
    hasScoring = true;
    const answer = answerToValueSet(answers[field.key]);
    for (const opt of field.options) {
      if (!answer.has(opt.value)) continue;
      total += getOptionScore(opt);
    }
  }
  return { total, hasScoring };
}

/**
 * Maximum possible score across visible fields, used as the denominator for
 * percentage display. For `select` we take the highest single option (or the
 * field-level `totalPoints` when at least one correct option exists); for
 * `multiselect` we sum the positive option points (the player can pick them
 * all). `autoReject` options are excluded — selecting them rejects the
 * application outright, so they can't be part of a "best-case" answer set.
 */
export function computeMaxScore(visibleFields: ApplicationFormField[]): number {
  let max = 0;
  for (const field of visibleFields) {
    if (!fieldHasScoring(field)) continue;
    max += fieldMaxScore(field);
  }
  return max;
}

/**
 * Find the first field whose answer triggers a hard-disqualify (`autoReject` option selected).
 * Considers ONLY visible fields. Returns the field key (and which option was the offender).
 */
export function findHardDisqualify(
  visibleFields: ApplicationFormField[],
  answers: AnswerMap,
): { fieldKey: string; optionValue: string } | null {
  for (const field of visibleFields) {
    if (!field.options) continue;
    const answer = answerToValueSet(answers[field.key]);
    for (const opt of field.options) {
      if (opt.autoReject === true && answer.has(opt.value)) {
        return { fieldKey: field.key, optionValue: opt.value };
      }
    }
  }
  return null;
}

/**
 * Server-side evaluation gate. Order: hard-disqualify → score-below-threshold → pending.
 *
 * This is the SINGLE SOURCE OF TRUTH for evaluation logic. Server (POST /applications) and
 * owner editor preview both call this. Player runtime does NOT call this — the player only
 * receives a `PlayerFormView` projection and never sees gating data.
 */
export function evaluateApplication(
  doc: OwnerFormConfig,
  answers: AnswerMap,
  options?: { evaluatedAt?: string },
): ApplicationFormEvaluationResult {
  const evaluatedAt = options?.evaluatedAt ?? new Date().toISOString();
  const visibleFields = computeVisibleFields(doc, answers);

  const hardDisq = findHardDisqualify(visibleFields, answers);
  if (hardDisq) {
    return {
      result: "hard_disqualify",
      offendingFieldKey: hardDisq.fieldKey,
      evaluatedAt,
    };
  }

  const passingScore = doc.settings.passingScore;
  const { total, hasScoring } = computeScore(visibleFields, answers);
  const maxScore = hasScoring ? computeMaxScore(visibleFields) : 0;
  const scorePercent =
    hasScoring && maxScore > 0 ? Math.round((total / maxScore) * 100) : null;

  if (
    passingScore !== null &&
    hasScoring &&
    scorePercent !== null &&
    scorePercent < passingScore
  ) {
    return {
      result: "score_below_threshold",
      score: total,
      maxScore,
      scorePercent,
      passingScore,
      evaluatedAt,
    };
  }

  return {
    result: "pending_review",
    ...(hasScoring
      ? {
          score: total,
          maxScore,
          ...(scorePercent !== null ? { scorePercent } : {}),
        }
      : {}),
    ...(passingScore !== null ? { passingScore } : {}),
    evaluatedAt,
  };
}

/**
 * Project an evaluation result for the applicant. Removes anything the owner
 * did not explicitly opt to disclose. The full result still flows to owner-
 * scoped responses; this helper guards every applicant-facing surface.
 *
 * Disclosure rules:
 *   - pending_review     → result + evaluatedAt only (never reveal threshold).
 *   - hard_disqualify    → keep offendingFieldKey only when
 *                          settings.showRejectReasonToPlayerOnReject is true.
 *   - score_below_threshold → keep score and passingScore only when
 *                             settings.showScoreToPlayerOnReject is true.
 *
 * If settings is null (legacy v0 form has no toggles) we default to the
 * minimal projection so legacy installs cannot accidentally leak.
 */
export function pickPlayerEvaluationView(
  result: ApplicationFormEvaluationResult,
  settings: ApplicationFormSettings | null,
): ApplicationFormEvaluationResult {
  const base: ApplicationFormEvaluationResult = {
    result: result.result,
    evaluatedAt: result.evaluatedAt,
  };

  if (!settings || result.result === "pending_review") {
    return base;
  }

  if (result.result === "hard_disqualify") {
    if (settings.showRejectReasonToPlayerOnReject && result.offendingFieldKey !== undefined) {
      return { ...base, offendingFieldKey: result.offendingFieldKey };
    }
    return base;
  }

  // score_below_threshold
  if (settings.showScoreToPlayerOnReject) {
    return {
      ...base,
      ...(result.score !== undefined ? { score: result.score } : {}),
      ...(result.maxScore !== undefined ? { maxScore: result.maxScore } : {}),
      ...(result.scorePercent !== undefined ? { scorePercent: result.scorePercent } : {}),
      ...(result.passingScore !== undefined ? { passingScore: result.passingScore } : {}),
    };
  }
  return base;
}
