import { lstat, readdir, realpath, rename, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { fingerprintTextFile, hashText, type FileFingerprint } from "./fingerprint.js";
import { ensureDir, pathExists, readJsonFile } from "./fs-utils.js";
import { computeNamingReport, type NamingReport } from "./naming-lint.js";
import type { PlatformProfile } from "./platform-profile.js";
import { computeReadabilityReport, type ReadabilityReport } from "./readability-lint.js";
import { assertInsideProjectRoot, resolveProjectRelativePath } from "./safe-path.js";
import { pad3 } from "./steps.js";
import { computeTitlePolicyReport, type TitlePolicyReport } from "./title-policy.js";
import { isPlainObject } from "./type-guards.js";

export type PrejudgeGuardrailsStatus = "pass" | "warn" | "violation" | "skipped";

export type PrejudgeGuardrailsReport = {
  schema_version: 2;
  generated_at: string;
  scope: { chapter: number };
  platform_profile: { rel_path: string; fingerprint: string };
  dependencies: {
    characters_active: { rel_path: string; fingerprint: string };
    readability_script: { rel_path: string; fingerprint: string };
  };
  chapter_fingerprint: FileFingerprint;
  title_policy: TitlePolicyReport;
  readability_lint: ReadabilityReport;
  naming_lint: NamingReport;
  status: PrejudgeGuardrailsStatus;
  has_blocking_issues: boolean;
  blocking_reasons: string[];
};

const PREJUDGE_GUARDRAILS_STATUSES = ["pass", "warn", "violation", "skipped"] as const;
const SEVERITY_POLICIES = ["warn", "soft", "hard"] as const;
const MAX_PREJUDGE_GUARDRAILS_CACHE_BYTES = 2 * 1024 * 1024;
const MAX_READABILITY_SCRIPT_FINGERPRINT_BYTES = 1024 * 1024;

type DependencyFingerprint = { rel_path: string; fingerprint: string };

function resolveReadabilityScriptRelPath(profile: PlatformProfile): string {
  const fromProfile = profile.compliance.script_paths?.lint_readability;
  if (typeof fromProfile === "string" && fromProfile.trim().length > 0) return fromProfile.trim();
  return "scripts/lint-readability.sh";
}

async function fingerprintReadabilityScript(args: { rootDir: string; scriptRelPath: string }): Promise<DependencyFingerprint> {
  const rel_path = args.scriptRelPath.trim();
  if (rel_path.length === 0) {
    return { rel_path: args.scriptRelPath, fingerprint: hashText(JSON.stringify({ status: "invalid_path" })) };
  }

  const label = "platform-profile.json.compliance.script_paths.lint_readability";
  let scriptAbs: string;
  try {
    scriptAbs = resolveProjectRelativePath(args.rootDir, rel_path, label);
  } catch {
    return { rel_path, fingerprint: hashText(JSON.stringify({ status: "invalid_path" })) };
  }

  if (!(await pathExists(scriptAbs))) return { rel_path, fingerprint: hashText(JSON.stringify({ status: "missing" })) };

  try {
    const rootReal = await realpath(args.rootDir);
    const execAbs = await realpath(scriptAbs);
    assertInsideProjectRoot(rootReal, execAbs);
    const st = await stat(execAbs);
    if (!st.isFile()) return { rel_path, fingerprint: hashText(JSON.stringify({ status: "not_file" })) };
    if (st.size > MAX_READABILITY_SCRIPT_FINGERPRINT_BYTES) {
      return { rel_path, fingerprint: hashText(JSON.stringify({ status: "too_large", size: st.size })) };
    }
    const { fingerprint } = await fingerprintTextFile(execAbs);
    return { rel_path, fingerprint: hashText(JSON.stringify({ status: "ok", fingerprint })) };
  } catch {
    return { rel_path, fingerprint: hashText(JSON.stringify({ status: "unreadable" })) };
  }
}

async function fingerprintCharactersActive(rootDir: string): Promise<DependencyFingerprint> {
  const rel_path = "characters/active";
  const abs = join(rootDir, rel_path);
  if (!(await pathExists(abs))) return { rel_path, fingerprint: hashText(JSON.stringify({ status: "missing" })) };

  let rootReal: string;
  let dirReal: string;
  let resolvedFromSymlink = false;
  try {
    rootReal = await realpath(rootDir);
    dirReal = await realpath(abs);
    assertInsideProjectRoot(rootReal, dirReal);
    const st = await lstat(abs);
    resolvedFromSymlink = st.isSymbolicLink();
    const resolved = await stat(dirReal);
    if (!resolved.isDirectory()) return { rel_path, fingerprint: hashText(JSON.stringify({ status: "not_dir" })) };
  } catch {
    return { rel_path, fingerprint: hashText(JSON.stringify({ status: "unreadable" })) };
  }

  let dirents;
  try {
    dirents = await readdir(dirReal, { withFileTypes: true });
  } catch {
    return { rel_path, fingerprint: hashText(JSON.stringify({ status: "unreadable" })) };
  }

  const files = dirents
    .map((d) => d.name)
    .filter((name) => name.endsWith(".json"))
    .sort((a, b) => a.localeCompare(b, "en"));

  const entries: Array<{
    name: string;
    kind: "file" | "symlink" | "other" | "error";
    size?: number;
    mtime_ms?: number;
  }> = [];
  for (const name of files) {
    try {
      const st = await lstat(join(dirReal, name));
      const base = { name, size: st.size, mtime_ms: st.mtimeMs };
      if (st.isSymbolicLink()) entries.push({ ...base, kind: "symlink" });
      else if (st.isFile()) entries.push({ ...base, kind: "file" });
      else entries.push({ ...base, kind: "other" });
    } catch {
      entries.push({ name, kind: "error" });
    }
  }

  const status = entries.some((e) => e.kind !== "file") ? "unreadable" : "ok";
  return { rel_path, fingerprint: hashText(JSON.stringify({ status, resolvedFromSymlink, entries })) };
}

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
  const rootReal = await realpath(args.rootDir);
  const chapterReal = await realpath(args.chapterAbsPath);
  assertInsideProjectRoot(rootReal, chapterReal);
  const { fingerprint: chapter_fingerprint, text: chapterText } = await fingerprintTextFile(chapterReal);

  const [characters_active, readability_script] = await Promise.all([
    fingerprintCharactersActive(args.rootDir),
    fingerprintReadabilityScript({ rootDir: args.rootDir, scriptRelPath: resolveReadabilityScriptRelPath(args.platformProfile) })
  ]);

  const title_policy = computeTitlePolicyReport({ chapter: args.chapter, chapterText, platformProfile: args.platformProfile });
  const readability_lint = await computeReadabilityReport({
    rootDir: args.rootDir,
    chapter: args.chapter,
    chapterAbsPath: chapterReal,
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
    schema_version: 2,
    generated_at,
    scope: { chapter: args.chapter },
    platform_profile: { rel_path: args.platformProfileRelPath, fingerprint: fingerprintPlatformProfile(args.platformProfile) },
    dependencies: { characters_active, readability_script },
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
  const rootReal = await realpath(args.rootDir);
  const stagingAbs = join(args.rootDir, "staging");
  const guardrailsAbs = join(args.rootDir, "staging/guardrails");
  if (await pathExists(stagingAbs)) assertInsideProjectRoot(rootReal, await realpath(stagingAbs));
  if (await pathExists(guardrailsAbs)) assertInsideProjectRoot(rootReal, await realpath(guardrailsAbs));
  await ensureDir(guardrailsAbs);
  assertInsideProjectRoot(rootReal, await realpath(guardrailsAbs));

  // Atomic write (rename) prevents following a symlink at the destination path.
  const tmpPath = `${absPath}.tmp.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}`;
  await writeFile(tmpPath, `${JSON.stringify(args.report, null, 2)}\n`, { encoding: "utf8", flag: "wx" });
  try {
    await rename(tmpPath, absPath);
  } catch (err) {
    await rm(tmpPath, { force: true });
    throw err;
  }
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

  let cacheAbs = abs;
  try {
    const rootReal = await realpath(args.rootDir);
    cacheAbs = await realpath(abs);
    assertInsideProjectRoot(rootReal, cacheAbs);
    const st = await stat(cacheAbs);
    if (!st.isFile()) return null;
    if (st.size > MAX_PREJUDGE_GUARDRAILS_CACHE_BYTES) return null;
  } catch {
    return null;
  }

  let raw: unknown;
  try {
    raw = await readJsonFile(cacheAbs);
  } catch {
    return null;
  }
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 2) return null;

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

  const depsRaw = obj.dependencies;
  if (!isPlainObject(depsRaw)) return null;
  const depsObj = depsRaw as Record<string, unknown>;

  const charactersRaw = depsObj.characters_active;
  if (!isPlainObject(charactersRaw)) return null;
  const charactersObj = charactersRaw as Record<string, unknown>;
  if (typeof charactersObj.rel_path !== "string" || charactersObj.rel_path !== "characters/active") return null;
  if (typeof charactersObj.fingerprint !== "string" || charactersObj.fingerprint.trim().length === 0) return null;

  const scriptRaw = depsObj.readability_script;
  if (!isPlainObject(scriptRaw)) return null;
  const scriptObj = scriptRaw as Record<string, unknown>;
  if (typeof scriptObj.rel_path !== "string" || scriptObj.rel_path.trim().length === 0) return null;
  if (typeof scriptObj.fingerprint !== "string" || scriptObj.fingerprint.trim().length === 0) return null;

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
  if (readabilityObj.schema_version !== 1) return null;
  if (typeof readabilityObj.has_blocking_issues !== "boolean") return null;
  if (!Array.isArray(readabilityObj.issues)) return null;
  if (
    !readabilityObj.issues.every((it) => {
      if (!isPlainObject(it)) return false;
      const rec = it as Record<string, unknown>;
      if (typeof rec.id !== "string" || rec.id.trim().length === 0) return false;
      if (typeof rec.summary !== "string" || rec.summary.trim().length === 0) return false;
      if (typeof rec.severity !== "string" || !(SEVERITY_POLICIES as readonly string[]).includes(rec.severity)) return false;
      return true;
    })
  )
    return null;
  if (typeof readabilityObj.status !== "string") return null;

  const naming = obj.naming_lint;
  if (!isPlainObject(naming)) return null;
  const namingObj = naming as Record<string, unknown>;
  if (namingObj.schema_version !== 1) return null;
  if (typeof namingObj.has_blocking_issues !== "boolean") return null;
  if (!Array.isArray(namingObj.issues)) return null;
  if (
    !namingObj.issues.every((it) => {
      if (!isPlainObject(it)) return false;
      const rec = it as Record<string, unknown>;
      if (typeof rec.id !== "string" || rec.id.trim().length === 0) return false;
      if (typeof rec.summary !== "string" || rec.summary.trim().length === 0) return false;
      if (typeof rec.severity !== "string" || !(SEVERITY_POLICIES as readonly string[]).includes(rec.severity)) return false;
      return true;
    })
  )
    return null;
  if (typeof namingObj.status !== "string") return null;

  const [currentCharacters, currentScript] = await Promise.all([
    fingerprintCharactersActive(args.rootDir),
    fingerprintReadabilityScript({ rootDir: args.rootDir, scriptRelPath: resolveReadabilityScriptRelPath(args.platformProfile) })
  ]);
  if (charactersObj.fingerprint !== currentCharacters.fingerprint) return null;
  if (scriptObj.rel_path !== currentScript.rel_path) return null;
  if (scriptObj.fingerprint !== currentScript.fingerprint) return null;

  let now: FileFingerprint;
  try {
    const rootReal = await realpath(args.rootDir);
    const chapterReal = await realpath(args.chapterAbsPath);
    assertInsideProjectRoot(rootReal, chapterReal);
    ({ fingerprint: now } = await fingerprintTextFile(chapterReal));
  } catch {
    return null;
  }
  const fresh = now.size === fp.size && now.mtime_ms === fp.mtime_ms && now.content_hash === fp.content_hash;
  if (!fresh) return null;

  return raw as PrejudgeGuardrailsReport;
}
