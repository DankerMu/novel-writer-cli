import { readdir, rename, rm } from "node:fs/promises";
import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile } from "./fs-utils.js";
import type { SeverityPolicy } from "./platform-profile.js";
import { pad2, pad3 } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

export type PromiseType = "selling_point" | "core_mystery" | "mechanism" | "relationship_arc";
export type PromiseStatus = "promised" | "advanced" | "delivered";

export type PromiseLedgerHistoryEvent = {
  chapter: number;
  action: string;
  note?: string;
  at?: string;
};

type CommentFields = Partial<Record<`_${string}`, unknown>>;

export type PromiseLedgerEntry = CommentFields & {
  id: string;
  type: PromiseType;
  promise_text: string;
  status: PromiseStatus;
  introduced_chapter: number;
  last_touched_chapter: number;
  delivered_chapter?: number | null;
  links?: { hook_entry_ids?: string[]; foreshadowing_ids?: string[] };
  history?: PromiseLedgerHistoryEvent[];
};

export type PromiseLedgerPolicy = {
  dormancy_threshold_chapters: number;
};

export type PromiseLedgerFile = CommentFields & {
  $schema?: string;
  schema_version: 1;
  policy?: PromiseLedgerPolicy;
  entries: PromiseLedgerEntry[];
};

export type PromiseLedgerIssue = {
  id: string;
  severity: SeverityPolicy;
  summary: string;
  evidence?: string;
  suggestion?: string;
};

export type PromiseLedgerDormantPromise = Pick<
  PromiseLedgerEntry,
  "id" | "type" | "promise_text" | "status" | "introduced_chapter" | "last_touched_chapter"
> & {
  chapters_since_last_touch: number;
  dormancy_threshold_chapters: number;
  suggestion: string;
};

export type PromiseLedgerReport = {
  schema_version: 1;
  generated_at: string;
  as_of: { chapter: number; volume: number };
  scope: { volume: number; chapter_start: number; chapter_end: number };
  ledger_path: string;
  policy: PromiseLedgerPolicy;
  stats: {
    total_promises: number;
    promised_total: number;
    advanced_total: number;
    delivered_total: number;
    open_total: number;
    dormant_total: number;
  };
  dormant_promises: PromiseLedgerDormantPromise[];
  issues: PromiseLedgerIssue[];
  has_blocking_issues: boolean;
};

const DEFAULT_POLICY: PromiseLedgerPolicy = { dormancy_threshold_chapters: 12 };
const PROMISE_TYPES: PromiseType[] = ["selling_point", "core_mystery", "mechanism", "relationship_arc"];
const PROMISE_STATUSES: PromiseStatus[] = ["promised", "advanced", "delivered"];

function pickCommentFields(obj: Record<string, unknown>): CommentFields {
  const out = Object.create(null) as CommentFields;
  for (const [k, v] of Object.entries(obj)) {
    if (!k.startsWith("_")) continue;
    if (k === "__proto__" || k === "constructor" || k === "prototype") continue;
    out[k as `_${string}`] = v;
  }
  return out;
}

function safePositiveInt(v: unknown): number | null {
  return typeof v === "number" && Number.isInteger(v) && v >= 1 ? v : null;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length > 0 ? t : null;
}

function safePromiseType(v: unknown): PromiseType | null {
  if (v === "selling_point" || v === "core_mystery" || v === "mechanism" || v === "relationship_arc") return v;
  return null;
}

function safePromiseStatus(v: unknown): PromiseStatus | null {
  if (v === "promised" || v === "advanced" || v === "delivered") return v;
  return null;
}

const RFC3339_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function safeIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!RFC3339_DATE_TIME.test(t)) return null;
  if (!Number.isFinite(Date.parse(t))) return null;
  return t;
}

function normalizeStringIds(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const uniq = Array.from(new Set(raw.filter((v) => typeof v === "string").map((v) => (v as string).trim()).filter((v) => v.length > 0)));
  return uniq.length > 0 ? uniq : null;
}

function normalizeLinks(raw: unknown): { hook_entry_ids?: string[]; foreshadowing_ids?: string[] } | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const hook_entry_ids = normalizeStringIds(obj.hook_entry_ids);
  const foreshadowing_ids = normalizeStringIds(obj.foreshadowing_ids);
  const out: { hook_entry_ids?: string[]; foreshadowing_ids?: string[] } = {};
  if (hook_entry_ids) out.hook_entry_ids = hook_entry_ids;
  if (foreshadowing_ids) out.foreshadowing_ids = foreshadowing_ids;
  return Object.keys(out).length > 0 ? out : null;
}

function normalizeExistingEntry(raw: unknown, warnings: string[]): PromiseLedgerEntry | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  const comments = pickCommentFields(obj);

  const id = safeString(obj.id);
  if (!id) {
    warnings.push("Dropped promise ledger entry missing required 'id'.");
    return null;
  }

  const type = safePromiseType(obj.type);
  if (!type) {
    warnings.push(`Dropped promise ledger entry '${id}': invalid 'type'.`);
    return null;
  }

  const promise_text = safeString(obj.promise_text);
  if (!promise_text) {
    warnings.push(`Dropped promise ledger entry '${id}': missing required 'promise_text'.`);
    return null;
  }

  const introduced_chapter = safePositiveInt(obj.introduced_chapter);
  if (introduced_chapter === null) {
    warnings.push(`Dropped promise ledger entry '${id}': invalid 'introduced_chapter'.`);
    return null;
  }

  const lastRaw = obj.last_touched_chapter;
  let last_touched_chapter = safePositiveInt(lastRaw);
  if (last_touched_chapter === null) {
    if (lastRaw !== undefined) {
      warnings.push(`Promise ledger entry '${id}': invalid 'last_touched_chapter' (defaulted to introduced_chapter).`);
    }
    last_touched_chapter = introduced_chapter;
  }
  if (last_touched_chapter < introduced_chapter) {
    warnings.push(
      `Promise ledger entry '${id}': last_touched_chapter (${last_touched_chapter}) < introduced_chapter (${introduced_chapter}); clamped.`
    );
    last_touched_chapter = introduced_chapter;
  }

  const statusRaw = obj.status;
  const statusParsed = safePromiseStatus(statusRaw);
  const status = statusParsed ?? "promised";
  if (statusRaw !== undefined && statusParsed === null) {
    warnings.push(`Promise ledger entry '${id}': invalid 'status' (defaulted to 'promised').`);
  }

  const deliveredRaw = obj.delivered_chapter;
  let delivered_chapter: number | null | undefined;
  if (deliveredRaw === undefined) {
    delivered_chapter = undefined;
  } else if (deliveredRaw === null) {
    delivered_chapter = null;
  } else {
    const parsed = safePositiveInt(deliveredRaw);
    if (parsed === null) {
      warnings.push(`Promise ledger entry '${id}': ignoring invalid 'delivered_chapter'.`);
      delivered_chapter = undefined;
    } else {
      delivered_chapter = parsed;
    }
  }

  const links = normalizeLinks(obj.links);

  const historyRaw = Array.isArray(obj.history) ? obj.history : null;
  const history: PromiseLedgerHistoryEvent[] = [];
  if (historyRaw) {
    for (const it of historyRaw) {
      if (!isPlainObject(it)) continue;
      const ho = it as Record<string, unknown>;
      const chapter = safePositiveInt(ho.chapter);
      const action = safeString(ho.action);
      if (chapter === null || !action) continue;
      const note = safeString(ho.note) ?? undefined;
      const at = safeIso(ho.at) ?? undefined;
      history.push({ chapter, action, ...(note ? { note } : {}), ...(at ? { at } : {}) });
    }
  }

  return {
    ...comments,
    id,
    type,
    promise_text,
    status,
    introduced_chapter,
    last_touched_chapter,
    ...(delivered_chapter === undefined ? {} : { delivered_chapter }),
    ...(links ? { links } : {}),
    ...(history.length > 0 ? { history } : {})
  };
}

export async function loadPromiseLedger(rootDir: string): Promise<{ ledger: PromiseLedgerFile; warnings: string[] }> {
  const rel = "promise-ledger.json";
  const abs = join(rootDir, rel);
  if (!(await pathExists(abs))) {
    return {
      ledger: { $schema: "schemas/promise-ledger.schema.json", schema_version: 1, policy: DEFAULT_POLICY, entries: [] },
      warnings: []
    };
  }

  const raw = await readJsonFile(abs);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${rel}: expected a JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  const comments = pickCommentFields(obj);

  if (obj.schema_version === undefined) throw new NovelCliError(`Invalid ${rel}: missing required 'schema_version'.`, 2);
  if (obj.schema_version !== 1) throw new NovelCliError(`Invalid ${rel}: 'schema_version' must be 1.`, 2);

  if (obj.entries === undefined) throw new NovelCliError(`Invalid ${rel}: missing required 'entries' array.`, 2);
  if (!Array.isArray(obj.entries)) throw new NovelCliError(`Invalid ${rel}: 'entries' must be an array.`, 2);

  const warnings: string[] = [];

  let policy: PromiseLedgerPolicy = { ...DEFAULT_POLICY };
  if (obj.policy !== undefined) {
    if (!isPlainObject(obj.policy)) {
      warnings.push("Promise ledger: ignoring invalid 'policy' (expected object).");
    } else {
      const p = obj.policy as Record<string, unknown>;
      const dormancy = safePositiveInt(p.dormancy_threshold_chapters);
      if (dormancy !== null) policy = { dormancy_threshold_chapters: dormancy };
      else warnings.push("Promise ledger: ignoring invalid 'policy.dormancy_threshold_chapters' (expected int >= 1).");
    }
  }

  const entries: PromiseLedgerEntry[] = [];
  for (const it of obj.entries) {
    const normalized = normalizeExistingEntry(it, warnings);
    if (normalized) entries.push(normalized);
  }
  entries.sort((a, b) => a.introduced_chapter - b.introduced_chapter || a.id.localeCompare(b.id, "en"));

  return {
    ledger: {
      $schema: "schemas/promise-ledger.schema.json",
      schema_version: 1,
      policy,
      entries,
      ...comments
    } as PromiseLedgerFile,
    warnings
  };
}

export async function writePromiseLedgerFile(args: { rootDir: string; ledger: PromiseLedgerFile }): Promise<{ rel: string }> {
  const rel = "promise-ledger.json";
  await writeJsonFile(join(args.rootDir, rel), args.ledger);
  return { rel };
}

function makeLightTouchSuggestion(entry: Pick<PromiseLedgerEntry, "type" | "promise_text">): string {
  const label = `「${entry.promise_text}」`;
  if (entry.type === "core_mystery") {
    return `轻触谜团 ${label}：加入一个微小线索/旁观者反应/道具细节，让读者记起这个问题（不要揭示答案）。`;
  }
  if (entry.type === "mechanism") {
    return `轻触机制 ${label}：用一次小规模应用或副作用展示规则边界/代价（避免大段解释或直接兑现）。`;
  }
  if (entry.type === "relationship_arc") {
    return `轻触关系弧 ${label}：安排一段短对话/互相试探/小误会来推进关系张力（避免直接给出最终结论）。`;
  }
  return `轻触卖点 ${label}：用一个小收益/小代价/小反转提醒读者该卖点仍在运转（不要直接兑现最终大回报）。`;
}

export function computePromiseLedgerReport(args: {
  ledger: PromiseLedgerFile;
  asOfChapter: number;
  volume: number;
  chapterRange: { start: number; end: number };
}): PromiseLedgerReport {
  const start = args.chapterRange.start;
  const end = args.chapterRange.end;

  if (!Number.isInteger(args.asOfChapter) || args.asOfChapter < 1) {
    throw new Error(`Invalid asOfChapter: ${String(args.asOfChapter)} (expected int >= 1).`);
  }
  if (!Number.isInteger(args.volume) || args.volume < 0) throw new Error(`Invalid volume: ${String(args.volume)} (expected int >= 0).`);
  if (!Number.isInteger(start) || start < 1) throw new Error(`Invalid chapterRange.start: ${String(start)} (expected int >= 1).`);
  if (!Number.isInteger(end) || end < start) throw new Error(`Invalid chapterRange.end: ${String(end)} (expected int >= start=${start}).`);
  if (args.asOfChapter < end) {
    throw new Error(`Invalid asOfChapter: ${String(args.asOfChapter)} (expected int >= chapterRange.end=${end}).`);
  }

  const policy = args.ledger.policy ?? DEFAULT_POLICY;
  const threshold = policy.dormancy_threshold_chapters;

  let promised_total = 0;
  let advanced_total = 0;
  let delivered_total = 0;

  const dormant_promises: PromiseLedgerDormantPromise[] = [];

  for (const e of args.ledger.entries) {
    if (e.status === "promised") promised_total += 1;
    else if (e.status === "advanced") advanced_total += 1;
    else if (e.status === "delivered") delivered_total += 1;

    if (e.status === "delivered") continue;
    const since = Math.max(0, args.asOfChapter - e.last_touched_chapter);
    if (since < threshold) continue;
    dormant_promises.push({
      id: e.id,
      type: e.type,
      promise_text: e.promise_text,
      status: e.status,
      introduced_chapter: e.introduced_chapter,
      last_touched_chapter: e.last_touched_chapter,
      chapters_since_last_touch: since,
      dormancy_threshold_chapters: threshold,
      suggestion: makeLightTouchSuggestion(e)
    });
  }

  dormant_promises.sort((a, b) => b.chapters_since_last_touch - a.chapters_since_last_touch || a.id.localeCompare(b.id, "en"));

  const issues: PromiseLedgerIssue[] = [];

  const open_total = promised_total + advanced_total;
  const highRiskOpenThreshold = Math.max(10, threshold);
  if (open_total >= highRiskOpenThreshold) {
    issues.push({
      id: "promise_ledger.high_risk.too_many_open",
      severity: "warn",
      summary: `High open promise load: open_total=${open_total} (promised=${promised_total}, advanced=${advanced_total}).`,
      suggestion: "Consider delivering/closing a few promises or adding small touches to reduce perceived stalling."
    });
  }

  if (dormant_promises.length > 0) {
    const top = dormant_promises.slice(0, 5);
    const summaries = top.map((d) => `${d.id}:${d.chapters_since_last_touch}ch`).join(" | ");
    const suffix = dormant_promises.length > top.length ? " …" : "";
    issues.push({
      id: "promise_ledger.dormancy.dormant_promises",
      severity: "warn",
      summary: `Dormant promises detected (threshold=${threshold} chapters). ${summaries}${suffix}`,
      suggestion: "Use the light-touch suggestions to remind readers without spoiling payoffs."
    });
  }

  // Very lightweight "advancement rate" proxy: how many open promises were touched in this range.
  const touchedInRange = args.ledger.entries.filter((e) => e.status !== "delivered" && e.last_touched_chapter >= start && e.last_touched_chapter <= end).length;
  const touchRate = open_total > 0 ? touchedInRange / open_total : 1;
  if (open_total > 0 && touchRate < 0.2) {
    issues.push({
      id: "promise_ledger.high_risk.low_touch_rate",
      severity: "warn",
      summary: `Low promise touch rate in this range: touched_in_range=${touchedInRange}/${open_total} (${Math.round(touchRate * 100)}%).`,
      evidence: `range=ch${pad3(start)}-ch${pad3(end)}`,
      suggestion: "Consider allocating 1-2 small beats per chapter to keep core promises visible."
    });
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    as_of: { chapter: args.asOfChapter, volume: args.volume },
    scope: { volume: args.volume, chapter_start: start, chapter_end: end },
    ledger_path: "promise-ledger.json",
    policy,
    stats: {
      total_promises: args.ledger.entries.length,
      promised_total,
      advanced_total,
      delivered_total,
      open_total,
      dormant_total: dormant_promises.length
    },
    dormant_promises,
    issues,
    has_blocking_issues: false
  };
}

export async function writePromiseLedgerLogs(args: {
  rootDir: string;
  report: PromiseLedgerReport;
  historyRange?: { start: number; end: number } | null;
}): Promise<{ latestRel: string; historyRel?: string }> {
  const dirRel = "logs/promises";
  const dirAbs = join(args.rootDir, dirRel);
  await ensureDir(dirAbs);

  const latestRel = `${dirRel}/latest.json`;
  const latestAbs = join(args.rootDir, latestRel);

  const result: { latestRel: string; historyRel?: string } = { latestRel };
  if (args.historyRange) {
    const historyRel = `${dirRel}/promise-ledger-report-vol-${pad2(args.report.scope.volume)}-ch${pad3(args.historyRange.start)}-ch${pad3(
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
    const chapter = (asOf as Record<string, unknown>).chapter;
    if (typeof chapter !== "number" || !Number.isInteger(chapter) || chapter < 0) return null;
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
    const tmpAbs = join(dirAbs, `.tmp-promises-latest-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
    await writeJsonFile(tmpAbs, args.report);
    try {
      // Re-check right before publish to reduce (not eliminate) races without introducing a lock.
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

export async function loadPromiseLedgerLatestSummary(rootDir: string): Promise<Record<string, unknown> | null> {
  const rel = "logs/promises/latest.json";
  const abs = join(rootDir, rel);
  if (!(await pathExists(abs))) return null;
  try {
    const raw = await readJsonFile(abs);
    return summarizePromiseLedgerReport(raw);
  } catch {
    return null;
  }
}

export function summarizePromiseLedgerReport(raw: unknown): Record<string, unknown> | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;

  const truncateWithEllipsis = (text: string, maxLen: number): string => {
    if (text.length <= maxLen) return text;
    if (maxLen <= 0) return "";
    if (maxLen === 1) return "…";
    let end = Math.max(0, maxLen - 1);
    if (end > 0) {
      const last = text.charCodeAt(end - 1);
      if (last >= 0xd800 && last <= 0xdbff) {
        const next = text.charCodeAt(end);
        if (next >= 0xdc00 && next <= 0xdfff) end -= 1;
      }
    }
    return `${text.slice(0, end)}…`;
  };

  const safeIntOrNull = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
  const safeStringOrNull = (v: unknown, maxLen: number): string | null => {
    if (typeof v !== "string") return null;
    const t = v.trim();
    if (t.length === 0) return null;
    return truncateWithEllipsis(t, maxLen);
  };

  const asOfRaw = isPlainObject(obj.as_of) ? (obj.as_of as Record<string, unknown>) : null;
  const scopeRaw = isPlainObject(obj.scope) ? (obj.scope as Record<string, unknown>) : null;
  const statsRaw = isPlainObject(obj.stats) ? (obj.stats as Record<string, unknown>) : null;
  const policyRaw = isPlainObject(obj.policy) ? (obj.policy as Record<string, unknown>) : null;
  const issuesRaw = Array.isArray(obj.issues) ? (obj.issues as unknown[]) : [];
  const dormantRaw = Array.isArray(obj.dormant_promises) ? (obj.dormant_promises as unknown[]) : [];

  const as_of = asOfRaw
    ? {
        chapter: safeIntOrNull(asOfRaw.chapter),
        volume: safeIntOrNull(asOfRaw.volume)
      }
    : null;

  const scope = scopeRaw
    ? {
        volume: safeIntOrNull(scopeRaw.volume),
        chapter_start: safeIntOrNull(scopeRaw.chapter_start),
        chapter_end: safeIntOrNull(scopeRaw.chapter_end)
      }
    : null;

  const policy = policyRaw
    ? {
        dormancy_threshold_chapters: safeIntOrNull(policyRaw.dormancy_threshold_chapters)
      }
    : null;

  const stats = statsRaw
    ? {
        total_promises: safeIntOrNull(statsRaw.total_promises),
        promised_total: safeIntOrNull(statsRaw.promised_total),
        advanced_total: safeIntOrNull(statsRaw.advanced_total),
        delivered_total: safeIntOrNull(statsRaw.delivered_total),
        open_total: safeIntOrNull(statsRaw.open_total),
        dormant_total: safeIntOrNull(statsRaw.dormant_total)
      }
    : null;

  const issues = issuesRaw
    .filter(isPlainObject)
    .slice(0, 5)
    .map((it) => {
      const issue = it as Record<string, unknown>;
      return {
        id: safeStringOrNull(issue.id, 240),
        severity: safeStringOrNull(issue.severity, 32),
        summary: safeStringOrNull(issue.summary, 240),
        suggestion: safeStringOrNull(issue.suggestion, 200)
      };
    });

  const dormant_promises = dormantRaw
    .filter(isPlainObject)
    .slice(0, 5)
    .map((it) => {
      const d = it as Record<string, unknown>;
      return {
        id: safeStringOrNull(d.id, 80),
        type: safeStringOrNull(d.type, 40),
        promise_text: safeStringOrNull(d.promise_text, 160),
        status: safeStringOrNull(d.status, 40),
        chapters_since_last_touch: safeIntOrNull(d.chapters_since_last_touch),
        suggestion: safeStringOrNull(d.suggestion, 200)
      };
    });

  const has_blocking_issues = typeof obj.has_blocking_issues === "boolean" ? obj.has_blocking_issues : null;

  return {
    as_of,
    scope,
    policy,
    stats,
    dormant_promises,
    issues,
    has_blocking_issues
  };
}

export type PromiseSeedCandidate = {
  type: PromiseType;
  promise_text: string;
  introduced_chapter: number;
  sources: string[];
};

function normalizeSeedText(text: string): string {
  return text.trim().replace(/\s+/gu, " ").replace(/[。！？；，、]+$/gu, "");
}

function guessTypeFromHeading(heading: string): PromiseType | null {
  const h = heading.toLowerCase();
  if (heading.includes("卖点") || heading.includes("爽点") || h.includes("selling") || h.includes("highlight")) return "selling_point";
  if (heading.includes("谜") || h.includes("mystery") || h.includes("suspense")) return "core_mystery";
  if (heading.includes("机制") || heading.includes("系统") || heading.includes("规则") || h.includes("mechanism") || h.includes("system")) return "mechanism";
  const hasCp = /\bcp\b/u.test(h);
  if (heading.includes("关系") || heading.includes("感情") || hasCp || h.includes("relationship")) return "relationship_arc";
  return null;
}

function guessTypeFromText(text: string): PromiseType {
  const t = text;
  if (t.includes("谜") || t.includes("真相") || t.includes("身份")) return "core_mystery";
  if (t.includes("系统") || t.includes("机制") || t.includes("规则") || t.includes("代价")) return "mechanism";
  if (t.includes("关系") || t.includes("感情") || t.includes("误会") || t.includes("和好")) return "relationship_arc";
  return "selling_point";
}

function extractMarkdownBullets(args: {
  markdown: string;
  defaultIntroducedChapter: number;
  typeHintFromHeading: boolean;
  source: string;
}): PromiseSeedCandidate[] {
  const lines = args.markdown.split(/\r?\n/gu);
  let currentHeading: string | null = null;
  const out: PromiseSeedCandidate[] = [];

  for (const line of lines) {
    const heading = /^(?:\uFEFF)?\s{0,3}#{1,6}\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      currentHeading = heading[1]?.trim() ?? null;
      continue;
    }

    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/u.exec(line);
    if (!bullet) continue;
    const raw = bullet[1] ?? "";
    const cleaned = normalizeSeedText(raw);
    if (cleaned.length < 2) continue;
    if (cleaned.length > 120) continue;

    const type = args.typeHintFromHeading && currentHeading ? guessTypeFromHeading(currentHeading) : null;
    out.push({
      type: type ?? guessTypeFromText(cleaned),
      promise_text: cleaned,
      introduced_chapter: args.defaultIntroducedChapter,
      sources: [args.source]
    });
  }

  return out;
}

async function listRecentSummaryFiles(rootDir: string, max: number): Promise<Array<{ chapter: number; rel: string }>> {
  const dirRel = "summaries";
  const dirAbs = join(rootDir, dirRel);
  if (!(await pathExists(dirAbs))) return [];

  const entries = await readdir(dirAbs, { withFileTypes: true });
  const files = entries
    .filter((e) => e.isFile() && e.name.startsWith("chapter-") && e.name.endsWith("-summary.md"))
    .map((e) => e.name);

  const parsed: Array<{ chapter: number; rel: string }> = [];
  for (const name of files) {
    const m = /^chapter-(\d{3})-summary\.md$/u.exec(name);
    if (!m) continue;
    const chapter = Number.parseInt(m[1] ?? "", 10);
    if (!Number.isInteger(chapter) || chapter < 1) continue;
    parsed.push({ chapter, rel: `${dirRel}/${name}` });
  }

  parsed.sort((a, b) => b.chapter - a.chapter);
  return parsed.slice(0, Math.max(0, max)).sort((a, b) => a.chapter - b.chapter);
}

function extractSummaryKeyEvents(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/gu);
  const out: string[] = [];
  let inKeyEvents = false;
  for (const line of lines) {
    const heading = /^(?:\uFEFF)?\s{0,3}#{1,6}\s+(.+?)\s*$/u.exec(line);
    if (heading) {
      const title = (heading[1] ?? "").trim();
      inKeyEvents = title.includes("关键事件");
      continue;
    }
    if (!inKeyEvents) continue;
    const bullet = /^\s*(?:[-*]|\d+\.)\s+(.+?)\s*$/u.exec(line);
    if (!bullet) continue;
    const cleaned = normalizeSeedText(bullet[1] ?? "");
    if (cleaned.length < 2) continue;
    if (cleaned.length > 120) continue;
    out.push(cleaned);
  }
  return out;
}

function makePromiseId(n: number): string {
  return `promise:p${pad3(n)}`;
}

export async function buildPromiseLedgerSeed(args: {
  rootDir: string;
  volume: number;
  maxRecentSummaries?: number;
}): Promise<{ ledger: PromiseLedgerFile; candidates: PromiseSeedCandidate[] }> {
  const now = new Date().toISOString();
  const candidates: PromiseSeedCandidate[] = [];

  const briefAbs = join(args.rootDir, "brief.md");
  if (await pathExists(briefAbs)) {
    const brief = await readTextFile(briefAbs);
    candidates.push(
      ...extractMarkdownBullets({
        markdown: brief,
        defaultIntroducedChapter: 1,
        typeHintFromHeading: true,
        source: "brief.md"
      })
    );
  }

  const outlineRel = `volumes/vol-${pad2(args.volume)}/outline.md`;
  const outlineAbs = join(args.rootDir, outlineRel);
  if (await pathExists(outlineAbs)) {
    const outline = await readTextFile(outlineAbs);
    candidates.push(
      ...extractMarkdownBullets({
        markdown: outline,
        defaultIntroducedChapter: 1,
        typeHintFromHeading: true,
        source: outlineRel
      })
    );
  }

  const maxSummaries = Math.max(0, args.maxRecentSummaries ?? 10);
  const summaryFiles = await listRecentSummaryFiles(args.rootDir, maxSummaries);
  for (const sf of summaryFiles) {
    const abs = join(args.rootDir, sf.rel);
    const md = await readTextFile(abs);
    const events = extractSummaryKeyEvents(md);
    for (const ev of events) {
      candidates.push({
        type: guessTypeFromText(ev),
        promise_text: ev,
        introduced_chapter: sf.chapter,
        sources: [sf.rel]
      });
    }
  }

  const byKey = new Map<string, PromiseSeedCandidate>();
  for (const c of candidates) {
    const key = c.promise_text.toLowerCase();
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, { ...c, sources: c.sources.slice() });
      continue;
    }
    existing.introduced_chapter = Math.min(existing.introduced_chapter, c.introduced_chapter);
    for (const s of c.sources) if (!existing.sources.includes(s)) existing.sources.push(s);
  }

  const deduped = Array.from(byKey.values()).sort(
    (a, b) =>
      PROMISE_TYPES.indexOf(a.type) - PROMISE_TYPES.indexOf(b.type) ||
      a.introduced_chapter - b.introduced_chapter ||
      a.promise_text.localeCompare(b.promise_text, "zh")
  );

  const entries: PromiseLedgerEntry[] = deduped.map((c, i) => {
    const introduced = c.introduced_chapter;
    const id = makePromiseId(i + 1);
    const note = c.sources.length > 0 ? `seeded_from: ${c.sources.join(", ")}` : "seeded";
    return {
      id,
      type: c.type,
      promise_text: c.promise_text,
      status: "promised",
      introduced_chapter: introduced,
      last_touched_chapter: introduced,
      history: [{ chapter: introduced, action: "seeded", note, at: now }]
    };
  });

  return {
    ledger: {
      $schema: "schemas/promise-ledger.schema.json",
      schema_version: 1,
      policy: DEFAULT_POLICY,
      entries,
      _seeded_at: now,
      _seed_volume: args.volume
    },
    candidates: deduped
  };
}

export async function ensurePromiseLedgerInitialized(args: {
  rootDir: string;
  volume: number;
  maxRecentSummaries?: number;
  apply: boolean;
}): Promise<{ wrote: boolean; rel: string; ledger: PromiseLedgerFile; candidates: PromiseSeedCandidate[] }> {
  const rel = "promise-ledger.json";
  const abs = join(args.rootDir, rel);
  if (await pathExists(abs)) {
    const loaded = await loadPromiseLedger(args.rootDir);
    return { wrote: false, rel, ledger: loaded.ledger, candidates: [] };
  }

  const { ledger, candidates } = await buildPromiseLedgerSeed({
    rootDir: args.rootDir,
    volume: args.volume,
    maxRecentSummaries: args.maxRecentSummaries
  });

  if (args.apply) {
    await writePromiseLedgerFile({ rootDir: args.rootDir, ledger });
    return { wrote: true, rel, ledger, candidates };
  }

  return { wrote: false, rel, ledger, candidates };
}

export function validatePromiseLedgerForReport(ledger: PromiseLedgerFile): void {
  if (ledger.schema_version !== 1) throw new Error("promise-ledger schema_version must be 1");
  if (!Array.isArray(ledger.entries)) throw new Error("promise-ledger entries must be an array");
  for (const e of ledger.entries) {
    if (!safeString(e.id)) throw new Error("promise-ledger entry.id must be a non-empty string");
    if (!PROMISE_TYPES.includes(e.type)) throw new Error(`promise-ledger entry.type must be one of: ${PROMISE_TYPES.join(", ")}`);
    if (!safeString(e.promise_text)) throw new Error("promise-ledger entry.promise_text must be a non-empty string");
    if (!PROMISE_STATUSES.includes(e.status)) throw new Error(`promise-ledger entry.status must be one of: ${PROMISE_STATUSES.join(", ")}`);
    if (safePositiveInt(e.introduced_chapter) === null) throw new Error("promise-ledger entry.introduced_chapter must be int >= 1");
    if (safePositiveInt(e.last_touched_chapter) === null) throw new Error("promise-ledger entry.last_touched_chapter must be int >= 1");
  }
}
