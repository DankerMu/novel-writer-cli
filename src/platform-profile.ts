import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { pathExists, readJsonFile } from "./fs-utils.js";
import { isPlainObject } from "./type-guards.js";

export const PLATFORM_IDS = ["qidian", "tomato", "fanqie", "jinjiang"] as const;
export type PlatformId = (typeof PLATFORM_IDS)[number];
export const CANONICAL_PLATFORM_IDS = ["qidian", "fanqie", "jinjiang"] as const;
export type CanonicalPlatformId = (typeof CANONICAL_PLATFORM_IDS)[number];
export type SeverityPolicy = "warn" | "soft" | "hard";

export type WordCountPolicy = {
  target_min: number;
  target_max: number;
  hard_min: number;
  hard_max: number;
};

export type InfoLoadPolicy = {
  max_new_entities_per_chapter: number;
  max_unknown_entities_per_chapter: number;
  max_new_terms_per_1k_words: number;
};

export type CompliancePolicy = {
  banned_words: string[];
  duplicate_name_policy: SeverityPolicy;
  script_paths?: Record<string, string>;
};

export type HookPolicy = {
  required: boolean;
  min_strength: number;
  allowed_types: string[];
  fix_strategy: string;
};

export type ScoringPolicy = {
  genre_drive_type: string;
  weight_profile_id: string;
  weight_overrides?: Record<string, number>;
  max_revisions?: number;
};

export type RetentionTitlePolicy = {
  enabled: boolean;
  min_chars: number;
  max_chars: number;
  forbidden_patterns: string[];
  required_patterns?: string[];
  auto_fix: boolean;
};

export type HookLedgerPolicy = {
  enabled: boolean;
  fulfillment_window_chapters: number;
  diversity_window_chapters: number;
  max_same_type_streak: number;
  min_distinct_types_in_window: number;
  overdue_policy: SeverityPolicy;
};

export type RetentionPolicy = {
  title_policy: RetentionTitlePolicy;
  hook_ledger: HookLedgerPolicy;
};

export type MobileReadabilityBlockingSeverity = "hard_only" | "soft_and_hard";

export type MobileReadabilityPolicy = {
  enabled: boolean;
  max_paragraph_chars: number;
  max_consecutive_exposition_paragraphs: number;
  blocking_severity: MobileReadabilityBlockingSeverity;
};

export type ReadabilityPolicy = {
  mobile: MobileReadabilityPolicy;
};

export type NamingConflictType = "duplicate" | "near_duplicate" | "alias_collision";

export type NamingPolicy = {
  enabled: boolean;
  near_duplicate_threshold: number;
  blocking_conflict_types: NamingConflictType[];
  exemptions?: Record<string, unknown>;
};

export type PlatformProfile = {
  schema_version: number;
  platform: PlatformId;
  created_at: string;
  word_count: WordCountPolicy;
  info_load: InfoLoadPolicy;
  compliance: CompliancePolicy;
  hook_policy?: HookPolicy;
  scoring?: ScoringPolicy;
  retention?: RetentionPolicy | null;
  readability?: ReadabilityPolicy | null;
  naming?: NamingPolicy | null;
};

function requireIntField(obj: Record<string, unknown>, field: string, file: string): number {
  const v = obj[field];
  if (typeof v !== "number" || !Number.isInteger(v)) throw new NovelCliError(`Invalid ${file}: '${field}' must be an int.`, 2);
  return v;
}

function requirePositiveNumberField(obj: Record<string, unknown>, field: string, file: string): number {
  const v = obj[field];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) throw new NovelCliError(`Invalid ${file}: '${field}' must be a non-negative number.`, 2);
  return v;
}

function requireBoolField(obj: Record<string, unknown>, field: string, file: string): boolean {
  const v = obj[field];
  if (typeof v !== "boolean") throw new NovelCliError(`Invalid ${file}: '${field}' must be a boolean.`, 2);
  return v;
}

function requireStringArrayField(obj: Record<string, unknown>, field: string, file: string): string[] {
  const v = obj[field];
  if (!Array.isArray(v) || !v.every((s) => typeof s === "string")) throw new NovelCliError(`Invalid ${file}: '${field}' must be a string array.`, 2);
  return v as string[];
}

function requireStringField(obj: Record<string, unknown>, field: string, file: string): string {
  const v = obj[field];
  if (typeof v !== "string" || v.trim().length === 0) throw new NovelCliError(`Invalid ${file}: '${field}' must be a non-empty string.`, 2);
  return v;
}

function requirePlatformId(value: unknown, file: string): PlatformId {
  if (value === "qidian" || value === "tomato" || value === "fanqie" || value === "jinjiang") return value;
  throw new NovelCliError(`Invalid ${file}: 'platform' must be one of: ${PLATFORM_IDS.join(", ")}.`, 2);
}

export function canonicalPlatformId(id: PlatformId): CanonicalPlatformId {
  if (id === "tomato") return "fanqie";
  return id;
}

function requireSeverityPolicy(value: unknown, file: string, field: string): SeverityPolicy {
  if (value === "warn" || value === "soft" || value === "hard") return value;
  throw new NovelCliError(`Invalid ${file}: '${field}' must be one of: warn, soft, hard.`, 2);
}

function parseWordCountPolicy(raw: unknown, file: string): WordCountPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'word_count' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  return {
    target_min: requireIntField(obj, "target_min", file),
    target_max: requireIntField(obj, "target_max", file),
    hard_min: requireIntField(obj, "hard_min", file),
    hard_max: requireIntField(obj, "hard_max", file)
  };
}

function parseInfoLoadPolicy(raw: unknown, file: string): InfoLoadPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'info_load' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  return {
    max_new_entities_per_chapter: requireIntField(obj, "max_new_entities_per_chapter", file),
    max_unknown_entities_per_chapter: requireIntField(obj, "max_unknown_entities_per_chapter", file),
    max_new_terms_per_1k_words: requirePositiveNumberField(obj, "max_new_terms_per_1k_words", file)
  };
}

function parseCompliancePolicy(raw: unknown, file: string): CompliancePolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'compliance' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;

  const bannedRaw = obj.banned_words;
  if (!Array.isArray(bannedRaw) || !bannedRaw.every((w) => typeof w === "string" && w.trim().length > 0)) {
    throw new NovelCliError(`Invalid ${file}: 'compliance.banned_words' must be a string array.`, 2);
  }
  const banned_words = Array.from(new Set(bannedRaw.map((w) => w.trim()))).filter((w) => w.length > 0);

  const out: CompliancePolicy = {
    banned_words,
    duplicate_name_policy: requireSeverityPolicy(obj.duplicate_name_policy, file, "compliance.duplicate_name_policy")
  };

  if (obj.script_paths !== undefined) {
    if (!isPlainObject(obj.script_paths)) throw new NovelCliError(`Invalid ${file}: 'compliance.script_paths' must be an object.`, 2);
    const sp = obj.script_paths as Record<string, unknown>;
    const script_paths: Record<string, string> = {};
    for (const [k, v] of Object.entries(sp)) {
      if (typeof v !== "string" || v.trim().length === 0) {
        throw new NovelCliError(`Invalid ${file}: 'compliance.script_paths.${k}' must be a non-empty string.`, 2);
      }
      script_paths[k] = v.trim();
    }
    out.script_paths = script_paths;
  }

  return out;
}

const VALID_FIX_STRATEGIES = ["hook-fix"] as const;

function parseHookPolicy(raw: unknown, file: string): HookPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'hook_policy' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const min_strength = requireIntField(obj, "min_strength", file);
  if (min_strength < 1 || min_strength > 5) throw new NovelCliError(`Invalid ${file}: 'hook_policy.min_strength' must be 1-5.`, 2);
  const fix_strategy = requireStringField(obj, "fix_strategy", file);
  if (!(VALID_FIX_STRATEGIES as readonly string[]).includes(fix_strategy)) {
    throw new NovelCliError(`Invalid ${file}: 'hook_policy.fix_strategy' must be one of: ${VALID_FIX_STRATEGIES.join(", ")}.`, 2);
  }
  const allowed_types = Array.from(new Set(requireStringArrayField(obj, "allowed_types", file).map((s) => s.trim()))).filter((s) => s.length > 0);
  if (allowed_types.length === 0) {
    throw new NovelCliError(`Invalid ${file}: 'hook_policy.allowed_types' must be a non-empty string array.`, 2);
  }
  return {
    required: requireBoolField(obj, "required", file),
    min_strength,
    allowed_types,
    fix_strategy
  };
}

function parseScoringPolicy(raw: unknown, file: string): ScoringPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'scoring' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const out: ScoringPolicy = {
    genre_drive_type: requireStringField(obj, "genre_drive_type", file),
    weight_profile_id: requireStringField(obj, "weight_profile_id", file)
  };
  if (obj.max_revisions !== undefined) {
    out.max_revisions = requireNonNegativeIntValue(obj.max_revisions, file, "scoring.max_revisions");
  }
  if (obj.weight_overrides !== undefined) {
    if (!isPlainObject(obj.weight_overrides)) throw new NovelCliError(`Invalid ${file}: 'scoring.weight_overrides' must be an object.`, 2);
    const wo = obj.weight_overrides as Record<string, unknown>;
    const overrides: Record<string, number> = {};
    for (const [k, v] of Object.entries(wo)) {
      if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
        throw new NovelCliError(`Invalid ${file}: 'scoring.weight_overrides.${k}' must be a finite number >= 0.`, 2);
      }
      overrides[k] = v;
    }
    out.weight_overrides = overrides;
  }
  return out;
}

function requireBoolValue(value: unknown, file: string, field: string): boolean {
  if (typeof value !== "boolean") throw new NovelCliError(`Invalid ${file}: '${field}' must be a boolean.`, 2);
  return value;
}

function requireNonNegativeIntValue(value: unknown, file: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be an int >= 0.`, 2);
  }
  return value;
}

function requirePositiveIntValue(value: unknown, file: string, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be an int >= 1.`, 2);
  }
  return value;
}

function requireFiniteNonNegativeNumberValue(value: unknown, file: string, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be a finite number >= 0.`, 2);
  }
  return value;
}

function requireStringArrayValue(
  value: unknown,
  file: string,
  field: string,
  opts: { allowEmpty: boolean }
): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && v.trim().length > 0)) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be a string array (no empty items).`, 2);
  }
  const uniq = Array.from(new Set(value.map((v) => v.trim()))).filter((v) => v.length > 0);
  if (!opts.allowEmpty && uniq.length === 0) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be a non-empty string array.`, 2);
  }
  return uniq;
}

function assertValidRegexPattern(pattern: string, file: string, field: string, index: number): void {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Invalid ${file}: '${field}[${index}]' must be a valid regex pattern. ${message}`, 2);
  }
}

function parseRetentionTitlePolicy(raw: unknown, file: string): RetentionTitlePolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'retention.title_policy' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const enabled = requireBoolValue(obj.enabled, file, "retention.title_policy.enabled");
  const min_chars = requireNonNegativeIntValue(obj.min_chars, file, "retention.title_policy.min_chars");
  const max_chars = requireNonNegativeIntValue(obj.max_chars, file, "retention.title_policy.max_chars");
  if (min_chars > max_chars) {
    throw new NovelCliError(`Invalid ${file}: 'retention.title_policy.min_chars' must be <= 'retention.title_policy.max_chars'.`, 2);
  }
  const forbidden_patterns = requireStringArrayValue(obj.forbidden_patterns, file, "retention.title_policy.forbidden_patterns", { allowEmpty: true });
  forbidden_patterns.forEach((p, i) => assertValidRegexPattern(p, file, "retention.title_policy.forbidden_patterns", i));
  const required_patterns = obj.required_patterns === undefined
    ? undefined
    : requireStringArrayValue(obj.required_patterns, file, "retention.title_policy.required_patterns", { allowEmpty: true });
  if (required_patterns) required_patterns.forEach((p, i) => assertValidRegexPattern(p, file, "retention.title_policy.required_patterns", i));
  const auto_fix = requireBoolValue(obj.auto_fix, file, "retention.title_policy.auto_fix");
  return {
    enabled,
    min_chars,
    max_chars,
    forbidden_patterns,
    ...(required_patterns ? { required_patterns } : {}),
    auto_fix
  };
}

function parseHookLedgerPolicy(raw: unknown, file: string): HookLedgerPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'retention.hook_ledger' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  return {
    enabled: requireBoolValue(obj.enabled, file, "retention.hook_ledger.enabled"),
    fulfillment_window_chapters: requirePositiveIntValue(obj.fulfillment_window_chapters, file, "retention.hook_ledger.fulfillment_window_chapters"),
    diversity_window_chapters: requirePositiveIntValue(obj.diversity_window_chapters, file, "retention.hook_ledger.diversity_window_chapters"),
    max_same_type_streak: requirePositiveIntValue(obj.max_same_type_streak, file, "retention.hook_ledger.max_same_type_streak"),
    min_distinct_types_in_window: requirePositiveIntValue(obj.min_distinct_types_in_window, file, "retention.hook_ledger.min_distinct_types_in_window"),
    overdue_policy: requireSeverityPolicy(obj.overdue_policy, file, "retention.hook_ledger.overdue_policy")
  };
}

function parseRetentionPolicy(raw: unknown, file: string): RetentionPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'retention' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  return {
    title_policy: parseRetentionTitlePolicy(obj.title_policy, file),
    hook_ledger: parseHookLedgerPolicy(obj.hook_ledger, file)
  };
}

function parseMobileReadabilityPolicy(raw: unknown, file: string): MobileReadabilityPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'readability.mobile' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const blocking = typeof obj.blocking_severity === "string" ? obj.blocking_severity : null;
  if (blocking !== "hard_only" && blocking !== "soft_and_hard") {
    throw new NovelCliError(`Invalid ${file}: 'readability.mobile.blocking_severity' must be 'hard_only' or 'soft_and_hard'.`, 2);
  }
  return {
    enabled: requireBoolValue(obj.enabled, file, "readability.mobile.enabled"),
    max_paragraph_chars: requirePositiveIntValue(obj.max_paragraph_chars, file, "readability.mobile.max_paragraph_chars"),
    max_consecutive_exposition_paragraphs: requirePositiveIntValue(
      obj.max_consecutive_exposition_paragraphs,
      file,
      "readability.mobile.max_consecutive_exposition_paragraphs"
    ),
    blocking_severity: blocking
  };
}

function parseReadabilityPolicy(raw: unknown, file: string): ReadabilityPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'readability' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  return { mobile: parseMobileReadabilityPolicy(obj.mobile, file) };
}

const VALID_NAMING_CONFLICT_TYPES = ["duplicate", "near_duplicate", "alias_collision"] as const;

function parseNamingPolicy(raw: unknown, file: string): NamingPolicy {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: 'naming' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const enabled = requireBoolValue(obj.enabled, file, "naming.enabled");
  const near_duplicate_threshold = requireFiniteNonNegativeNumberValue(obj.near_duplicate_threshold, file, "naming.near_duplicate_threshold");
  if (near_duplicate_threshold > 1) {
    throw new NovelCliError(`Invalid ${file}: 'naming.near_duplicate_threshold' must be <= 1.`, 2);
  }

  const rawTypes = requireStringArrayValue(obj.blocking_conflict_types, file, "naming.blocking_conflict_types", { allowEmpty: false });
  const blocking_conflict_types: NamingConflictType[] = [];
  for (const t of rawTypes) {
    if (!(VALID_NAMING_CONFLICT_TYPES as readonly string[]).includes(t)) {
      throw new NovelCliError(
        `Invalid ${file}: 'naming.blocking_conflict_types' contains unknown type '${t}' (allowed: ${VALID_NAMING_CONFLICT_TYPES.join(", ")}).`,
        2
      );
    }
    blocking_conflict_types.push(t as NamingConflictType);
  }

  const out: NamingPolicy = {
    enabled,
    near_duplicate_threshold,
    blocking_conflict_types: Array.from(new Set(blocking_conflict_types))
  };

  if (obj.exemptions !== undefined) {
    if (!isPlainObject(obj.exemptions)) throw new NovelCliError(`Invalid ${file}: 'naming.exemptions' must be an object.`, 2);
    out.exemptions = obj.exemptions as Record<string, unknown>;
  }

  return out;
}

export function parsePlatformProfile(raw: unknown, file: string): PlatformProfile {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: expected a JSON object.`, 2);
  const obj = raw as Record<string, unknown>;

  const schema_version = requireIntField(obj, "schema_version", file);
  const platform = requirePlatformId(obj.platform, file);
  const created_at = requireStringField(obj, "created_at", file);
  const word_count = parseWordCountPolicy(obj.word_count, file);
  const info_load = parseInfoLoadPolicy(obj.info_load, file);
  const compliance = parseCompliancePolicy(obj.compliance, file);

  // hook_policy is required in schemas/platform-profile.schema.json but optional here for backward compat with older files.
  let hook_policy: HookPolicy | undefined;
  if (obj.hook_policy !== undefined) {
    if (!isPlainObject(obj.hook_policy)) throw new NovelCliError(`Invalid ${file}: 'hook_policy' must be an object.`, 2);
    hook_policy = parseHookPolicy(obj.hook_policy, file);
  }

  let scoring: ScoringPolicy | undefined;
  if (obj.scoring !== undefined) {
    if (!isPlainObject(obj.scoring)) throw new NovelCliError(`Invalid ${file}: 'scoring' must be an object.`, 2);
    scoring = parseScoringPolicy(obj.scoring, file);
  }

  const out: PlatformProfile = { schema_version, platform, created_at, word_count, info_load, compliance, hook_policy, scoring };

  if (obj.retention !== undefined) {
    out.retention = obj.retention === null ? null : parseRetentionPolicy(obj.retention, file);
  }
  if (obj.readability !== undefined) {
    out.readability = obj.readability === null ? null : parseReadabilityPolicy(obj.readability, file);
  }
  if (obj.naming !== undefined) {
    out.naming = obj.naming === null ? null : parseNamingPolicy(obj.naming, file);
  }

  return out;
}

export async function loadPlatformProfile(rootDir: string): Promise<{ relPath: string; profile: PlatformProfile } | null> {
  const relPath = "platform-profile.json";
  const absPath = join(rootDir, relPath);
  if (!(await pathExists(absPath))) return null;
  const raw = await readJsonFile(absPath);
  return { relPath, profile: parsePlatformProfile(raw, relPath) };
}
