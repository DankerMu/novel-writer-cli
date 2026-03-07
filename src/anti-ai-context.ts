import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { pathExists, readJsonFile, readTextFile } from "./fs-utils.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { isPlainObject } from "./type-guards.js";

const execFileAsync = promisify(execFile);
const cliRootDir = join(dirname(fileURLToPath(import.meta.url)), "..");

type StatisticalLevel = "high" | "medium" | "low";
type CanonicalGenre = "xuanhuan" | "dushi" | "scifi" | "history" | "suspense" | "romance" | "horror";

type BlacklistLintHit = {
  word: string;
  count: number;
  category?: string | null;
};

type BlacklistLintReport = {
  hits_per_kchars: number;
  hits?: BlacklistLintHit[];
  statistical_profile?: {
    blacklist_hit_rate?: number;
    narration_connector_count?: number;
  };
};

type StructuralLintViolation = {
  rule_id: string;
  severity: "warning" | "error";
  location?: {
    line?: number;
    char_start?: number;
    char_end?: number;
    paragraph_index?: number;
  };
  description: string;
  suggestion?: string;
};

type StructuralLintReport = {
  violations?: StructuralLintViolation[];
};

export type AntiAiStatisticalTargets = {
  source: { style_profile: string; brief?: string };
  sentence_length_std_dev: {
    target: number | null;
    fallback_range: [number, number];
    fallback_applied: boolean;
  };
  paragraph_length_cv: {
    target: number | null;
    fallback_range: [number, number];
    fallback_applied: boolean;
  };
  vocabulary_diversity: {
    target: StatisticalLevel;
    source_field: "vocabulary_richness";
    fallback_applied: boolean;
  };
  narration_connectors: {
    target: 0;
    source_field: "ai-blacklist.category_metadata.narration_connector";
    fallback_applied: false;
    note: string;
  };
  register_mixing: {
    target: StatisticalLevel;
    fallback_applied: boolean;
  };
  emotional_arc: {
    target: StatisticalLevel;
    source_field: "emotional_volatility";
    fallback_applied: boolean;
  };
};

export type AntiAiGenreOverrides = {
  genre: CanonicalGenre;
  source: { brief: string; mode: "brief_override_notes" | "brief_genre_fallback" };
  explicit_notes: string | null;
  paragraph_structure: {
    single_sentence_ratio: { min: number; max: number };
    max_paragraph_chars: number;
  };
  punctuation_rhythm: {
    ellipsis_max_per_chapter: number;
    exclamation_max_per_chapter: number;
    em_dash_max_per_chapter: 0;
  };
  notes: string[];
};

type AntiAiGenreOverridePreset = Omit<AntiAiGenreOverrides, "source" | "explicit_notes">;

export type AntiAiStatisticalProfile = {
  source: "deterministic_lint+heuristic";
  chapter_path: string;
  blacklist_hit_rate: number | null;
  sentence_repetition_rate: number;
  sentence_length_std_dev: number;
  paragraph_length_cv: number;
  vocabulary_diversity_score: number;
  vocabulary_richness_estimate: StatisticalLevel;
  narration_connector_count: number | null;
  humanize_technique_variety: number;
};

export type AntiAiJudgeContext = {
  blacklistLint: Record<string, unknown> | null;
  structuralRuleViolations: StructuralLintViolation[] | null;
  statisticalProfile: AntiAiStatisticalProfile | null;
  degraded: { blacklist_lint?: boolean; structural_rule_violations?: boolean };
};

const GENRE_ALIASES: Record<string, CanonicalGenre> = {
  xuanhuan: "xuanhuan",
  "玄幻": "xuanhuan",
  dushi: "dushi",
  "都市": "dushi",
  scifi: "scifi",
  sci_fi: "scifi",
  "sci-fi": "scifi",
  "科幻": "scifi",
  history: "history",
  "历史": "history",
  suspense: "suspense",
  mystery: "suspense",
  "悬疑": "suspense",
  romance: "romance",
  "言情": "romance",
  horror: "horror",
  "恐怖": "horror"
};

const DEFAULT_SINGLE_SENTENCE_RATIO = { min: 0.25, max: 0.45 } as const;
const DEFAULT_MAX_PARAGRAPH_CHARS = 100;
const DEFAULT_ELLIPSIS_MAX = 5;
const DEFAULT_EXCLAMATION_MAX = 8;

const GENRE_OVERRIDE_PRESETS: Record<CanonicalGenre, AntiAiGenreOverridePreset> = {
  xuanhuan: {
    genre: "xuanhuan",
    paragraph_structure: { single_sentence_ratio: { ...DEFAULT_SINGLE_SENTENCE_RATIO }, max_paragraph_chars: DEFAULT_MAX_PARAGRAPH_CHARS },
    punctuation_rhythm: { ellipsis_max_per_chapter: DEFAULT_ELLIPSIS_MAX, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["未命中特定类型覆写，使用默认人类写作阈值。"]
  },
  dushi: {
    genre: "dushi",
    paragraph_structure: { single_sentence_ratio: { ...DEFAULT_SINGLE_SENTENCE_RATIO }, max_paragraph_chars: DEFAULT_MAX_PARAGRAPH_CHARS },
    punctuation_rhythm: { ellipsis_max_per_chapter: DEFAULT_ELLIPSIS_MAX, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["未命中特定类型覆写，使用默认人类写作阈值。"]
  },
  history: {
    genre: "history",
    paragraph_structure: { single_sentence_ratio: { ...DEFAULT_SINGLE_SENTENCE_RATIO }, max_paragraph_chars: DEFAULT_MAX_PARAGRAPH_CHARS },
    punctuation_rhythm: { ellipsis_max_per_chapter: DEFAULT_ELLIPSIS_MAX, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["未命中特定类型覆写，使用默认人类写作阈值。"]
  },
  scifi: {
    genre: "scifi",
    paragraph_structure: { single_sentence_ratio: { min: 0.15, max: 0.3 }, max_paragraph_chars: 120 },
    punctuation_rhythm: { ellipsis_max_per_chapter: DEFAULT_ELLIPSIS_MAX, exclamation_max_per_chapter: 5, em_dash_max_per_chapter: 0 },
    notes: ["科幻允许更长单段，但感叹号收紧到 ≤5/章。", "“难以形容 / 不可名状”仅可灰度出现，建议 ≤2/章且尽量补具体感官。"]
  },
  suspense: {
    genre: "suspense",
    paragraph_structure: { single_sentence_ratio: { min: 0.2, max: 0.35 }, max_paragraph_chars: 100 },
    punctuation_rhythm: { ellipsis_max_per_chapter: 8, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["悬疑强调断点与停顿，允许省略号 ≤8/章。"]
  },
  horror: {
    genre: "horror",
    paragraph_structure: { single_sentence_ratio: { min: 0.3, max: 0.5 }, max_paragraph_chars: DEFAULT_MAX_PARAGRAPH_CHARS },
    punctuation_rhythm: { ellipsis_max_per_chapter: 8, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["恐怖允许更碎的呼吸感，但不能靠标点堆恐惧。"]
  },
  romance: {
    genre: "romance",
    paragraph_structure: { single_sentence_ratio: { ...DEFAULT_SINGLE_SENTENCE_RATIO }, max_paragraph_chars: DEFAULT_MAX_PARAGRAPH_CHARS },
    punctuation_rhythm: { ellipsis_max_per_chapter: DEFAULT_ELLIPSIS_MAX, exclamation_max_per_chapter: DEFAULT_EXCLAMATION_MAX, em_dash_max_per_chapter: 0 },
    notes: ["言情沿用默认阈值，重点依赖语气差异和情感回收。"]
  }
};

function normalizeProjectGenre(raw: unknown): CanonicalGenre | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const withoutParens = trimmed.replace(/[（(].*$/u, "").trim();
  if (withoutParens.length === 0) return null;
  const compact = withoutParens.replace(/\s+/gu, "");
  return GENRE_ALIASES[withoutParens] ?? GENRE_ALIASES[compact] ?? GENRE_ALIASES[compact.toLowerCase()] ?? null;
}

async function loadBriefMeta(rootDir: string): Promise<{ genre: CanonicalGenre | null; overrideNotes: string | null }> {
  const briefRel = "brief.md";
  const briefAbs = join(rootDir, briefRel);
  if (!(await pathExists(briefAbs))) return { genre: null, overrideNotes: null };

  try {
    const lines = (await readTextFile(briefAbs)).split(/\r?\n/u);
    let genre: CanonicalGenre | null = null;
    let overrideNotes: string | null = null;
    for (const line of lines) {
      const genreMatch = /^\s*-\s*\*\*(?:题材|Genre)\*\*[:：]\s*(.+?)\s*$/u.exec(line);
      if (genreMatch) genre = normalizeProjectGenre(genreMatch[1] ?? "");
      const overrideMatch = /^\s*-\s*\*\*覆写说明\*\*[:：]\s*(.+?)\s*$/u.exec(line);
      if (overrideMatch) {
        const note = (overrideMatch[1] ?? "").trim();
        if (note.length > 0 && note !== "{genre_override_notes}") overrideNotes = note;
      }
    }
    return { genre, overrideNotes };
  } catch {
    return { genre: null, overrideNotes: null };
  }
}

function asStatisticalLevel(value: unknown): StatisticalLevel | null {
  return value === "high" || value === "medium" || value === "low" ? value : null;
}

function parsePercentRange(note: string, labelPattern: RegExp): { min: number; max: number } | null {
  const match = new RegExp(`${labelPattern.source}[^0-9]*(\\d{1,3})\\s*%\\s*(?:-|–|—|~|～|至|到)\\s*(\\d{1,3})\\s*%`, "u").exec(note);
  if (!match) return null;
  const min = Number(match[1]) / 100;
  const max = Number(match[2]) / 100;
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return null;
  return { min, max };
}

function parseBoundedInt(note: string, labelPattern: RegExp): number | null {
  const match = new RegExp(`${labelPattern.source}[^0-9]*(?:≤|<=|不超过|最多)?\\s*(\\d{1,3})\\s*(?:/章|／章|字|个|次)?`, "u").exec(note);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

function applyExplicitGenreOverrideNotes(base: AntiAiGenreOverridePreset, overrideNotes: string | null): { overrides: AntiAiGenreOverridePreset; applied: boolean } {
  if (!overrideNotes) return { overrides: base, applied: false };

  const singleSentenceRatio = parsePercentRange(overrideNotes, /单句段(?:落)?(?:占比)?/u);
  const paragraphCharMax = parseBoundedInt(overrideNotes, /(?:段长(?:上限)?|段落(?:长度|字数)?(?:上限)?|单段(?:可放宽到)?)/u);
  const ellipsisMax = parseBoundedInt(overrideNotes, /省略号(?:上限)?/u);
  const exclamationMax = parseBoundedInt(overrideNotes, /感叹号(?:上限)?/u);

  let applied = false;
  const overrides: AntiAiGenreOverridePreset = {
    ...base,
    paragraph_structure: {
      ...base.paragraph_structure,
      ...(singleSentenceRatio
        ? { single_sentence_ratio: singleSentenceRatio }
        : {}),
      ...(paragraphCharMax !== null ? { max_paragraph_chars: paragraphCharMax } : {})
    },
    punctuation_rhythm: {
      ...base.punctuation_rhythm,
      ...(ellipsisMax !== null ? { ellipsis_max_per_chapter: ellipsisMax } : {}),
      ...(exclamationMax !== null ? { exclamation_max_per_chapter: exclamationMax } : {})
    }
  };

  if (singleSentenceRatio || paragraphCharMax !== null || ellipsisMax !== null || exclamationMax !== null) {
    applied = true;
  }

  return { overrides, applied };
}

function toStructuralLintConfig(overrides: AntiAiGenreOverrides): Record<string, unknown> {
  return {
    thresholds: {
      l5: {
        single_sentence_ratio: [
          overrides.paragraph_structure.single_sentence_ratio.min,
          overrides.paragraph_structure.single_sentence_ratio.max
        ],
        paragraph_char_max: overrides.paragraph_structure.max_paragraph_chars
      },
      l6: {
        ellipsis_per_chapter_max: overrides.punctuation_rhythm.ellipsis_max_per_chapter,
        exclamation_per_chapter_max: overrides.punctuation_rhythm.exclamation_max_per_chapter,
        em_dash_per_chapter_max: overrides.punctuation_rhythm.em_dash_max_per_chapter
      }
    }
  };
}

export async function loadAntiAiStatisticalTargets(rootDir: string): Promise<AntiAiStatisticalTargets | null> {
  const relPath = "style-profile.json";
  const absPath = join(rootDir, relPath);
  if (!(await pathExists(absPath))) return null;

  try {
    const raw = await readJsonFile(absPath);
    if (!isPlainObject(raw)) return null;
    const obj = raw as Record<string, unknown>;

    const sentenceStd = typeof obj.sentence_length_std_dev === "number" && Number.isFinite(obj.sentence_length_std_dev)
      ? obj.sentence_length_std_dev
      : null;
    const paragraphCv = typeof obj.paragraph_length_cv === "number" && Number.isFinite(obj.paragraph_length_cv)
      ? obj.paragraph_length_cv
      : null;
    const vocabularyRichness = asStatisticalLevel(obj.vocabulary_richness) ?? "medium";
    const registerMixing = asStatisticalLevel(obj.register_mixing) ?? "medium";
    const emotionalVolatility = asStatisticalLevel(obj.emotional_volatility) ?? "medium";

    return {
      source: { style_profile: relPath },
      sentence_length_std_dev: {
        target: sentenceStd,
        fallback_range: [8, 18],
        fallback_applied: sentenceStd === null
      },
      paragraph_length_cv: {
        target: paragraphCv,
        fallback_range: [0.4, 1.2],
        fallback_applied: paragraphCv === null
      },
      vocabulary_diversity: {
        target: vocabularyRichness,
        source_field: "vocabulary_richness",
        fallback_applied: asStatisticalLevel(obj.vocabulary_richness) === null
      },
      narration_connectors: {
        target: 0,
        source_field: "ai-blacklist.category_metadata.narration_connector",
        fallback_applied: false,
        note: "叙述连接词默认按 0 命中控制；style-profile 当前无独立字段，依赖 ai-blacklist + writing_directives。"
      },
      register_mixing: {
        target: registerMixing,
        fallback_applied: asStatisticalLevel(obj.register_mixing) === null
      },
      emotional_arc: {
        target: emotionalVolatility,
        source_field: "emotional_volatility",
        fallback_applied: asStatisticalLevel(obj.emotional_volatility) === null
      }
    };
  } catch {
    return null;
  }
}

export async function loadAntiAiGenreOverrides(rootDir: string): Promise<AntiAiGenreOverrides | null> {
  const brief = await loadBriefMeta(rootDir);
  if (!brief.genre) return null;
  const preset = GENRE_OVERRIDE_PRESETS[brief.genre];
  const { overrides, applied } = applyExplicitGenreOverrideNotes(preset, brief.overrideNotes);
  return {
    ...overrides,
    source: {
      brief: "brief.md",
      mode: applied ? "brief_override_notes" : "brief_genre_fallback"
    },
    explicit_notes: brief.overrideNotes
  };
}

function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gu, "\n")
    .replace(/^\s*#{1,6}\s+.*$/gmu, "")
    .replace(/`[^`]+`/gu, "")
    .replace(/\r\n?/gu, "\n");
}

function countCompactChars(text: string): number {
  return Array.from(text.replace(/\s+/gu, "")).length;
}

function extractParagraphs(text: string): string[] {
  return stripMarkdown(text)
    .split(/\n\s*\n/gu)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function splitSentences(text: string): string[] {
  const normalized = stripMarkdown(text).replace(/\n+/gu, "\n").trim();
  if (normalized.length === 0) return [];
  const matches = normalized.match(/[^。！？!?……]+(?:……|[。！？!?]+)?/gu) ?? [];
  return matches.map((item) => item.trim()).filter((item) => item.length > 0);
}

function coreSentenceLength(sentence: string): number {
  const stripped = sentence.replace(/[，。！？!?；：、“”‘’（）()\[\]{}《》【】…—\-\s]/gu, "");
  return Array.from(stripped).length;
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function coefficientOfVariation(values: number[]): number {
  if (values.length === 0) return 0;
  const avg = mean(values);
  if (avg === 0) return 0;
  return stddev(values) / avg;
}

function collectVocabularyTokens(text: string): string[] {
  const compact = stripMarkdown(text).replace(/\s+/gu, "");
  const segments = compact.match(/[\p{Script=Han}A-Za-z0-9]+/gu) ?? [];
  const tokens: string[] = [];
  for (const segment of segments) {
    const chars = Array.from(segment);
    if (chars.length <= 2) {
      tokens.push(segment);
      continue;
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      tokens.push(`${chars[index]}${chars[index + 1]}`);
    }
  }
  return tokens;
}

function estimateVocabularyRichness(score: number): StatisticalLevel {
  if (score >= 0.45) return "high";
  if (score >= 0.35) return "medium";
  return "low";
}

function sentencePatternSignature(sentence: string): string {
  const length = coreSentenceLength(sentence);
  const bucket = length < 14 ? "short" : length < 28 ? "mid" : "long";
  const hasDialogue = /[“”]/u.test(sentence) ? "dialogue" : "narration";
  const punctuation = sentence.includes("？") || sentence.includes("?") ? "question" : sentence.includes("！") || sentence.includes("!") ? "exclaim" : "plain";
  const connector = /(然而|但是|不过|于是|因此|随后|接着|同时|与此同时)/u.test(sentence) ? "connector" : "plain";
  return `${bucket}|${hasDialogue}|${punctuation}|${connector}`;
}

function computeSentenceRepetitionRate(sentences: string[]): number {
  if (sentences.length < 2) return 0;
  let maxRepeated = 0;
  for (let start = 0; start < sentences.length; start += 1) {
    const window = sentences.slice(start, start + 5);
    if (window.length < 2) continue;
    const counts = new Map<string, number>();
    for (const sentence of window) {
      const signature = sentencePatternSignature(sentence);
      counts.set(signature, (counts.get(signature) ?? 0) + 1);
    }
    let repeated = 0;
    for (const count of counts.values()) {
      if (count > 1) repeated += count - 1;
    }
    if (repeated > maxRepeated) maxRepeated = repeated;
  }
  return maxRepeated;
}

const HUMANIZE_TECHNIQUES: Record<string, RegExp> = {
  thought_interrupt: /……/u,
  self_correction: /(不，|不是，|不对，|准确地说|更准确地说|或者说)/u,
  sensory_trigger: /(闻到|嗅到|听见|听到|看见|摸到|触到|尝到|鼻尖|耳边|指尖|喉咙|后颈)/u,
  mundane_detail: /(锅里|汤|鞋底|袖口|杯沿|桌角|门把手|衣角|碗沿|台阶|水汽|灰尘|汗渍)/u,
  register_shift: /(妈的|见鬼|操|得嘞|行吧|您|阁下|在下|贫道|本座)/u
};

function computeHumanizeTechniqueVariety(text: string): number {
  let count = 0;
  for (const matcher of Object.values(HUMANIZE_TECHNIQUES)) {
    if (matcher.test(text)) count += 1;
  }
  return count;
}

async function findAvailableScriptPath(rootDir: string, scriptRel: string): Promise<string | null> {
  try {
    const candidate = resolveProjectRelativePath(rootDir, scriptRel, scriptRel);
    if (await pathExists(candidate)) return candidate;
  } catch {
    // Fall back to the packaged script path below.
  }

  const packaged = join(cliRootDir, scriptRel);
  return (await pathExists(packaged)) ? packaged : null;
}

async function runJsonScript(rootDir: string, scriptRel: string, args: string[]): Promise<Record<string, unknown> | null> {
  const scriptAbs = await findAvailableScriptPath(rootDir, scriptRel);
  if (!scriptAbs) return null;
  try {
    const { stdout } = await execFileAsync("bash", [scriptAbs, ...args], { cwd: rootDir, maxBuffer: 1024 * 1024 * 8, timeout: 30_000 });
    const raw = JSON.parse(stdout);
    return isPlainObject(raw) ? (raw as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function resolveProjectFileIfSafe(rootDir: string, relPath: string): Promise<string | null> {
  try {
    return resolveProjectRelativePath(rootDir, relPath, relPath);
  } catch {
    return null;
  }
}

async function markJudgeContextDegraded(rootDir: string, degraded: AntiAiJudgeContext["degraded"]): Promise<void> {
  if (await pathExists(join(rootDir, "ai-blacklist.json"))) degraded.blacklist_lint = true;
  if (await findAvailableScriptPath(rootDir, "scripts/lint-structural.sh")) degraded.structural_rule_violations = true;
}

async function runBlacklistLint(rootDir: string, chapterRel: string): Promise<BlacklistLintReport | null> {
  const chapterAbs = await resolveProjectFileIfSafe(rootDir, chapterRel);
  const blacklistRel = "ai-blacklist.json";
  const blacklistAbs = join(rootDir, blacklistRel);
  if (!chapterAbs || !(await pathExists(chapterAbs)) || !(await pathExists(blacklistAbs))) return null;
  const raw = await runJsonScript(rootDir, "scripts/lint-blacklist.sh", [chapterRel, blacklistRel]);
  if (!raw) return null;
  const hits_per_kchars = typeof raw.hits_per_kchars === "number" ? raw.hits_per_kchars : 0;
  const hits = Array.isArray(raw.hits)
    ? raw.hits.filter(isPlainObject).map((item) => ({
        word: typeof item.word === "string" ? item.word : "",
        count: typeof item.count === "number" ? item.count : 0,
        category: typeof item.category === "string" ? item.category : null
      })).filter((item) => item.word.length > 0)
    : [];
  const statistical_profile = isPlainObject(raw.statistical_profile)
    ? {
        blacklist_hit_rate: typeof raw.statistical_profile.blacklist_hit_rate === "number" ? raw.statistical_profile.blacklist_hit_rate : undefined,
        narration_connector_count: typeof raw.statistical_profile.narration_connector_count === "number" ? raw.statistical_profile.narration_connector_count : undefined
      }
    : undefined;
  return { hits_per_kchars, hits, statistical_profile };
}

function toStructuralLintGenre(genre: CanonicalGenre | null): string | null {
  switch (genre) {
    case "scifi":
      return "sci-fi";
    case "suspense":
      return "mystery";
    case "horror":
      return "horror";
    case "romance":
      return "romance";
    default:
      return null;
  }
}

async function runStructuralLint(rootDir: string, chapterRel: string, overrides: AntiAiGenreOverrides | null): Promise<StructuralLintReport | null> {
  const chapterAbs = await resolveProjectFileIfSafe(rootDir, chapterRel);
  if (!chapterAbs || !(await pathExists(chapterAbs))) return null;

  const args = [chapterRel];
  const structuralGenre = toStructuralLintGenre(overrides?.genre ?? null);
  if (structuralGenre) args.push("--genre", structuralGenre);

  let tempDir: string | null = null;
  try {
    if (overrides) {
      tempDir = await mkdtemp(join(tmpdir(), "novel-anti-ai-struct-"));
      const configPath = join(tempDir, "lint-structural-overrides.json");
      await writeFile(configPath, `${JSON.stringify(toStructuralLintConfig(overrides), null, 2)}\n`, "utf8");
      args.push("--config", configPath);
    }

    const raw = await runJsonScript(rootDir, "scripts/lint-structural.sh", args);
    if (!raw) return null;
    return {
      violations: Array.isArray(raw.violations)
        ? raw.violations.filter(isPlainObject).map((item) => ({
            rule_id: typeof item.rule_id === "string" ? item.rule_id : "unknown",
            severity: item.severity === "error" ? "error" : "warning",
            location: isPlainObject(item.location)
              ? {
                  ...(typeof item.location.line === "number" ? { line: item.location.line } : {}),
                  ...(typeof item.location.char_start === "number" ? { char_start: item.location.char_start } : {}),
                  ...(typeof item.location.char_end === "number" ? { char_end: item.location.char_end } : {}),
                  ...(typeof item.location.paragraph_index === "number" ? { paragraph_index: item.location.paragraph_index } : {})
                }
              : undefined,
            description: typeof item.description === "string" ? item.description : "",
            suggestion: typeof item.suggestion === "string" ? item.suggestion : undefined
          }))
        : []
    };
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}

export async function loadAntiAiJudgeContext(args: { rootDir: string; chapterRel: string }): Promise<AntiAiJudgeContext> {
  const degraded: AntiAiJudgeContext["degraded"] = {};
  const chapterAbs = await resolveProjectFileIfSafe(args.rootDir, args.chapterRel);
  if (!chapterAbs) {
    await markJudgeContextDegraded(args.rootDir, degraded);
    return { blacklistLint: null, structuralRuleViolations: null, statisticalProfile: null, degraded };
  }
  if (!(await pathExists(chapterAbs))) {
    return { blacklistLint: null, structuralRuleViolations: null, statisticalProfile: null, degraded };
  }

  let chapterText: string;
  try {
    chapterText = await readTextFile(chapterAbs);
  } catch {
    await markJudgeContextDegraded(args.rootDir, degraded);
    return { blacklistLint: null, structuralRuleViolations: null, statisticalProfile: null, degraded };
  }

  const genreOverrides = await loadAntiAiGenreOverrides(args.rootDir);
  const blacklistLint = await runBlacklistLint(args.rootDir, args.chapterRel);
  if (!blacklistLint && (await pathExists(join(args.rootDir, "ai-blacklist.json")))) degraded.blacklist_lint = true;
  const structuralLint = await runStructuralLint(args.rootDir, args.chapterRel, genreOverrides);
  if (!structuralLint && (await findAvailableScriptPath(args.rootDir, "scripts/lint-structural.sh"))) degraded.structural_rule_violations = true;

  const sentences = splitSentences(chapterText);
  const sentenceLengths = sentences.map(coreSentenceLength).filter((value) => value > 0);
  const paragraphs = extractParagraphs(chapterText);
  const paragraphLengths = paragraphs.map(countCompactChars).filter((value) => value > 0);
  const vocabularyTokens = collectVocabularyTokens(chapterText);
  const vocabularyScore = vocabularyTokens.length === 0 ? 0 : new Set(vocabularyTokens).size / vocabularyTokens.length;

  const statisticalProfile: AntiAiStatisticalProfile = {
    source: "deterministic_lint+heuristic",
    chapter_path: args.chapterRel,
    blacklist_hit_rate: blacklistLint?.statistical_profile?.blacklist_hit_rate ?? blacklistLint?.hits_per_kchars ?? null,
    sentence_repetition_rate: computeSentenceRepetitionRate(sentences),
    sentence_length_std_dev: round3(stddev(sentenceLengths)),
    paragraph_length_cv: round3(coefficientOfVariation(paragraphLengths)),
    vocabulary_diversity_score: round3(vocabularyScore),
    vocabulary_richness_estimate: estimateVocabularyRichness(vocabularyScore),
    narration_connector_count: blacklistLint?.statistical_profile?.narration_connector_count ?? null,
    humanize_technique_variety: computeHumanizeTechniqueVariety(chapterText)
  };

  return {
    blacklistLint: blacklistLint ? (blacklistLint as unknown as Record<string, unknown>) : null,
    structuralRuleViolations: structuralLint?.violations ?? null,
    statisticalProfile,
    degraded
  };
}
