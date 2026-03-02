import { join } from "node:path";

import { fingerprintTextFile, hashText, type FileFingerprint } from "./fingerprint.js";
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
  platform_profile: { rel_path: string; fingerprint: string };
  chapter_fingerprint: FileFingerprint;
  title_policy: TitlePolicyReport;
  readability_lint: ReadabilityReport;
  naming_lint: NamingReport;
  status: PrejudgeGuardrailsStatus;
  has_blocking_issues: boolean;
  blocking_reasons: string[];
};

const PREJUDGE_GUARDRAILS_STATUSES = ["pass", "warn", "violation", "skipped"] as const;

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

function fingerprintPlatformProfile(profile: PlatformProfile): string {
  // Note: PlatformProfile is fully derived from platform-profile.json via parsePlatformProfile.
  // JSON.stringify output is deterministic here because we control key insertion order in the parser.
  return hashText(JSON.stringify(profile));
}

export async function computePrejudgeGuardrailsReport(args: {
  rootDir: string;
  chapter: number;
  chapterAbsPath: string;
  platformProfileRelPath: string;
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
    platform_profile: { rel_path: args.platformProfileRelPath, fingerprint: fingerprintPlatformProfile(args.platformProfile) },
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
  platformProfileRelPath: string;
  platformProfile: PlatformProfile;
}): Promise<PrejudgeGuardrailsReport | null> {
  const rel = prejudgeGuardrailsRelPath(args.chapter);
  const abs = join(args.rootDir, rel);
  if (!(await pathExists(abs))) return null;

  let raw: unknown;
  try {
    raw = await readJsonFile(abs);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;

  const scopeRaw = obj.scope;
  if (!isPlainObject(scopeRaw)) return null;
  const scopeObj = scopeRaw as Record<string, unknown>;
  if (typeof scopeObj.chapter !== "number" || !Number.isInteger(scopeObj.chapter) || scopeObj.chapter !== args.chapter) return null;

  const statusRaw = obj.status;
  if (typeof statusRaw !== "string") return null;
  if (!(PREJUDGE_GUARDRAILS_STATUSES as readonly string[]).includes(statusRaw)) return null;

  const profileRaw = obj.platform_profile;
  if (!isPlainObject(profileRaw)) return null;
  const profileObj = profileRaw as Record<string, unknown>;
  if (typeof profileObj.rel_path !== "string" || profileObj.rel_path.trim().length === 0) return null;
  if (typeof profileObj.fingerprint !== "string" || profileObj.fingerprint.trim().length === 0) return null;
  if (profileObj.rel_path !== args.platformProfileRelPath) return null;
  if (profileObj.fingerprint !== fingerprintPlatformProfile(args.platformProfile)) return null;

  const fpRaw = obj.chapter_fingerprint;
  if (!isPlainObject(fpRaw)) return null;
  const fp = fpRaw as Record<string, unknown>;
  if (typeof fp.size !== "number" || typeof fp.mtime_ms !== "number" || typeof fp.content_hash !== "string") return null;

  if (typeof obj.has_blocking_issues !== "boolean") return null;
  if (!Array.isArray(obj.blocking_reasons) || !obj.blocking_reasons.every((v) => typeof v === "string")) return null;

  const titleRaw = obj.title_policy;
  if (!isPlainObject(titleRaw)) return null;
  const titleObj = titleRaw as Record<string, unknown>;
  if (titleObj.schema_version !== 1) return null;
  if (typeof titleObj.status !== "string") return null;
  if (!Array.isArray(titleObj.issues)) return null;
  if (typeof titleObj.has_hard_violations !== "boolean") return null;

  const readability = obj.readability_lint;
  if (!isPlainObject(readability)) return null;
  const readabilityObj = readability as Record<string, unknown>;
  if (typeof readabilityObj.has_blocking_issues !== "boolean") return null;
  if (!Array.isArray(readabilityObj.issues)) return null;
  if (typeof readabilityObj.status !== "string") return null;

  const naming = obj.naming_lint;
  if (!isPlainObject(naming)) return null;
  const namingObj = naming as Record<string, unknown>;
  if (typeof namingObj.has_blocking_issues !== "boolean") return null;
  if (!Array.isArray(namingObj.issues)) return null;
  if (typeof namingObj.status !== "string") return null;

  let now: FileFingerprint;
  try {
    ({ fingerprint: now } = await fingerprintTextFile(args.chapterAbsPath));
  } catch {
    return null;
  }
  const fresh = now.size === fp.size && now.mtime_ms === fp.mtime_ms && now.content_hash === fp.content_hash;
  if (!fresh) return null;

  return raw as PrejudgeGuardrailsReport;
}
