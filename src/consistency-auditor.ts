import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile } from "./fs-utils.js";
import { loadLatestJsonSummary } from "./latest-summary-loader.js";
import type { NerMention, NerOutput } from "./ner.js";
import { runNer } from "./ner.js";
import { pad2, pad3 } from "./steps.js";
import { truncateWithEllipsis } from "./text-utils.js";
import { isPlainObject } from "./type-guards.js";

type Severity = "high" | "medium" | "low";
type Confidence = "high" | "medium" | "low";
type IssueType = "character_mapping" | "relationship_jump" | "location_contradiction" | "timeline_contradiction";

export type ContinuityEvidence = {
  chapter: number;
  source: "chapter" | "contract" | "changelog";
  line: number;
  snippet: string;
};

export type ContinuityIssue = {
  id: string;
  type: IssueType;
  severity: Severity;
  confidence: Confidence;
  entities: {
    characters: string[];
    locations: string[];
    time_markers: string[];
    storylines: string[];
  };
  description: string;
  evidence: ContinuityEvidence[];
  suggestions: string[];
};

export type ContinuityReport = {
  schema_version: 1;
  generated_at: string;
  scope: "periodic" | "volume_end";
  volume: number;
  chapter_range: [number, number];
  issues: ContinuityIssue[];
  stats: {
    chapters_checked: number;
    chapters_missing?: number;
    issues_total: number;
    issues_by_severity: { high: number; medium: number; low: number };
    ner_ok?: number;
    ner_failed?: number;
    ner_failed_sample?: string;
  };
};

function severityRank(v: string): number {
  switch (v) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    default:
      return 9;
  }
}

function confidenceRank(v: string): number {
  switch (v) {
    case "high":
      return 0;
    case "medium":
      return 1;
    case "low":
      return 2;
    default:
      return 9;
  }
}

function idSafe(s: string): string {
  return s.trim().replace(/\s+/gu, "_").replaceAll("|", "／").replaceAll(":", "：").replaceAll("=", "＝");
}

function truncateSnippet(snippet: string, maxLen: number = 160): string {
  const trimmed = snippet.trim();
  return truncateWithEllipsis(trimmed, maxLen);
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function extractSeason(marker: string): "spring" | "summer" | "autumn" | "winter" | null {
  if (marker.includes("春")) return "spring";
  if (marker.includes("夏")) return "summer";
  if (marker.includes("秋")) return "autumn";
  if (marker.includes("冬")) return "winter";
  return null;
}

type TimeMarkerPick = { text: string; confidence: string; mention: NerMention | null } | null;

function pickPrimaryTimeMarker(ner: NerOutput): TimeMarkerPick {
  let best: { rank: number; line: number; text: string; confidence: string; mention: NerMention | null } | null = null;
  for (const tm of ner.entities.time_markers) {
    const text = tm.text.trim();
    if (text.length === 0) continue;
    const rank = confidenceRank(tm.confidence);
    const mention = tm.mentions[0] ?? null;
    const line = mention?.line ?? Number.POSITIVE_INFINITY;
    if (!best) {
      best = { rank, line, text, confidence: tm.confidence, mention };
      continue;
    }
    if (rank !== best.rank) {
      if (rank < best.rank) best = { rank, line, text, confidence: tm.confidence, mention };
      continue;
    }
    if (line !== best.line) {
      if (line < best.line) best = { rank, line, text, confidence: tm.confidence, mention };
      continue;
    }
    if (text !== best.text && text < best.text) best = { rank, line, text, confidence: tm.confidence, mention };
  }
  return best ? { text: best.text, confidence: best.confidence, mention: best.mention } : null;
}

async function listVolumeDirs(rootDir: string): Promise<string[]> {
  const volsAbs = join(rootDir, "volumes");
  if (!(await pathExists(volsAbs))) return [];
  const entries = await readdir(volsAbs, { withFileTypes: true });
  const dirs = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => /^vol-\d{2}$/u.test(name))
    .sort(compareStrings);
  return dirs;
}

async function findChapterContractRelPath(args: { rootDir: string; chapter: number }): Promise<string | null> {
  const volumeDirs = await listVolumeDirs(args.rootDir);
  for (const volDir of volumeDirs) {
    const rel = `volumes/${volDir}/chapter-contracts/chapter-${pad3(args.chapter)}.json`;
    if (await pathExists(join(args.rootDir, rel))) return rel;
  }
  return null;
}

async function loadChapterContract(args: { rootDir: string; chapter: number }): Promise<Record<string, unknown> | null> {
  const rel = await findChapterContractRelPath({ rootDir: args.rootDir, chapter: args.chapter });
  if (!rel) return null;
  try {
    const raw = await readJsonFile(join(args.rootDir, rel));
    if (!isPlainObject(raw)) return null;
    return raw as Record<string, unknown>;
  } catch {
    return null;
  }
}

function parseConcurrentState(contract: Record<string, unknown>): { storyline_id: string | null; concurrent_state: Record<string, string> } | null {
  const storyline_id = typeof contract.storyline_id === "string" ? contract.storyline_id.trim() : null;
  const ctxRaw = contract.storyline_context;
  if (!isPlainObject(ctxRaw)) return null;
  const ctx = ctxRaw as Record<string, unknown>;
  const csRaw = ctx.concurrent_state;
  if (!isPlainObject(csRaw)) return null;
  const csObj = csRaw as Record<string, unknown>;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(csObj)) {
    if (typeof v !== "string") continue;
    const key = k.trim();
    const val = v.trim();
    if (key.length === 0 || val.length === 0) continue;
    out[key] = val;
  }
  if (Object.keys(out).length === 0) return null;
  return { storyline_id, concurrent_state: out };
}

type NerCacheEntry =
  | { status: "ok"; ner: NerOutput; chapterRel: string }
  | { status: "missing"; chapterRel: string; error: string }
  | { status: "failed"; chapterRel: string; error: string };

async function getNerForChapter(args: { rootDir: string; chapter: number; cache: Map<number, NerCacheEntry> }): Promise<NerCacheEntry> {
  const cached = args.cache.get(args.chapter);
  if (cached) return cached;

  const chapterRel = `chapters/chapter-${pad3(args.chapter)}.md`;
  const chapterAbs = join(args.rootDir, chapterRel);
  if (!(await pathExists(chapterAbs))) {
    const entry: NerCacheEntry = { status: "missing", chapterRel, error: "chapter file missing" };
    args.cache.set(args.chapter, entry);
    return entry;
  }

  try {
    const ner = await runNer(chapterAbs);
    const entry: NerCacheEntry = { status: "ok", ner, chapterRel };
    args.cache.set(args.chapter, entry);
    return entry;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    const entry: NerCacheEntry = { status: "failed", chapterRel, error: message };
    args.cache.set(args.chapter, entry);
    return entry;
  }
}

function sortByLengthThenLexDesc(values: string[]): string[] {
  return Array.from(new Set(values))
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .sort((a, b) => b.length - a.length || compareStrings(a, b));
}

export async function computeContinuityReport(args: {
  rootDir: string;
  volume: number;
  scope: ContinuityReport["scope"];
  chapterRange: { start: number; end: number };
}): Promise<ContinuityReport> {
  const start = args.chapterRange.start;
  const end = args.chapterRange.end;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end < start) {
    throw new Error(`Invalid chapterRange: [${String(start)}, ${String(end)}]`);
  }
  if (!Number.isInteger(args.volume) || args.volume < 0) {
    throw new Error(`Invalid volume: ${String(args.volume)}`);
  }

  const generated_at = new Date().toISOString();
  const issues: ContinuityIssue[] = [];

  const nerCache = new Map<number, NerCacheEntry>();
  let chaptersChecked = 0;
  let chaptersMissing = 0;
  let nerOk = 0;
  let nerFailed = 0;
  let firstNerFailure: string | null = null;

  const chapterFacts: Array<{
    chapter: number;
    time_marker: TimeMarkerPick;
    characters: Array<{ text: string; mentions: NerMention[] }>;
    locations: string[];
  }> = [];

  for (let c = start; c <= end; c += 1) {
    const entry = await getNerForChapter({ rootDir: args.rootDir, chapter: c, cache: nerCache });
    if (entry.status === "missing") {
      chaptersMissing += 1;
      continue;
    }
    chaptersChecked += 1;
    if (entry.status !== "ok") {
      nerFailed += 1;
      if (!firstNerFailure) firstNerFailure = entry.error;
      continue;
    }
    nerOk += 1;

    const ner = entry.ner;
    const time_marker = pickPrimaryTimeMarker(ner);
    const characters = ner.entities.characters
      .map((e) => ({ text: e.text.trim(), mentions: e.mentions }))
      .filter((e) => e.text.length > 0);
    characters.sort((a, b) => compareStrings(a.text, b.text));
    const locations = ner.entities.locations.map((l) => l.text.trim()).filter((s) => s.length > 0);

    chapterFacts.push({ chapter: c, time_marker, characters, locations });
  }

  // Location contradiction: co-occurrence facts within the same primary time marker.
  const locationGroups = new Map<
    string,
    {
      character: string;
      time_marker: string;
      locations: Map<
        string,
        {
          chapter: number;
          line: number;
          snippet: string;
          time_marker_confidence: string;
        }
      >;
    }
  >();

  for (const ch of chapterFacts) {
    const tm = ch.time_marker;
    if (!tm) continue;
    const tmText = tm.text.trim();
    if (tmText.length === 0) continue;
    const locTexts = sortByLengthThenLexDesc(ch.locations);
    if (locTexts.length === 0) continue;

    for (const char of ch.characters) {
      if (char.mentions.length === 0) continue;
      for (const m of char.mentions) {
        const snippet = m.snippet ?? "";
        if (snippet.length === 0) continue;
        const loc = locTexts.find((t) => snippet.includes(t));
        if (!loc) continue;

        const key = `${char.text}\u0000${tmText}`;
        const group = locationGroups.get(key) ?? { character: char.text, time_marker: tmText, locations: new Map() };
        if (!group.locations.has(loc)) {
          group.locations.set(loc, {
            chapter: ch.chapter,
            line: m.line,
            snippet: truncateSnippet(snippet),
            time_marker_confidence: tm.confidence
          });
        }
        locationGroups.set(key, group);
      }
    }
  }

  for (const group of locationGroups.values()) {
    if (group.locations.size < 2) continue;
    const locList = Array.from(group.locations.keys()).sort(compareStrings);

    const highLocCount = Array.from(group.locations.values()).filter((e) => e.time_marker_confidence === "high").length;
    const isHigh = highLocCount >= 2;
    const severity: Severity = isHigh ? "high" : "medium";
    const confidence: Confidence = isHigh ? "high" : "medium";

    const evidenceList = locList
      .map((loc) => {
        const ev = group.locations.get(loc)!;
        return { loc, ...ev };
      })
      .slice(0, 5);

    const locId = locList.map(idSafe).join("|");
    const id = `location_contradiction:char=${idSafe(group.character)}:time=${idSafe(group.time_marker)}:loc=${locId}`;

    issues.push({
      id,
      type: "location_contradiction",
      severity,
      confidence,
      entities: {
        characters: [group.character],
        locations: locList,
        time_markers: [group.time_marker],
        storylines: []
      },
      description: "同一 time_marker 下角色位置出现矛盾或疑似瞬移。",
      evidence: evidenceList.map((e) => ({
        chapter: e.chapter,
        source: "chapter",
        line: e.line,
        snippet: e.snippet
      })),
      suggestions: [
        "确认时间标尺是否应推进（例如从'第三年冬末'推进到'翌日清晨'）。",
        "若确为跨地移动，补一段赶路/传送的因果说明。"
      ]
    });
  }

  // Timeline contradiction: compare primary time markers referenced via concurrent_state (chNN).
  const seenTimelineIds = new Set<string>();

  for (let c = start; c <= end; c += 1) {
    const contract = await loadChapterContract({ rootDir: args.rootDir, chapter: c });
    if (!contract) continue;
    const cs = parseConcurrentState(contract);
    if (!cs) continue;

    const currentNer = await getNerForChapter({ rootDir: args.rootDir, chapter: c, cache: nerCache });
    if (currentNer.status !== "ok") continue;
    const tmA = pickPrimaryTimeMarker(currentNer.ner);
    if (!tmA || tmA.text.length === 0) continue;
    const seasonA = extractSeason(tmA.text);
    if (!seasonA || tmA.confidence !== "high") continue;

    const storylineKeys = Object.keys(cs.concurrent_state).sort(compareStrings);
    for (const other of storylineKeys) {
      const summary = cs.concurrent_state[other] ?? "";
      const refs: number[] = [];
      const re = /[（(]\s*ch\s*(\d+)\s*[）)]/giu;
      let m: RegExpExecArray | null;
      while ((m = re.exec(summary)) !== null) {
        const n = Number.parseInt(m[1] ?? "", 10);
        if (Number.isInteger(n) && n > 0) refs.push(n);
      }
      refs.sort((a, b) => a - b);
      for (const refChapter of refs) {
        const refNer = await getNerForChapter({ rootDir: args.rootDir, chapter: refChapter, cache: nerCache });
        if (refNer.status !== "ok") continue;
        const tmB = pickPrimaryTimeMarker(refNer.ner);
        if (!tmB || tmB.text.length === 0) continue;
        const seasonB = extractSeason(tmB.text);
        if (!seasonB || tmB.confidence !== "high") continue;
        if (seasonA === seasonB) continue;

        const storylines = [cs.storyline_id, other].filter((s): s is string => typeof s === "string" && s.length > 0).sort(compareStrings);
        const id = `timeline_contradiction:storylines=${storylines.map(idSafe).join("|")}:time=${idSafe(tmA.text)}|${idSafe(tmB.text)}`;
        if (seenTimelineIds.has(id)) continue;
        seenTimelineIds.add(id);

        const evA: ContinuityEvidence = {
          chapter: c,
          source: "chapter",
          line: tmA.mention?.line ?? 0,
          snippet: truncateSnippet(tmA.mention?.snippet ?? tmA.text)
        };
        const evB: ContinuityEvidence = {
          chapter: refChapter,
          source: "chapter",
          line: tmB.mention?.line ?? 0,
          snippet: truncateSnippet(tmB.mention?.snippet ?? tmB.text)
        };

        issues.push({
          id,
          type: "timeline_contradiction",
          severity: "high",
          confidence: "high",
          entities: {
            characters: [],
            locations: [],
            time_markers: [tmA.text, tmB.text],
            storylines
          },
          description: "跨故事线并发状态与 time_marker 存在高置信矛盾（可能触发 LS-001）。",
          evidence: [evA, evB],
          suggestions: ["补齐并发线的时空锚点，或调整事件发生顺序。"]
        });
      }
    }
  }

  // Stable ordering: severity (high→low) → type → id
  issues.sort((a, b) => {
    const sr = severityRank(a.severity) - severityRank(b.severity);
    if (sr !== 0) return sr;
    const tr = compareStrings(a.type, b.type);
    if (tr !== 0) return tr;
    return compareStrings(a.id, b.id);
  });

  const bySeverity = { high: 0, medium: 0, low: 0 };
  for (const it of issues) bySeverity[it.severity] += 1;

  const report: ContinuityReport = {
    schema_version: 1,
    generated_at,
    scope: args.scope,
    volume: args.volume,
    chapter_range: [start, end],
    issues,
    stats: {
      chapters_checked: chaptersChecked,
      chapters_missing: chaptersMissing,
      issues_total: issues.length,
      issues_by_severity: bySeverity,
      ner_ok: nerOk,
      ner_failed: nerFailed,
      ...(firstNerFailure ? { ner_failed_sample: truncateSnippet(firstNerFailure, 200) } : {})
    }
  };

  return report;
}

export async function writeContinuityLogs(args: {
  rootDir: string;
  report: ContinuityReport;
}): Promise<{ latestRel: string; historyRel: string }> {
  const dirRel = "logs/continuity";
  const dirAbs = join(args.rootDir, dirRel);
  await ensureDir(dirAbs);

  const [start, end] = args.report.chapter_range;
  const historyRel = `${dirRel}/continuity-report-vol-${pad2(args.report.volume)}-ch${pad3(start)}-ch${pad3(end)}.json`;
  const latestRel = `${dirRel}/latest.json`;

  await writeJsonFile(join(args.rootDir, historyRel), args.report);

  const latestAbs = join(args.rootDir, latestRel);
  const scopeRank = (scope: unknown): number => (scope === "volume_end" ? 1 : 0);
  const parseLatest = (raw: unknown): { end: number; scope_rank: number; generated_at: string | null } | null => {
    if (!isPlainObject(raw)) return null;
    const obj = raw as Record<string, unknown>;
    if (obj.schema_version !== 1) return null;
    const range = obj.chapter_range;
    if (!Array.isArray(range) || range.length !== 2) return null;
    const a = range[0];
    const b = range[1];
    if (typeof a !== "number" || typeof b !== "number") return null;
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < a) return null;
    const rawTs = typeof obj.generated_at === "string" ? obj.generated_at : null;
    const generated_at = rawTs && Number.isFinite(Date.parse(rawTs)) ? rawTs : null;
    return { end: b, scope_rank: scopeRank(obj.scope), generated_at };
  };

  const next = { end, scope_rank: scopeRank(args.report.scope), generated_at: args.report.generated_at };
  let shouldWriteLatest = true;
  if (await pathExists(latestAbs)) {
    try {
      const existing = parseLatest(await readJsonFile(latestAbs));
      if (existing) {
        if (existing.end > next.end) {
          shouldWriteLatest = false;
        } else if (existing.end === next.end && existing.scope_rank > next.scope_rank) {
          shouldWriteLatest = false;
        } else if (existing.end === next.end && existing.scope_rank === next.scope_rank) {
          // If timestamps are comparable, keep the newer one; otherwise, overwrite.
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
    // Atomic replace to avoid partial/corrupted JSON on interruption.
    const tmpAbs = join(dirAbs, `.tmp-continuity-latest-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await writeJsonFile(tmpAbs, args.report);
    try {
      // Re-check right before publish to reduce (not eliminate) races without introducing a lock.
      let stillWrite = true;
      if (await pathExists(latestAbs)) {
        try {
          const existing2 = parseLatest(await readJsonFile(latestAbs));
          if (existing2) {
            if (existing2.end > next.end) {
              stillWrite = false;
            } else if (existing2.end === next.end && existing2.scope_rank > next.scope_rank) {
              stillWrite = false;
            } else if (existing2.end === next.end && existing2.scope_rank === next.scope_rank && existing2.generated_at) {
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

  return { latestRel, historyRel };
}

export async function writeVolumeContinuityReport(args: {
  rootDir: string;
  report: ContinuityReport;
}): Promise<{ volumeRel: string }> {
  const rel = `volumes/vol-${pad2(args.report.volume)}/continuity-report.json`;
  await writeJsonFile(join(args.rootDir, rel), args.report);
  return { volumeRel: rel };
}

export async function loadContinuityLatestSummary(rootDir: string): Promise<Record<string, unknown> | null> {
  return loadLatestJsonSummary({ rootDir, relPath: "logs/continuity/latest.json", summarize: summarizeContinuityForJudge });
}

export function summarizeContinuityForJudge(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;
  const issuesRaw = Array.isArray(obj.issues) ? (obj.issues as unknown[]) : [];
  const statsRaw = isPlainObject(obj.stats) ? (obj.stats as Record<string, unknown>) : {};

  const issues: Array<Record<string, unknown>> = [];
  const ls_001_signals: Array<Record<string, unknown>> = [];
  const MAX_ISSUES = 5;
  const MAX_LS_001_SIGNALS = 5;
  const MAX_DESCRIPTION = 240;
  const MAX_ID = 240;
  const MAX_SUGGESTION = 180;
  const ALLOWED_TYPES = new Set<string>(["timeline_contradiction", "location_contradiction", "character_mapping", "relationship_jump"]);

  const safeString = (v: unknown, maxLen: number): string | null => {
    if (typeof v !== "string") return null;
    const trimmed = v.trim();
    if (trimmed.length === 0) return null;
    return truncateSnippet(trimmed, maxLen);
  };

  const safeInt = (v: unknown): number | null => {
    return typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : null;
  };

  const safeSeverityCounts = (v: unknown): { high: number; medium: number; low: number } | null => {
    if (!isPlainObject(v)) return null;
    const o = v as Record<string, unknown>;
    const high = safeInt(o.high);
    const medium = safeInt(o.medium);
    const low = safeInt(o.low);
    if (high === null || medium === null || low === null) return null;
    return { high, medium, low };
  };

  for (const it of issuesRaw) {
    if (!isPlainObject(it)) continue;
    const issue = it as Record<string, unknown>;
    const type = typeof issue.type === "string" ? issue.type : "";
    const severity = typeof issue.severity === "string" ? issue.severity : "";
    const confidence = typeof issue.confidence === "string" ? issue.confidence : "";
    if (!["high", "medium"].includes(severity)) continue;
    if (!ALLOWED_TYPES.has(type)) continue;

    const evidenceRaw = Array.isArray(issue.evidence) ? (issue.evidence as unknown[]) : [];
    const evidence = evidenceRaw
      .filter((e) => isPlainObject(e))
      .slice(0, 2)
      .map((e) => {
        const eo = e as Record<string, unknown>;
        const chapter = typeof eo.chapter === "number" && Number.isInteger(eo.chapter) ? eo.chapter : null;
        const snippet = typeof eo.snippet === "string" ? truncateSnippet(eo.snippet, 120) : null;
        return chapter !== null && snippet !== null ? { chapter, snippet } : null;
      })
      .filter((e): e is { chapter: number; snippet: string } => e !== null);

    const suggestionsRaw = Array.isArray(issue.suggestions) ? (issue.suggestions as unknown[]) : [];
    const suggestion = safeString(suggestionsRaw[0], MAX_SUGGESTION);

    const id = safeString(issue.id, MAX_ID) ?? "";
    const description = safeString(issue.description, MAX_DESCRIPTION) ?? "";

    const trimmed: Record<string, unknown> = {
      id,
      type,
      severity,
      confidence,
      description,
      evidence,
      ...(suggestion ? { suggestion } : {})
    };
    issues.push(trimmed);

    if (type === "timeline_contradiction" && confidence === "high") {
      ls_001_signals.push({
        issue_id: id,
        confidence,
        evidence,
        ...(suggestion ? { suggestion } : {})
      });
    }
  }

  issues.sort((a, b) => {
    const as = String(a.severity ?? "");
    const bs = String(b.severity ?? "");
    const sr = severityRank(as) - severityRank(bs);
    if (sr !== 0) return sr;
    const tr = compareStrings(String(a.type ?? ""), String(b.type ?? ""));
    if (tr !== 0) return tr;
    return compareStrings(String(a.id ?? ""), String(b.id ?? ""));
  });

  ls_001_signals.sort((a, b) => compareStrings(String(a.issue_id ?? ""), String(b.issue_id ?? "")));

  let chapter_range: [number, number] | null = null;
  if (Array.isArray(obj.chapter_range) && obj.chapter_range.length === 2) {
    const a = obj.chapter_range[0];
    const b = obj.chapter_range[1];
    if (typeof a === "number" && typeof b === "number" && Number.isInteger(a) && Number.isInteger(b) && a > 0 && b >= a) {
      chapter_range = [a, b];
    }
  }

  const scope = typeof obj.scope === "string" && ["periodic", "volume_end"].includes(obj.scope) ? obj.scope : null;
  const volume = typeof obj.volume === "number" && Number.isInteger(obj.volume) && obj.volume >= 0 ? obj.volume : null;
  const generated_at = typeof obj.generated_at === "string" ? obj.generated_at : null;

  const chaptersChecked = safeInt(statsRaw.chapters_checked) ?? 0;
  const issuesTotal = safeInt(statsRaw.issues_total) ?? 0;
  const issuesBySeverity = safeSeverityCounts(statsRaw.issues_by_severity) ?? { high: 0, medium: 0, low: 0 };
  const chaptersMissing = safeInt(statsRaw.chapters_missing);
  const nerOk = safeInt(statsRaw.ner_ok);
  const nerFailed = safeInt(statsRaw.ner_failed);
  const nerFailedSample = safeString(statsRaw.ner_failed_sample, 160);

  const summary: Record<string, unknown> = {
    schema_version: obj.schema_version,
    ...(generated_at ? { generated_at } : {}),
    ...(scope ? { scope } : {}),
    ...(volume !== null ? { volume } : {}),
    chapter_range,
    stats: {
      chapters_checked: chaptersChecked,
      issues_total: issuesTotal,
      issues_by_severity: issuesBySeverity,
      ...(chaptersMissing !== null ? { chapters_missing: chaptersMissing } : {}),
      ...(nerOk !== null ? { ner_ok: nerOk } : {}),
      ...(nerFailed !== null ? { ner_failed: nerFailed } : {}),
      ...(nerFailedSample ? { ner_failed_sample: nerFailedSample } : {})
    },
    issues: issues.slice(0, MAX_ISSUES)
  };

  const signals = ls_001_signals.slice(0, MAX_LS_001_SIGNALS);
  if (signals.length > 0) summary.ls_001_signals = signals;

  return summary;
}

export async function tryParseOutlineChapterRange(args: { rootDir: string; volume: number }): Promise<{ start: number; end: number } | null> {
  const outlineRel = `volumes/vol-${pad2(args.volume)}/outline.md`;
  const outlineAbs = join(args.rootDir, outlineRel);
  if (!(await pathExists(outlineAbs))) return null;

  const text = await readTextFile(outlineAbs);
  const nums: number[] = [];
  const re = /^###\s*第\s*(\d+)\s*章/gu;
  for (const line of text.split(/\r?\n/gu)) {
    const m = re.exec(line);
    re.lastIndex = 0;
    if (!m) continue;
    const n = Number.parseInt(m[1] ?? "", 10);
    if (Number.isInteger(n) && n > 0) nums.push(n);
  }
  if (nums.length === 0) return null;
  nums.sort((a, b) => a - b);
  return { start: nums[0]!, end: nums[nums.length - 1]! };
}

export async function tryParseVolumeContractChapterRange(args: { rootDir: string; volume: number }): Promise<{ start: number; end: number } | null> {
  const dirRel = `volumes/vol-${pad2(args.volume)}/chapter-contracts`;
  const dirAbs = join(args.rootDir, dirRel);
  if (!(await pathExists(dirAbs))) return null;

  const entries = await readdir(dirAbs, { withFileTypes: true });
  const nums: number[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = /^chapter-(\d{3})\.json$/u.exec(e.name);
    if (!m) continue;
    const n = Number.parseInt(m[1] ?? "", 10);
    if (Number.isInteger(n) && n > 0) nums.push(n);
  }
  if (nums.length === 0) return null;
  nums.sort((a, b) => a - b);
  return { start: nums[0]!, end: nums[nums.length - 1]! };
}

export async function tryResolveVolumeChapterRange(args: { rootDir: string; volume: number }): Promise<{ start: number; end: number } | null> {
  return (await tryParseOutlineChapterRange(args)) ?? (await tryParseVolumeContractChapterRange(args));
}
