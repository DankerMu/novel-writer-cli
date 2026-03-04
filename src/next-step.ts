import { readdir } from "node:fs/promises";
import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { tryResolveVolumeChapterRange } from "./consistency-auditor.js";
import { NovelCliError } from "./errors.js";
import { pathExists, readJsonFile, readTextFile } from "./fs-utils.js";
import { computeGateDecision, detectHighConfidenceViolation } from "./gate-decision.js";
import { checkHookPolicy } from "./hook-policy.js";
import type { PlatformProfile } from "./platform-profile.js";
import { loadPlatformProfile } from "./platform-profile.js";
import { QUICKSTART_STAGING_RELS } from "./quickstart.js";
import { computeReviewNext } from "./volume-review.js";

type LoadedProfile = { relPath: string; profile: PlatformProfile };
import { computePrejudgeGuardrailsReport, loadPrejudgeGuardrailsReportIfFresh, prejudgeGuardrailsRelPath } from "./prejudge-guardrails.js";
import { summarizeNamingIssues } from "./naming-lint.js";
import { summarizeReadabilityIssues } from "./readability-lint.js";
import { computeTitlePolicyReport } from "./title-policy.js";
import { chapterRelPaths, formatStepId } from "./steps.js";
import { isPlainObject } from "./type-guards.js";
import { computeVolumeNextStep } from "./volume-planning.js";

export type NextStepResult = {
  step: string;
  reason: string;
  inflight: { chapter: number | null; pipeline_stage: string | null };
  evidence?: Record<string, unknown>;
};

function normalizeStage(stage: unknown): string | null {
  if (stage === null || stage === undefined) return null;
  if (typeof stage === "string") return stage;
  return null;
}

async function checkHookPolicyForStage(args: {
  projectRootDir: string;
  stagePrefix: "refined" | "judged";
  inflightChapter: number;
  pipelineStage: string;
  evidence: Record<string, unknown>;
  hookFixCount: number;
  evalRelPath: string;
  loadedProfile: LoadedProfile | null;
}): Promise<NextStepResult | null> {
  const hookPolicy = args.loadedProfile?.profile.hook_policy;
  if (!hookPolicy?.required) return null;

  let evalRaw: unknown;
  try {
    evalRaw = await readJsonFile(join(args.projectRootDir, args.evalRelPath));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "judge" }),
      reason: `${args.stagePrefix}:hook_eval_read_failed`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, hookFixCount: args.hookFixCount, error: message }
    };
  }

  const check = checkHookPolicy({ hookPolicy, evalRaw });

  if (check.status === "invalid_eval") {
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "judge" }),
      reason: `${args.stagePrefix}:hook_eval_invalid:${check.reason}`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, hookFixCount: args.hookFixCount, hook_check: check }
    };
  }

  if (check.status === "fail") {
    if (args.hookFixCount < 1) {
      return {
        step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "hook-fix" }),
        reason: `${args.stagePrefix}:hook_policy_fail:hook-fix:${check.reason}`,
        inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
        evidence: { ...args.evidence, hookFixCount: args.hookFixCount, hook_check: check }
      };
    }
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
      reason: `${args.stagePrefix}:hook_policy_fail:manual_review:${check.reason}`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, hookFixCount: args.hookFixCount, hook_check: check }
    };
  }

  return null;
}

async function checkTitlePolicyForStage(args: {
  projectRootDir: string;
  stagePrefix: "refined" | "judged";
  inflightChapter: number;
  pipelineStage: string;
  evidence: Record<string, unknown>;
  titleFixCount: number;
  hasChapter: boolean;
  chapterRelPath: string;
  loadedProfile: LoadedProfile | null;
}): Promise<NextStepResult | null> {
  if (!args.loadedProfile) return null;
  const titlePolicy = args.loadedProfile.profile.retention?.title_policy;
  if (!titlePolicy?.enabled) return null;

  if (!args.hasChapter) {
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "draft" }),
      reason: `${args.stagePrefix}:missing_chapter`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, titleFixCount: args.titleFixCount }
    };
  }

  let chapterText: string;
  try {
    chapterText = await readTextFile(join(args.projectRootDir, args.chapterRelPath));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
      reason: `${args.stagePrefix}:title_read_failed`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, titleFixCount: args.titleFixCount, error: message }
    };
  }

  const report = computeTitlePolicyReport({ chapter: args.inflightChapter, chapterText, platformProfile: args.loadedProfile.profile });
  if (report.status === "pass" || report.status === "skipped") return null;
  if (!report.has_hard_violations && !titlePolicy.auto_fix) return null;

  const primaryIssue = report.issues.find((i) => i.severity === "hard") ?? report.issues[0] ?? null;
  const issueSummary = primaryIssue?.summary ?? "title policy failing";
  if (titlePolicy.auto_fix) {
    if (args.titleFixCount < 1) {
      return {
        step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "title-fix" }),
        reason: `${args.stagePrefix}:title_policy_fail:title-fix`,
        inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
        evidence: { ...args.evidence, titleFixCount: args.titleFixCount, title_policy: { status: report.status, issue: issueSummary } }
      };
    }
    return {
      step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
      reason: `${args.stagePrefix}:title_policy_fail:manual_review`,
      inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
      evidence: { ...args.evidence, titleFixCount: args.titleFixCount, title_policy: { status: report.status, issue: issueSummary } }
    };
  }

  return {
    step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
    reason: `${args.stagePrefix}:title_policy_fail:manual_fix_required`,
    inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
    evidence: { ...args.evidence, titleFixCount: args.titleFixCount, title_policy: { status: report.status, issue: issueSummary } }
  };
}

async function checkPrejudgeGuardrailsForStage(args: {
  projectRootDir: string;
  stagePrefix: "refined" | "judged";
  inflightChapter: number;
  pipelineStage: string;
  evidence: Record<string, unknown>;
  chapterRelPath: string;
  loadedProfile: LoadedProfile | null;
}): Promise<NextStepResult | null> {
  if (!args.loadedProfile) return null;

  const chapterAbsPath = join(args.projectRootDir, args.chapterRelPath);
  const cacheRelPath = prejudgeGuardrailsRelPath(args.inflightChapter);
  let cacheStatus: "hit" | "miss" = "miss";
  let report = await loadPrejudgeGuardrailsReportIfFresh({
    rootDir: args.projectRootDir,
    chapter: args.inflightChapter,
    chapterAbsPath,
    platformProfileRelPath: args.loadedProfile.relPath,
    platformProfile: args.loadedProfile.profile
  });
  if (report) cacheStatus = "hit";

  if (!report) {
    try {
      report = await computePrejudgeGuardrailsReport({
        rootDir: args.projectRootDir,
        chapter: args.inflightChapter,
        chapterAbsPath,
        platformProfileRelPath: args.loadedProfile.relPath,
        platformProfile: args.loadedProfile.profile
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
        reason: `${args.stagePrefix}:prejudge_guardrails_error`,
        inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
        evidence: { ...args.evidence, prejudge_guardrails: { cache: { status: cacheStatus, rel_path: cacheRelPath }, error: message } }
      };
    }
  }

  if (!report.has_blocking_issues) return null;

  const readabilityBlocking = report.readability_lint.has_blocking_issues;
  const namingBlocking = report.naming_lint.has_blocking_issues;

  const readabilitySummary = readabilityBlocking ? summarizeReadabilityIssues(report.readability_lint.issues, 3) : null;
  const namingSummary = namingBlocking ? summarizeNamingIssues(report.naming_lint.issues, 3) : null;

  const reasons: string[] = [];
  if (readabilityBlocking) reasons.push("readability_lint");
  if (namingBlocking) reasons.push("naming_lint");
  const label = reasons.length > 0 ? reasons.join("+") : report.blocking_reasons.join("+");

  return {
    step: formatStepId({ kind: "chapter", chapter: args.inflightChapter, stage: "review" }),
    reason: `${args.stagePrefix}:prejudge_guardrails_blocking:${label}`,
    inflight: { chapter: args.inflightChapter, pipeline_stage: args.pipelineStage },
    evidence: {
      ...args.evidence,
      prejudge_guardrails: {
        cache: { status: cacheStatus, rel_path: cacheRelPath },
        status: report.status,
        has_blocking_issues: report.has_blocking_issues,
        blocking_reasons: report.blocking_reasons,
        platform_profile: report.platform_profile,
        readability: {
          status: report.readability_lint.status,
          issues_total: report.readability_lint.issues.length,
          has_blocking_issues: report.readability_lint.has_blocking_issues,
          ...(readabilitySummary ? { blocking_summary: readabilitySummary } : {})
        },
        naming: {
          status: report.naming_lint.status,
          issues_total: report.naming_lint.issues.length,
          has_blocking_issues: report.naming_lint.has_blocking_issues,
          ...(namingSummary ? { blocking_summary: namingSummary } : {})
        }
      }
    }
  };
}

async function computeChapterNextStep(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  const inflightChapter = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
  const stage = normalizeStage(checkpoint.pipeline_stage);
  const hookFixCount = typeof checkpoint.hook_fix_count === "number" ? checkpoint.hook_fix_count : 0;
  const titleFixCount = typeof checkpoint.title_fix_count === "number" ? checkpoint.title_fix_count : 0;

  if (inflightChapter !== null && inflightChapter < 1) {
    throw new NovelCliError(".checkpoint.json.inflight_chapter must be an int >= 1 (or null).", 2);
  }

  if (stage === null || stage === "committed") {
    if (inflightChapter !== null) {
      throw new NovelCliError(
        `Checkpoint inconsistent: pipeline_stage=${stage ?? "null"} but inflight_chapter=${inflightChapter}. Set inflight_chapter to null.`,
        2
      );
    }

    // Volume-end: enter deterministic volume review pipeline (issue #144).
    if (checkpoint.last_completed_chapter > 0) {
      let range: { start: number; end: number } | null = null;
      try {
        range = await tryResolveVolumeChapterRange({ rootDir: projectRootDir, volume: checkpoint.current_volume });
      } catch {
        // Best-effort: if we can't resolve range, fall back to chapter pipeline.
        range = null;
      }

      if (range && checkpoint.last_completed_chapter === range.end) {
        const next = await computeReviewNext(projectRootDir, checkpoint);
        return { ...next, reason: `volume_end:${next.reason}` };
      }
    }

    const nextChapter = checkpoint.last_completed_chapter + 1;
    return {
      step: formatStepId({ kind: "chapter", chapter: nextChapter, stage: "draft" }),
      reason: "fresh",
      inflight: { chapter: null, pipeline_stage: stage }
    };
  }

  if (inflightChapter === null) {
    throw new NovelCliError(
      `Checkpoint inconsistent: pipeline_stage=${stage} requires inflight_chapter. Repair .checkpoint.json and rerun.`,
      2
    );
  }

  const rel = chapterRelPaths(inflightChapter);
  const hasChapter = await pathExists(join(projectRootDir, rel.staging.chapterMd));
  const hasSummary = await pathExists(join(projectRootDir, rel.staging.summaryMd));
  const hasDelta = await pathExists(join(projectRootDir, rel.staging.deltaJson));
  const hasCrossref = await pathExists(join(projectRootDir, rel.staging.crossrefJson));
  const hasEval = await pathExists(join(projectRootDir, rel.staging.evalJson));

  const evidence = { hasChapter, hasSummary, hasDelta, hasCrossref, hasEval };

  // Resume rules (aligned with skills/continue).
  // Revision loop: restart from ChapterWriter regardless of existing staging artifacts.
  if (stage === "revising") {
    return {
      step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
      reason: "revising:restart_draft",
      inflight: { chapter: inflightChapter, pipeline_stage: stage },
      evidence
    };
  }

  if (stage === "drafting") {
    if (!hasChapter) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
        reason: `${stage}:missing_chapter`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }
    if (!hasSummary || !hasDelta || !hasCrossref) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "summarize" }),
        reason: `${stage}:missing_summary`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }
    return {
      step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "refine" }),
      reason: `${stage}:ready_refine`,
      inflight: { chapter: inflightChapter, pipeline_stage: stage },
      evidence
    };
  }

  if (stage === "drafted") {
    if (!hasChapter) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
        reason: "drafted:missing_chapter",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }
    if (!hasSummary || !hasDelta || !hasCrossref) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "summarize" }),
        reason: "drafted:missing_summary",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }
    return {
      step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "refine" }),
      reason: "drafted:resume_refine",
      inflight: { chapter: inflightChapter, pipeline_stage: stage },
      evidence
    };
  }

  if (stage === "refined") {
    if (!hasChapter) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
        reason: "refined:missing_chapter",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }

    const loadedProfile = await loadPlatformProfile(projectRootDir);

    if (!hasEval) {
      const titleGate = await checkTitlePolicyForStage({
        projectRootDir,
        stagePrefix: "refined",
        inflightChapter,
        pipelineStage: stage,
        evidence,
        titleFixCount,
        hasChapter,
        chapterRelPath: rel.staging.chapterMd,
        loadedProfile
      });
      if (titleGate) return titleGate;

      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "judge" }),
        reason: "refined:missing_eval",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }

    const titleGate = await checkTitlePolicyForStage({
      projectRootDir,
      stagePrefix: "refined",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      titleFixCount,
      hasChapter,
      chapterRelPath: rel.staging.chapterMd,
      loadedProfile
    });
    if (titleGate) return titleGate;

    const hookGate = await checkHookPolicyForStage({
      projectRootDir,
      stagePrefix: "refined",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      hookFixCount,
      evalRelPath: rel.staging.evalJson,
      loadedProfile
    });
    if (hookGate) return hookGate;

    const guardrailsGate = await checkPrejudgeGuardrailsForStage({
      projectRootDir,
      stagePrefix: "refined",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      chapterRelPath: rel.staging.chapterMd,
      loadedProfile
    });
    if (guardrailsGate) return guardrailsGate;

    return {
      step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "commit" }),
      reason: "refined:ready_commit",
      inflight: { chapter: inflightChapter, pipeline_stage: stage },
      evidence
    };
  }

  if (stage === "judged") {
    if (!hasChapter) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
        reason: "judged:missing_chapter",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }

    if (!hasEval) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "judge" }),
        reason: "judged:missing_eval",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence
      };
    }

    const loadedProfile = await loadPlatformProfile(projectRootDir);

    const titleGate = await checkTitlePolicyForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      titleFixCount,
      hasChapter,
      chapterRelPath: rel.staging.chapterMd,
      loadedProfile
    });
    if (titleGate) return titleGate;

    const hookGate = await checkHookPolicyForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      hookFixCount,
      evalRelPath: rel.staging.evalJson,
      loadedProfile
    });
    if (hookGate) return hookGate;

    const guardrailsGate = await checkPrejudgeGuardrailsForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      chapterRelPath: rel.staging.chapterMd,
      loadedProfile
    });
    if (guardrailsGate) return guardrailsGate;

    // Gate decision: deterministic mapping from QualityJudge outputs → next action.
    let evalRaw: unknown;
    try {
      evalRaw = await readJsonFile(join(projectRootDir, rel.staging.evalJson));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "judge" }),
        reason: `judged:eval_read_failed`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: { ...evidence, error: message }
      };
    }

    if (!isPlainObject(evalRaw)) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "judge" }),
        reason: `judged:eval_invalid`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: { ...evidence }
      };
    }

    const evalObj = evalRaw as Record<string, unknown>;
    const overall = typeof evalObj.overall_final === "number" ? evalObj.overall_final : typeof evalObj.overall === "number" ? evalObj.overall : null;
    if (overall === null || !Number.isFinite(overall)) {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "judge" }),
        reason: `judged:eval_missing_overall`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: { ...evidence }
      };
    }

    const revisionCount = typeof checkpoint.revision_count === "number" && Number.isInteger(checkpoint.revision_count) && checkpoint.revision_count >= 0
      ? checkpoint.revision_count
      : 0;
    const violation = detectHighConfidenceViolation(evalRaw);

    const maxRevisions =
      typeof loadedProfile?.profile.scoring?.max_revisions === "number" &&
      Number.isInteger(loadedProfile.profile.scoring.max_revisions) &&
      loadedProfile.profile.scoring.max_revisions >= 0
        ? loadedProfile.profile.scoring.max_revisions
        : null;

    const gateDecision = computeGateDecision({
      overall_final: overall,
      revision_count: revisionCount,
      has_high_confidence_violation: violation.has_high_confidence_violation,
      ...(maxRevisions === null ? {} : { max_revisions: maxRevisions })
    });

    const gateEvidence = {
      ...evidence,
      gate: {
        decision: gateDecision,
        overall_final: overall,
        revision_count: revisionCount,
        max_revisions: maxRevisions,
        has_high_confidence_violation: violation.has_high_confidence_violation,
        high_confidence_violations: violation.high_confidence_violations.slice(0, 10)
      },
      quality_judge: {
        recommendation: typeof evalObj.recommendation === "string" ? evalObj.recommendation : null
      }
    };

    if (gateDecision === "pass") {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "commit" }),
        reason: "judged:gate:pass",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: gateEvidence
      };
    }

    if (gateDecision === "force_passed") {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "commit" }),
        reason: "judged:gate:force_passed",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: gateEvidence
      };
    }

    if (gateDecision === "polish") {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "refine" }),
        reason: "judged:gate:polish",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: gateEvidence
      };
    }

    if (gateDecision === "revise") {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
        reason: "judged:gate:revise",
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: gateEvidence
      };
    }

    if (gateDecision === "pause_for_user" || gateDecision === "pause_for_user_force_rewrite") {
      return {
        step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "review" }),
        reason: `judged:gate:${gateDecision}`,
        inflight: { chapter: inflightChapter, pipeline_stage: stage },
        evidence: gateEvidence
      };
    }

    const _exhaustive: never = gateDecision;
    throw new NovelCliError(`Unsupported gate decision: ${String(_exhaustive)}`, 2);
  }

  // Unknown stage: upstream parseCheckpoint validates enum so this should be unreachable.
  throw new NovelCliError(
    `Checkpoint has unexpected pipeline_stage=${stage}. This should not happen; repair .checkpoint.json and rerun.`,
    2
  );
}

function notImplementedState(state: string): never {
  throw new NovelCliError(`Not implemented: orchestrator_state=${state}`, 2);
}

async function countContractArtifacts(rootDir: string): Promise<{
  hasDir: boolean;
  fileCount: number;
  sample: string[];
  degraded: boolean;
  error?: string;
}> {
  const absDir = join(rootDir, QUICKSTART_STAGING_RELS.contractsDir);
  const hasDir = await pathExists(absDir);
  if (!hasDir) return { hasDir, fileCount: 0, sample: [], degraded: false };

  try {
    const entries = await readdir(absDir, { withFileTypes: true });
    const files = entries.filter((e) => e.isFile()).map((e) => e.name);
    const sample = files
      .filter((n) => n.endsWith(".json"))
      .sort()
      .slice(0, 3);
    const fileCount = files.filter((n) => n.endsWith(".json")).length;
    return { hasDir, fileCount, sample, degraded: false };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // If the dir exists but is unreadable, treat as present but degraded.
    return { hasDir, fileCount: 0, sample: [], degraded: true, error: message };
  }
}

async function computeQuickStartNextStep(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  const stage = normalizeStage(checkpoint.pipeline_stage);
  const inflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;

  if ((stage === null || stage === "committed") && inflight !== null) {
    throw new NovelCliError(
      `Checkpoint inconsistent for QUICK_START: pipeline_stage=${stage ?? "null"} but inflight_chapter=${inflight}. Set inflight_chapter to null.`,
      2
    );
  }
  if (stage !== null && stage !== "committed") {
    throw new NovelCliError(
      `Checkpoint inconsistent for QUICK_START: pipeline_stage=${stage} (expected null or committed). Finish the chapter pipeline or repair .checkpoint.json.`,
      2
    );
  }

  const rulesAbs = join(projectRootDir, QUICKSTART_STAGING_RELS.rulesJson);
  const styleAbs = join(projectRootDir, QUICKSTART_STAGING_RELS.styleProfileJson);
  const trialAbs = join(projectRootDir, QUICKSTART_STAGING_RELS.trialChapterMd);
  const evalAbs = join(projectRootDir, QUICKSTART_STAGING_RELS.evaluationJson);

  const rulesExists = await pathExists(rulesAbs);
  const contracts = await countContractArtifacts(projectRootDir);
  const styleExists = await pathExists(styleAbs);
  const trialExists = await pathExists(trialAbs);
  const evalExists = await pathExists(evalAbs);

  let rulesOk = false;
  let rulesError: string | null = null;
  if (rulesExists) {
    try {
      const raw = await readJsonFile(rulesAbs);
      if (!isPlainObject(raw)) throw new Error("expected JSON object");
      const obj = raw as Record<string, unknown>;
      const rules = obj.rules;
      if (!Array.isArray(rules)) throw new Error("missing 'rules' array");
      for (const [idx, rule] of rules.entries()) {
        if (!isPlainObject(rule)) throw new Error(`rules[${idx}] must be an object`);
        const r = rule as Record<string, unknown>;
        if (typeof r.id !== "string" || r.id.trim().length === 0) throw new Error(`rules[${idx}].id must be a non-empty string`);
        if (typeof r.category !== "string" || r.category.trim().length === 0) {
          throw new Error(`rules[${idx}].category must be a non-empty string`);
        }
        if (typeof r.rule !== "string" || r.rule.trim().length === 0) throw new Error(`rules[${idx}].rule must be a non-empty string`);
        const ct = r.constraint_type;
        if (ct !== "hard" && ct !== "soft") throw new Error(`rules[${idx}].constraint_type must be hard|soft`);
        if (!Array.isArray(r.exceptions)) throw new Error(`rules[${idx}].exceptions must be an array`);
      }
      rulesOk = true;
    } catch (err: unknown) {
      rulesError = err instanceof Error ? err.message : String(err);
      rulesOk = false;
    }
  }

  let styleOk = false;
  let styleError: string | null = null;
  if (styleExists) {
    try {
      const raw = await readJsonFile(styleAbs);
      if (!isPlainObject(raw)) throw new Error("expected JSON object");
      const obj = raw as Record<string, unknown>;
      const sourceType = obj.source_type;
      if (typeof sourceType !== "string" || sourceType.trim().length === 0) throw new Error("missing 'source_type'");
      if (sourceType !== "original" && sourceType !== "reference" && sourceType !== "template" && sourceType !== "write_then_extract") {
        throw new Error(`invalid source_type=${sourceType}`);
      }
      styleOk = true;
    } catch (err: unknown) {
      styleError = err instanceof Error ? err.message : String(err);
      styleOk = false;
    }
  }

  let trialOk = false;
  let trialError: string | null = null;
  if (trialExists) {
    try {
      const text = await readTextFile(trialAbs);
      if (text.trim().length === 0) throw new Error("empty trial chapter");
      trialOk = true;
    } catch (err: unknown) {
      trialError = err instanceof Error ? err.message : String(err);
      trialOk = false;
    }
  }

  let evalOk = false;
  let evalError: string | null = null;
  if (evalExists) {
    try {
      const raw = await readJsonFile(evalAbs);
      if (!isPlainObject(raw)) throw new Error("expected JSON object");
      evalOk = true;
    } catch (err: unknown) {
      evalError = err instanceof Error ? err.message : String(err);
      evalOk = false;
    }
  }

  const evidence = {
    staging: {
      rulesExists,
      rulesOk,
      ...(rulesError ? { rulesError } : {}),
      contracts: {
        hasDir: contracts.hasDir,
        jsonFileCount: contracts.fileCount,
        sample: contracts.sample,
        degraded: contracts.degraded,
        ...(contracts.error ? { error: contracts.error } : {})
      },
      styleExists,
      styleOk,
      ...(styleError ? { styleError } : {}),
      trialExists,
      trialOk,
      ...(trialError ? { trialError } : {}),
      evalExists,
      evalOk,
      ...(evalError ? { evalError } : {})
    }
  };

  if (!rulesOk) {
    return {
      step: formatStepId({ kind: "quickstart", phase: "world" }),
      reason: "quickstart:world",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }

  if (!contracts.hasDir || contracts.fileCount === 0) {
    return {
      step: formatStepId({ kind: "quickstart", phase: "characters" }),
      reason: "quickstart:characters",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }

  if (!styleOk) {
    return {
      step: formatStepId({ kind: "quickstart", phase: "style" }),
      reason: "quickstart:style",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }

  if (!trialOk) {
    return {
      step: formatStepId({ kind: "quickstart", phase: "trial" }),
      reason: "quickstart:trial",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }

  if (!evalOk) {
    return {
      step: formatStepId({ kind: "quickstart", phase: "results" }),
      reason: "quickstart:results",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }

  return {
    step: formatStepId({ kind: "quickstart", phase: "results" }),
    reason: "quickstart:results:artifacts_present",
    inflight: { chapter: null, pipeline_stage: null },
    evidence
  };
}

export async function computeNextStep(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  switch (checkpoint.orchestrator_state) {
    case "WRITING":
    case "CHAPTER_REWRITE":
      return await computeChapterNextStep(projectRootDir, checkpoint);
    case "ERROR_RETRY": {
      const stage = normalizeStage(checkpoint.pipeline_stage);
      const inflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;

      let normalizedCheckpoint = checkpoint;
      let healPrefix = "";

      // Only auto-heal invariants when explicitly in ERROR_RETRY.
      if ((stage === null || stage === "committed") && inflight !== null) {
        normalizedCheckpoint = { ...checkpoint, inflight_chapter: null };
        healPrefix = "healed_drop_inflight:";
      } else if (stage !== null && stage !== "committed" && inflight === null) {
        normalizedCheckpoint = { ...checkpoint, inflight_chapter: checkpoint.last_completed_chapter + 1 };
        healPrefix = "healed_infer_inflight:";
      }

      const next = await computeChapterNextStep(projectRootDir, normalizedCheckpoint);
      return { ...next, reason: `error_retry:${healPrefix}${next.reason}` };
    }
    case "INIT": {
      const next = await computeQuickStartNextStep(projectRootDir, checkpoint);
      return { ...next, reason: `init:${next.reason}` };
    }
    case "QUICK_START":
      return await computeQuickStartNextStep(projectRootDir, checkpoint);
    case "VOL_PLANNING":
      return await computeVolumeNextStep(projectRootDir, checkpoint);
    case "VOL_REVIEW":
      return await computeReviewNext(projectRootDir, checkpoint);
    default:
      return notImplementedState(checkpoint.orchestrator_state);
  }
}
