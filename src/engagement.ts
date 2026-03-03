import { appendFile, rename, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile } from "./fs-utils.js";
import { loadLatestJsonSummary } from "./latest-summary-loader.js";
import type { SeverityPolicy } from "./platform-profile.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { pad2, pad3 } from "./steps.js";
import { truncateWithEllipsis } from "./text-utils.js";
import { isPlainObject } from "./type-guards.js";

export type EngagementScore = 1 | 2 | 3 | 4 | 5;

export type EngagementMetricRecord = {
  schema_version: 1;
  generated_at: string;
  chapter: number;
  volume: number;
  word_count: number;
  plot_progression_beats: number;
  conflict_intensity: EngagementScore;
  payoff_score: EngagementScore;
  new_info_load_score: EngagementScore;
  notes: string;
};

export type EngagementIssue = {
  id: string;
  severity: SeverityPolicy;
  summary: string;
  evidence?: string;
  suggestion?: string;
};

export type EngagementReport = {
  schema_version: 1;
  generated_at: string;
  as_of: { chapter: number; volume: number };
  scope: { volume: number; chapter_start: number; chapter_end: number };
  metrics_stream_path: string;
  metrics: EngagementMetricRecord[];
  stats: {
    chapters: number;
    avg_word_count: number | null;
    avg_plot_progression_beats: number | null;
    avg_conflict_intensity: number | null;
    avg_payoff_score: number | null;
    avg_new_info_load_score: number | null;
  };
  issues: EngagementIssue[];
  has_blocking_issues: boolean;
};

const DEFAULT_METRICS_REL = "engagement-metrics.jsonl";
const MAX_LATEST_JSON_BYTES = 512 * 1024;

function safeInt(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isInteger(v)) return null;
  return v;
}

function safeFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return v;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

const RFC3339_DATE_TIME =
  /^(\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d{1,9}))?(?:Z|([+-])([01]\d|2[0-3]):([0-5]\d))$/;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  switch (month) {
    case 1:
    case 3:
    case 5:
    case 7:
    case 8:
    case 10:
    case 12:
      return 31;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    case 2:
      return isLeapYear(year) ? 29 : 28;
    default:
      return 0;
  }
}

function safeIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  const m = RFC3339_DATE_TIME.exec(t);
  if (!m) return null;

  const year = Number.parseInt(m[1] ?? "", 10);
  const month = Number.parseInt(m[2] ?? "", 10);
  const day = Number.parseInt(m[3] ?? "", 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
  if (day > daysInMonth(year, month)) return null;

  if (!Number.isFinite(Date.parse(t))) return null;
  return t;
}

function clampScore(n: number): EngagementScore {
  const clamped = Math.max(1, Math.min(5, Math.round(n)));
  return clamped as EngagementScore;
}

function countNonWhitespaceChars(text: string): number {
  const compact = text.replace(/\s+/gu, "");
  return Array.from(compact).length;
}

function normalizeEventText(text: string): string {
  return text.trim().replace(/\s+/gu, " ").replace(/[。！？；，、]+$/gu, "");
}

function extractSummaryKeyEvents(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/gu);
  const out: string[] = [];
  let inKeyEvents = false;
  for (const line of lines) {
    const heading = /^(?:\uFEFF)?\s{0,3}#{1,6}\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      const title = (heading[1] ?? "").trim();
      inKeyEvents = title.includes("关键事件") || title.toLowerCase().includes("key events") || title.toLowerCase().includes("key beats");
      continue;
    }
    if (!inKeyEvents) continue;
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/u.exec(line);
    if (!bullet) continue;
    const cleaned = normalizeEventText(bullet[1] ?? "");
    if (cleaned.length < 2) continue;
    out.push(truncateWithEllipsis(cleaned, 200));
  }
  return out;
}

function extractSummaryBullets(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/gu);
  const out: string[] = [];
  for (const line of lines) {
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/u.exec(line);
    if (!bullet) continue;
    const cleaned = normalizeEventText(bullet[1] ?? "");
    if (cleaned.length < 2) continue;
    out.push(truncateWithEllipsis(cleaned, 200));
  }
  return out;
}

function scoreConflictIntensity(events: string[]): { score: EngagementScore; evidence: string } {
  const conflictKeywords = [
    "战",
    "打",
    "杀",
    "追",
    "逃",
    "对峙",
    "对抗",
    "冲突",
    "威胁",
    "危机",
    "围",
    "拦",
    "袭",
    "爆发",
    "生死",
    "决战",
    "大战",
    "强敌",
    "背叛"
  ];
  const peakKeywords = ["决战", "终局", "生死", "灭", "覆灭", "崩盘", "大劫", "同归于尽"];
  let conflictHits = 0;
  let hasPeak = false;
  for (const ev of events) {
    for (const k of peakKeywords) {
      if (ev.includes(k)) hasPeak = true;
    }
    for (const k of conflictKeywords) {
      if (ev.includes(k)) {
        conflictHits += 1;
        break;
      }
    }
  }

  if (hasPeak) return { score: 5, evidence: `peak_keyword=true; conflict_hits=${conflictHits}` };
  if (conflictHits >= 3) return { score: 4, evidence: `conflict_hits=${conflictHits}` };
  if (conflictHits === 2) return { score: 3, evidence: "conflict_hits=2" };
  if (conflictHits === 1) return { score: 2, evidence: "conflict_hits=1" };
  return { score: 1, evidence: "conflict_hits=0" };
}

function scorePayoff(events: string[]): { score: EngagementScore; evidence: string } {
  const payoffKeywords = ["突破", "晋级", "升级", "获得", "奖励", "胜", "赢", "击败", "反转", "揭示", "真相", "身份", "和解", "告白", "兑现", "解决"];
  const bigPayoffKeywords = ["真相", "身份", "大反转", "重大", "终结", "解决", "兑现", "击杀", "覆灭", "告白", "和解"];
  let payoffHits = 0;
  let hasBig = false;
  for (const ev of events) {
    for (const k of bigPayoffKeywords) if (ev.includes(k)) hasBig = true;
    for (const k of payoffKeywords) {
      if (ev.includes(k)) {
        payoffHits += 1;
        break;
      }
    }
  }

  if (hasBig && payoffHits >= 2) return { score: 5, evidence: `big_payoff=true; payoff_hits=${payoffHits}` };
  if (hasBig) return { score: 4, evidence: `big_payoff=true; payoff_hits=${payoffHits}` };
  if (payoffHits >= 3) return { score: 4, evidence: `payoff_hits=${payoffHits}` };
  if (payoffHits === 2) return { score: 3, evidence: "payoff_hits=2" };
  if (payoffHits === 1) return { score: 2, evidence: "payoff_hits=1" };
  return { score: 1, evidence: "payoff_hits=0" };
}

function scoreNewInfoLoad(args: {
  infoLoadNewTermsPer1k: number | null;
  infoLoadNewEntities: number | null;
  infoLoadUnknownEntities: number | null;
  events: string[];
}): { score: EngagementScore; evidence: string } {
  if (args.infoLoadNewTermsPer1k !== null) {
    const v = args.infoLoadNewTermsPer1k;
    const score = v < 0.5 ? 1 : v < 1.0 ? 2 : v < 2.0 ? 3 : v < 3.5 ? 4 : 5;
    return { score, evidence: `info_load.new_terms_per_1k_words=${v}` };
  }

  const newEntities = args.infoLoadNewEntities;
  const unknownEntities = args.infoLoadUnknownEntities;
  if (newEntities !== null || unknownEntities !== null) {
    const total = (newEntities ?? 0) + (unknownEntities ?? 0);
    const score = total < 2 ? 1 : total < 4 ? 2 : total < 7 ? 3 : total < 10 ? 4 : 5;
    return { score, evidence: `info_load.entities_total=${total} (new=${newEntities ?? "null"}, unknown=${unknownEntities ?? "null"})` };
  }

  // Fallback heuristic (summary-only): count rule/setting introduction phrases.
  const infoKeywords = ["系统", "规则", "设定", "机制", "首次", "发现", "揭示", "介绍", "解释", "新"];
  let hits = 0;
  for (const ev of args.events) {
    if (infoKeywords.some((k) => ev.includes(k))) hits += 1;
  }
  const score = hits === 0 ? 1 : hits === 1 ? 2 : hits === 2 ? 3 : hits === 3 ? 4 : 5;
  return { score, evidence: `fallback.summary_info_hits=${hits}` };
}

function extractPlatformConstraintsSignals(evalRaw: unknown): {
  wordCountChars: number | null;
  newTermsPer1k: number | null;
  newEntitiesCount: number | null;
  unknownEntitiesCount: number | null;
} {
  if (!isPlainObject(evalRaw)) {
    return { wordCountChars: null, newTermsPer1k: null, newEntitiesCount: null, unknownEntitiesCount: null };
  }
  const obj = evalRaw as Record<string, unknown>;
  const pcRaw = obj.platform_constraints;
  if (!isPlainObject(pcRaw)) return { wordCountChars: null, newTermsPer1k: null, newEntitiesCount: null, unknownEntitiesCount: null };

  const pc = pcRaw as Record<string, unknown>;
  const wcRaw = pc.word_count;
  const infoRaw = pc.info_load;

  let wordCountChars: number | null = null;
  if (isPlainObject(wcRaw)) {
    const chars = safeInt((wcRaw as Record<string, unknown>).chars);
    if (chars !== null && chars >= 0) wordCountChars = chars;
  }

  let newTermsPer1k: number | null = null;
  let newEntitiesCount: number | null = null;
  let unknownEntitiesCount: number | null = null;
  if (isPlainObject(infoRaw)) {
    const info = infoRaw as Record<string, unknown>;
    const terms = safeFiniteNumber(info.new_terms_per_1k_words);
    if (terms !== null && terms >= 0) newTermsPer1k = terms;
    const newE = safeInt(info.new_entities_count);
    if (newE !== null && newE >= 0) newEntitiesCount = newE;
    const unkE = safeInt(info.unknown_entities_count);
    if (unkE !== null && unkE >= 0) unknownEntitiesCount = unkE;
  }

  return { wordCountChars, newTermsPer1k, newEntitiesCount, unknownEntitiesCount };
}

export async function computeEngagementMetricRecord(args: {
  rootDir: string;
  chapter: number;
  volume: number;
  chapterRel: string;
  summaryRel: string;
  evalRel: string;
}): Promise<{ record: EngagementMetricRecord; warnings: string[] }> {
  const warnings: string[] = [];

  if (!Number.isInteger(args.chapter) || args.chapter < 1) throw new Error(`Invalid chapter: ${String(args.chapter)} (expected int >= 1).`);
  if (!Number.isInteger(args.volume) || args.volume < 0) throw new Error(`Invalid volume: ${String(args.volume)} (expected int >= 0).`);

  const chapterAbs = resolveProjectRelativePath(args.rootDir, args.chapterRel, "chapterRel");
  const summaryAbs = resolveProjectRelativePath(args.rootDir, args.summaryRel, "summaryRel");
  const evalAbs = resolveProjectRelativePath(args.rootDir, args.evalRel, "evalRel");

  const chapterText = await readTextFile(chapterAbs);
  const summaryText = await readTextFile(summaryAbs);

  let evalRaw: unknown = null;
  if (await pathExists(evalAbs)) {
    try {
      evalRaw = await readJsonFile(evalAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Engagement metrics: failed to read eval JSON (${args.evalRel}): ${message}`);
      evalRaw = null;
    }
  }

  const pc = extractPlatformConstraintsSignals(evalRaw);

  const keyEvents = extractSummaryKeyEvents(summaryText);
  const fallbackBullets = keyEvents.length > 0 ? [] : extractSummaryBullets(summaryText);
  const events = keyEvents.length > 0 ? keyEvents : fallbackBullets;
  const plotBeats = keyEvents.length > 0 ? keyEvents.length : fallbackBullets.length;
  const beatsSource = keyEvents.length > 0 ? "key_events" : "summary_bullets";
  if (events.length === 0) warnings.push("Engagement metrics: no summary bullet events detected; conflict/payoff scoring may be degraded.");

  const wordCount = pc.wordCountChars ?? countNonWhitespaceChars(chapterText);

  const conflict = scoreConflictIntensity(events);
  const payoff = scorePayoff(events);
  const infoLoad = scoreNewInfoLoad({
    infoLoadNewTermsPer1k: pc.newTermsPer1k,
    infoLoadNewEntities: pc.newEntitiesCount,
    infoLoadUnknownEntities: pc.unknownEntitiesCount,
    events
  });

  const notesParts: string[] = [];
  notesParts.push(`word_count=${wordCount}${pc.wordCountChars !== null ? "(platform_constraints)" : ""}`);
  notesParts.push(`beats=${plotBeats}(${beatsSource})`);
  notesParts.push(`conflict=${conflict.score}(${conflict.evidence})`);
  notesParts.push(`payoff=${payoff.score}(${payoff.evidence})`);
  notesParts.push(`info_load=${infoLoad.score}(${infoLoad.evidence})`);
  const notes = notesParts.join("; ");

  const now = new Date().toISOString();
  const record: EngagementMetricRecord = {
    schema_version: 1,
    generated_at: now,
    chapter: args.chapter,
    volume: args.volume,
    word_count: wordCount,
    plot_progression_beats: plotBeats,
    conflict_intensity: conflict.score,
    payoff_score: payoff.score,
    new_info_load_score: infoLoad.score,
    notes: truncateWithEllipsis(notes, 320)
  };

  return { record, warnings };
}

export async function appendEngagementMetricRecord(args: {
  rootDir: string;
  record: EngagementMetricRecord;
  relPath?: string;
}): Promise<{ rel: string }> {
  const rel = args.relPath ?? DEFAULT_METRICS_REL;
  const abs = resolveProjectRelativePath(args.rootDir, rel, "relPath");
  await ensureDir(dirname(abs));
  await appendFile(abs, `${JSON.stringify(args.record)}\n`, "utf8");
  return { rel };
}

function normalizeLoadedMetric(raw: unknown): EngagementMetricRecord | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;

  const chapter = safeInt(obj.chapter);
  if (chapter === null || chapter < 1) return null;
  const volume = safeInt(obj.volume);
  if (volume === null || volume < 0) return null;

  const word_count = safeInt(obj.word_count);
  const plot_progression_beats = safeInt(obj.plot_progression_beats);
  const conflict_intensity = safeInt(obj.conflict_intensity);
  const payoff_score = safeInt(obj.payoff_score);
  const new_info_load_score = safeInt(obj.new_info_load_score);
  if (word_count === null || word_count < 0) return null;
  if (plot_progression_beats === null || plot_progression_beats < 0) return null;
  if (conflict_intensity === null || conflict_intensity < 1 || conflict_intensity > 5) return null;
  if (payoff_score === null || payoff_score < 1 || payoff_score > 5) return null;
  if (new_info_load_score === null || new_info_load_score < 1 || new_info_load_score > 5) return null;

  const generated_at = safeIso(obj.generated_at);
  if (!generated_at) return null;

  const notes = safeString(obj.notes);
  if (!notes) return null;

  return {
    schema_version: 1,
    generated_at,
    chapter,
    volume,
    word_count,
    plot_progression_beats,
    conflict_intensity: clampScore(conflict_intensity),
    payoff_score: clampScore(payoff_score),
    new_info_load_score: clampScore(new_info_load_score),
    notes
  };
}

export async function loadEngagementMetricsStream(args: {
  rootDir: string;
  relPath?: string;
  maxRecords?: number;
}): Promise<{ records: EngagementMetricRecord[]; warnings: string[]; rel: string }> {
  const rel = args.relPath ?? DEFAULT_METRICS_REL;
  const abs = resolveProjectRelativePath(args.rootDir, rel, "relPath");
  if (!(await pathExists(abs))) return { records: [], warnings: [], rel };

  const rawText = await readTextFile(abs);
  const warnings: string[] = [];
  const records: EngagementMetricRecord[] = [];

  const lines = rawText.split(/\r?\n/gu);
  for (const [i, lineRaw] of lines.entries()) {
    const line = lineRaw.trim();
    if (line.length === 0) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      warnings.push(`Engagement metrics: invalid JSONL at line ${i + 1}; skipping.`);
      continue;
    }
    const normalized = normalizeLoadedMetric(parsed);
    if (!normalized) {
      warnings.push(`Engagement metrics: invalid record at line ${i + 1}; skipping.`);
      continue;
    }
    records.push(normalized);
    if (typeof args.maxRecords === "number" && args.maxRecords > 0 && records.length > args.maxRecords) {
      records.shift();
    }
  }

  return { records, warnings, rel };
}

function average(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function pickLatestPerChapter(records: EngagementMetricRecord[]): EngagementMetricRecord[] {
  // If duplicates exist, keep the newest per chapter (generated_at tie-break); fall back to last-seen order.
  const byChapter = new Map<number, EngagementMetricRecord>();
  for (const r of records) {
    const prev = byChapter.get(r.chapter);
    if (!prev) {
      byChapter.set(r.chapter, r);
      continue;
    }
    const a = Date.parse(prev.generated_at);
    const b = Date.parse(r.generated_at);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      if (b >= a) byChapter.set(r.chapter, r);
    } else {
      byChapter.set(r.chapter, r);
    }
  }
  return Array.from(byChapter.values()).sort((a, b) => a.chapter - b.chapter || a.generated_at.localeCompare(b.generated_at, "en"));
}

export function computeEngagementReport(args: {
  records: EngagementMetricRecord[];
  asOfChapter: number;
  volume: number;
  chapterRange: { start: number; end: number };
  metricsRelPath?: string;
}): EngagementReport {
  if (!Number.isInteger(args.asOfChapter) || args.asOfChapter < 1) throw new Error(`Invalid asOfChapter: ${String(args.asOfChapter)} (expected int >= 1).`);
  if (!Number.isInteger(args.volume) || args.volume < 0) throw new Error(`Invalid volume: ${String(args.volume)} (expected int >= 0).`);
  if (!Number.isInteger(args.chapterRange.start) || args.chapterRange.start < 1) {
    throw new Error(`Invalid chapterRange.start: ${String(args.chapterRange.start)} (expected int >= 1).`);
  }
  if (!Number.isInteger(args.chapterRange.end) || args.chapterRange.end < args.chapterRange.start) {
    throw new Error(`Invalid chapterRange.end: ${String(args.chapterRange.end)} (expected int >= start=${args.chapterRange.start}).`);
  }
  if (args.asOfChapter < args.chapterRange.end) {
    throw new Error(`Invalid asOfChapter: ${String(args.asOfChapter)} (expected int >= chapterRange.end=${args.chapterRange.end}).`);
  }

  const selected = pickLatestPerChapter(
    args.records.filter((r) => r.chapter >= args.chapterRange.start && r.chapter <= args.chapterRange.end)
  );

  const metricsByChapter = new Map<number, EngagementMetricRecord>();
  for (const r of selected) metricsByChapter.set(r.chapter, r);

  const issues: EngagementIssue[] = [];

  // Low plot beats stretches (consecutive beats <= 1).
  const lowBeatThreshold = 1;
  const minStretch = 3;
  const pushLowBeatsStretch = (start: number, end: number, stretchLen: number): void => {
    issues.push({
      id: "engagement.low_density.low_plot_beats_stretch",
      severity: "warn",
      summary: `Low plot progression beats for ${stretchLen} consecutive chapters (<=${lowBeatThreshold}).`,
      evidence: `range=ch${pad3(start)}-ch${pad3(end)}`,
      suggestion: "Add 1-2 clear progression beats per chapter (goal→obstacle→decision), and surface consequences."
    });
  };

  let stretchStart: number | null = null;
  let stretchEnd: number | null = null;
  let stretchLen = 0;
  let lastChapter: number | null = null;
  for (const r of selected) {
    const isConsecutive = lastChapter !== null && r.chapter === lastChapter + 1;
    if (r.plot_progression_beats <= lowBeatThreshold) {
      if (stretchStart === null || stretchEnd === null || !isConsecutive) {
        if (stretchStart !== null && stretchEnd !== null && stretchLen >= minStretch) {
          pushLowBeatsStretch(stretchStart, stretchEnd, stretchLen);
        }
        stretchStart = r.chapter;
        stretchEnd = r.chapter;
        stretchLen = 1;
      } else {
        stretchLen += 1;
        stretchEnd = r.chapter;
      }
    } else {
      if (stretchStart !== null && stretchEnd !== null && stretchLen >= minStretch) {
        pushLowBeatsStretch(stretchStart, stretchEnd, stretchLen);
      }
      stretchStart = null;
      stretchEnd = null;
      stretchLen = 0;
    }
    lastChapter = r.chapter;
  }
  if (stretchStart !== null && stretchEnd !== null && stretchLen >= minStretch) {
    pushLowBeatsStretch(stretchStart, stretchEnd, stretchLen);
  }

  const tail5 = (() => {
    const tailEnd = args.chapterRange.end;
    const tailStart = tailEnd - 4;
    if (tailStart < args.chapterRange.start) return null;
    const tail: EngagementMetricRecord[] = [];
    for (let ch = tailStart; ch <= tailEnd; ch += 1) {
      const r = metricsByChapter.get(ch);
      if (!r) return null;
      tail.push(r);
    }
    return tail;
  })();

  // Low payoff trend in last 5 chapters (requires a complete consecutive tail).
  if (tail5) {
    const avgPayoff = average(tail5.map((r) => r.payoff_score));
    if (avgPayoff !== null && avgPayoff <= 2.0) {
      issues.push({
        id: "engagement.low_density.low_payoff_trend",
        severity: "warn",
        summary: `Low payoff trend in last 5 chapters (avg_payoff=${avgPayoff.toFixed(2)}).`,
        evidence: `range=ch${pad3(tail5[0]!.chapter)}-ch${pad3(tail5[tail5.length - 1]!.chapter)}`,
        suggestion: "Schedule small but frequent rewards/reveals (wins, reveals, emotional beats) to avoid perceived stalling."
      });
    }
  }

  // Conflict plateau in last 5 chapters (requires a complete consecutive tail; all <= 2).
  if (tail5) {
    const maxConflict = Math.max(...tail5.map((r) => r.conflict_intensity));
    if (maxConflict <= 2) {
      issues.push({
        id: "engagement.low_density.conflict_plateau",
        severity: "warn",
        summary: "Conflict plateau in last 5 chapters (conflict_intensity stays low).",
        evidence: `range=ch${pad3(tail5[0]!.chapter)}-ch${pad3(tail5[tail5.length - 1]!.chapter)}`,
        suggestion: "Introduce explicit opposition, time pressure, or meaningful cost to raise tension without forcing a full climax."
      });
    }
  }

  const wordCounts = selected.map((r) => r.word_count);
  const beats = selected.map((r) => r.plot_progression_beats);
  const conflicts = selected.map((r) => r.conflict_intensity);
  const payoffs = selected.map((r) => r.payoff_score);
  const infos = selected.map((r) => r.new_info_load_score);

  const hasBlocking = issues.some((i) => i.severity === "hard");

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    as_of: { chapter: args.asOfChapter, volume: args.volume },
    scope: { volume: args.volume, chapter_start: args.chapterRange.start, chapter_end: args.chapterRange.end },
    metrics_stream_path: args.metricsRelPath ?? DEFAULT_METRICS_REL,
    metrics: selected,
    stats: {
      chapters: selected.length,
      avg_word_count: average(wordCounts),
      avg_plot_progression_beats: average(beats),
      avg_conflict_intensity: average(conflicts),
      avg_payoff_score: average(payoffs),
      avg_new_info_load_score: average(infos)
    },
    issues,
    has_blocking_issues: hasBlocking
  };
}

export async function writeEngagementLogs(args: {
  rootDir: string;
  report: EngagementReport;
  historyRange?: { start: number; end: number } | null;
}): Promise<{ latestRel: string; historyRel?: string }> {
  const dirRel = "logs/engagement";
  const dirAbs = join(args.rootDir, dirRel);
  await ensureDir(dirAbs);

  const latestRel = `${dirRel}/latest.json`;
  const latestAbs = join(args.rootDir, latestRel);

  const result: { latestRel: string; historyRel?: string } = { latestRel };
  if (args.historyRange) {
    const historyRel = `${dirRel}/engagement-report-vol-${pad2(args.report.scope.volume)}-ch${pad3(args.historyRange.start)}-ch${pad3(
      args.historyRange.end
    )}.json`;
    await writeJsonFile(join(args.rootDir, historyRel), args.report);
    result.historyRel = historyRel;
  }

  const parseLatest = (raw: unknown): { chapter: number; generated_at: string | null } | null => {
    if (!isPlainObject(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (obj.schema_version !== 1) return null;
    const asOf = obj.as_of;
    if (!isPlainObject(asOf)) return null;
    const chapter = safeInt((asOf as Record<string, unknown>).chapter);
    if (chapter === null || chapter < 0) return null;
    const rawTs = typeof obj.generated_at === "string" ? obj.generated_at : null;
    const generated_at = rawTs && Number.isFinite(Date.parse(rawTs)) ? rawTs : null;
    return { chapter, generated_at };
  };

  const next = { chapter: args.report.as_of.chapter, generated_at: args.report.generated_at };
  let shouldWriteLatest = true;
  if (await pathExists(latestAbs)) {
    try {
      const existing = parseLatest(await readJsonFile(latestAbs));
      if (existing) {
        if (existing.chapter > next.chapter) {
          shouldWriteLatest = false;
        } else if (existing.chapter === next.chapter) {
          if (existing.generated_at) {
            const a = Date.parse(existing.generated_at);
            const b = Date.parse(next.generated_at);
            if (Number.isFinite(a) && Number.isFinite(b) && a >= b) shouldWriteLatest = false;
          }
        }
      }
    } catch {
      shouldWriteLatest = true;
    }
  }

  if (shouldWriteLatest) {
    const tmpAbs = join(dirAbs, `.tmp-engagement-latest-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await writeJsonFile(tmpAbs, args.report);
    try {
      let stillWrite = true;
      if (await pathExists(latestAbs)) {
        try {
          const existing2 = parseLatest(await readJsonFile(latestAbs));
          if (existing2) {
            if (existing2.chapter > next.chapter) {
              stillWrite = false;
            } else if (existing2.chapter === next.chapter && existing2.generated_at) {
              const a = Date.parse(existing2.generated_at);
              const b = Date.parse(next.generated_at);
              if (Number.isFinite(a) && Number.isFinite(b) && a >= b) stillWrite = false;
            }
          }
        } catch {
          stillWrite = true;
        }
      }
      if (stillWrite) await rename(tmpAbs, latestAbs);
    } finally {
      await rm(tmpAbs, { force: true }).catch(() => {});
    }
  }

  return result;
}

export async function loadEngagementLatestSummary(rootDir: string): Promise<Record<string, unknown> | null> {
  return loadLatestJsonSummary({
    rootDir,
    relPath: "logs/engagement/latest.json",
    maxBytes: MAX_LATEST_JSON_BYTES,
    summarize: summarizeEngagementReport
  });
}

export function summarizeEngagementReport(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;

  const safePositiveIntOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null);
  const safeNonNegativeIntOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null);
  const safeNonNegativeFiniteOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null);
  const safeStringOrNull = (v: unknown, maxLen: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0) return null;
    return truncateWithEllipsis(t, maxLen);
  };

  const asOfRaw = isPlainObject(obj.as_of) ? (obj.as_of as Record<string, unknown>) : null;
  const scopeRaw = isPlainObject(obj.scope) ? (obj.scope as Record<string, unknown>) : null;
  const statsRaw = isPlainObject(obj.stats) ? (obj.stats as Record<string, unknown>) : null;
  const issuesRaw = Array.isArray(obj.issues) ? (obj.issues as unknown[]) : [];

  const as_of = asOfRaw
    ? {
        chapter: safePositiveIntOrNull(asOfRaw.chapter),
        volume: safeNonNegativeIntOrNull(asOfRaw.volume)
      }
    : null;

  let scope = scopeRaw
    ? {
        volume: safeNonNegativeIntOrNull(scopeRaw.volume),
        chapter_start: safePositiveIntOrNull(scopeRaw.chapter_start),
        chapter_end: safePositiveIntOrNull(scopeRaw.chapter_end)
      }
    : null;
  if (scope && scope.chapter_start !== null && scope.chapter_end !== null && scope.chapter_start > scope.chapter_end) scope = null;

  const stats = statsRaw
    ? {
        chapters: safeNonNegativeIntOrNull(statsRaw.chapters),
        avg_word_count: safeNonNegativeFiniteOrNull(statsRaw.avg_word_count),
        avg_plot_progression_beats: safeNonNegativeFiniteOrNull(statsRaw.avg_plot_progression_beats),
        avg_conflict_intensity: safeNonNegativeFiniteOrNull(statsRaw.avg_conflict_intensity),
        avg_payoff_score: safeNonNegativeFiniteOrNull(statsRaw.avg_payoff_score),
        avg_new_info_load_score: safeNonNegativeFiniteOrNull(statsRaw.avg_new_info_load_score)
      }
    : null;

  const issues: Array<{ id: string | null; severity: string | null; summary: string | null; suggestion: string | null }> = [];
  for (const it of issuesRaw) {
    if (!isPlainObject(it)) continue;
    const issue = it as Record<string, unknown>;
    issues.push({
      id: safeStringOrNull(issue.id, 240),
      severity: safeStringOrNull(issue.severity, 32),
      summary: safeStringOrNull(issue.summary, 240),
      suggestion: safeStringOrNull(issue.suggestion, 200)
    });
    if (issues.length >= 5) break;
  }

  const has_blocking_issues = typeof obj.has_blocking_issues === "boolean" ? obj.has_blocking_issues : null;

  return {
    as_of,
    scope,
    stats,
    issues,
    has_blocking_issues
  };
}
