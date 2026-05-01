import test from "node:test";
import assert from "node:assert/strict";

import {
  computeScore,
  computeVisibleFields,
  evaluateApplication,
  findHardDisqualify,
  pickPlayerEvaluationView,
} from "@/lib/applicationFormEvaluation";
import type {
  ApplicationFormEvaluationResult,
  ApplicationFormSettings,
  OwnerFormConfig,
} from "@/lib/types";

function makeForm(): OwnerFormConfig {
  return {
    version: 1,
    fields: [
      {
        key: "premium",
        label: "Premium account?",
        type: "select",
        required: true,
        options: [
          { value: "yes", label: "Yes" },
          { value: "no", label: "No", autoReject: true },
        ],
      },
      {
        key: "rules",
        label: "Server rules quiz",
        type: "select",
        required: true,
        options: [
          { value: "a", label: "Build anywhere", points: 0 },
          { value: "b", label: "Respect grief rules", points: 20, correct: true },
          { value: "c", label: "PVP everywhere", points: 0 },
        ],
      },
      {
        key: "pvp_experience",
        label: "Describe PVP experience",
        type: "textarea",
        required: false,
      },
    ],
    settings: {
      // Form-level percentage threshold: applicants must score ≥ 60% of the
      // form's max points (which equals 20 — only the `rules` field has scoring
      // and the `b` option is its sole positive option).
      passingScore: 60,
      showScoreToPlayerOnReject: true,
      showRejectReasonToPlayerOnReject: true,
    },
    branching: [
      // pvp_experience only shows when rules answer is "c"
      { targetFieldKey: "pvp_experience", whenFieldKey: "rules", allowedValues: ["c"] },
    ],
  };
}

test("hard-disqualify wins over score threshold", () => {
  const form = makeForm();
  const result = evaluateApplication(form, {
    premium: "no",
    rules: "b",
  });
  assert.equal(result.result, "hard_disqualify");
  assert.equal(result.offendingFieldKey, "premium");
  assert.equal(result.score, undefined);
});

test("score below threshold rejects (percent below passingScore)", () => {
  const form = makeForm();
  const result = evaluateApplication(form, {
    premium: "yes",
    rules: "a",
  });
  assert.equal(result.result, "score_below_threshold");
  assert.equal(result.score, 0);
  assert.equal(result.maxScore, 20);
  assert.equal(result.scorePercent, 0);
  assert.equal(result.passingScore, 60);
});

test("score at or above threshold passes (pending review)", () => {
  const form = makeForm();
  const result = evaluateApplication(form, {
    premium: "yes",
    rules: "b",
  });
  assert.equal(result.result, "pending_review");
  assert.equal(result.score, 20);
  assert.equal(result.maxScore, 20);
  assert.equal(result.scorePercent, 100);
  assert.equal(result.passingScore, 60);
});

test("legacy v0 form (no scoring, no branching) returns pending without score", () => {
  const v0Doc: OwnerFormConfig = {
    version: 1,
    fields: [
      { key: "why", label: "Why join?", type: "textarea", required: true },
    ],
    settings: {
      passingScore: null,
      showScoreToPlayerOnReject: false,
      showRejectReasonToPlayerOnReject: false,
    },
    branching: [],
  };
  const result = evaluateApplication(v0Doc, { why: "i love mc" });
  assert.equal(result.result, "pending_review");
  assert.equal(result.score, undefined);
  assert.equal(result.passingScore, undefined);
});

test("computeVisibleFields hides fields whose branching rule is unmet", () => {
  const form = makeForm();
  const visible = computeVisibleFields(form, { premium: "yes", rules: "b" });
  // pvp_experience hides because rules != "c"
  assert.equal(visible.length, 2);
  assert.deepEqual(
    visible.map((f) => f.key),
    ["premium", "rules"],
  );
});

test("computeVisibleFields shows branched field when condition met", () => {
  const form = makeForm();
  const visible = computeVisibleFields(form, { premium: "yes", rules: "c" });
  assert.equal(visible.length, 3);
});

test("hard-disqualify on a hidden field is ignored", () => {
  const form = makeForm();
  // Add an autoReject option to the hidden pvp_experience field via a select-typed override
  form.fields[2] = {
    key: "pvp_experience",
    label: "Have you been banned?",
    type: "select",
    required: false,
    options: [
      { value: "yes", label: "Yes", autoReject: true },
      { value: "no", label: "No" },
    ],
  };
  // rules="b" hides pvp_experience entirely. Even though pvp_experience answer is "yes" (autoReject),
  // it must be ignored because the field is not visible.
  const result = evaluateApplication(form, {
    premium: "yes",
    rules: "b",
    pvp_experience: "yes",
  });
  assert.equal(result.result, "pending_review");
});

test("findHardDisqualify on multiselect with overlap triggers", () => {
  const form: OwnerFormConfig = {
    version: 1,
    fields: [
      {
        key: "platforms",
        label: "Platforms you play on",
        type: "multiselect",
        required: true,
        options: [
          { value: "java", label: "Java" },
          { value: "bedrock", label: "Bedrock", autoReject: true },
          { value: "console", label: "Console" },
        ],
      },
    ],
    settings: {
      passingScore: null,
      showScoreToPlayerOnReject: false,
      showRejectReasonToPlayerOnReject: false,
    },
    branching: [],
  };
  const result = findHardDisqualify(form.fields, { platforms: ["java", "bedrock"] });
  assert.deepEqual(result, { fieldKey: "platforms", optionValue: "bedrock" });
});

test("computeScore: only counts correct/points options for selected answers", () => {
  const form = makeForm();
  const { total, hasScoring } = computeScore(form.fields, { rules: "b" });
  assert.equal(hasScoring, true);
  assert.equal(total, 20);
});

test("computeScore: returns hasScoring=false when no field has scoring", () => {
  const form: OwnerFormConfig = {
    version: 1,
    fields: [{ key: "why", label: "Why?", type: "textarea", required: true }],
    settings: {
      passingScore: null,
      showScoreToPlayerOnReject: false,
      showRejectReasonToPlayerOnReject: false,
    },
    branching: [],
  };
  const { hasScoring } = computeScore(form.fields, { why: "i love mc" });
  assert.equal(hasScoring, false);
});

test("evaluator embeds evaluatedAt timestamp", () => {
  const form = makeForm();
  const before = Date.now();
  const result = evaluateApplication(form, { premium: "yes", rules: "b" });
  const after = Date.now();
  const ts = new Date(result.evaluatedAt).getTime();
  assert.ok(ts >= before && ts <= after, `evaluatedAt ${ts} outside [${before}, ${after}]`);
});

const baseEvaluatedAt = "2026-04-30T16:00:00.000Z";

const settingsBothOff: ApplicationFormSettings = {
  passingScore: 60,
  showScoreToPlayerOnReject: false,
  showRejectReasonToPlayerOnReject: false,
};
const settingsScoreOn: ApplicationFormSettings = {
  passingScore: 60,
  showScoreToPlayerOnReject: true,
  showRejectReasonToPlayerOnReject: false,
};
const settingsReasonOn: ApplicationFormSettings = {
  passingScore: 60,
  showScoreToPlayerOnReject: false,
  showRejectReasonToPlayerOnReject: true,
};
const settingsBothOn: ApplicationFormSettings = {
  passingScore: 60,
  showScoreToPlayerOnReject: true,
  showRejectReasonToPlayerOnReject: true,
};

const hardDisqualify: ApplicationFormEvaluationResult = {
  result: "hard_disqualify",
  offendingFieldKey: "premium",
  evaluatedAt: baseEvaluatedAt,
};
const scoreBelow: ApplicationFormEvaluationResult = {
  result: "score_below_threshold",
  score: 5,
  maxScore: 20,
  scorePercent: 25,
  passingScore: 60,
  evaluatedAt: baseEvaluatedAt,
};
const pendingWithScoring: ApplicationFormEvaluationResult = {
  result: "pending_review",
  score: 25,
  maxScore: 30,
  scorePercent: 83,
  passingScore: 60,
  evaluatedAt: baseEvaluatedAt,
};

test("pickPlayerEvaluationView with both toggles off strips offendingFieldKey/score/passingScore", () => {
  assert.deepEqual(pickPlayerEvaluationView(hardDisqualify, settingsBothOff), {
    result: "hard_disqualify",
    evaluatedAt: baseEvaluatedAt,
  });
  assert.deepEqual(pickPlayerEvaluationView(scoreBelow, settingsBothOff), {
    result: "score_below_threshold",
    evaluatedAt: baseEvaluatedAt,
  });
});

test("pickPlayerEvaluationView with showScoreToPlayerOnReject=true reveals score+percent+threshold for score path only", () => {
  assert.deepEqual(pickPlayerEvaluationView(scoreBelow, settingsScoreOn), {
    result: "score_below_threshold",
    score: 5,
    maxScore: 20,
    scorePercent: 25,
    passingScore: 60,
    evaluatedAt: baseEvaluatedAt,
  });
  // hard_disqualify path is not affected by score toggle alone
  assert.deepEqual(pickPlayerEvaluationView(hardDisqualify, settingsScoreOn), {
    result: "hard_disqualify",
    evaluatedAt: baseEvaluatedAt,
  });
});

test("pickPlayerEvaluationView with showRejectReasonToPlayerOnReject=true reveals offendingFieldKey for hard_disqualify only", () => {
  assert.deepEqual(pickPlayerEvaluationView(hardDisqualify, settingsReasonOn), {
    result: "hard_disqualify",
    offendingFieldKey: "premium",
    evaluatedAt: baseEvaluatedAt,
  });
  // score path is not affected by reason toggle alone
  assert.deepEqual(pickPlayerEvaluationView(scoreBelow, settingsReasonOn), {
    result: "score_below_threshold",
    evaluatedAt: baseEvaluatedAt,
  });
});

test("pickPlayerEvaluationView with both toggles on returns the full result for both reject paths", () => {
  assert.deepEqual(pickPlayerEvaluationView(hardDisqualify, settingsBothOn), {
    result: "hard_disqualify",
    offendingFieldKey: "premium",
    evaluatedAt: baseEvaluatedAt,
  });
  assert.deepEqual(pickPlayerEvaluationView(scoreBelow, settingsBothOn), {
    result: "score_below_threshold",
    score: 5,
    maxScore: 20,
    scorePercent: 25,
    passingScore: 60,
    evaluatedAt: baseEvaluatedAt,
  });
});

test("pickPlayerEvaluationView never reveals threshold metadata for pending_review", () => {
  for (const settings of [settingsBothOff, settingsScoreOn, settingsReasonOn, settingsBothOn]) {
    assert.deepEqual(pickPlayerEvaluationView(pendingWithScoring, settings), {
      result: "pending_review",
      evaluatedAt: baseEvaluatedAt,
    });
  }
});

test("pickPlayerEvaluationView with null settings (legacy v0) returns minimal projection", () => {
  assert.deepEqual(pickPlayerEvaluationView(scoreBelow, null), {
    result: "score_below_threshold",
    evaluatedAt: baseEvaluatedAt,
  });
  assert.deepEqual(pickPlayerEvaluationView(hardDisqualify, null), {
    result: "hard_disqualify",
    evaluatedAt: baseEvaluatedAt,
  });
});
