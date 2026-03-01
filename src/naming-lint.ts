import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { fingerprintFile, fingerprintTextFile, fingerprintsMatch, type FileFingerprint } from "./fingerprint.js";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "./fs-utils.js";
import type { InfoLoadNerPrecompute } from "./platform-constraints.js";
import type { NamingConflictType, PlatformProfile, SeverityPolicy } from "./platform-profile.js";
import { pad3 } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

export type NamingCheckStatus = "pass" | "warn" | "violation" | "skipped";

export type NamingIssue = {
  id: string;
  severity: SeverityPolicy;
  summary: string;
  evidence?: string;
  suggestion?: string;
  conflict_type?: NamingConflictType;
  similarity?: number;
};

export type NamingRegistryEntry = {
  slug_id: string;
  rel_path: string;
  display_name: string;
  aliases: string[];
};

export type NamingReport = {
  schema_version: 1;
  generated_at: string;
  scope: { chapter: number };
  policy: {
    enabled: boolean;
    near_duplicate_threshold: number;
    blocking_conflict_types: NamingConflictType[];
  } | null;
  registry: {
    total_characters: number;
    total_names: number;
  };
  status: NamingCheckStatus;
  issues: NamingIssue[];
  has_blocking_issues: boolean;
};

export type NamingLintPrecompute = {
  status: "pass" | "skipped";
  error?: string;
  chapter_fingerprint: FileFingerprint | null;
  report: NamingReport | null;
};

type NameOccurrence = {
  slug_id: string;
  rel_path: string;
  kind: "canonical" | "alias";
  value: string;
};

type NamingExemptions = {
  ignore_names: Set<string>;
  allow_pairs: Set<string>;
};

function severityRank(sev: SeverityPolicy): number {
  if (sev === "warn") return 1;
  if (sev === "soft") return 2;
  if (sev === "hard") return 3;
  return 0;
}

function normalizeNameKey(name: string): string {
  return name.trim().replace(/\s+/gu, "").toLowerCase();
}

function makePairKey(a: string, b: string): string {
  return [a, b].sort((x, y) => x.localeCompare(y, "en")).join("||");
}

function parseExemptions(raw: unknown): NamingExemptions {
  const ignore_names = new Set<string>();
  const allow_pairs = new Set<string>();

  if (!isPlainObject(raw)) return { ignore_names, allow_pairs };
  const obj = raw as Record<string, unknown>;

  const ignored = obj.ignore_names;
  if (Array.isArray(ignored)) {
    for (const it of ignored) {
      if (typeof it !== "string") continue;
      const key = normalizeNameKey(it);
      if (key.length > 0) ignore_names.add(key);
    }
  }

  const pairs = obj.allow_pairs;
  if (Array.isArray(pairs)) {
    for (const it of pairs) {
      if (!Array.isArray(it) || it.length !== 2) continue;
      const a = typeof it[0] === "string" ? normalizeNameKey(it[0]) : "";
      const b = typeof it[1] === "string" ? normalizeNameKey(it[1]) : "";
      if (a.length === 0 || b.length === 0) continue;
      allow_pairs.add(makePairKey(a, b));
    }
  }

  return { ignore_names, allow_pairs };
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;

  const aa = Array.from(a);
  const bb = Array.from(b);
  const n = aa.length;
  const m = bb.length;
  if (n === 0) return m;
  if (m === 0) return n;

  let prev = new Array<number>(m + 1);
  for (let j = 0; j <= m; j += 1) prev[j] = j;

  for (let i = 1; i <= n; i += 1) {
    const cur = new Array<number>(m + 1);
    cur[0] = i;
    const ai = aa[i - 1];
    for (let j = 1; j <= m; j += 1) {
      const cost = ai === bb[j - 1] ? 0 : 1;
      const del = prev[j]! + 1;
      const ins = cur[j - 1]! + 1;
      const sub = prev[j - 1]! + cost;
      cur[j] = Math.min(del, ins, sub);
    }
    prev = cur;
  }
  return prev[m]!;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function computeSimilarity(a: string, b: string): number {
  const left = normalizeNameKey(a);
  const right = normalizeNameKey(b);
  if (left.length === 0 && right.length === 0) return 1;
  if (left.length === 0 || right.length === 0) return 0;

  const maxLen = Math.max(Array.from(left).length, Array.from(right).length);
  if (maxLen === 0) return 1;
  const dist = levenshteinDistance(left, right);
  const ratio = dist / maxLen;

  const sim = maxLen <= 4 ? 1 - Math.pow(ratio, 4) : 1 - ratio;
  if (sim <= 0) return 0;
  if (sim >= 1) return 1;
  return round3(sim);
}

function collectBlockingTypes(profile: PlatformProfile): Set<NamingConflictType> {
  const types = profile.naming?.blocking_conflict_types ?? [];
  return new Set(types);
}

function severityForConflict(args: {
  conflict_type: NamingConflictType;
  blockingTypes: Set<NamingConflictType>;
}): SeverityPolicy {
  return args.blockingTypes.has(args.conflict_type) ? "hard" : "soft";
}

async function deriveNameRegistry(rootDir: string): Promise<{ entries: NamingRegistryEntry[]; issues: NamingIssue[] }> {
  const dirRel = "characters/active";
  const dirAbs = join(rootDir, dirRel);
  if (!(await pathExists(dirAbs))) return { entries: [], issues: [] };

  const entries: NamingRegistryEntry[] = [];
  const issues: NamingIssue[] = [];

  let dirents;
  try {
    dirents = await readdir(dirAbs, { withFileTypes: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    issues.push({
      id: "naming.registry.read_failed",
      severity: "warn",
      summary: `Failed to list ${dirRel}.`,
      evidence: message,
      suggestion: "Ensure characters/active/ exists and is readable."
    });
    return { entries: [], issues };
  }

  const files = dirents
    .filter((d) => d.isFile() && d.name.endsWith(".json"))
    .map((d) => d.name)
    .sort((a, b) => a.localeCompare(b, "en"));

  for (const filename of files) {
    const slug_id = filename.replace(/\.json$/u, "");
    const rel_path = `${dirRel}/${filename}`;
    let raw: unknown;
    try {
      raw = await readJsonFile(join(dirAbs, filename));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      issues.push({
        id: "naming.registry.invalid_profile",
        severity: "warn",
        summary: `Invalid character profile: ${rel_path}.`,
        evidence: message
      });
      continue;
    }

    if (!isPlainObject(raw)) {
      issues.push({
        id: "naming.registry.invalid_profile",
        severity: "warn",
        summary: `Invalid character profile: ${rel_path} must be a JSON object.`,
        suggestion: "Fix the JSON structure (expected {id, display_name, ...})."
      });
      continue;
    }

    const obj = raw as Record<string, unknown>;
    const displayRaw = obj.display_name;
    const display_name = typeof displayRaw === "string" ? displayRaw.trim() : "";
    if (display_name.length === 0) {
      issues.push({
        id: "naming.registry.invalid_profile",
        severity: "warn",
        summary: `Invalid character profile: ${rel_path} missing display_name.`,
        suggestion: "Ensure display_name is a non-empty string."
      });
      continue;
    }

    const idRaw = obj.id;
    if (typeof idRaw === "string" && idRaw.trim().length > 0 && idRaw.trim() !== slug_id) {
      issues.push({
        id: "naming.registry.id_mismatch",
        severity: "warn",
        summary: `Character profile id mismatch: ${rel_path} has id='${idRaw.trim()}', expected '${slug_id}'.`,
        suggestion: "Align characters/active/<slug>.json filename with its id field."
      });
    }

    const canonicalKey = normalizeNameKey(display_name);
    const aliasesRaw = obj.aliases;
    const aliases: string[] = [];
    if (Array.isArray(aliasesRaw)) {
      for (const it of aliasesRaw) {
        if (typeof it !== "string") continue;
        const trimmed = it.trim();
        if (trimmed.length === 0) continue;
        if (normalizeNameKey(trimmed) === canonicalKey) continue;
        aliases.push(trimmed);
      }
    }
    const uniqueAliases = Array.from(new Set(aliases.map((a) => normalizeNameKey(a))))
      .map((k) => {
        const found = aliases.find((a) => normalizeNameKey(a) === k);
        return found ?? "";
      })
      .filter((a) => a.length > 0);

    entries.push({ slug_id, rel_path, display_name, aliases: uniqueAliases });
  }

  entries.sort((a, b) => a.slug_id.localeCompare(b.slug_id, "en"));
  return { entries, issues };
}

function buildNameOccurrences(entries: NamingRegistryEntry[]): Array<{ key: string; occ: NameOccurrence }> {
  const out: Array<{ key: string; occ: NameOccurrence }> = [];
  for (const e of entries) {
    out.push({
      key: normalizeNameKey(e.display_name),
      occ: { slug_id: e.slug_id, rel_path: e.rel_path, kind: "canonical", value: e.display_name }
    });
    for (const a of e.aliases) {
      out.push({
        key: normalizeNameKey(a),
        occ: { slug_id: e.slug_id, rel_path: e.rel_path, kind: "alias", value: a }
      });
    }
  }
  return out.filter((it) => it.key.length > 0);
}

function isPairExempt(exemptions: NamingExemptions, a: string, b: string): boolean {
  const ka = normalizeNameKey(a);
  const kb = normalizeNameKey(b);
  if (ka.length === 0 || kb.length === 0) return false;
  return exemptions.allow_pairs.has(makePairKey(ka, kb));
}

export async function computeNamingReport(args: {
  rootDir: string;
  chapter: number;
  chapterText: string;
  platformProfile: PlatformProfile;
  infoLoadNer?: InfoLoadNerPrecompute | null;
}): Promise<NamingReport> {
  const generated_at = new Date().toISOString();

  const policy = args.platformProfile.naming ?? null;
  const policyOut = policy
    ? {
        enabled: policy.enabled,
        near_duplicate_threshold: policy.near_duplicate_threshold,
        blocking_conflict_types: policy.blocking_conflict_types
      }
    : null;

  if (!policy || !policy.enabled) {
    return {
      schema_version: 1,
      generated_at,
      scope: { chapter: args.chapter },
      policy: policyOut,
      registry: { total_characters: 0, total_names: 0 },
      status: "skipped",
      issues: [],
      has_blocking_issues: false
    };
  }

  const exemptions = parseExemptions(policy.exemptions);
  const blockingTypes = collectBlockingTypes(args.platformProfile);
  const threshold = policy.near_duplicate_threshold;

  const registry = await deriveNameRegistry(args.rootDir);
  const entries = registry.entries;

  const issues: NamingIssue[] = registry.issues.map((i) => ({ ...i }));

  const canonicalKeyToEntries = new Map<string, NamingRegistryEntry[]>();
  for (const e of entries) {
    const key = normalizeNameKey(e.display_name);
    if (key.length === 0) continue;
    if (exemptions.ignore_names.has(key)) continue;
    const bucket = canonicalKeyToEntries.get(key);
    if (bucket) bucket.push(e);
    else canonicalKeyToEntries.set(key, [e]);
  }

  const duplicateKeys = Array.from(canonicalKeyToEntries.keys()).sort((a, b) => a.localeCompare(b, "zh"));
  for (const key of duplicateKeys) {
    const bucket = canonicalKeyToEntries.get(key);
    if (!bucket || bucket.length <= 1) continue;
    const name = bucket[0]?.display_name ?? key;
    const ev = bucket
      .map((b) => `${b.slug_id} (${b.rel_path})`)
      .slice(0, 5)
      .join(" | ");
    const suffix = bucket.length > 5 ? " …" : "";
    issues.push({
      id: "naming.duplicate_display_name",
      conflict_type: "duplicate",
      severity: severityForConflict({ conflict_type: "duplicate", blockingTypes }),
      summary: `Duplicate character name detected: '${name}' appears in ${bucket.length} profiles.`,
      evidence: `${ev}${suffix}`,
      suggestion: "Rename one character or add an exemption if the overlap is intentional."
    });
  }

  const occurrences = buildNameOccurrences(entries);
  const occByKey = new Map<string, NameOccurrence[]>();
  for (const it of occurrences) {
    if (exemptions.ignore_names.has(it.key)) continue;
    const bucket = occByKey.get(it.key);
    if (bucket) bucket.push(it.occ);
    else occByKey.set(it.key, [it.occ]);
  }

  const occKeys = Array.from(occByKey.keys()).sort((a, b) => a.localeCompare(b, "zh"));
  for (const key of occKeys) {
    const bucket = occByKey.get(key);
    if (!bucket) continue;
    const uniqueSlugs = new Set(bucket.map((b) => b.slug_id));
    if (uniqueSlugs.size <= 1) continue;
    const hasAlias = bucket.some((b) => b.kind === "alias");
    if (!hasAlias) continue;

    const label = bucket[0]?.value ?? key;
    if (isPairExempt(exemptions, label, label)) continue;
    const ev = bucket
      .map((b) => `${b.slug_id}:${b.kind} (${b.rel_path})`)
      .slice(0, 6)
      .join(" | ");
    const suffix = bucket.length > 6 ? " …" : "";
    issues.push({
      id: "naming.alias_collision",
      conflict_type: "alias_collision",
      severity: severityForConflict({ conflict_type: "alias_collision", blockingTypes }),
      summary: `Alias collision detected: '${label}' is associated with multiple characters.`,
      evidence: `${ev}${suffix}`,
      suggestion: "Rename the alias or add text disambiguation to avoid confusing readers."
    });
  }

  const canonicalEntries = entries
    .filter((e) => normalizeNameKey(e.display_name).length > 0 && !exemptions.ignore_names.has(normalizeNameKey(e.display_name)))
    .slice()
    .sort((a, b) => a.display_name.localeCompare(b.display_name, "zh") || a.slug_id.localeCompare(b.slug_id, "en"));

  const maxNearIssues = 50;
  let nearCount = 0;
  for (let i = 0; i < canonicalEntries.length && nearCount < maxNearIssues; i += 1) {
    const a = canonicalEntries[i];
    if (!a) continue;
    const keyA = normalizeNameKey(a.display_name);
    for (let j = i + 1; j < canonicalEntries.length && nearCount < maxNearIssues; j += 1) {
      const b = canonicalEntries[j];
      if (!b) continue;
      const keyB = normalizeNameKey(b.display_name);
      if (keyA === keyB) continue;
      if (isPairExempt(exemptions, a.display_name, b.display_name)) continue;
      const score = computeSimilarity(a.display_name, b.display_name);
      if (score < threshold) continue;
      issues.push({
        id: "naming.near_duplicate",
        conflict_type: "near_duplicate",
        severity: severityForConflict({ conflict_type: "near_duplicate", blockingTypes }),
        similarity: score,
        summary: `Near-duplicate names detected: '${a.display_name}' vs '${b.display_name}' (similarity=${score} ≥ ${threshold}).`,
        evidence: `${a.slug_id} (${a.rel_path}) | ${b.slug_id} (${b.rel_path})`,
        suggestion: "Consider renaming or adding strong textual disambiguation when both names must coexist."
      });
      nearCount += 1;
    }
  }

  const nerIndex = args.infoLoadNer?.status === "pass" ? args.infoLoadNer.current_index : null;
  if (nerIndex) {
    const knownNames: Array<{ key: string; label: string; slug_id: string; rel_path: string; kind: "canonical" | "alias" }> = [];
    for (const e of entries) {
      const k = normalizeNameKey(e.display_name);
      if (k.length > 0 && !exemptions.ignore_names.has(k)) {
        knownNames.push({ key: k, label: e.display_name, slug_id: e.slug_id, rel_path: e.rel_path, kind: "canonical" });
      }
      for (const a of e.aliases) {
        const ak = normalizeNameKey(a);
        if (ak.length > 0 && !exemptions.ignore_names.has(ak)) {
          knownNames.push({ key: ak, label: a, slug_id: e.slug_id, rel_path: e.rel_path, kind: "alias" });
        }
      }
    }

    const knownKeySet = new Set(knownNames.map((k) => k.key));

    const unknownCandidates = Array.from(nerIndex.entries())
      .filter(([, meta]) => meta.category === "character")
      .map(([text, meta]) => ({ text, meta }))
      .sort((a, b) => a.text.localeCompare(b.text, "zh"));

    for (const it of unknownCandidates) {
      const key = normalizeNameKey(it.text);
      if (key.length === 0) continue;
      if (exemptions.ignore_names.has(key)) continue;
      if (knownKeySet.has(key)) continue;

      let best: { score: number; match: (typeof knownNames)[number] } | null = null;
      for (const kn of knownNames) {
        const score = computeSimilarity(key, kn.key);
        if (score < threshold) continue;
        if (!best || score > best.score) best = { score, match: kn };
      }
      if (!best) continue;
      if (isPairExempt(exemptions, it.text, best.match.label)) continue;

      const ev = it.meta.evidence ? `${it.meta.evidence} ~ ${best.match.label} (${best.match.slug_id})` : `${best.match.label} (${best.match.slug_id})`;
      issues.push({
        id: "naming.unknown_entity_confusion",
        severity: "warn",
        similarity: best.score,
        summary: `Unknown character-like entity '${it.text}' is highly similar to existing '${best.match.label}' (similarity=${best.score} ≥ ${threshold}).`,
        evidence: ev,
        suggestion: "If this is a new character, add a profile under characters/active/. Otherwise, add disambiguation or adjust naming."
      });
    }
  }

  const ordered = issues
    .slice()
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        a.id.localeCompare(b.id, "en") ||
        a.summary.localeCompare(b.summary, "zh")
    );

  const has_blocking_issues = ordered.some((i) => i.severity === "hard");
  const status: NamingCheckStatus = has_blocking_issues ? "violation" : ordered.length > 0 ? "warn" : "pass";

  const total_names = entries.reduce((acc, e) => acc + 1 + e.aliases.length, 0);

  return {
    schema_version: 1,
    generated_at,
    scope: { chapter: args.chapter },
    policy: policyOut,
    registry: { total_characters: entries.length, total_names },
    status,
    issues: ordered,
    has_blocking_issues
  };
}

export function summarizeNamingIssues(issues: NamingIssue[], limit: number): string {
  const ordered = issues
    .slice()
    .sort(
      (a, b) =>
        severityRank(b.severity) - severityRank(a.severity) ||
        a.id.localeCompare(b.id, "en") ||
        a.summary.localeCompare(b.summary, "zh")
    );
  return ordered
    .slice(0, limit)
    .map((i) => i.summary)
    .join(" | ");
}

export async function precomputeNamingReport(args: {
  rootDir: string;
  chapter: number;
  chapterAbsPath: string;
  platformProfile: PlatformProfile;
  infoLoadNer?: InfoLoadNerPrecompute | null;
}): Promise<NamingLintPrecompute> {
  try {
    const before = await fingerprintTextFile(args.chapterAbsPath);

    const ner = args.infoLoadNer;
    const usableNer =
      ner && ner.status === "pass" && ner.chapter_fingerprint ? fingerprintsMatch(ner.chapter_fingerprint, before.fingerprint) : false;

    const report = await computeNamingReport({
      rootDir: args.rootDir,
      chapter: args.chapter,
      chapterText: before.text,
      platformProfile: args.platformProfile,
      ...(usableNer ? { infoLoadNer: ner } : {})
    });

    const afterFp = await fingerprintFile(args.chapterAbsPath);
    if (!fingerprintsMatch(before.fingerprint, afterFp)) {
      return {
        status: "skipped",
        error: "Chapter changed while running naming lint; skipping precomputed result.",
        chapter_fingerprint: null,
        report: null
      };
    }
    return { status: "pass", chapter_fingerprint: afterFp, report };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return { status: "skipped", error: message, chapter_fingerprint: null, report: null };
  }
}

export async function writeNamingLintLogs(args: { rootDir: string; chapter: number; report: NamingReport }): Promise<{ latestRel: string; historyRel: string }> {
  const dirRel = "logs/naming";
  const dirAbs = join(args.rootDir, dirRel);
  await ensureDir(dirAbs);

  const historyRel = `${dirRel}/naming-report-chapter-${pad3(args.chapter)}.json`;
  const latestRel = `${dirRel}/latest.json`;

  await writeJsonFile(join(args.rootDir, historyRel), args.report);
  await writeJsonFile(join(args.rootDir, latestRel), args.report);

  return { latestRel, historyRel };
}

export async function attachNamingLintToEval(args: {
  evalAbsPath: string;
  evalRelPath: string;
  reportRelPath: string;
  report: NamingReport;
}): Promise<void> {
  const raw = await readJsonFile(args.evalAbsPath);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${args.evalRelPath}: eval JSON must be an object.`, 2);
  const obj = raw as Record<string, unknown>;

  const bySeverity = { warn: 0, soft: 0, hard: 0 };
  for (const issue of args.report.issues) {
    if (issue.severity === "warn") bySeverity.warn += 1;
    else if (issue.severity === "soft") bySeverity.soft += 1;
    else if (issue.severity === "hard") bySeverity.hard += 1;
  }

  obj.naming_lint = {
    report_path: args.reportRelPath,
    status: args.report.status,
    ...(args.report.policy
      ? {
          enabled: args.report.policy.enabled,
          near_duplicate_threshold: args.report.policy.near_duplicate_threshold,
          blocking_conflict_types: args.report.policy.blocking_conflict_types
        }
      : { enabled: null, near_duplicate_threshold: null, blocking_conflict_types: null }),
    registry: args.report.registry,
    issues_total: args.report.issues.length,
    issues_by_severity: bySeverity,
    has_blocking_issues: args.report.has_blocking_issues
  };

  await writeJsonFile(args.evalAbsPath, obj);
}

export function assertNoDuplicateCanonicalDisplayNames(entries: NamingRegistryEntry[]): void {
  const seen = new Map<string, NamingRegistryEntry>();
  for (const e of entries) {
    const key = normalizeNameKey(e.display_name);
    if (key.length === 0) continue;
    const prev = seen.get(key);
    if (!prev) {
      seen.set(key, e);
      continue;
    }
    throw new NovelCliError(
      `Duplicate display_name in registry: '${e.display_name}' in ${prev.rel_path} and ${e.rel_path}.`,
      2
    );
  }
}
