import test from "node:test";
import assert from "node:assert/strict";

import {
  computeScore,
  computeVisibleFields,
  evaluateApplication,
  findHardDisqualify,
} from "@/lib/applicationFormEvaluation";
import type { OwnerFormConfig } from "@/lib/types";

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
      passingScore: 20,
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

test("score below threshold rejects", () => {
  const form = makeForm();
  const result = evaluateApplication(form, {
    premium: "yes",
    rules: "a",
  });
  assert.equal(result.result, "score_below_threshold");
  assert.equal(result.score, 0);
  assert.equal(result.passingScore, 20);
});

test("score at or above threshold passes (pending review)", () => {
  const form = makeForm();
  const result = evaluateApplication(form, {
    premium: "yes",
    rules: "b",
  });
  assert.equal(result.result, "pending_review");
  assert.equal(result.score, 20);
  assert.equal(result.passingScore, 20);
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
