import test from "node:test";
import assert from "node:assert/strict";

import {
  canonicalJsonStringify,
  computeFormContentHash,
  measureDocumentBytes,
  normalizeApplicationFormDocument,
  pickPlayerFormView,
  serializeApplicationFormDocument,
  stripInternalFormDataKeys,
  validateBranchingGraph,
  MAX_APPLICATION_FORM_BYTES,
  MAX_FORM_FIELDS,
} from "@/lib/applicationFormDocument";
import type { OwnerFormConfig } from "@/lib/types";

function makeOwnerForm(): OwnerFormConfig {
  return {
    version: 1,
    fields: [
      {
        key: "premium",
        label: "Do you own a premium account?",
        type: "select",
        required: true,
        options: [
          { value: "yes", label: "Yes", points: 0, correct: true },
          { value: "no", label: "No", points: 0, autoReject: true },
        ],
      },
      {
        key: "experience",
        label: "How many hours have you played?",
        type: "text",
        required: false,
      },
    ],
    settings: {
      passingScore: null,
      showScoreToPlayerOnReject: false,
      showRejectReasonToPlayerOnReject: false,
    },
    branching: [],
  };
}

test("normalizeApplicationFormDocument accepts legacy v0 array shape", () => {
  const v0 = [
    { key: "why", label: "Why join?", type: "textarea", required: true },
    { key: "age", label: "Age?", type: "text", required: false },
  ];
  const doc = normalizeApplicationFormDocument(v0);
  assert.ok(doc, "should produce a doc");
  assert.equal(doc.version, 1);
  assert.equal(doc.fields.length, 2);
  assert.equal(doc.fields[0].key, "why");
  assert.equal(doc.settings.passingScore, null);
  assert.equal(doc.branching.length, 0);
});

test("normalizeApplicationFormDocument accepts v1 object shape", () => {
  const doc = normalizeApplicationFormDocument(makeOwnerForm());
  assert.ok(doc);
  assert.equal(doc.fields.length, 2);
  assert.equal(doc.fields[0].options?.[1].autoReject, true);
});

test("normalizeApplicationFormDocument rejects invalid version", () => {
  const doc = normalizeApplicationFormDocument({ version: 99, fields: [] });
  assert.equal(doc, null);
});

test("normalizeApplicationFormDocument fires onLegacyEncounter once per serverId", () => {
  let count = 0;
  const v0 = [{ key: "x", label: "X", type: "text", required: false }];
  normalizeApplicationFormDocument(v0, {
    serverId: "test-server-once",
    onLegacyEncounter: () => {
      count += 1;
    },
  });
  normalizeApplicationFormDocument(v0, {
    serverId: "test-server-once",
    onLegacyEncounter: () => {
      count += 1;
    },
  });
  assert.equal(count, 1, "second encounter must not fire");
});

test("canonicalJsonStringify is key-order invariant", () => {
  const a = canonicalJsonStringify({ b: 1, a: 2, c: { y: 1, x: 2 } });
  const b = canonicalJsonStringify({ a: 2, c: { x: 2, y: 1 }, b: 1 });
  assert.equal(a, b);
});

test("canonicalJsonStringify preserves array order", () => {
  const a = canonicalJsonStringify(["x", "a", "m"]);
  assert.equal(a, '["x","a","m"]');
});

test("computeFormContentHash is deterministic for equivalent inputs", () => {
  const original = makeOwnerForm();
  // Simulate Postgres jsonb storage round-trip (which does NOT preserve insertion order).
  const reordered = JSON.parse(JSON.stringify(original));
  // Force key reordering by re-creating the inner objects with reversed key order.
  reordered.settings = {
    showRejectReasonToPlayerOnReject: false,
    passingScore: null,
    showScoreToPlayerOnReject: false,
  };
  const h1 = computeFormContentHash(original);
  const h2 = computeFormContentHash(reordered);
  assert.equal(h1, h2);
});

test("computeFormContentHash differs when meaningful content changes", () => {
  const a = makeOwnerForm();
  const b = makeOwnerForm();
  b.settings.passingScore = 30;
  const h1 = computeFormContentHash(a);
  const h2 = computeFormContentHash(b);
  assert.notEqual(h1, h2);
});

test("computeFormContentHash returns 32-hex chars", () => {
  const hash = computeFormContentHash(makeOwnerForm());
  assert.match(hash, /^[a-f0-9]{32}$/);
});

test("measureDocumentBytes < ceiling for typical form", () => {
  const bytes = measureDocumentBytes(makeOwnerForm());
  assert.ok(bytes < MAX_APPLICATION_FORM_BYTES, `expected < ${MAX_APPLICATION_FORM_BYTES}, got ${bytes}`);
});

test("validateBranchingGraph accepts well-formed forward-only rules", () => {
  const doc = makeOwnerForm();
  doc.branching = [
    {
      targetFieldKey: "experience",
      whenFieldKey: "premium",
      allowedValues: ["yes"],
    },
  ];
  const result = validateBranchingGraph(doc.fields, doc.branching);
  assert.equal(result.valid, true);
});

test("validateBranchingGraph rejects forward references", () => {
  const doc = makeOwnerForm();
  // Try to make `premium` (idx 0) depend on `experience` (idx 1) — invalid.
  doc.branching = [
    {
      targetFieldKey: "premium",
      whenFieldKey: "experience",
      allowedValues: ["10"],
    },
  ];
  const result = validateBranchingGraph(doc.fields, doc.branching);
  assert.equal(result.valid, false);
});

test("pickPlayerFormView strips points / correct / autoReject", () => {
  const view = pickPlayerFormView(makeOwnerForm());
  assert.ok(view);
  const opt = view.fields[0].options?.[1];
  assert.ok(opt);
  assert.equal(Object.keys(opt).sort().join(","), "label,value");
  // Negative assertions — these MUST NOT exist on the projection.
  assert.equal((opt as Record<string, unknown>).points, undefined);
  assert.equal((opt as Record<string, unknown>).autoReject, undefined);
  assert.equal((opt as Record<string, unknown>).correct, undefined);
});

test("pickPlayerFormView omits branching + settings entirely", () => {
  const doc = makeOwnerForm();
  doc.branching = [
    { targetFieldKey: "experience", whenFieldKey: "premium", allowedValues: ["yes"] },
  ];
  doc.settings.passingScore = 30;
  doc.settings.showScoreToPlayerOnReject = true;
  const view = pickPlayerFormView(doc);
  assert.ok(view);
  assert.equal((view as unknown as Record<string, unknown>).branching, undefined);
  assert.equal((view as unknown as Record<string, unknown>).settings, undefined);
});

test("stripInternalFormDataKeys removes both mcUsername and _evaluation", () => {
  const stripped = stripInternalFormDataKeys({
    mcUsername: "Notch",
    _evaluation: { result: "pending_review" },
    why: "i love mc",
  });
  assert.deepEqual(stripped, { why: "i love mc" });
});

test("stripInternalFormDataKeys returns null for null input", () => {
  assert.equal(stripInternalFormDataKeys(null), null);
});

test("MAX_FORM_FIELDS is 100", () => {
  assert.equal(MAX_FORM_FIELDS, 100);
});

test("serializeApplicationFormDocument round-trips via normalize", () => {
  const original = makeOwnerForm();
  original.branching = [
    { targetFieldKey: "experience", whenFieldKey: "premium", allowedValues: ["yes"] },
  ];
  const serialized = serializeApplicationFormDocument(original);
  const re = normalizeApplicationFormDocument(serialized);
  assert.deepEqual(re, original);
});
