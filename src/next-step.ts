import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { pathExists, readJsonFile, readTextFile } from "./fs-utils.js";
import { checkHookPolicy } from "./hook-policy.js";
import { loadPlatformProfile } from "./platform-profile.js";
import { computePrejudgeGuardrailsReport, loadPrejudgeGuardrailsReportIfFresh, prejudgeGuardrailsRelPath } from "./prejudge-guardrails.js";
import { summarizeNamingIssues } from "./naming-lint.js";
import { summarizeReadabilityIssues } from "./readability-lint.js";
import { computeTitlePolicyReport } from "./title-policy.js";
import { chapterRelPaths, formatStepId } from "./steps.js";

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
}): Promise<NextStepResult | null> {
  const loadedProfile = await loadPlatformProfile(args.projectRootDir);
  const hookPolicy = loadedProfile?.profile.hook_policy;
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
}): Promise<NextStepResult | null> {
  const loadedProfile = await loadPlatformProfile(args.projectRootDir);
  if (!loadedProfile) return null;
  const titlePolicy = loadedProfile.profile.retention?.title_policy;
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

  const report = computeTitlePolicyReport({ chapter: args.inflightChapter, chapterText, platformProfile: loadedProfile.profile });
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
}): Promise<NextStepResult | null> {
  const loadedProfile = await loadPlatformProfile(args.projectRootDir);
  if (!loadedProfile) return null;

  const chapterAbsPath = join(args.projectRootDir, args.chapterRelPath);
  let report = await loadPrejudgeGuardrailsReportIfFresh({
    rootDir: args.projectRootDir,
    chapter: args.inflightChapter,
    chapterAbsPath,
    platformProfileRelPath: loadedProfile.relPath,
    platformProfile: loadedProfile.profile
  });

  if (!report) {
    try {
      report = await computePrejudgeGuardrailsReport({
        rootDir: args.projectRootDir,
        chapter: args.inflightChapter,
        chapterAbsPath,
        platformProfileRelPath: loadedProfile.relPath,
        platformProfile: loadedProfile.profile
      });
    } catch {
      return null;
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
        report_path: prejudgeGuardrailsRelPath(args.inflightChapter),
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

export async function computeNextStep(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  const inflightChapter = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
  const stage = normalizeStage(checkpoint.pipeline_stage);
  const hookFixCount = typeof checkpoint.hook_fix_count === "number" ? checkpoint.hook_fix_count : 0;
  const titleFixCount = typeof checkpoint.title_fix_count === "number" ? checkpoint.title_fix_count : 0;

  // Fresh start.
  if (inflightChapter === null || stage === null || stage === "committed") {
    const nextChapter = checkpoint.last_completed_chapter + 1;
    return {
      step: formatStepId({ kind: "chapter", chapter: nextChapter, stage: "draft" }),
      reason: "fresh",
      inflight: { chapter: null, pipeline_stage: stage }
    };
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

    if (!hasEval) {
      const titleGate = await checkTitlePolicyForStage({
        projectRootDir,
        stagePrefix: "refined",
        inflightChapter,
        pipelineStage: stage,
        evidence,
        titleFixCount,
        hasChapter,
        chapterRelPath: rel.staging.chapterMd
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
      chapterRelPath: rel.staging.chapterMd
    });
    if (titleGate) return titleGate;

    const hookGate = await checkHookPolicyForStage({
      projectRootDir,
      stagePrefix: "refined",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      hookFixCount,
      evalRelPath: rel.staging.evalJson
    });
    if (hookGate) return hookGate;

    const guardrailsGate = await checkPrejudgeGuardrailsForStage({
      projectRootDir,
      stagePrefix: "refined",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      chapterRelPath: rel.staging.chapterMd
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

    const titleGate = await checkTitlePolicyForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      titleFixCount,
      hasChapter,
      chapterRelPath: rel.staging.chapterMd
    });
    if (titleGate) return titleGate;

    const hookGate = await checkHookPolicyForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      hookFixCount,
      evalRelPath: rel.staging.evalJson
    });
    if (hookGate) return hookGate;

    const guardrailsGate = await checkPrejudgeGuardrailsForStage({
      projectRootDir,
      stagePrefix: "judged",
      inflightChapter,
      pipelineStage: stage,
      evidence,
      chapterRelPath: rel.staging.chapterMd
    });
    if (guardrailsGate) return guardrailsGate;

    return {
      step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "commit" }),
      reason: "judged:ready_commit",
      inflight: { chapter: inflightChapter, pipeline_stage: stage },
      evidence
    };
  }

  // Unknown stage: fall back to safest.
  return {
    step: formatStepId({ kind: "chapter", chapter: inflightChapter, stage: "draft" }),
    reason: `unknown_stage:${stage}`,
    inflight: { chapter: inflightChapter, pipeline_stage: stage },
    evidence
  };
}
