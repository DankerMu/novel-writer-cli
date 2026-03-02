import { rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, removePath, writeJsonFile } from "./fs-utils.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { pad3 } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

export type CharacterVoiceThresholds = {
  avg_dialogue_chars_ratio_low: number;
  avg_dialogue_chars_ratio_high: number;
  exclamation_per_100_chars_delta: number;
  question_per_100_chars_delta: number;
  ellipsis_per_100_chars_delta: number;
  signature_overlap_min: number;
};

export type CharacterVoicePolicy = {
  window_chapters: number;
  min_dialogue_samples: number;
  drift_thresholds: CharacterVoiceThresholds;
  recovery_thresholds: CharacterVoiceThresholds;
};

export type CharacterVoiceSelection = {
  protagonist_id: string;
  core_cast_ids?: string[];
};

export type CharacterVoiceMetrics = {
  dialogue_samples: number;
  dialogue_chars: number;
  dialogue_len_avg: number;
  dialogue_len_p25: number;
  dialogue_len_p50: number;
  dialogue_len_p75: number;
  sentence_len_avg: number;
  sentence_len_p25: number;
  sentence_len_p50: number;
  sentence_len_p75: number;
  exclamation_per_100_chars: number;
  question_per_100_chars: number;
  ellipsis_per_100_chars: number;
};

type CommentFields = Partial<Record<`_${string}`, unknown>>;

export type CharacterVoiceProfile = CommentFields & {
  character_id: string;
  display_name: string;
  name_variants?: string[];
  baseline_range: { chapter_start: number; chapter_end: number };
  baseline_metrics: CharacterVoiceMetrics;
  signature_phrases: string[];
  taboo_phrases?: string[];
};

export type CharacterVoiceProfilesFile = CommentFields & {
  $schema?: string;
  schema_version: 1;
  created_at: string;
  selection: CharacterVoiceSelection;
  policy: CharacterVoicePolicy;
  profiles: CharacterVoiceProfile[];
};

export type CharacterVoiceDriftCharacter = {
  character_id: string;
  display_name: string;
  drifted_metrics: Array<{ id: string; baseline: number; current: number; detail: string }>;
  signature_phrases: { baseline: string[]; current: string[]; overlap: number | null };
  baseline_metrics: CharacterVoiceMetrics;
  current_metrics: CharacterVoiceMetrics;
  evidence: Array<{ chapter: number; excerpt: string }>;
  directives: string[];
};

export type CharacterVoiceDriftFile = {
  schema_version: 1;
  generated_at: string;
  as_of: { chapter: number; volume: number };
  window: { chapter_start: number; chapter_end: number; window_chapters: number };
  profiles_path: string;
  characters: CharacterVoiceDriftCharacter[];
};

const PROFILES_REL = "character-voice-profiles.json";
const DRIFT_REL = "character-voice-drift.json";

const DEFAULT_POLICY: CharacterVoicePolicy = {
  window_chapters: 10,
  min_dialogue_samples: 5,
  drift_thresholds: {
    avg_dialogue_chars_ratio_low: 0.6,
    avg_dialogue_chars_ratio_high: 1.67,
    exclamation_per_100_chars_delta: 3.5,
    question_per_100_chars_delta: 3.5,
    ellipsis_per_100_chars_delta: 3.5,
    signature_overlap_min: 0.2
  },
  recovery_thresholds: {
    avg_dialogue_chars_ratio_low: 0.75,
    avg_dialogue_chars_ratio_high: 1.33,
    exclamation_per_100_chars_delta: 2.0,
    question_per_100_chars_delta: 2.0,
    ellipsis_per_100_chars_delta: 2.0,
    signature_overlap_min: 0.3
  }
};

function pickCommentFields(obj: Record<string, unknown>): CommentFields {
  const out = Object.create(null) as CommentFields;
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("_")) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k as `_${string}`] = v;
  }
  return out;
}

function safeInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function safeNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function normalizeStringIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const uniq = Array.from(new Set(raw.map((v) => (typeof v === "string" ? v.trim() : "")).filter((v) => v.length > 0)));
  return uniq;
}

function countNonWhitespaceChars(text: string): number {
  const compact = text.replace(/\s+/gu, "");
  return Array.from(compact).length;
}

function countSubstring(text: string, needle: string): number {
  if (!needle) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const next = text.indexOf(needle, idx);
    if (next < 0) break;
    count += 1;
    idx = next + needle.length;
  }
  return count;
}

function snippet(text: string, maxLen: number): string {
  const s = text.trim().replace(/\s+/gu, " ");
  if (s.length <= maxLen) return s;
  let end = Math.max(0, maxLen - 1);
  if (end > 0) {
    const last = s.charCodeAt(end - 1);
    if (last >= 0xd800 && last <= 0xdbff) {
      const next = s.charCodeAt(end);
      if (next >= 0xdc00 && next <= 0xdfff) end -= 1;
    }
  }
  return `${s.slice(0, end)}…`;
}

function percentileInt(sortedAsc: number[], p: number): number {
  if (sortedAsc.length === 0) return 0;
  const clamped = Math.max(0, Math.min(1, p));
  const idx = Math.floor((sortedAsc.length - 1) * clamped);
  return sortedAsc[idx] ?? 0;
}

function average(nums: number[]): number {
  if (nums.length === 0) return 0;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

type DialogueSample = { chapter: number; character_id: string | null; text: string };

function extractDialogueSamples(chapterText: string, chapter: number): Array<{ chapter: number; start: number; end: number; text: string }> {
  const out: Array<{ chapter: number; start: number; end: number; text: string }> = [];
  const re = /“([^”]{2,2000})”|「([^」]{2,2000})」|"([^"]{2,2000})"/gu;
  for (const m of chapterText.matchAll(re)) {
    const raw = (m[1] ?? m[2] ?? m[3] ?? "").trim();
    const text = raw.replace(/\s+/gu, " ");
    if (text.length < 2) continue;
    const idx = m.index ?? -1;
    if (idx < 0) continue;
    out.push({ chapter, start: idx, end: idx + (m[0] ?? "").length, text });
  }
  return out;
}

function attributeSpeaker(args: {
  chapterText: string;
  sample: { start: number; end: number };
  characterVariants: Map<string, string[]>;
}): string | null {
  const before = Math.max(0, args.sample.start - 24);
  const after = Math.min(args.chapterText.length, args.sample.end + 24);
  const ctx = args.chapterText.slice(before, after);

  const matched: string[] = [];
  for (const [id, variants] of args.characterVariants) {
    const ok = variants.some((v) => v.length >= 2 && ctx.includes(v));
    if (ok) matched.push(id);
    if (matched.length > 1) return null;
  }
  return matched.length === 1 ? matched[0] ?? null : null;
}

function computeSignaturePhrases(dialogues: string[]): string[] {
  const candidates = [
    "哈哈",
    "呵呵",
    "哼",
    "嗯",
    "唉",
    "哎",
    "呃",
    "咳",
    "喂",
    "嘿",
    "啧",
    "呀",
    "啊",
    "呢",
    "吧",
    "嘛",
    "哟"
  ];
  const counts = new Map<string, number>();
  for (const d of dialogues) {
    for (const c of candidates) {
      const hits = countSubstring(d, c);
      if (hits > 0) counts.set(c, (counts.get(c) ?? 0) + hits);
    }
  }

  const scored = Array.from(counts.entries())
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0], "zh"));

  return scored.slice(0, 8).map(([t]) => t);
}

function computeVoiceMetrics(dialogues: string[]): CharacterVoiceMetrics {
  const lens: number[] = [];
  const sentenceLens: number[] = [];
  let exclamations = 0;
  let questions = 0;
  let ellipsis = 0;

  for (const d of dialogues) {
    const len = countNonWhitespaceChars(d);
    lens.push(len);
    exclamations += countSubstring(d, "!") + countSubstring(d, "！");
    questions += countSubstring(d, "?") + countSubstring(d, "？");
    ellipsis += countSubstring(d, "…") + countSubstring(d, "...");

    const parts = d.split(/[。！？!?]+/u).map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length === 0) {
      sentenceLens.push(len);
    } else {
      for (const p of parts) sentenceLens.push(countNonWhitespaceChars(p));
    }
  }

  lens.sort((a, b) => a - b);
  sentenceLens.sort((a, b) => a - b);

  const dialogueChars = lens.reduce((a, b) => a + b, 0);
  const exclamationPer100 = dialogueChars > 0 ? (exclamations * 100) / dialogueChars : 0;
  const questionPer100 = dialogueChars > 0 ? (questions * 100) / dialogueChars : 0;
  const ellipsisPer100 = dialogueChars > 0 ? (ellipsis * 100) / dialogueChars : 0;

  return {
    dialogue_samples: dialogues.length,
    dialogue_chars: dialogueChars,
    dialogue_len_avg: average(lens),
    dialogue_len_p25: percentileInt(lens, 0.25),
    dialogue_len_p50: percentileInt(lens, 0.5),
    dialogue_len_p75: percentileInt(lens, 0.75),
    sentence_len_avg: average(sentenceLens),
    sentence_len_p25: percentileInt(sentenceLens, 0.25),
    sentence_len_p50: percentileInt(sentenceLens, 0.5),
    sentence_len_p75: percentileInt(sentenceLens, 0.75),
    exclamation_per_100_chars: exclamationPer100,
    question_per_100_chars: questionPer100,
    ellipsis_per_100_chars: ellipsisPer100
  };
}

async function loadCharacterDisplayNameMap(rootDir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const stateAbs = join(rootDir, "state/current-state.json");
  if (!(await pathExists(stateAbs))) return out;
  let raw: unknown;
  try {
    raw = await readJsonFile(stateAbs);
  } catch {
    return out;
  }
  if (!isPlainObject(raw)) return out;
  const obj = raw as Record<string, unknown>;
  const characters = obj.characters;
  if (!isPlainObject(characters)) return out;
  for (const [id, v] of Object.entries(characters as Record<string, unknown>)) {
    if (!isPlainObject(v)) continue;
    const dn = safeString((v as Record<string, unknown>).display_name);
    if (!dn) continue;
    out.set(id, dn);
  }
  return out;
}

function normalizeThresholds(raw: unknown, label: string): CharacterVoiceThresholds {
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${PROFILES_REL}: '${label}' must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const num = (k: string): number => {
    const v = safeNumber(obj[k]);
    if (v === null) throw new NovelCliError(`Invalid ${PROFILES_REL}: '${label}.${k}' must be a finite number.`, 2);
    return v;
  };

  const ratioLow = num("avg_dialogue_chars_ratio_low");
  const ratioHigh = num("avg_dialogue_chars_ratio_high");
  if (ratioLow <= 0 || ratioHigh <= 0 || ratioLow > ratioHigh) {
    throw new NovelCliError(`Invalid ${PROFILES_REL}: '${label}.avg_dialogue_chars_ratio_*' must satisfy 0 < low <= high.`, 2);
  }

  const exDelta = num("exclamation_per_100_chars_delta");
  const qDelta = num("question_per_100_chars_delta");
  const eDelta = num("ellipsis_per_100_chars_delta");
  if (exDelta < 0 || qDelta < 0 || eDelta < 0) {
    throw new NovelCliError(`Invalid ${PROFILES_REL}: '${label}.*_delta' must be >= 0.`, 2);
  }

  const overlapMin = num("signature_overlap_min");
  if (overlapMin < 0 || overlapMin > 1) {
    throw new NovelCliError(`Invalid ${PROFILES_REL}: '${label}.signature_overlap_min' must be in [0, 1].`, 2);
  }

  return {
    avg_dialogue_chars_ratio_low: ratioLow,
    avg_dialogue_chars_ratio_high: ratioHigh,
    exclamation_per_100_chars_delta: exDelta,
    question_per_100_chars_delta: qDelta,
    ellipsis_per_100_chars_delta: eDelta,
    signature_overlap_min: overlapMin
  };
}

export async function loadCharacterVoiceProfiles(rootDir: string): Promise<{ profiles: CharacterVoiceProfilesFile | null; warnings: string[]; rel: string }> {
  const rel = PROFILES_REL;
  const abs = join(rootDir, rel);
  if (!(await pathExists(abs))) return { profiles: null, warnings: [], rel };

  const raw = await readJsonFile(abs);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${rel}: expected a JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  const comments = pickCommentFields(obj);

  if (obj.schema_version === undefined) throw new NovelCliError(`Invalid ${rel}: missing required 'schema_version'.`, 2);
  if (obj.schema_version !== 1) throw new NovelCliError(`Invalid ${rel}: 'schema_version' must be 1.`, 2);

  const created_at = safeString(obj.created_at);
  if (!created_at) throw new NovelCliError(`Invalid ${rel}: missing required 'created_at'.`, 2);

  const selectionRaw = obj.selection;
  if (!isPlainObject(selectionRaw)) throw new NovelCliError(`Invalid ${rel}: missing required 'selection' object.`, 2);
  const selectionObj = selectionRaw as Record<string, unknown>;
  const protagonist_id = safeString(selectionObj.protagonist_id);
  if (!protagonist_id) throw new NovelCliError(`Invalid ${rel}: selection.protagonist_id must be a non-empty string.`, 2);
  const core_cast_ids = normalizeStringIds(selectionObj.core_cast_ids);

  const warnings: string[] = [];

  let policy: CharacterVoicePolicy = { ...DEFAULT_POLICY };
  if (obj.policy !== undefined) {
    if (!isPlainObject(obj.policy)) {
      warnings.push("Character voice profiles: ignoring invalid 'policy' (expected object).");
    } else {
      const p = obj.policy as Record<string, unknown>;
      const window_chapters = safeInt(p.window_chapters);
      const min_dialogue_samples = safeInt(p.min_dialogue_samples);
      const drift_thresholds = p.drift_thresholds;
      const recovery_thresholds = p.recovery_thresholds;
      if (window_chapters === null || window_chapters < 1) {
        warnings.push("Character voice profiles: invalid policy.window_chapters; defaulted.");
      } else {
        policy.window_chapters = window_chapters;
      }
      if (min_dialogue_samples === null || min_dialogue_samples < 1) {
        warnings.push("Character voice profiles: invalid policy.min_dialogue_samples; defaulted.");
      } else {
        policy.min_dialogue_samples = min_dialogue_samples;
      }
      try {
        if (drift_thresholds !== undefined) policy.drift_thresholds = normalizeThresholds(drift_thresholds, "policy.drift_thresholds");
        if (recovery_thresholds !== undefined) policy.recovery_thresholds = normalizeThresholds(recovery_thresholds, "policy.recovery_thresholds");
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Character voice profiles: invalid thresholds; defaulted. ${message}`);
        policy = { ...DEFAULT_POLICY };
      }
    }
  }

  if (!Array.isArray(obj.profiles)) throw new NovelCliError(`Invalid ${rel}: missing required 'profiles' array.`, 2);

  const profiles: CharacterVoiceProfile[] = [];
  for (const it of obj.profiles) {
    if (!isPlainObject(it)) continue;
    const po = it as Record<string, unknown>;
    const entryComments = pickCommentFields(po);
    const character_id = safeString(po.character_id);
    const display_name = safeString(po.display_name);
    if (!character_id || !display_name) {
      warnings.push("Character voice profiles: dropped invalid profile entry missing character_id/display_name.");
      continue;
    }
    const name_variants = normalizeStringIds(po.name_variants);

    const baselineRaw = po.baseline_range;
    if (!isPlainObject(baselineRaw)) {
      warnings.push(`Character voice profiles: dropped '${character_id}' profile missing baseline_range.`);
      continue;
    }
    const br = baselineRaw as Record<string, unknown>;
    const chapter_start = safeInt(br.chapter_start);
    const chapter_end = safeInt(br.chapter_end);
    if (chapter_start === null || chapter_start < 1 || chapter_end === null || chapter_end < chapter_start) {
      warnings.push(`Character voice profiles: dropped '${character_id}' profile with invalid baseline_range.`);
      continue;
    }

    const metricsRaw = po.baseline_metrics;
    if (!isPlainObject(metricsRaw)) {
      warnings.push(`Character voice profiles: dropped '${character_id}' profile missing baseline_metrics.`);
      continue;
    }
    const mo = metricsRaw as Record<string, unknown>;
    const metrics: CharacterVoiceMetrics = {
      dialogue_samples: safeInt(mo.dialogue_samples) ?? 0,
      dialogue_chars: safeInt(mo.dialogue_chars) ?? 0,
      dialogue_len_avg: safeNumber(mo.dialogue_len_avg) ?? 0,
      dialogue_len_p25: safeInt(mo.dialogue_len_p25) ?? 0,
      dialogue_len_p50: safeInt(mo.dialogue_len_p50) ?? 0,
      dialogue_len_p75: safeInt(mo.dialogue_len_p75) ?? 0,
      sentence_len_avg: safeNumber(mo.sentence_len_avg) ?? 0,
      sentence_len_p25: safeInt(mo.sentence_len_p25) ?? 0,
      sentence_len_p50: safeInt(mo.sentence_len_p50) ?? 0,
      sentence_len_p75: safeInt(mo.sentence_len_p75) ?? 0,
      exclamation_per_100_chars: safeNumber(mo.exclamation_per_100_chars) ?? 0,
      question_per_100_chars: safeNumber(mo.question_per_100_chars) ?? 0,
      ellipsis_per_100_chars: safeNumber(mo.ellipsis_per_100_chars) ?? 0
    };

    const signature_phrases = normalizeStringIds(po.signature_phrases);
    if (signature_phrases.length === 0) warnings.push(`Character voice profiles: '${character_id}' has empty signature_phrases.`);

    const taboo_phrases = normalizeStringIds(po.taboo_phrases);

    profiles.push({
      ...entryComments,
      character_id,
      display_name,
      ...(name_variants.length > 0 ? { name_variants } : {}),
      baseline_range: { chapter_start, chapter_end },
      baseline_metrics: metrics,
      signature_phrases,
      ...(taboo_phrases.length > 0 ? { taboo_phrases } : {})
    });
  }

  // Stable ordering: protagonist first, then core cast, then the rest.
  const order = [protagonist_id, ...core_cast_ids];
  profiles.sort((a, b) => {
    const ia = order.indexOf(a.character_id);
    const ib = order.indexOf(b.character_id);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return a.character_id.localeCompare(b.character_id, "en");
  });

  return {
    rel,
    warnings,
    profiles: {
      $schema: typeof obj.$schema === "string" ? obj.$schema : "schemas/character-voice-profiles.schema.json",
      schema_version: 1,
      created_at,
      selection: { protagonist_id, ...(core_cast_ids.length > 0 ? { core_cast_ids } : {}) },
      policy,
      profiles,
      ...comments
    }
  };
}

async function loadChaptersDialogues(args: {
  rootDir: string;
  chapterRange: { start: number; end: number };
  characterVariants: Map<string, string[]>;
  warnings: string[];
}): Promise<DialogueSample[]> {
  const samples: DialogueSample[] = [];
  for (let chapter = args.chapterRange.start; chapter <= args.chapterRange.end; chapter += 1) {
    const rel = `chapters/chapter-${pad3(chapter)}.md`;
    const abs = resolveProjectRelativePath(args.rootDir, rel, "chapterRel");
    if (!(await pathExists(abs))) {
      args.warnings.push(`Character voice: missing chapter file: ${rel}`);
      continue;
    }
    let text: string;
    try {
      text = await readTextFile(abs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      args.warnings.push(`Character voice: failed to read chapter file: ${rel}. ${message}`);
      continue;
    }

    const extracted = extractDialogueSamples(text, chapter);
    for (const it of extracted) {
      const character_id = attributeSpeaker({ chapterText: text, sample: it, characterVariants: args.characterVariants });
      samples.push({ chapter, character_id, text: it.text });
    }
  }
  return samples;
}

function buildVariantMap(profiles: Array<Pick<CharacterVoiceProfile, "character_id" | "display_name" | "name_variants">>): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const p of profiles) {
    const variants = new Set<string>();
    if (p.display_name) variants.add(p.display_name);
    for (const v of p.name_variants ?? []) variants.add(v);
    m.set(p.character_id, Array.from(variants.values()).filter((v) => v.trim().length > 0));
  }
  return m;
}

export async function buildCharacterVoiceProfiles(args: {
  rootDir: string;
  protagonistId: string;
  coreCastIds: string[];
  baselineRange: { start: number; end: number };
  windowChapters?: number;
}): Promise<{ profiles: CharacterVoiceProfilesFile; warnings: string[]; rel: string }> {
  const protagonistId = safeString(args.protagonistId);
  if (!protagonistId) throw new NovelCliError(`Invalid protagonistId: must be a non-empty string.`, 2);

  const coreCastIds = Array.from(new Set(args.coreCastIds.map((s) => s.trim()).filter((s) => s.length > 0)));

  const start = args.baselineRange.start;
  const end = args.baselineRange.end;
  if (!Number.isInteger(start) || start < 1) throw new NovelCliError(`Invalid baselineRange.start: ${String(start)} (expected int >= 1).`, 2);
  if (!Number.isInteger(end) || end < start) throw new NovelCliError(`Invalid baselineRange.end: ${String(end)} (expected int >= start=${start}).`, 2);

  const warnings: string[] = [];
  const displayNames = await loadCharacterDisplayNameMap(args.rootDir);

  const trackedIds = [protagonistId, ...coreCastIds].filter((v, i, a) => a.indexOf(v) === i);
  const profiles: CharacterVoiceProfile[] = [];

  const policy: CharacterVoicePolicy = {
    ...DEFAULT_POLICY,
    ...(typeof args.windowChapters === "number" && Number.isInteger(args.windowChapters) && args.windowChapters >= 1
      ? { window_chapters: args.windowChapters }
      : {})
  };

  // Prepare profiles list with display names first (used for speaker attribution).
  const stubProfiles = trackedIds.map((id) => {
    const dn = displayNames.get(id) ?? id;
    return { character_id: id, display_name: dn, name_variants: [dn] };
  });
  const variants = buildVariantMap(stubProfiles);

  const samples = await loadChaptersDialogues({
    rootDir: args.rootDir,
    chapterRange: { start, end },
    characterVariants: variants,
    warnings
  });

  for (const p of stubProfiles) {
    const dialogues = samples.filter((s) => s.character_id === p.character_id).map((s) => s.text);
    const baseline_metrics = computeVoiceMetrics(dialogues);
    const signature_phrases = computeSignaturePhrases(dialogues);
    if (baseline_metrics.dialogue_samples < policy.min_dialogue_samples) {
      warnings.push(
        `Character voice: '${p.character_id}' baseline has only ${baseline_metrics.dialogue_samples} dialogue samples (< min_dialogue_samples=${policy.min_dialogue_samples}).`
      );
    }
    profiles.push({
      character_id: p.character_id,
      display_name: p.display_name,
      name_variants: p.name_variants,
      baseline_range: { chapter_start: start, chapter_end: end },
      baseline_metrics,
      signature_phrases,
      taboo_phrases: []
    });
  }

  // Stable order: protagonist first.
  profiles.sort((a, b) => {
    if (a.character_id === protagonistId) return -1;
    if (b.character_id === protagonistId) return 1;
    const ia = coreCastIds.indexOf(a.character_id);
    const ib = coreCastIds.indexOf(b.character_id);
    if (ia >= 0 || ib >= 0) {
      if (ia < 0) return 1;
      if (ib < 0) return -1;
      return ia - ib;
    }
    return a.character_id.localeCompare(b.character_id, "en");
  });

  const now = new Date().toISOString();
  const file: CharacterVoiceProfilesFile = {
    $schema: "schemas/character-voice-profiles.schema.json",
    schema_version: 1,
    created_at: now,
    selection: { protagonist_id: protagonistId, ...(coreCastIds.length > 0 ? { core_cast_ids: coreCastIds } : {}) },
    policy,
    profiles
  };

  return { profiles: file, warnings, rel: PROFILES_REL };
}

function jaccard(a: string[], b: string[]): number | null {
  const aa = new Set(a.filter((s) => s.trim().length > 0));
  const bb = new Set(b.filter((s) => s.trim().length > 0));
  if (aa.size === 0 && bb.size === 0) return null;
  const inter = Array.from(aa.values()).filter((v) => bb.has(v)).length;
  const union = new Set([...aa.values(), ...bb.values()]).size;
  return union === 0 ? null : inter / union;
}

function metricsWithinThresholds(args: {
  baseline: CharacterVoiceMetrics;
  current: CharacterVoiceMetrics;
  baselineSig: string[];
  currentSig: string[];
  thresholds: CharacterVoiceThresholds;
}): { ok: boolean; drifted: Array<{ id: string; baseline: number; current: number; detail: string }> } {
  const out: Array<{ id: string; baseline: number; current: number; detail: string }> = [];
  const ratio = args.baseline.dialogue_len_avg > 0 ? args.current.dialogue_len_avg / args.baseline.dialogue_len_avg : null;
  if (ratio !== null && (ratio < args.thresholds.avg_dialogue_chars_ratio_low || ratio > args.thresholds.avg_dialogue_chars_ratio_high)) {
    out.push({
      id: "avg_dialogue_chars_ratio",
      baseline: args.baseline.dialogue_len_avg,
      current: args.current.dialogue_len_avg,
      detail: `ratio=${ratio.toFixed(2)} (allowed ${args.thresholds.avg_dialogue_chars_ratio_low.toFixed(2)}..${args.thresholds.avg_dialogue_chars_ratio_high.toFixed(
        2
      )})`
    });
  }

  const exDelta = Math.abs(args.current.exclamation_per_100_chars - args.baseline.exclamation_per_100_chars);
  if (exDelta > args.thresholds.exclamation_per_100_chars_delta) {
    out.push({
      id: "exclamation_per_100_chars_delta",
      baseline: args.baseline.exclamation_per_100_chars,
      current: args.current.exclamation_per_100_chars,
      detail: `abs_delta=${exDelta.toFixed(2)} (> ${args.thresholds.exclamation_per_100_chars_delta.toFixed(2)})`
    });
  }

  const qDelta = Math.abs(args.current.question_per_100_chars - args.baseline.question_per_100_chars);
  if (qDelta > args.thresholds.question_per_100_chars_delta) {
    out.push({
      id: "question_per_100_chars_delta",
      baseline: args.baseline.question_per_100_chars,
      current: args.current.question_per_100_chars,
      detail: `abs_delta=${qDelta.toFixed(2)} (> ${args.thresholds.question_per_100_chars_delta.toFixed(2)})`
    });
  }

  const eDelta = Math.abs(args.current.ellipsis_per_100_chars - args.baseline.ellipsis_per_100_chars);
  if (eDelta > args.thresholds.ellipsis_per_100_chars_delta) {
    out.push({
      id: "ellipsis_per_100_chars_delta",
      baseline: args.baseline.ellipsis_per_100_chars,
      current: args.current.ellipsis_per_100_chars,
      detail: `abs_delta=${eDelta.toFixed(2)} (> ${args.thresholds.ellipsis_per_100_chars_delta.toFixed(2)})`
    });
  }

  const overlap = jaccard(args.baselineSig, args.currentSig);
  if (overlap !== null && overlap < args.thresholds.signature_overlap_min) {
    out.push({
      id: "signature_overlap",
      baseline: args.thresholds.signature_overlap_min,
      current: overlap,
      detail: `overlap=${overlap.toFixed(2)} (< ${args.thresholds.signature_overlap_min.toFixed(2)})`
    });
  }

  return { ok: out.length === 0, drifted: out };
}

function buildDirectives(args: {
  displayName: string;
  driftedMetrics: Array<{ id: string; baseline: number; current: number; detail: string }>;
  baselineSig: string[];
}): string[] {
  const directives: string[] = [];
  directives.push(`角色「${args.displayName}」：保持台词语气与节奏一致（句长、语气词、标点习惯）。`);

  for (const m of args.driftedMetrics) {
    if (m.id === "avg_dialogue_chars_ratio") {
      if (m.current > m.baseline) directives.push("台词偏长：把长句拆短，减少解释性赘述，更多用行动/反应补足信息。");
      else directives.push("台词偏短：适度补充完整句与内在动机，让表达更符合角色习惯（避免只剩“嗯/行/好”）。");
    } else if (m.id === "exclamation_per_100_chars_delta") {
      if (m.current > m.baseline) directives.push("情绪标点偏激：减少感叹号/怒吼式表达，用更克制的措辞体现情绪。");
      else directives.push("情绪标点偏弱：适度提升情绪起伏，让句尾更有“锋芒/力度”。");
    } else if (m.id === "question_per_100_chars_delta") {
      if (m.current > m.baseline) directives.push("反问偏多：减少连续追问与质询式台词，避免角色变成审问机器。");
      else directives.push("反问偏少：必要时加入一两句追问/质疑，保留角色的压迫感或好奇心。");
    } else if (m.id === "ellipsis_per_100_chars_delta") {
      if (m.current > m.baseline) directives.push("拖沓停顿偏多：减少省略号/拖音，避免台词显得犹豫或灌水。");
      else directives.push("停顿偏少：需要时加入自然停顿/留白，让台词更像“人在说话”。");
    } else if (m.id === "signature_overlap") {
      const sig = args.baselineSig.slice(0, 3);
      if (sig.length > 0) directives.push(`口癖回归：适度加入其常用表达/语气词（例如：${sig.join("、")}），但不要堆叠。`);
      else directives.push("口癖回归：回忆该角色常用的语气词/习惯句式，并在关键对话中自然出现。");
    }
  }

  return directives;
}

function pickEvidence(args: { samples: Array<{ chapter: number; text: string }>; driftedMetricIds: string[] }): Array<{ chapter: number; excerpt: string }> {
  if (args.samples.length === 0) return [];
  const score = (s: { chapter: number; text: string }): number => {
    const len = countNonWhitespaceChars(s.text);
    const ex = countSubstring(s.text, "!") + countSubstring(s.text, "！");
    const q = countSubstring(s.text, "?") + countSubstring(s.text, "？");
    const e = countSubstring(s.text, "…") + countSubstring(s.text, "...");
    // Prefer samples relevant to drift types.
    let base = len;
    if (args.driftedMetricIds.includes("exclamation_per_100_chars_delta")) base += ex * 30;
    if (args.driftedMetricIds.includes("question_per_100_chars_delta")) base += q * 25;
    if (args.driftedMetricIds.includes("ellipsis_per_100_chars_delta")) base += e * 15;
    return base;
  };

  const sorted = args.samples.slice().sort((a, b) => score(b) - score(a) || b.chapter - a.chapter);
  return sorted.slice(0, 3).map((s) => ({ chapter: s.chapter, excerpt: snippet(s.text, 140) }));
}

export async function loadActiveCharacterVoiceDriftIds(rootDir: string): Promise<Set<string>> {
  const abs = join(rootDir, DRIFT_REL);
  if (!(await pathExists(abs))) return new Set<string>();
  let raw: unknown;
  try {
    raw = await readJsonFile(abs);
  } catch {
    return new Set<string>();
  }
  if (!isPlainObject(raw)) return new Set<string>();
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return new Set<string>();
  const chars = obj.characters;
  if (!Array.isArray(chars)) return new Set<string>();
  const ids = new Set<string>();
  for (const it of chars) {
    if (!isPlainObject(it)) continue;
    const id = safeString((it as Record<string, unknown>).character_id);
    if (id) ids.add(id);
  }
  return ids;
}

export async function computeCharacterVoiceDrift(args: {
  rootDir: string;
  profiles: CharacterVoiceProfilesFile;
  asOfChapter: number;
  volume: number;
  previousActiveCharacterIds?: Set<string>;
}): Promise<{ drift: CharacterVoiceDriftFile | null; activeCharacterIds: Set<string>; warnings: string[] }> {
  if (!Number.isInteger(args.asOfChapter) || args.asOfChapter < 1) {
    throw new Error(`Invalid asOfChapter: ${String(args.asOfChapter)} (expected int >= 1).`);
  }
  if (!Number.isInteger(args.volume) || args.volume < 0) throw new Error(`Invalid volume: ${String(args.volume)} (expected int >= 0).`);

  const warnings: string[] = [];
  const policy = args.profiles.policy ?? DEFAULT_POLICY;
  const windowChapters = policy.window_chapters ?? DEFAULT_POLICY.window_chapters;
  const start = Math.max(1, args.asOfChapter - windowChapters + 1);
  const end = args.asOfChapter;

  const characterVariants = buildVariantMap(args.profiles.profiles);
  const rawSamples = await loadChaptersDialogues({
    rootDir: args.rootDir,
    chapterRange: { start, end },
    characterVariants,
    warnings
  });

  const previousActive = args.previousActiveCharacterIds ?? new Set<string>();
  const activeCharacterIds = new Set<string>();
  const driftedCharacters: CharacterVoiceDriftCharacter[] = [];

  for (const p of args.profiles.profiles) {
    const baseline = p.baseline_metrics;
    const baselineSig = p.signature_phrases ?? [];

    const currentDialogues = rawSamples.filter((s) => s.character_id === p.character_id).map((s) => s.text);
    const currentSamples = rawSamples.filter((s) => s.character_id === p.character_id).map((s) => ({ chapter: s.chapter, text: s.text }));

    const current = computeVoiceMetrics(currentDialogues);
    const currentSig = computeSignaturePhrases(currentDialogues);

    const enough = baseline.dialogue_samples >= policy.min_dialogue_samples && current.dialogue_samples >= policy.min_dialogue_samples;
    const wasActive = previousActive.has(p.character_id);

    if (!enough && !wasActive) {
      if (current.dialogue_samples > 0) {
        warnings.push(
          `Character voice: insufficient dialogue samples for '${p.character_id}' in window (baseline=${baseline.dialogue_samples}, current=${current.dialogue_samples}, min=${policy.min_dialogue_samples}).`
        );
      }
      continue;
    }

    const thresholds = wasActive ? policy.recovery_thresholds : policy.drift_thresholds;
    const check = metricsWithinThresholds({ baseline, current, baselineSig, currentSig, thresholds });
    const isOk = enough ? check.ok : false;
    const isActive = wasActive ? !isOk : !check.ok;

    if (!isActive) continue;

    activeCharacterIds.add(p.character_id);
    const overlap = jaccard(baselineSig, currentSig);
    const driftedMetricIds = check.drifted.map((m) => m.id);
    const evidence = pickEvidence({ samples: currentSamples, driftedMetricIds });
    const directives = buildDirectives({ displayName: p.display_name, driftedMetrics: check.drifted, baselineSig });

    if (!enough) directives.unshift("（数据不足）本窗口该角色台词样本偏少：请在后续章节增加少量该角色对白以便复核漂移恢复。");

    driftedCharacters.push({
      character_id: p.character_id,
      display_name: p.display_name,
      drifted_metrics: check.drifted,
      signature_phrases: { baseline: baselineSig, current: currentSig, overlap },
      baseline_metrics: baseline,
      current_metrics: current,
      evidence,
      directives
    });
  }

  if (driftedCharacters.length === 0) {
    return { drift: null, activeCharacterIds, warnings };
  }

  const drift: CharacterVoiceDriftFile = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    as_of: { chapter: args.asOfChapter, volume: args.volume },
    window: { chapter_start: start, chapter_end: end, window_chapters: windowChapters },
    profiles_path: PROFILES_REL,
    characters: driftedCharacters
  };

  return { drift, activeCharacterIds, warnings };
}

export async function writeCharacterVoiceDriftFile(args: { rootDir: string; drift: CharacterVoiceDriftFile }): Promise<{ rel: string }> {
  const rel = DRIFT_REL;
  const abs = join(args.rootDir, rel);
  await ensureDir(dirname(abs));

  const dirAbs = dirname(abs);
  const tmpAbs = join(dirAbs, `.tmp-character-voice-drift-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeJsonFile(tmpAbs, args.drift);
  try {
    await rename(tmpAbs, abs);
  } finally {
    await rm(tmpAbs, { force: true }).catch(() => {});
  }

  return { rel };
}

export async function writeCharacterVoiceProfilesFile(args: { rootDir: string; profiles: CharacterVoiceProfilesFile }): Promise<{ rel: string }> {
  const rel = PROFILES_REL;
  const abs = join(args.rootDir, rel);
  await ensureDir(dirname(abs));

  const dirAbs = dirname(abs);
  const tmpAbs = join(dirAbs, `.tmp-character-voice-profiles-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
  await writeJsonFile(tmpAbs, args.profiles);
  try {
    await rename(tmpAbs, abs);
  } finally {
    await rm(tmpAbs, { force: true }).catch(() => {});
  }

  return { rel };
}

export async function clearCharacterVoiceDriftFile(rootDir: string): Promise<boolean> {
  const abs = join(rootDir, DRIFT_REL);
  if (!(await pathExists(abs))) return false;
  await removePath(abs);
  return true;
}
