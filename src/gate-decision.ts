import { isPlainObject } from "./type-guards.js";

export const GATE_DECISIONS = ["pass", "polish", "revise", "pause_for_user", "pause_for_user_force_rewrite", "force_passed"] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];
export type GateEvalFailureReason = "eval_invalid" | "eval_missing_overall";

export type GateDecisionInput = {
  overall_final: number;
  revision_count: number;
  has_high_confidence_violation: boolean;
  has_golden_chapter_gate_failure: boolean;
  force_pass?: boolean;
  max_revisions?: number;
};

export type ContractCheck = Record<string, unknown> & {
  status?: unknown;
  confidence?: unknown;
  constraint_type?: unknown;
};

function isHighViolation(check: ContractCheck): boolean {
  return check.status === "violation" && check.confidence === "high";
}

export function detectHighConfidenceViolation(evalRaw: unknown): {
  has_high_confidence_violation: boolean;
  high_confidence_violations: ContractCheck[];
} {
  if (!isPlainObject(evalRaw)) return { has_high_confidence_violation: false, high_confidence_violations: [] };
  const evalObj = evalRaw as Record<string, unknown>;

  const cvRaw = evalObj.contract_verification;
  if (!isPlainObject(cvRaw)) return { has_high_confidence_violation: false, high_confidence_violations: [] };
  const cv = cvRaw as Record<string, unknown>;

  const pick = (key: string): ContractCheck[] => {
    const raw = cv[key];
    if (!Array.isArray(raw)) return [];
    return raw.filter((it): it is ContractCheck => isPlainObject(it)) as ContractCheck[];
  };

  const hardChecks: ContractCheck[] = [];

  for (const key of ["l1_checks", "l2_checks", "l3_checks"]) {
    for (const it of pick(key)) {
      if (!isHighViolation(it)) continue;
      hardChecks.push(it);
    }
  }

  for (const it of pick("ls_checks")) {
    if (!isHighViolation(it)) continue;
    const constraintType = typeof it.constraint_type === "string" ? it.constraint_type : null;
    // Default to hard when missing to preserve safety.
    const isHard = constraintType === null || constraintType === "hard";
    if (!isHard) continue;
    hardChecks.push(constraintType === null ? { ...it, constraint_type_inferred: true } : it);
  }

  return { has_high_confidence_violation: hardChecks.length > 0, high_confidence_violations: hardChecks };
}

export function computeGateDecision(args: GateDecisionInput): GateDecision {
  const maxRevisions = normalizeMaxRevisions(args.max_revisions);

  if (args.force_pass) return "force_passed";
  if (args.has_high_confidence_violation || args.has_golden_chapter_gate_failure) {
    return args.revision_count >= maxRevisions ? "pause_for_user" : "revise";
  }

  const score = args.overall_final;
  if (!Number.isFinite(score)) return "pause_for_user_force_rewrite";
  if (score >= 4.0) return "pass";
  if (score >= 3.5) return args.revision_count >= maxRevisions ? "force_passed" : "polish";
  if (score >= 3.0) return args.revision_count >= maxRevisions ? "force_passed" : "revise";
  if (score >= 2.0) return "pause_for_user";
  return "pause_for_user_force_rewrite";
}

export type GoldenChapterGateCheck = Record<string, unknown> & {
  id?: unknown;
  status?: unknown;
  detail?: unknown;
  evidence?: unknown;
};

export type EvaluatedGateDecision = {
  overall_final: number;
  decision: GateDecision;
  revision_count: number;
  max_revisions: number | null;
  has_high_confidence_violation: boolean;
  high_confidence_violations: ContractCheck[];
  has_golden_chapter_gate_failure: boolean;
  golden_chapter_gate_failures: GoldenChapterGateCheck[];
  recommendation: string | null;
};

export type EvaluateGateDecisionFromEvalResult =
  | { ok: true; gate: EvaluatedGateDecision }
  | { ok: false; reason: GateEvalFailureReason };

function normalizeMaxRevisions(value: unknown): number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : 2;
}

function isGoldenChapterGateFailureStatus(value: unknown): boolean {
  return value === "fail" || value === "failed" || value === "violation";
}

export function detectGoldenChapterGateFailure(evalRaw: unknown): {
  has_golden_chapter_gate_failure: boolean;
  failed_checks: GoldenChapterGateCheck[];
} {
  if (!isPlainObject(evalRaw)) return { has_golden_chapter_gate_failure: false, failed_checks: [] };
  const evalObj = evalRaw as Record<string, unknown>;
  const raw = evalObj.golden_chapter_gates;
  if (!isPlainObject(raw)) return { has_golden_chapter_gate_failure: false, failed_checks: [] };

  const gates = raw as Record<string, unknown>;
  if (gates.activated === false) return { has_golden_chapter_gate_failure: false, failed_checks: [] };

  const failedChecks: GoldenChapterGateCheck[] = [];
  const seenIds = new Set<string>();
  const checksRaw = gates.checks;
  if (Array.isArray(checksRaw)) {
    for (const item of checksRaw) {
      if (!isPlainObject(item)) continue;
      const check = item as GoldenChapterGateCheck;
      if (!isGoldenChapterGateFailureStatus(check.status)) continue;
      const id = typeof check.id === "string" && check.id.trim().length > 0 ? check.id.trim() : null;
      if (id) {
        if (seenIds.has(id)) continue;
        seenIds.add(id);
        failedChecks.push({ ...check, id });
        continue;
      }
      failedChecks.push(check);
    }
  }

  const failedGateIdsRaw = gates.failed_gate_ids;
  if (Array.isArray(failedGateIdsRaw)) {
    for (const item of failedGateIdsRaw) {
      if (typeof item !== "string" || item.trim().length === 0) continue;
      const id = item.trim();
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      failedChecks.push({ id, status: "fail" });
    }
  }

  const hasFailure = gates.passed === false || failedChecks.length > 0;
  return { has_golden_chapter_gate_failure: hasFailure, failed_checks: failedChecks };
}

export function evaluateGateDecisionFromEval(args: {
  evalRaw: unknown;
  revision_count: number;
  max_revisions?: number | null;
  force_pass?: boolean;
}): EvaluateGateDecisionFromEvalResult {
  if (!isPlainObject(args.evalRaw)) return { ok: false, reason: "eval_invalid" };
  const evalObj = args.evalRaw as Record<string, unknown>;

  const overall =
    typeof evalObj.overall_final === "number"
      ? evalObj.overall_final
      : typeof evalObj.overall === "number"
        ? evalObj.overall
        : null;
  if (overall === null || !Number.isFinite(overall)) {
    return { ok: false, reason: "eval_missing_overall" };
  }

  const maxRevisions = typeof args.max_revisions === "number" && Number.isInteger(args.max_revisions) && args.max_revisions >= 0
    ? args.max_revisions
    : null;
  const violation = detectHighConfidenceViolation(evalObj);
  const goldenGateFailure = detectGoldenChapterGateFailure(evalObj);
  const decision = computeGateDecision({
    overall_final: overall,
    revision_count: args.revision_count,
    has_high_confidence_violation: violation.has_high_confidence_violation,
    has_golden_chapter_gate_failure: goldenGateFailure.has_golden_chapter_gate_failure,
    ...(maxRevisions === null ? {} : { max_revisions: maxRevisions }),
    ...(args.force_pass ? { force_pass: true } : {})
  });

  return {
    ok: true,
    gate: {
      overall_final: overall,
      decision,
      revision_count: args.revision_count,
      max_revisions: maxRevisions,
      has_high_confidence_violation: violation.has_high_confidence_violation,
      high_confidence_violations: violation.high_confidence_violations,
      has_golden_chapter_gate_failure: goldenGateFailure.has_golden_chapter_gate_failure,
      golden_chapter_gate_failures: goldenGateFailure.failed_checks,
      recommendation: typeof evalObj.recommendation === "string" ? evalObj.recommendation : null
    }
  };
}
