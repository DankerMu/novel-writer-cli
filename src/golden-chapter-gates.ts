import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { pathExists, readJsonFile } from "./fs-utils.js";
import { CANONICAL_PLATFORM_IDS, canonicalPlatformId, type CanonicalPlatformId, type PlatformId } from "./platform-profile.js";
import { isPlainObject } from "./type-guards.js";

const VALID_THRESHOLD_OPERATORS = ["<", "<=", ">", ">=", "==", "!="] as const;

export type GoldenChapterGateRule = {
  id: string;
  requirement: string;
  evaluation_hint?: string;
  threshold?: {
    metric: string;
    operator: string;
    value: string | number | boolean;
  };
  allowed_values?: string[];
};

export type GoldenChapterGateChapterConfig = {
  gates: GoldenChapterGateRule[];
  notes?: string[];
};

export type GoldenChapterGatePlatformConfig = {
  chapters: Record<string, GoldenChapterGateChapterConfig>;
};

export type GoldenChapterGatesConfig = {
  schema_version: 1;
  description?: string;
  invalid_combinations: Array<{ genre: string; platform: CanonicalPlatformId; warning: string }>;
  platforms: Record<CanonicalPlatformId, GoldenChapterGatePlatformConfig>;
};

function requireString(value: unknown, file: string, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be a non-empty string.`, 2);
  }
  return value.trim();
}

function requireOptionalStringArray(value: unknown, file: string, field: string): string[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || !value.every((item) => typeof item === "string" && item.trim().length > 0)) {
    throw new NovelCliError(`Invalid ${file}: '${field}' must be a string array.`, 2);
  }
  return value.map((item) => item.trim());
}

function parseRule(raw: unknown, file: string, field: string): GoldenChapterGateRule {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: '${field}' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const out: GoldenChapterGateRule = {
    id: requireString(obj.id, file, `${field}.id`),
    requirement: requireString(obj.requirement, file, `${field}.requirement`)
  };

  if (obj.evaluation_hint !== undefined) {
    out.evaluation_hint = requireString(obj.evaluation_hint, file, `${field}.evaluation_hint`);
  }

  if (obj.threshold !== undefined) {
    if (!isPlainObject(obj.threshold)) throw new NovelCliError(`Invalid ${file}: '${field}.threshold' must be an object.`, 2);
    const threshold = obj.threshold as Record<string, unknown>;
    const value = threshold.value;
    if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
      throw new NovelCliError(`Invalid ${file}: '${field}.threshold.value' must be string|number|boolean.`, 2);
    }
    const operator = requireString(threshold.operator, file, `${field}.threshold.operator`);
    if (!(VALID_THRESHOLD_OPERATORS as readonly string[]).includes(operator)) {
      throw new NovelCliError(
        `Invalid ${file}: '${field}.threshold.operator' must be one of: ${VALID_THRESHOLD_OPERATORS.join(", ")}.`,
        2
      );
    }
    out.threshold = {
      metric: requireString(threshold.metric, file, `${field}.threshold.metric`),
      operator,
      value
    };
  }

  const allowed_values = requireOptionalStringArray(obj.allowed_values, file, `${field}.allowed_values`);
  if (allowed_values) out.allowed_values = allowed_values;
  return out;
}

function parseChapterConfig(raw: unknown, file: string, field: string): GoldenChapterGateChapterConfig {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: '${field}' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const gatesRaw = obj.gates;
  if (!Array.isArray(gatesRaw) || gatesRaw.length === 0) {
    throw new NovelCliError(`Invalid ${file}: '${field}.gates' must be a non-empty array.`, 2);
  }
  const gates = gatesRaw.map((item, index) => parseRule(item, file, `${field}.gates[${index}]`));
  const notes = requireOptionalStringArray(obj.notes, file, `${field}.notes`);
  return notes ? { gates, notes } : { gates };
}

export function parseGoldenChapterGates(raw: unknown, file: string): GoldenChapterGatesConfig {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${file}: expected a JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) throw new NovelCliError(`Invalid ${file}: 'schema_version' must be 1.`, 2);

  if (!isPlainObject(obj.platforms)) throw new NovelCliError(`Invalid ${file}: 'platforms' must be an object.`, 2);
  const platformsRaw = obj.platforms as Record<string, unknown>;
  const platforms = {} as GoldenChapterGatesConfig["platforms"];
  for (const platformId of CANONICAL_PLATFORM_IDS) {
    const platformRaw = platformsRaw[platformId];
    if (!isPlainObject(platformRaw)) {
      throw new NovelCliError(`Invalid ${file}: missing 'platforms.${platformId}' object.`, 2);
    }
    const platformObj = platformRaw as Record<string, unknown>;
    if (!isPlainObject(platformObj.chapters)) {
      throw new NovelCliError(`Invalid ${file}: 'platforms.${platformId}.chapters' must be an object.`, 2);
    }
    const chaptersRaw = platformObj.chapters as Record<string, unknown>;
    const chapters: Record<string, GoldenChapterGateChapterConfig> = {};
    for (const chapter of ["1", "2", "3"]) {
      chapters[chapter] = parseChapterConfig(chaptersRaw[chapter], file, `platforms.${platformId}.chapters.${chapter}`);
    }
    platforms[platformId] = { chapters };
  }

  if (!Array.isArray(obj.invalid_combinations)) {
    throw new NovelCliError(`Invalid ${file}: 'invalid_combinations' must be an array.`, 2);
  }
  const invalid_combinations = obj.invalid_combinations.map((item, index) => {
    if (!isPlainObject(item)) {
      throw new NovelCliError(`Invalid ${file}: 'invalid_combinations[${index}]' must be an object.`, 2);
    }
    const entry = item as Record<string, unknown>;
    const platform = requireString(entry.platform, file, `invalid_combinations[${index}].platform`);
    if (!CANONICAL_PLATFORM_IDS.includes(platform as CanonicalPlatformId)) {
      throw new NovelCliError(
        `Invalid ${file}: 'invalid_combinations[${index}].platform' must be one of ${CANONICAL_PLATFORM_IDS.join(", ")}.`,
        2
      );
    }
    return {
      genre: requireString(entry.genre, file, `invalid_combinations[${index}].genre`),
      platform: platform as CanonicalPlatformId,
      warning: requireString(entry.warning, file, `invalid_combinations[${index}].warning`)
    };
  });

  const out: GoldenChapterGatesConfig = { schema_version: 1, invalid_combinations, platforms };
  if (typeof obj.description === "string" && obj.description.trim().length > 0) out.description = obj.description.trim();
  return out;
}

export async function loadGoldenChapterGates(rootDir: string): Promise<{ relPath: string; config: GoldenChapterGatesConfig } | null> {
  const relPath = "golden-chapter-gates.json";
  const absPath = join(rootDir, relPath);
  if (!(await pathExists(absPath))) return null;
  const raw = await readJsonFile(absPath);
  return { relPath, config: parseGoldenChapterGates(raw, relPath) };
}

export function selectGoldenChapterGatesForPlatform(args: {
  config: GoldenChapterGatesConfig;
  platformId: PlatformId;
  chapter: number;
}): {
  platform: CanonicalPlatformId;
  chapter: number;
  current_chapter: GoldenChapterGateChapterConfig;
  chapters: GoldenChapterGatePlatformConfig["chapters"];
  invalid_combination_warnings: Array<{ genre: string; warning: string }>;
} | null {
  if (!Number.isInteger(args.chapter) || args.chapter < 1 || args.chapter > 3) return null;

  const platform = canonicalPlatformId(args.platformId);
  const platformConfig = args.config.platforms[platform];
  if (!platformConfig) return null;
  const current_chapter = platformConfig.chapters[String(args.chapter)];
  if (!current_chapter) return null;

  return {
    platform,
    chapter: args.chapter,
    current_chapter,
    chapters: platformConfig.chapters,
    invalid_combination_warnings: args.config.invalid_combinations
      .filter((item) => item.platform === platform)
      .map((item) => ({ genre: item.genre, warning: item.warning }))
  };
}
