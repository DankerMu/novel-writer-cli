import { join } from "node:path";

import { fingerprintTextFile, type FileFingerprint } from "./fingerprint.js";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "./fs-utils.js";
import { computeNamingReport, type NamingReport } from "./naming-lint.js";
import type { PlatformProfile } from "./platform-profile.js";
import { computeReadabilityReport, type ReadabilityReport } from "./readability-lint.js";
import { pad3 } from "./steps.js";
import { computeTitlePolicyReport, type TitlePolicyReport } from "./title-policy.js";
import { isPlainObject } from "./type-guards.js";

export type PrejudgeGuardrailsStatus = "pass" | "warn" | "violation" | "skipped";

export type PrejudgeGuardrailsReport = {
  schema_version: 1;
  generated_at: string;
  scope: { chapter: number };
  chapter_fingerprint: FileFingerprint;
  title_policy: TitlePolicyReport;
  readability_lint: ReadabilityReport;
  naming_lint: NamingReport;
  status: PrejudgeGuardrailsStatus;
  has_blocking_issues: boolean;
  blocking_reasons: string[];
};

function isBlockingTitlePolicy(report: TitlePolicyReport): boolean {
  if (report.status === "pass" || report.status === "skipped") return false;
  if (report.has_hard_violations) return true;
  // When title_policy.auto_fix is enabled, warn-only issues are treated as blocking to trigger title-fix.
  return Boolean(report.policy?.auto_fix);
}

function isBlockingReadability(report: ReadabilityReport): boolean {
  return report.has_blocking_issues;
}

function isBlockingNaming(report: NamingReport): boolean {
  return report.has_blocking_issues;
}

export function prejudgeGuardrailsRelPath(chapter: number): string {
  return `staging/guardrails/prejudge-guardrails-chapter-${pad3(chapter)}.json`;
}

export async function computePrejudgeGuardrailsReport(args: {
  rootDir: string;
  chapter: number;
  chapterAbsPath: string;
  platformProfile: PlatformProfile;
}): Promise<PrejudgeGuardrailsReport> {
  const generated_at = new Date().toISOString();
  const { fingerprint: chapter_fingerprint, text: chapterText } = await fingerprintTextFile(args.chapterAbsPath);

  const title_policy = computeTitlePolicyReport({ chapter: args.chapter, chapterText, platformProfile: args.platformProfile });
  const readability_lint = await computeReadabilityReport({
    rootDir: args.rootDir,
    chapter: args.chapter,
    chapterAbsPath: args.chapterAbsPath,
    chapterText,
    platformProfile: args.platformProfile,
    preferDeterministicScript: true
  });
  const naming_lint = await computeNamingReport({
    rootDir: args.rootDir,
    chapter: args.chapter,
    chapterText,
    platformProfile: args.platformProfile
  });

  const blocking_reasons: string[] = [];
  if (isBlockingTitlePolicy(title_policy)) blocking_reasons.push("title_policy");
  if (isBlockingReadability(readability_lint)) blocking_reasons.push("readability_lint");
  if (isBlockingNaming(naming_lint)) blocking_reasons.push("naming_lint");

  const has_blocking_issues = blocking_reasons.length > 0;
  const hasAnyIssues = title_policy.issues.length + readability_lint.issues.length + naming_lint.issues.length > 0;

  const status: PrejudgeGuardrailsStatus = has_blocking_issues ? "violation" : hasAnyIssues ? "warn" : "pass";

  return {
    schema_version: 1,
    generated_at,
    scope: { chapter: args.chapter },
    chapter_fingerprint,
    title_policy,
    readability_lint,
    naming_lint,
    status,
    has_blocking_issues,
    blocking_reasons
  };
}

export async function writePrejudgeGuardrailsReport(args: {
  rootDir: string;
  chapter: number;
  report: PrejudgeGuardrailsReport;
}): Promise<{ relPath: string }> {
  const relPath = prejudgeGuardrailsRelPath(args.chapter);
  const absPath = join(args.rootDir, relPath);
  await ensureDir(join(args.rootDir, "staging/guardrails"));
  await writeJsonFile(absPath, args.report);
  return { relPath };
}

export async function loadPrejudgeGuardrailsReportIfFresh(args: {
  rootDir: string;
  chapter: number;
  chapterAbsPath: string;
}): Promise<PrejudgeGuardrailsReport | null> {
  const rel = prejudgeGuardrailsRelPath(args.chapter);
  const abs = join(args.rootDir, rel);
  if (!(await pathExists(abs))) return null;

  const raw = await readJsonFile(abs);
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;

  const fpRaw = obj.chapter_fingerprint;
  if (!isPlainObject(fpRaw)) return null;
  const fp = fpRaw as Record<string, unknown>;
  if (typeof fp.size !== "number" || typeof fp.mtime_ms !== "number" || typeof fp.content_hash !== "string") return null;

  const { fingerprint: now } = await fingerprintTextFile(args.chapterAbsPath);
  const fresh = now.size === fp.size && now.mtime_ms === fp.mtime_ms && now.content_hash === fp.content_hash;
  if (!fresh) return null;

  return raw as PrejudgeGuardrailsReport;
}

