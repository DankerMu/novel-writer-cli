import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, writeJsonFile } from "./fs-utils.js";
import type { HookLedgerPolicy, SeverityPolicy } from "./platform-profile.js";
import { pad2, pad3 } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

export type HookLedgerStatus = "open" | "fulfilled" | "lapsed";

export type HookLedgerHistoryEvent = { at: string; chapter: number; action: string; detail?: string };
export type HookLedgerHistory = HookLedgerHistoryEvent[];

export type HookLedgerEntry = Record<string, unknown> & {
  id: string;
  chapter: number;
  hook_type: string;
  hook_strength: number;
  promise_text: string;
  status: HookLedgerStatus;
  fulfillment_window: [number, number];
  fulfilled_chapter: number | null;
  created_at: string;
  updated_at: string;
  evidence_snippet?: string;
  sources?: { eval_path?: string };
  links?: { promise_ids?: string[]; foreshadowing_ids?: string[] };
  history?: HookLedgerHistory;
};

export type HookLedgerFile = Record<string, unknown> & {
  schema_version: 1;
  entries: HookLedgerEntry[];
};

export type RetentionIssue = {
  id: string;
  severity: SeverityPolicy;
  summary: string;
  evidence?: string;
  suggestion?: string;
};

export type RetentionReport = {
  schema_version: 1;
  generated_at: string;
  as_of: { chapter: number; volume: number };
  scope: { volume: number; chapter_start: number; chapter_end: number };
  policy: HookLedgerPolicy;
  ledger_path: string;
  stats: {
    entries_total: number;
    open_total: number;
    fulfilled_total: number;
    lapsed_total: number;
  };
  debt: {
    newly_lapsed_total: number;
    open: HookLedgerEntrySummary[];
    lapsed: HookLedgerEntrySummary[];
  };
  diversity: {
    window_chapters: number;
    range: { start: number; end: number };
    distinct_types_in_window: number;
    min_distinct_types_in_window: number;
    max_same_type_streak_in_window: number;
    max_same_type_streak_allowed: number;
    types_by_chapter: Array<{ chapter: number; hook_type: string | null }>;
  };
  issues: RetentionIssue[];
  has_blocking_issues: boolean;
};

export type HookLedgerEntrySummary = Pick<
  HookLedgerEntry,
  "id" | "chapter" | "hook_type" | "hook_strength" | "promise_text" | "status" | "fulfillment_window" | "fulfilled_chapter"
> & { evidence_snippet?: string };

type HookEvalSignals = {
  present: boolean | null;
  type: string | null;
  evidence: string | null;
  strength: number | null;
};

function pickCommentFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("_")) continue;
    out[k] = v;
  }
  return out;
}

function safeInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) ? v : null;
}

function safePositiveInt(v: unknown): number | null {
  const n = safeInt(v);
  return n !== null && n > 0 ? n : null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function safeHookStatus(v: unknown): HookLedgerStatus | null {
  if (v === "open" || v === "fulfilled" || v === "lapsed") return v;
  return null;
}

function safeIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  return Number.isFinite(Date.parse(v)) ? v : null;
}

function safeWindow(v: unknown): [number, number] | null {
  if (!Array.isArray(v) || v.length !== 2) return null;
  const a = safePositiveInt(v[0]);
  const b = safePositiveInt(v[1]);
  if (a === null || b === null) return null;
  if (a > b) return null;
  return [a, b];
}

function normalizeLinks(raw: unknown): { promise_ids?: string[]; foreshadowing_ids?: string[] } | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const promise_ids = Array.isArray(obj.promise_ids) ? obj.promise_ids.filter((v) => typeof v === "string" && v.trim().length > 0) : null;
  const foreshadowing_ids = Array.isArray(obj.foreshadowing_ids)
    ? obj.foreshadowing_ids.filter((v) => typeof v === "string" && v.trim().length > 0)
    : null;

  if (!promise_ids && !foreshadowing_ids) return null;
  return {
    ...(promise_ids ? { promise_ids } : {}),
    ...(foreshadowing_ids ? { foreshadowing_ids } : {})
  };
}

function hookPromiseText(hookType: string): string {
  switch (hookType) {
    case "question":
      return "留悬念：未解之问";
    case "threat_reveal":
      return "留悬念：威胁升级";
    case "twist_reveal":
      return "留悬念：反转揭示";
    case "emotional_cliff":
      return "留悬念：情绪悬崖";
    case "next_objective":
      return "留悬念：新目标";
    default:
      return `留悬念：${hookType}`;
  }
}

function snippet(text: string, maxLen: number): string {
  const s = text.trim().replace(/\s+/gu, " ");
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function extractHookSignals(evalRaw: unknown): HookEvalSignals {
  if (!isPlainObject(evalRaw)) return { present: null, type: null, evidence: null, strength: null };
  const root = evalRaw as Record<string, unknown>;
  const evalObj = isPlainObject(root.eval_used) ? (root.eval_used as Record<string, unknown>) : root;

  // Hook fields.
  let present: boolean | null = null;
  let type: string | null = null;
  let evidence: string | null = null;
  const hookRaw = evalObj.hook;
  if (isPlainObject(hookRaw)) {
    const hookObj = hookRaw as Record<string, unknown>;
    present = typeof hookObj.present === "boolean" ? hookObj.present : null;
    type = safeString(hookObj.type);
    evidence = safeString(hookObj.evidence);
  }

  // Strength fields.
  let strength: number | null = null;
  const scoresRaw = evalObj.scores;
  if (isPlainObject(scoresRaw)) {
    const hsRaw = (scoresRaw as Record<string, unknown>).hook_strength;
    if (isPlainObject(hsRaw)) {
      strength = safeInt((hsRaw as Record<string, unknown>).score);
      if (evidence === null) evidence = safeString((hsRaw as Record<string, unknown>).evidence);
    }
  }
  if (strength === null) {
    const legacy = safeInt(evalObj.hook_strength);
    if (legacy !== null) strength = legacy;
  }
  if (strength === null && isPlainObject(hookRaw)) {
    const hookObj = hookRaw as Record<string, unknown>;
    const legacyStrength = safeInt(hookObj.strength);
    if (legacyStrength !== null) strength = legacyStrength;
    if (evidence === null) evidence = safeString(hookObj.evidence);
  }

  const hookType = type ? type.toLowerCase() : null;
  return { present, type: hookType, evidence, strength };
}

function normalizeExistingEntry(raw: unknown, now: string, warnings: string[]): HookLedgerEntry | null {
  if (!isPlainObject(raw)) {
    warnings.push("Dropped non-object hook ledger entry.");
    return null;
  }
  const obj = raw as Record<string, unknown>;
  const comments = pickCommentFields(obj);
  const id = safeString(obj.id);
  const chapter = safePositiveInt(obj.chapter);
  if (!id || chapter === null) {
    warnings.push("Dropped hook ledger entry missing id/chapter.");
    return null;
  }

  const hook_type = safeString(obj.hook_type)?.toLowerCase() ?? "unknown";
  let hook_strength = safeInt(obj.hook_strength);
  if (hook_strength === null || hook_strength < 1 || hook_strength > 5) {
    hook_strength = 3;
    warnings.push(`Hook ledger entry '${id}' has invalid hook_strength; defaulted to 3.`);
  }

  const promise_text = safeString(obj.promise_text) ?? hookPromiseText(hook_type);
  const status = safeHookStatus(obj.status) ?? "open";
  // Use an intentionally-invalid placeholder when missing; it will be backfilled during the next update pass.
  const fulfillment_window = safeWindow(obj.fulfillment_window) ?? [chapter + 1, chapter];
  const fulfilled_chapter = safePositiveInt(obj.fulfilled_chapter) ?? null;

  const created_at = safeIso(obj.created_at) ?? now;
  const updated_at = safeIso(obj.updated_at) ?? now;
  const evidence_snippet = safeString(obj.evidence_snippet) ?? undefined;

  const sources = isPlainObject(obj.sources) ? (obj.sources as Record<string, unknown>) : null;
  const eval_path = sources ? safeString(sources.eval_path) : null;

  const links = normalizeLinks(obj.links);

  const historyRaw = Array.isArray(obj.history) ? obj.history : null;
  const history: HookLedgerHistory = [];
  if (historyRaw) {
    for (const h of historyRaw) {
      if (!isPlainObject(h)) continue;
      const ho = h as Record<string, unknown>;
      const at = safeIso(ho.at) ?? null;
      const hChapter = safePositiveInt(ho.chapter);
      const action = safeString(ho.action);
      if (!at || hChapter === null || !action) continue;
      const detail = safeString(ho.detail) ?? undefined;
      history.push({ at, chapter: hChapter, action, ...(detail ? { detail } : {}) });
    }
  }

  const entry: HookLedgerEntry = {
    ...comments,
    id,
    chapter,
    hook_type,
    hook_strength,
    promise_text,
    status,
    fulfillment_window,
    fulfilled_chapter,
    created_at,
    updated_at,
    ...(evidence_snippet ? { evidence_snippet } : {}),
    ...(eval_path ? { sources: { eval_path } } : {}),
    ...(links ? { links } : {}),
    ...(history.length > 0 ? { history } : {})
  };

  return entry;
}

export async function loadHookLedger(rootDir: string): Promise<{ ledger: HookLedgerFile; warnings: string[] }> {
  const rel = "hook-ledger.json";
  const abs = join(rootDir, rel);
  if (!(await pathExists(abs))) {
    return {
      ledger: {
        $schema: "schemas/hook-ledger.schema.json",
        schema_version: 1,
        entries: []
      },
      warnings: []
    };
  }

  const raw = await readJsonFile(abs);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${rel}: expected a JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  const comments = pickCommentFields(obj);

  const schemaVersion = obj.schema_version;
  if (schemaVersion !== undefined && schemaVersion !== 1) {
    throw new NovelCliError(`Invalid ${rel}: 'schema_version' must be 1.`, 2);
  }

  const now = new Date().toISOString();
  const warnings: string[] = [];
  const entriesRaw = Array.isArray(obj.entries) ? obj.entries : [];
  const entries: HookLedgerEntry[] = [];
  for (const it of entriesRaw) {
    const entry = normalizeExistingEntry(it, now, warnings);
    if (entry) entries.push(entry);
  }

  return {
    ledger: {
      $schema: "schemas/hook-ledger.schema.json",
      schema_version: 1,
      entries,
      ...comments
    } as HookLedgerFile,
    warnings
  };
}

function retentionHistoryRel(args: { volume: number; start: number; end: number }): string {
  return `logs/retention/retention-report-vol-${pad2(args.volume)}-ch${pad3(args.start)}-ch${pad3(args.end)}.json`;
}

export async function writeHookLedgerFile(args: { rootDir: string; ledger: HookLedgerFile }): Promise<{ rel: string }> {
  const rel = "hook-ledger.json";
  await writeJsonFile(join(args.rootDir, rel), args.ledger);
  return { rel };
}

export async function writeRetentionLogs(args: {
  rootDir: string;
  report: RetentionReport;
  writeHistory: boolean;
}): Promise<{ latestRel: string; historyRel?: string }> {
  const dirRel = "logs/retention";
  const dirAbs = join(args.rootDir, dirRel);
  await ensureDir(dirAbs);

  const latestRel = `${dirRel}/latest.json`;
  await writeJsonFile(join(args.rootDir, latestRel), args.report);

  const result: { latestRel: string; historyRel?: string } = { latestRel };
  if (args.writeHistory) {
    const historyRel = retentionHistoryRel({
      volume: args.report.scope.volume,
      start: args.report.scope.chapter_start,
      end: args.report.scope.chapter_end
    });
    await writeJsonFile(join(args.rootDir, historyRel), args.report);
    result.historyRel = historyRel;
  }

  return result;
}

export async function attachHookLedgerToEval(args: {
  evalAbsPath: string;
  evalRelPath: string;
  ledgerRelPath: string;
  reportLatestRelPath: string;
  reportHistoryRelPath?: string;
  entry: HookLedgerEntry;
  report: RetentionReport;
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

  obj.hook_ledger = {
    ledger_path: args.ledgerRelPath,
    report_latest_path: args.reportLatestRelPath,
    ...(args.reportHistoryRelPath ? { report_history_path: args.reportHistoryRelPath } : {}),
    entry: {
      id: args.entry.id,
      chapter: args.entry.chapter,
      hook_type: args.entry.hook_type,
      hook_strength: args.entry.hook_strength,
      promise_text: args.entry.promise_text,
      status: args.entry.status,
      fulfillment_window: args.entry.fulfillment_window,
      fulfilled_chapter: args.entry.fulfilled_chapter,
      ...(args.entry.evidence_snippet ? { evidence_snippet: args.entry.evidence_snippet } : {})
    },
    issues_total: args.report.issues.length,
    issues_by_severity: bySeverity,
    has_blocking_issues: args.report.has_blocking_issues
  };

  await writeJsonFile(args.evalAbsPath, obj);
}

function summarizeEntry(e: HookLedgerEntry): HookLedgerEntrySummary {
  return {
    id: e.id,
    chapter: e.chapter,
    hook_type: e.hook_type,
    hook_strength: e.hook_strength,
    promise_text: e.promise_text,
    status: e.status,
    fulfillment_window: e.fulfillment_window,
    fulfilled_chapter: e.fulfilled_chapter,
    ...(e.evidence_snippet ? { evidence_snippet: e.evidence_snippet } : {})
  };
}

function computeMaxSameTypeStreak(typesByChapter: Array<{ chapter: number; hook_type: string | null }>): { max: number; type: string | null } {
  let max = 0;
  let maxType: string | null = null;
  let currentType: string | null = null;
  let current = 0;

  for (const it of typesByChapter) {
    const t = it.hook_type;
    if (!t || t === "none" || t === "unknown") {
      currentType = null;
      current = 0;
      continue;
    }
    if (currentType === t) {
      current += 1;
    } else {
      currentType = t;
      current = 1;
    }
    if (current > max) {
      max = current;
      maxType = currentType;
    }
  }

  return { max, type: maxType };
}

export function computeHookLedgerUpdate(args: {
  ledger: HookLedgerFile;
  evalRaw: unknown;
  chapter: number;
  volume: number;
  evalRelPath: string;
  policy: HookLedgerPolicy;
  reportRange: { start: number; end: number };
}): {
  updatedLedger: HookLedgerFile;
  entry: HookLedgerEntry | null;
  report: RetentionReport;
  newlyLapsed: HookLedgerEntry[];
  warnings: string[];
} {
  const now = new Date().toISOString();
  const warnings: string[] = [];
  const ledgerComments = pickCommentFields(args.ledger as Record<string, unknown>);

  const existingEntries: HookLedgerEntry[] = [];
  for (const it of args.ledger.entries) {
    const normalized = normalizeExistingEntry(it, now, warnings);
    if (normalized) existingEntries.push(normalized);
  }

  // Unique by chapter, prefer fulfilled over open over lapsed.
  const byChapter = new Map<number, HookLedgerEntry>();
  const dropped: HookLedgerEntry[] = [];
  const rank = (s: HookLedgerStatus): number => (s === "fulfilled" ? 3 : s === "open" ? 2 : 1);
  for (const e of existingEntries) {
    const prev = byChapter.get(e.chapter);
    if (!prev) {
      byChapter.set(e.chapter, e);
      continue;
    }
    if (rank(e.status) > rank(prev.status)) {
      dropped.push(prev);
      byChapter.set(e.chapter, e);
      continue;
    }
    dropped.push(e);
  }
  if (dropped.length > 0) {
    warnings.push(`Dropped ${dropped.length} duplicate hook ledger entries (duplicate chapter numbers).`);
  }

  const entries = Array.from(byChapter.values()).sort((a, b) => a.chapter - b.chapter || a.id.localeCompare(b.id, "en"));

  const evalSignals = extractHookSignals(args.evalRaw);
  const hookPresent = evalSignals.present === true;
  const hookType = evalSignals.type;
  const hookStrength = evalSignals.strength;
  const hookEvidence = evalSignals.evidence;

  let entry: HookLedgerEntry | null = null;
  if (hookPresent && hookType && hookType !== "none") {
    const id = `hook:ch${pad3(args.chapter)}`;
    const existing = entries.find((e) => e.chapter === args.chapter) ?? null;
    const baseCreatedAt = existing ? existing.created_at : now;
    const prevStatus = existing ? existing.status : "open";
    const prevFulfilled = existing ? existing.fulfilled_chapter : null;
    const prevLinks = existing ? normalizeLinks(existing.links) : null;
    const prevHistory = existing && Array.isArray(existing.history) ? (existing.history as HookLedgerHistory) : [];

    const windowStart = args.chapter + 1;
    const windowEnd = args.chapter + args.policy.fulfillment_window_chapters;
    const fulfillment_window: [number, number] = [windowStart, windowEnd];

    const nextHistory: HookLedgerHistory = prevHistory ? prevHistory.slice() : [];
    if (!existing) {
      nextHistory.push({ at: now, chapter: args.chapter, action: "opened" });
    }

    entry = {
      ...(existing ? { ...existing } : {}),
      id,
      chapter: args.chapter,
      hook_type: hookType,
      hook_strength: hookStrength && hookStrength >= 1 && hookStrength <= 5 ? hookStrength : 3,
      promise_text: hookPromiseText(hookType),
      status: prevStatus,
      fulfillment_window,
      fulfilled_chapter: prevStatus === "fulfilled" ? prevFulfilled : null,
      created_at: baseCreatedAt,
      updated_at: now,
      ...(hookEvidence ? { evidence_snippet: snippet(hookEvidence, 120) } : {}),
      sources: { eval_path: args.evalRelPath },
      ...(prevLinks ? { links: prevLinks } : {}),
      ...(nextHistory.length > 0 ? { history: nextHistory } : {})
    };

    // Upsert by chapter.
    const idx = entries.findIndex((e) => e.chapter === args.chapter);
    if (idx >= 0) entries[idx] = entry;
    else entries.push(entry);
  }

  // Backfill windows when missing/invalid.
  for (const e of entries) {
    const window = safeWindow(e.fulfillment_window);
    if (window) continue;
    e.fulfillment_window = [e.chapter + 1, e.chapter + args.policy.fulfillment_window_chapters];
    e.updated_at = now;
    const history: HookLedgerHistory = Array.isArray(e.history) ? (e.history as HookLedgerHistory) : [];
    history.push({ at: now, chapter: args.chapter, action: "window_backfilled" });
    e.history = history;
  }

  // Overdue detection: open promise past its inclusive window end => lapsed.
  const newlyLapsed: HookLedgerEntry[] = [];
  for (const e of entries) {
    if (e.status !== "open") continue;
    const window = safeWindow(e.fulfillment_window);
    if (!window) continue;
    const windowEnd = window[1];
    if (args.chapter <= windowEnd) continue;
    e.status = "lapsed";
    e.fulfilled_chapter = null;
    e.updated_at = now;
    const history: HookLedgerHistory = Array.isArray(e.history) ? (e.history as HookLedgerHistory) : [];
    history.push({ at: now, chapter: args.chapter, action: "lapsed", detail: `overdue after ch${pad3(windowEnd)}` });
    e.history = history;
    newlyLapsed.push(e);
  }

  const updatedLedger: HookLedgerFile = {
    $schema: "schemas/hook-ledger.schema.json",
    schema_version: 1,
    entries: entries.sort((a, b) => a.chapter - b.chapter || a.id.localeCompare(b.id, "en")),
    ...ledgerComments
  };

  // Diversity window computed over last N chapters (based on available ledger entries).
  const diversityStart = Math.max(1, args.chapter - args.policy.diversity_window_chapters + 1);
  const diversityEnd = args.chapter;
  const byChap = new Map<number, HookLedgerEntry>();
  for (const e of updatedLedger.entries) byChap.set(e.chapter, e);
  const typesByChapter: Array<{ chapter: number; hook_type: string | null }> = [];
  for (let c = diversityStart; c <= diversityEnd; c += 1) {
    const e = byChap.get(c) ?? null;
    const t = e ? e.hook_type : null;
    typesByChapter.push({ chapter: c, hook_type: t });
  }

  const distinctTypes = new Set<string>();
  for (const it of typesByChapter) {
    const t = it.hook_type;
    if (!t || t === "none" || t === "unknown") continue;
    distinctTypes.add(t);
  }

  const maxStreak = computeMaxSameTypeStreak(typesByChapter);
  const issues: RetentionIssue[] = [];

  if (newlyLapsed.length > 0) {
    const sample = newlyLapsed[0];
    const sev = args.policy.overdue_policy;
    issues.push({
      id: "retention.hook_ledger.hook_debt",
      severity: sev,
      summary: `Hook debt detected: ${newlyLapsed.length} promise(s) lapsed (window exceeded).`,
      evidence: sample ? `e.g. ${sample.id} (ch${pad3(sample.chapter)} window ${sample.fulfillment_window[0]}-${sample.fulfillment_window[1]})` : undefined,
      suggestion: "Fulfill promises within the configured window, or mark fulfilled in hook-ledger.json when paid off."
    });
  }

  if (maxStreak.max > args.policy.max_same_type_streak) {
    issues.push({
      id: "retention.hook_ledger.diversity.streak_exceeded",
      severity: args.policy.overdue_policy,
      summary: `Hook type streak ${maxStreak.max} exceeds max ${args.policy.max_same_type_streak} in the last ${args.policy.diversity_window_chapters} chapters.`,
      evidence: maxStreak.type ? `type=${maxStreak.type}` : undefined,
      suggestion: "Rotate hook types across consecutive chapters to reduce reader fatigue."
    });
  }

  if (distinctTypes.size < args.policy.min_distinct_types_in_window) {
    issues.push({
      id: "retention.hook_ledger.diversity.low_distinct_types",
      severity: args.policy.overdue_policy,
      summary: `Low hook type diversity: ${distinctTypes.size} distinct type(s) in the last ${args.policy.diversity_window_chapters} chapters (min ${args.policy.min_distinct_types_in_window}).`,
      suggestion: "Introduce at least one additional hook type within the diversity window."
    });
  }

  const open = updatedLedger.entries.filter((e) => e.status === "open").map(summarizeEntry);
  const lapsed = updatedLedger.entries.filter((e) => e.status === "lapsed").map(summarizeEntry);

  const hasBlocking = args.policy.overdue_policy === "hard" && issues.some((i) => i.severity === "hard");
  const report: RetentionReport = {
    schema_version: 1,
    generated_at: now,
    as_of: { chapter: args.chapter, volume: args.volume },
    scope: { volume: args.volume, chapter_start: args.reportRange.start, chapter_end: args.reportRange.end },
    policy: args.policy,
    ledger_path: "hook-ledger.json",
    stats: {
      entries_total: updatedLedger.entries.length,
      open_total: open.length,
      fulfilled_total: updatedLedger.entries.filter((e) => e.status === "fulfilled").length,
      lapsed_total: lapsed.length
    },
    debt: {
      newly_lapsed_total: newlyLapsed.length,
      open,
      lapsed
    },
    diversity: {
      window_chapters: args.policy.diversity_window_chapters,
      range: { start: diversityStart, end: diversityEnd },
      distinct_types_in_window: distinctTypes.size,
      min_distinct_types_in_window: args.policy.min_distinct_types_in_window,
      max_same_type_streak_in_window: maxStreak.max,
      max_same_type_streak_allowed: args.policy.max_same_type_streak,
      types_by_chapter: typesByChapter
    },
    issues,
    has_blocking_issues: hasBlocking
  };

  return { updatedLedger, entry, report, newlyLapsed, warnings };
}
