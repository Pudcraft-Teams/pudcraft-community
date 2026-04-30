import type {
  ApplicationFormBranchRule,
  ApplicationFormEvaluationResult,
  ApplicationFormField,
  OwnerFormConfig,
} from "@/lib/types";

export type AnswerMap = Record<string, string | string[]>;

function answerToValueSet(answer: string | string[] | undefined): Set<string> {
  if (answer === undefined) return new Set();
  if (Array.isArray(answer)) return new Set(answer);
  return new Set([answer]);
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

/** Sum of points for the player's answers across visible fields with `correct` options. */
export function computeScore(
  visibleFields: ApplicationFormField[],
  answers: AnswerMap,
): { total: number; hasScoring: boolean } {
  let total = 0;
  let hasScoring = false;
  for (const field of visibleFields) {
    if (!field.options) continue;
    const fieldHasScoring = field.options.some(
      (opt) => opt.correct === true || typeof opt.points === "number",
    );
    if (!fieldHasScoring) continue;
    hasScoring = true;
    const answer = answerToValueSet(answers[field.key]);
    for (const opt of field.options) {
      if (!answer.has(opt.value)) continue;
      if (typeof opt.points === "number") {
        total += opt.points;
      } else if (opt.correct === true) {
        total += 1;
      }
    }
  }
  return { total, hasScoring };
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

  if (passingScore !== null && hasScoring && total < passingScore) {
    return {
      result: "score_below_threshold",
      score: total,
      passingScore,
      evaluatedAt,
    };
  }

  return {
    result: "pending_review",
    ...(hasScoring ? { score: total } : {}),
    ...(passingScore !== null ? { passingScore } : {}),
    evaluatedAt,
  };
}
