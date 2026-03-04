import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { pathExists, readJsonFile, readTextFile } from "./fs-utils.js";
import { tryResolveVolumeChapterRange } from "./consistency-auditor.js";
import { formatStepId, pad2, pad3 } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

import type { NextStepResult } from "./next-step.js";

export const VOL_REVIEW_RELS = {
  dir: "staging/vol-review",
  qualitySummary: "staging/vol-review/quality-summary.json",
  auditReport: "staging/vol-review/audit-report.json",
  reviewReport: "staging/vol-review/review-report.md",
  foreshadowStatus: "staging/vol-review/foreshadow-status.json"
} as const;

export type VolumeReviewQualitySummary = {
  schema_version: 1;
  generated_at: string;
  as_of: { volume: number; chapter: number };
  chapter_range: [number, number];
  stats: {
    chapters_total: number;
    chapters_with_eval: number;
    overall_avg: number | null;
    overall_min: number | null;
    overall_max: number | null;
  };
  chapters: Array<{
    chapter: number;
    eval_path: string;
    overall_final: number | null;
    gate_decision: string | null;
    revisions: number | null;
    force_passed: boolean | null;
    has_high_confidence_violation: boolean | null;
  }>;
  low_chapters: Array<{ chapter: number; overall_final: number }>;
  warnings: string[];
};

function safeFiniteNumber(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function safeInt(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isInteger(v)) return null;
  return v;
}

function safeBool(v: unknown): boolean | null {
  if (typeof v !== "boolean") return null;
  return v;
}

function safeString(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeForeshadowFile(raw: unknown): { foreshadowing: Array<Record<string, unknown> & { id: string }> } | null {
  let obj: unknown = raw;
  if (Array.isArray(obj)) obj = { foreshadowing: obj };
  if (!isPlainObject(obj)) return null;
  const list = (obj as Record<string, unknown>).foreshadowing;
  if (!Array.isArray(list)) return null;
  const items: Array<Record<string, unknown> & { id: string }> = [];
  for (const it of list) {
    if (!isPlainObject(it)) continue;
    const id = safeString((it as Record<string, unknown>).id);
    if (!id) continue;
    items.push({ ...(it as Record<string, unknown>), id });
  }
  return { foreshadowing: items };
}

export async function collectVolumeData(args: { rootDir: string; checkpoint: Checkpoint }): Promise<VolumeReviewQualitySummary> {
  const volume = args.checkpoint.current_volume;
  const endChapter = args.checkpoint.last_completed_chapter;
  if (!Number.isInteger(volume) || volume < 1) throw new NovelCliError(`Invalid checkpoint.current_volume: ${String(volume)}`, 2);
  if (!Number.isInteger(endChapter) || endChapter < 0) throw new NovelCliError(`Invalid checkpoint.last_completed_chapter: ${String(endChapter)}`, 2);

  const warnings: string[] = [];

  const resolvedRange =
    (await tryResolveVolumeChapterRange({ rootDir: args.rootDir, volume })) ??
    (endChapter >= 1 ? { start: Math.max(1, endChapter - 9), end: endChapter } : null);
  if (!resolvedRange) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      as_of: { volume, chapter: endChapter },
      chapter_range: [0, 0],
      stats: { chapters_total: 0, chapters_with_eval: 0, overall_avg: null, overall_min: null, overall_max: null },
      chapters: [],
      low_chapters: [],
      warnings: endChapter === 0 ? ["No committed chapters yet; volume review summary is empty."] : ["Unable to resolve chapter range for volume review."]
    };
  }

  const chapterRange: [number, number] = [resolvedRange.start, resolvedRange.end];
  const chapters: VolumeReviewQualitySummary["chapters"] = [];
  const scores: number[] = [];
  const lowChapters: Array<{ chapter: number; overall_final: number }> = [];

  for (let chapter = resolvedRange.start; chapter <= resolvedRange.end; chapter++) {
    const evalRel = `evaluations/chapter-${pad3(chapter)}-eval.json`;
    const evalAbs = join(args.rootDir, evalRel);
    const exists = await pathExists(evalAbs);
    if (!exists) {
      warnings.push(`Missing eval file: ${evalRel}`);
      chapters.push({
        chapter,
        eval_path: evalRel,
        overall_final: null,
        gate_decision: null,
        revisions: null,
        force_passed: null,
        has_high_confidence_violation: null
      });
      continue;
    }

    let raw: unknown;
    try {
      raw = await readJsonFile(evalAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to read ${evalRel}: ${message}`);
      chapters.push({
        chapter,
        eval_path: evalRel,
        overall_final: null,
        gate_decision: null,
        revisions: null,
        force_passed: null,
        has_high_confidence_violation: null
      });
      continue;
    }

    if (!isPlainObject(raw)) {
      warnings.push(`Invalid eval JSON (expected object): ${evalRel}`);
      chapters.push({
        chapter,
        eval_path: evalRel,
        overall_final: null,
        gate_decision: null,
        revisions: null,
        force_passed: null,
        has_high_confidence_violation: null
      });
      continue;
    }

    const obj = raw as Record<string, unknown>;
    const overall =
      safeFiniteNumber(obj.overall_final) ??
      safeFiniteNumber(obj.overall) ??
      (isPlainObject(obj.judges) ? safeFiniteNumber((obj.judges as Record<string, unknown>).overall_final) : null);

    const gate =
      isPlainObject(obj.metadata) && isPlainObject((obj.metadata as Record<string, unknown>).gate)
        ? ((obj.metadata as Record<string, unknown>).gate as Record<string, unknown>)
        : isPlainObject(obj.gate)
          ? (obj.gate as Record<string, unknown>)
          : null;

    const gate_decision = gate ? safeString(gate.decision) : null;
    const revisions = gate ? safeInt(gate.revisions) : null;
    const force_passed = gate ? safeBool(gate.force_passed) : null;
    const has_high_confidence_violation = gate ? safeBool(gate.has_high_confidence_violation) : null;

    if (overall !== null) {
      scores.push(overall);
      if (overall < 3.5) lowChapters.push({ chapter, overall_final: overall });
    }

    chapters.push({
      chapter,
      eval_path: evalRel,
      overall_final: overall,
      gate_decision,
      revisions,
      force_passed,
      has_high_confidence_violation
    });
  }

  const avg = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  const min = scores.length > 0 ? Math.min(...scores) : null;
  const max = scores.length > 0 ? Math.max(...scores) : null;

  lowChapters.sort((a, b) => a.overall_final - b.overall_final || a.chapter - b.chapter);

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    as_of: { volume, chapter: endChapter },
    chapter_range: chapterRange,
    stats: {
      chapters_total: resolvedRange.end - resolvedRange.start + 1,
      chapters_with_eval: scores.length,
      overall_avg: avg === null ? null : Number(avg.toFixed(4)),
      overall_min: min,
      overall_max: max
    },
    chapters,
    low_chapters: lowChapters,
    warnings
  };
}

export async function computeForeshadowingAudit(args: { rootDir: string; checkpoint: Checkpoint }): Promise<Record<string, unknown>> {
  const volume = args.checkpoint.current_volume;
  const asOfChapter = args.checkpoint.last_completed_chapter;
  const warnings: string[] = [];

  const globalRel = "foreshadowing/global.json";
  const volumeRel = `volumes/vol-${pad2(volume)}/foreshadowing.json`;

  const globalAbs = join(args.rootDir, globalRel);
  const volumeAbs = join(args.rootDir, volumeRel);

  const globalRaw = (await pathExists(globalAbs)) ? await readJsonFile(globalAbs).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Failed to read ${globalRel}: ${message}`);
    return null;
  }) : null;
  const volumeRaw = (await pathExists(volumeAbs)) ? await readJsonFile(volumeAbs).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Failed to read ${volumeRel}: ${message}`);
    return null;
  }) : null;

  const global = globalRaw === null ? null : normalizeForeshadowFile(globalRaw);
  const plan = volumeRaw === null ? null : normalizeForeshadowFile(volumeRaw);

  if (globalRaw !== null && !global) warnings.push(`Invalid ${globalRel}: expected a list or {foreshadowing:[...]}.`);
  if (volumeRaw !== null && !plan) warnings.push(`Invalid ${volumeRel}: expected a list or {foreshadowing:[...]}.`);

  const globalItems = global?.foreshadowing ?? [];
  const planItems = plan?.foreshadowing ?? [];
  const globalIndex = new Map(globalItems.map((it) => [it.id, it]));

  const activeCount = globalItems.filter((it) => String(it.status ?? "") !== "resolved").length;
  const resolvedCount = globalItems.filter((it) => String(it.status ?? "") === "resolved").length;

  const overdueShort: Array<Record<string, unknown>> = [];
  for (const it of globalItems) {
    const scope = safeString(it.scope);
    const status = safeString(it.status);
    if (scope !== "short") continue;
    if (status === "resolved") continue;
    const trRaw = it.target_resolve_range;
    if (!Array.isArray(trRaw) || trRaw.length !== 2) continue;
    const start = safeInt(trRaw[0]);
    const end = safeInt(trRaw[1]);
    if (start === null || end === null) continue;
    if (asOfChapter > end) {
      overdueShort.push({ id: it.id, target_resolve_range: [start, end], as_of_chapter: asOfChapter });
    }
  }

  const planMissingInGlobal: string[] = [];
  const planResolvedInGlobal: string[] = [];
  for (const it of planItems) {
    const existing = globalIndex.get(it.id);
    if (!existing) planMissingInGlobal.push(it.id);
    else if (safeString(existing.status) === "resolved") planResolvedInGlobal.push(it.id);
  }

  planMissingInGlobal.sort();
  planResolvedInGlobal.sort();

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    as_of: { volume, chapter: asOfChapter },
    global: { total: globalItems.length, active_count: activeCount, resolved_count: resolvedCount },
    overdue_short: overdueShort,
    plan: plan ? { planned_total: planItems.length, missing_in_global: planMissingInGlobal, resolved_in_global: planResolvedInGlobal } : null,
    warnings
  };
}

export async function computeBridgeCheck(args: {
  rootDir: string;
  volume: number;
  foreshadowIds: { global: Set<string>; plan: Set<string> };
}): Promise<Record<string, unknown>> {
  const warnings: string[] = [];
  const storylinesRel = "storylines/storylines.json";
  const abs = join(args.rootDir, storylinesRel);
  if (!(await pathExists(abs))) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      volume: args.volume,
      broken: [],
      warnings: [`Missing optional file: ${storylinesRel}`]
    };
  }

  let raw: unknown;
  try {
    raw = await readJsonFile(abs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      volume: args.volume,
      broken: [],
      warnings: [`Failed to read ${storylinesRel}: ${message}`]
    };
  }

  if (!isPlainObject(raw)) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      volume: args.volume,
      broken: [],
      warnings: [`Invalid ${storylinesRel}: expected JSON object.`]
    };
  }

  const obj = raw as Record<string, unknown>;
  const relsRaw = obj.relationships;
  if (!Array.isArray(relsRaw)) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      volume: args.volume,
      broken: [],
      warnings
    };
  }

  const idExists = (id: string): boolean => args.foreshadowIds.global.has(id) || args.foreshadowIds.plan.has(id);

  const broken: Array<Record<string, unknown>> = [];
  for (const rel of relsRaw) {
    if (!isPlainObject(rel)) continue;
    const from = safeString((rel as Record<string, unknown>).from);
    const to = safeString((rel as Record<string, unknown>).to);
    const type = safeString((rel as Record<string, unknown>).type);
    const bridges = (rel as Record<string, unknown>).bridges;
    if (!isPlainObject(bridges)) continue;
    const shared = (bridges as Record<string, unknown>).shared_foreshadowing;
    if (!Array.isArray(shared)) continue;
    for (const idRaw of shared) {
      const id = safeString(idRaw);
      if (!id) continue;
      if (idExists(id)) continue;
      broken.push({
        missing_id: id,
        relationship: { from, to, type }
      });
    }
  }

  broken.sort((a, b) => String(a.missing_id ?? "").localeCompare(String(b.missing_id ?? "")));

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    volume: args.volume,
    broken,
    warnings
  };
}

export async function computeStorylineRhythm(args: { rootDir: string; volume: number; chapter_range: [number, number] }): Promise<Record<string, unknown>> {
  const warnings: string[] = [];
  const scheduleRel = `volumes/vol-${pad2(args.volume)}/storyline-schedule.json`;
  const scheduleAbs = join(args.rootDir, scheduleRel);
  if (!(await pathExists(scheduleAbs))) {
    warnings.push(`Missing optional file: ${scheduleRel}`);
  } else {
    // Best-effort parse schedule: we only use it as a presence signal for now.
    try {
      await readJsonFile(scheduleAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to read ${scheduleRel}: ${message}`);
    }
  }

  const appearances = new Map<string, number>();
  const lastSeen = new Map<string, number>();

  const [start, end] = args.chapter_range;
  const re = /storyline_id:\s*([a-zA-Z0-9_-]+)/gu;
  for (let chapter = start; chapter <= end; chapter++) {
    const rel = `summaries/chapter-${pad3(chapter)}-summary.md`;
    const abs = join(args.rootDir, rel);
    if (!(await pathExists(abs))) continue;
    let text: string;
    try {
      text = await readTextFile(abs);
    } catch {
      continue;
    }
    const idsThisChapter = new Set<string>();
    for (const m of text.matchAll(re)) {
      const id = m[1] ?? "";
      if (!id) continue;
      idsThisChapter.add(id);
    }
    if (idsThisChapter.size === 0) continue;
    for (const id of idsThisChapter) {
      appearances.set(id, (appearances.get(id) ?? 0) + 1);
      lastSeen.set(id, chapter);
    }
  }

  const appearancesObj: Record<string, number> = {};
  const lastSeenObj: Record<string, number> = {};
  for (const [k, v] of appearances.entries()) appearancesObj[k] = v;
  for (const [k, v] of lastSeen.entries()) lastSeenObj[k] = v;

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    volume: args.volume,
    chapter_range: args.chapter_range,
    appearances: appearancesObj,
    last_seen: lastSeenObj,
    warnings
  };
}

export async function computeReviewNextStep(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  const qualitySummaryAbs = join(projectRootDir, VOL_REVIEW_RELS.qualitySummary);
  const auditReportAbs = join(projectRootDir, VOL_REVIEW_RELS.auditReport);
  const reviewReportAbs = join(projectRootDir, VOL_REVIEW_RELS.reviewReport);
  const foreshadowAbs = join(projectRootDir, VOL_REVIEW_RELS.foreshadowStatus);

  const hasQualitySummary = await pathExists(qualitySummaryAbs);
  const hasAuditReport = await pathExists(auditReportAbs);
  const hasReviewReport = await pathExists(reviewReportAbs);
  const hasForeshadowStatus = await pathExists(foreshadowAbs);

  const evidence = { hasQualitySummary, hasAuditReport, hasReviewReport, hasForeshadowStatus };

  if (!hasQualitySummary) {
    return {
      step: formatStepId({ kind: "review", phase: "collect" }),
      reason: "vol_review:missing_quality_summary",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }
  if (!hasAuditReport) {
    return {
      step: formatStepId({ kind: "review", phase: "audit" }),
      reason: "vol_review:missing_audit_report",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }
  if (!hasReviewReport) {
    return {
      step: formatStepId({ kind: "review", phase: "report" }),
      reason: "vol_review:missing_review_report",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }
  if (!hasForeshadowStatus) {
    return {
      step: formatStepId({ kind: "review", phase: "cleanup" }),
      reason: "vol_review:missing_foreshadow_status",
      inflight: { chapter: null, pipeline_stage: null },
      evidence
    };
  }
  return {
    step: formatStepId({ kind: "review", phase: "transition" }),
    reason: "vol_review:ready_transition",
    inflight: { chapter: null, pipeline_stage: null },
    evidence
  };
}

// Alias for tasks wording.
export async function computeReviewNext(projectRootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  return await computeReviewNextStep(projectRootDir, checkpoint);
}
