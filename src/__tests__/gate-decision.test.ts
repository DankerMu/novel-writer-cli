import assert from "node:assert/strict";
import test from "node:test";

import { computeGateDecision, detectGoldenChapterGateFailure, detectHighConfidenceViolation, evaluateGateDecisionFromEval } from "../gate-decision.js";

test("computeGateDecision maps score bands to decisions (no violations)", () => {
  assert.equal(computeGateDecision({ overall_final: 4.0, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "pass");
  assert.equal(computeGateDecision({ overall_final: 3.9, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "polish");
  assert.equal(computeGateDecision({ overall_final: 3.5, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "polish");
  assert.equal(computeGateDecision({ overall_final: 3.4, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "revise");
  assert.equal(computeGateDecision({ overall_final: 3.0, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "revise");
  assert.equal(computeGateDecision({ overall_final: 2.9, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "pause_for_user");
  assert.equal(computeGateDecision({ overall_final: 2.0, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "pause_for_user");
  assert.equal(computeGateDecision({ overall_final: 1.99, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "pause_for_user_force_rewrite");
});

test("computeGateDecision forces revise on high-confidence violations", () => {
  assert.equal(computeGateDecision({ overall_final: 4.8, revision_count: 0, has_high_confidence_violation: true, has_golden_chapter_gate_failure: false }), "revise");
});

test("computeGateDecision pauses for user when high-confidence violations persist beyond max_revisions", () => {
  assert.equal(computeGateDecision({ overall_final: 4.8, revision_count: 2, has_high_confidence_violation: true, has_golden_chapter_gate_failure: false }), "pause_for_user");
});

test("computeGateDecision forces revise on golden chapter gate failures", () => {
  assert.equal(computeGateDecision({ overall_final: 4.8, revision_count: 0, has_high_confidence_violation: false, has_golden_chapter_gate_failure: true }), "revise");
});

test("computeGateDecision allows force_passed when revisions exhausted and score >= 3.0", () => {
  assert.equal(computeGateDecision({ overall_final: 3.2, revision_count: 2, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "force_passed");
});

test("computeGateDecision force-passes polish band when revisions exhausted", () => {
  assert.equal(computeGateDecision({ overall_final: 3.6, revision_count: 2, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false }), "force_passed");
});

test("computeGateDecision respects max_revisions override", () => {
  assert.equal(
    computeGateDecision({ overall_final: 3.6, revision_count: 1, has_high_confidence_violation: false, has_golden_chapter_gate_failure: false, max_revisions: 1 }),
    "force_passed"
  );
});

test("computeGateDecision supports manual force_pass override", () => {
  assert.equal(
    computeGateDecision({ overall_final: 1.0, revision_count: 0, has_high_confidence_violation: true, has_golden_chapter_gate_failure: true, force_pass: true }),
    "force_passed"
  );
});

test("detectHighConfidenceViolation returns false when contract_verification is missing", () => {
  assert.deepEqual(detectHighConfidenceViolation({ overall: 4.0, recommendation: "pass" }), {
    has_high_confidence_violation: false,
    high_confidence_violations: []
  });
});

test("detectHighConfidenceViolation detects l1/l2/l3 high-confidence violations", () => {
  const res = detectHighConfidenceViolation({
    contract_verification: {
      l1_checks: [{ status: "violation", confidence: "high", rule: "L1-001" }],
      l2_checks: [],
      l3_checks: []
    }
  });
  assert.equal(res.has_high_confidence_violation, true);
  assert.equal(res.high_confidence_violations.length, 1);
});

test("detectHighConfidenceViolation ignores ls_checks soft violations", () => {
  const res = detectHighConfidenceViolation({
    contract_verification: {
      ls_checks: [{ status: "violation", confidence: "high", constraint_type: "soft" }]
    }
  });
  assert.equal(res.has_high_confidence_violation, false);
});

test("detectHighConfidenceViolation marks inferred constraint_type for ls_checks when missing", () => {
  const res = detectHighConfidenceViolation({
    contract_verification: {
      ls_checks: [{ status: "violation", confidence: "high" }]
    }
  });
  assert.equal(res.has_high_confidence_violation, true);
  assert.equal(res.high_confidence_violations.length, 1);
  assert.equal((res.high_confidence_violations[0] as Record<string, unknown>).constraint_type_inferred, true);
});

test("detectGoldenChapterGateFailure returns false when gates are missing", () => {
  assert.deepEqual(detectGoldenChapterGateFailure({ overall: 4.0, recommendation: "pass" }), {
    has_golden_chapter_gate_failure: false,
    failed_checks: []
  });
});

test("detectGoldenChapterGateFailure deduplicates repeated failed gate ids", () => {
  const res = detectGoldenChapterGateFailure({
    golden_chapter_gates: {
      activated: true,
      passed: false,
      failed_gate_ids: ["hook_present", "protagonist_within_200_words"],
      checks: [{ id: "hook_present", status: "fail", detail: "no hook" }]
    }
  });
  assert.equal(res.has_golden_chapter_gate_failure, true);
  assert.equal(res.failed_checks.length, 2);
  assert.deepEqual(
    res.failed_checks.map((item) => item.id),
    ["hook_present", "protagonist_within_200_words"]
  );
});

test("evaluateGateDecisionFromEval rejects non-object eval payloads", () => {
  assert.deepEqual(evaluateGateDecisionFromEval({ evalRaw: null, revision_count: 0 }), {
    ok: false,
    reason: "eval_invalid"
  });
});

test("evaluateGateDecisionFromEval rejects missing overall scores", () => {
  assert.deepEqual(evaluateGateDecisionFromEval({ evalRaw: { chapter: 1 }, revision_count: 0 }), {
    ok: false,
    reason: "eval_missing_overall"
  });
});
