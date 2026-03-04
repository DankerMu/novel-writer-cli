import { isPlainObject } from "./type-guards.js";

export const GATE_DECISIONS = ["pass", "polish", "revise", "pause_for_user", "pause_for_user_force_rewrite", "force_passed"] as const;
export type GateDecision = (typeof GATE_DECISIONS)[number];

export type GateDecisionInput = {
  overall_final: number;
  revision_count: number;
  has_high_confidence_violation: boolean;
  force_pass?: boolean;
};

type ContractCheck = Record<string, unknown> & {
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
    hardChecks.push(it);
  }

  return { has_high_confidence_violation: hardChecks.length > 0, high_confidence_violations: hardChecks };
}

export function computeGateDecision(args: GateDecisionInput): GateDecision {
  if (args.force_pass) return "force_passed";
  if (args.has_high_confidence_violation) return "revise";

  const score = args.overall_final;
  if (score >= 4.0) return "pass";
  if (score >= 3.5) return "polish";
  if (score >= 3.0) return args.revision_count >= 2 ? "force_passed" : "revise";
  if (score >= 2.0) return "pause_for_user";
  return "pause_for_user_force_rewrite";
}

