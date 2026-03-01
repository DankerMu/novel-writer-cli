import { appendFile, readdir, rename, stat, truncate, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { readCheckpoint, type Checkpoint, writeCheckpoint } from "./checkpoint.js";
import {
  attachClicheLintToEval,
  computeClicheLintReport,
  loadWebNovelClicheLintConfig,
  precomputeClicheLintReport,
  writeClicheLintLogs
} from "./cliche-lint.js";
import { NovelCliError } from "./errors.js";
import { fingerprintsMatch, hashText } from "./fingerprint.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, removePath, writeJsonFile } from "./fs-utils.js";
import { computeForeshadowVisibilityReport, loadForeshadowGlobalItems, writeForeshadowVisibilityLogs } from "./foreshadow-visibility.js";
import { checkHookPolicy } from "./hook-policy.js";
import { withWriteLock } from "./lock.js";
import { computeContinuityReport, tryResolveVolumeChapterRange, writeContinuityLogs, writeVolumeContinuityReport, type ContinuityReport } from "./consistency-auditor.js";
import { attachPlatformConstraintsToEval, computePlatformConstraints, precomputeInfoLoadNer, writePlatformConstraintsLogs } from "./platform-constraints.js";
import { loadPlatformProfile } from "./platform-profile.js";
import {
  attachNamingLintToEval,
  computeNamingReport,
  precomputeNamingReport,
  summarizeNamingIssues,
  writeNamingLintLogs
} from "./naming-lint.js";
import {
  attachReadabilityLintToEval,
  computeReadabilityReport,
  precomputeReadabilityReport,
  summarizeReadabilityIssues,
  writeReadabilityLogs
} from "./readability-lint.js";
import { attachScoringWeightsToEval, loadGenreWeightProfiles } from "./scoring-weights.js";
import { rejectPathTraversalInput } from "./safe-path.js";
import { chapterRelPaths, pad2, pad3 } from "./steps.js";
import { computeTitlePolicyReport, writeTitlePolicyLogs } from "./title-policy.js";
import { isPlainObject } from "./type-guards.js";

type CommitArgs = {
  rootDir: string;
  chapter: number;
  dryRun: boolean;
};

export type CommitResult = {
  plan: string[];
  warnings: string[];
};

type StateFile = Record<string, unknown> & {
  schema_version: number;
  state_version: number;
  last_updated_chapter: number;
};

type DeltaFile = Record<string, unknown> & {
  chapter: number;
  base_state_version: number;
  storyline_id: string;
  ops: unknown[];
};

function requireInt(field: string, value: unknown, file: string): number {
  if (typeof value !== "number" || !Number.isInteger(value)) throw new NovelCliError(`Invalid ${file}: '${field}' must be an int.`, 2);
  return value;
}

function requireString(field: string, value: unknown, file: string): string {
  if (typeof value !== "string" || value.length === 0) throw new NovelCliError(`Invalid ${file}: '${field}' must be a non-empty string.`, 2);
  return value;
}

function loadStateInit(): StateFile {
  return {
    schema_version: 1,
    state_version: 0,
    last_updated_chapter: 0,
    characters: {},
    world_state: {},
    active_foreshadowing: []
  };
}

async function readState(rootDir: string, relPath: string): Promise<StateFile> {
  const abs = join(rootDir, relPath);
  if (!(await pathExists(abs))) return loadStateInit();
  const raw = await readJsonFile(abs);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid state file: ${relPath} must be an object.`, 2);
  const obj = raw as Record<string, unknown>;
  const schemaVersion = requireInt("schema_version", obj.schema_version, relPath);
  const stateVersion = requireInt("state_version", obj.state_version, relPath);
  const lastUpdated = requireInt("last_updated_chapter", obj.last_updated_chapter, relPath);
  return { ...obj, schema_version: schemaVersion, state_version: stateVersion, last_updated_chapter: lastUpdated } as StateFile;
}

async function appendJsonl(rootDir: string, relPath: string, payload: unknown): Promise<void> {
  const abs = join(rootDir, relPath);
  await ensureDir(dirname(abs));
  await appendFile(abs, `${JSON.stringify(payload)}\n`, "utf8");
}

function validateOps(ops: unknown[], warnings: string[]): Array<Record<string, unknown>> {
  const allowedTop = new Set(["characters", "items", "locations", "factions", "world_state", "active_foreshadowing"]);
  const out: Array<Record<string, unknown>> = [];

  for (const opRaw of ops) {
    if (!isPlainObject(opRaw)) {
      warnings.push("Dropped non-object op entry.");
      continue;
    }
    const op = opRaw as Record<string, unknown>;
    const opType = op.op;
    if (opType === "foreshadow") {
      out.push(op);
      continue;
    }
    if (opType !== "set" && opType !== "inc" && opType !== "add" && opType !== "remove") {
      warnings.push(`Dropped invalid op type: ${String(opType)}`);
      continue;
    }

    const path = op.path;
    if (typeof path !== "string" || path.length === 0) {
      warnings.push(`Dropped op with invalid path: ${JSON.stringify(op)}`);
      continue;
    }
    const parts = path.split(".");
    if (parts.length < 2 || parts.length > 4) {
      warnings.push(`Dropped op with invalid path depth: ${path}`);
      continue;
    }
    if (!allowedTop.has(parts[0] ?? "")) {
      warnings.push(`Dropped op with invalid top-level path: ${path}`);
      continue;
    }

    out.push(op);
  }

  return out;
}

function ensureObjectAtPath(root: Record<string, unknown>, pathParts: string[], warnings: string[]): Record<string, unknown> | null {
  let cursor: Record<string, unknown> = root;
  for (const key of pathParts) {
    const current = cursor[key];
    if (current === undefined) {
      cursor[key] = {};
      cursor = cursor[key] as Record<string, unknown>;
      continue;
    }
    if (!isPlainObject(current)) {
      warnings.push(`Path collision: '${key}' is not an object; skipping op.`);
      return null;
    }
    cursor = current as Record<string, unknown>;
  }
  return cursor;
}

function applyStateOps(state: StateFile, ops: Array<Record<string, unknown>>, warnings: string[]): { applied: number; foreshadowOps: Array<Record<string, unknown>> } {
  let applied = 0;
  const foreshadowOps: Array<Record<string, unknown>> = [];

  for (const op of ops) {
    const opType = op.op;
    if (opType === "foreshadow") {
      foreshadowOps.push(op);
      continue;
    }

    const path = String(op.path ?? "");
    const parts = path.split(".");
    const leaf = parts.pop();
    if (!leaf) {
      warnings.push(`Dropped op with empty leaf path: ${path}`);
      continue;
    }
    const parent = ensureObjectAtPath(state, parts, warnings);
    if (!parent) continue;

    if (opType === "set") {
      parent[leaf] = op.value;
      applied += 1;
      continue;
    }

    if (opType === "inc") {
      const delta = op.value;
      if (typeof delta !== "number" || !Number.isFinite(delta)) {
        warnings.push(`Dropped inc op with non-number value: ${path}`);
        continue;
      }
      const prev = parent[leaf];
      const prevNum = typeof prev === "number" && Number.isFinite(prev) ? prev : 0;
      parent[leaf] = prevNum + delta;
      applied += 1;
      continue;
    }

    if (opType === "add") {
      const prev = parent[leaf];
      if (prev === undefined) {
        parent[leaf] = [op.value];
        applied += 1;
        continue;
      }
      if (!Array.isArray(prev)) {
        warnings.push(`Dropped add op: target is not an array: ${path}`);
        continue;
      }
      prev.push(op.value);
      applied += 1;
      continue;
    }

    if (opType === "remove") {
      const prev = parent[leaf];
      if (!Array.isArray(prev)) {
        warnings.push(`Dropped remove op: target is not an array: ${path}`);
        continue;
      }
      const idx = prev.findIndex((v) => v === op.value);
      if (idx >= 0) prev.splice(idx, 1);
      applied += 1;
      continue;
    }
  }

  return { applied, foreshadowOps };
}

type ForeshadowItem = Record<string, unknown> & {
  id: string;
  status?: string;
  history?: unknown[];
  planted_chapter?: number;
  planted_storyline?: string;
  last_updated_chapter?: number;
};

function statusRank(status: string): number {
  switch (status) {
    case "planted":
      return 1;
    case "advanced":
      return 2;
    case "resolved":
      return 3;
    default:
      return 0;
  }
}

function normalizeForeshadowFile(raw: unknown): { foreshadowing: ForeshadowItem[] } {
  if (!isPlainObject(raw)) return { foreshadowing: [] };
  const obj = raw as Record<string, unknown>;
  const list = Array.isArray(obj.foreshadowing) ? (obj.foreshadowing as unknown[]) : [];
  const items: ForeshadowItem[] = [];
  for (const it of list) {
    if (!isPlainObject(it)) continue;
    const id = typeof (it as Record<string, unknown>).id === "string" ? ((it as Record<string, unknown>).id as string) : null;
    if (!id) continue;
    items.push({ ...(it as Record<string, unknown>), id } as ForeshadowItem);
  }
  return { foreshadowing: items };
}

async function updateForeshadowing(args: {
  rootDir: string;
  checkpoint: Checkpoint;
  delta: DeltaFile;
  foreshadowOps: Array<Record<string, unknown>>;
  warnings: string[];
  dryRun: boolean;
}): Promise<void> {
  if (args.foreshadowOps.length === 0) return;

  const globalRel = "foreshadowing/global.json";
  const globalAbs = join(args.rootDir, globalRel);
  let globalRaw: unknown = { foreshadowing: [] };
  if (await pathExists(globalAbs)) {
    try {
      globalRaw = await readJsonFile(globalAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      args.warnings.push(`Failed to read ${globalRel}: ${message}. Skipping foreshadow merge for this commit.`);
      return;
    }
  }

  if (Array.isArray(globalRaw)) globalRaw = { foreshadowing: globalRaw };
  if (!(isPlainObject(globalRaw) && Array.isArray((globalRaw as Record<string, unknown>).foreshadowing))) {
    args.warnings.push(`Invalid ${globalRel}: expected a list or {foreshadowing:[...]}. Skipping foreshadow merge for this commit.`);
    return;
  }

  const global = normalizeForeshadowFile(globalRaw);

  const volumeRel = `volumes/vol-${pad2(args.checkpoint.current_volume)}/foreshadowing.json`;
  const volumeAbs = join(args.rootDir, volumeRel);
  let volumeRaw: unknown = null;
  if (await pathExists(volumeAbs)) {
    try {
      volumeRaw = await readJsonFile(volumeAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      args.warnings.push(`Failed to read ${volumeRel}: ${message}. Proceeding without volume foreshadow metadata.`);
      volumeRaw = null;
    }
  }

  if (Array.isArray(volumeRaw)) volumeRaw = { foreshadowing: volumeRaw };
  if (volumeRaw !== null && !(isPlainObject(volumeRaw) && Array.isArray((volumeRaw as Record<string, unknown>).foreshadowing))) {
    args.warnings.push(`Ignoring invalid ${volumeRel}: expected a list or {foreshadowing:[...]}.`);
    volumeRaw = null;
  }

  const volume = normalizeForeshadowFile(volumeRaw);
  const volumeIndex = new Map(volume.foreshadowing.map((it) => [it.id, it]));

  const globalIndex = new Map(global.foreshadowing.map((it) => [it.id, it]));

  for (const op of args.foreshadowOps) {
    const id = typeof op.path === "string" ? op.path : null;
    const value = typeof op.value === "string" ? op.value : null;
    if (!id || !value) {
      args.warnings.push(`Dropped invalid foreshadow op: ${JSON.stringify(op)}`);
      continue;
    }
    if (value !== "planted" && value !== "advanced" && value !== "resolved") {
      args.warnings.push(`Dropped foreshadow op with invalid value: ${id}=${value}`);
      continue;
    }
    const detail = typeof op.detail === "string" ? op.detail : undefined;

    let item = globalIndex.get(id);
    if (!item) {
      const seed = volumeIndex.get(id);
      item = { id };
      if (seed) {
        for (const k of ["description", "scope", "target_resolve_range"]) {
          if (seed[k] !== undefined) item[k] = seed[k];
        }
      }
      global.foreshadowing.push(item);
      globalIndex.set(id, item);
    }

    // Status monotonic.
    const prevStatus = typeof item.status === "string" ? item.status : "";
    const nextStatus = statusRank(value) >= statusRank(prevStatus) ? value : prevStatus;
    item.status = nextStatus;

    if (value === "planted") {
      if (typeof item.planted_chapter !== "number") item.planted_chapter = args.delta.chapter;
      if (typeof item.planted_storyline !== "string") item.planted_storyline = args.delta.storyline_id;
    }

    const lastUpdated = typeof item.last_updated_chapter === "number" ? item.last_updated_chapter : 0;
    item.last_updated_chapter = Math.max(lastUpdated, args.delta.chapter);

    // Backfill metadata when missing.
    const seed = volumeIndex.get(id);
    if (seed) {
      for (const k of ["description", "scope", "target_resolve_range"]) {
        if (item[k] === undefined && seed[k] !== undefined) item[k] = seed[k];
      }
    }

    // History.
    const history = Array.isArray(item.history) ? item.history : [];
    const key = `${args.delta.chapter}:${value}`;
    const existingKeys = new Set(
      history
        .filter((h) => isPlainObject(h))
        .map((h) => `${String((h as Record<string, unknown>).chapter ?? "")}:${String((h as Record<string, unknown>).action ?? "")}`)
    );
    if (!existingKeys.has(key)) {
      history.push({ chapter: args.delta.chapter, action: value, ...(detail ? { detail } : {}) });
      item.history = history;
    }
  }

  if (!args.dryRun) {
    await ensureDir(dirname(globalAbs));
    await writeJsonFile(globalAbs, { foreshadowing: global.foreshadowing });
  }
}

async function doRename(rootDir: string, fromRel: string, toRel: string): Promise<void> {
  const fromAbs = join(rootDir, fromRel);
  const toAbs = join(rootDir, toRel);
  if (await pathExists(toAbs)) {
    throw new NovelCliError(`Refusing to overwrite existing destination: ${toRel}`, 2);
  }
  await ensureDir(dirname(toAbs));
  try {
    await rename(fromAbs, toAbs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to move '${fromRel}' to '${toRel}': ${message}`, 2);
  }
}

async function rollbackRename(rootDir: string, fromRel: string, toRel: string): Promise<void> {
  const fromAbs = join(rootDir, fromRel);
  const toAbs = join(rootDir, toRel);
  await ensureDir(dirname(toAbs));
  await rename(fromAbs, toAbs);
}

async function ensureFilePresent(rootDir: string, relPath: string): Promise<void> {
  const abs = join(rootDir, relPath);
  if (!(await pathExists(abs))) throw new NovelCliError(`Missing required file: ${relPath}`, 2);
}

type PendingVolumeEndAuditMarker = {
  schema_version: 1;
  created_at: string;
  volume: number;
  chapter_range: [number, number];
};

function pendingVolumeEndMarkerRel(volume: number): string {
  return `logs/continuity/pending-volume-end-vol-${pad2(volume)}.json`;
}

function resolveForeshadowVisibilityHistoryRange(args: {
  chapter: number;
  isVolumeEnd: boolean;
  volumeRange: { start: number; end: number } | null;
}): { start: number; end: number } | null {
  if (args.isVolumeEnd && args.volumeRange) return { start: args.volumeRange.start, end: args.volumeRange.end };
  if (args.chapter % 10 === 0) return { start: Math.max(1, args.chapter - 9), end: args.chapter };
  return null;
}

function parsePendingVolumeEndAuditMarker(raw: unknown): PendingVolumeEndAuditMarker | null {
  if (!isPlainObject(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.schema_version !== 1) return null;
  const created_at = typeof obj.created_at === "string" ? obj.created_at : null;
  const volume = typeof obj.volume === "number" && Number.isInteger(obj.volume) && obj.volume >= 0 ? obj.volume : null;
  const range = obj.chapter_range;
  if (!created_at || volume === null) return null;
  if (!Array.isArray(range) || range.length !== 2) return null;
  const start = range[0];
  const end = range[1];
  if (typeof start !== "number" || typeof end !== "number") return null;
  if (!Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (start < 1 || end < start) return null;
  return { schema_version: 1, created_at, volume, chapter_range: [start, end] };
}

async function listPendingVolumeEndAuditMarkers(rootDir: string, warnings: string[]): Promise<Array<{ rel: string; marker: PendingVolumeEndAuditMarker }>> {
  const dirRel = "logs/continuity";
  const dirAbs = join(rootDir, dirRel);
  if (!(await pathExists(dirAbs))) return [];

  const entries = await readdir(dirAbs, { withFileTypes: true });
  const out: Array<{ rel: string; marker: PendingVolumeEndAuditMarker }> = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = /^pending-volume-end-vol-(\d{2})\.json$/u.exec(e.name);
    if (!m) continue;
    const rel = `${dirRel}/${e.name}`;
    let raw: unknown;
    try {
      raw = await readJsonFile(join(rootDir, rel));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to read pending volume-end audit marker: ${rel}. ${message}`);
      continue;
    }
    const parsed = parsePendingVolumeEndAuditMarker(raw);
    if (!parsed) {
      warnings.push(`Ignoring invalid pending volume-end audit marker: ${rel}`);
      continue;
    }
    out.push({ rel, marker: parsed });
  }
  out.sort((a, b) => a.marker.volume - b.marker.volume || a.marker.chapter_range[0] - b.marker.chapter_range[0]);
  return out;
}

export async function commitChapter(args: CommitArgs): Promise<CommitResult> {
  if (!Number.isInteger(args.chapter) || args.chapter <= 0) {
    throw new NovelCliError(`--chapter must be an int >= 1`, 2);
  }

  const checkpoint = await readCheckpoint(args.rootDir);
  const volume = checkpoint.current_volume;
  const warnings: string[] = [];
  const plan: string[] = [];

  // Best-effort volume range resolution (for plan + optional volume-end continuity audits).
  // Never block commit on missing outline/contracts.
  let volumeRange: { start: number; end: number } | null = null;
  try {
    volumeRange = await tryResolveVolumeChapterRange({ rootDir: args.rootDir, volume });
  } catch {
    volumeRange = null;
  }
  let isVolumeEnd = volumeRange !== null && args.chapter === volumeRange.end;
  let shouldPeriodicContinuityAudit = args.chapter % 5 === 0 && !isVolumeEnd;

  const loadedProfile = await loadPlatformProfile(args.rootDir);
  if (!loadedProfile) warnings.push("Missing platform-profile.json; platform constraints will be skipped.");

  const loadedCliche = await loadWebNovelClicheLintConfig(args.rootDir);
  if (!loadedCliche) warnings.push("Missing web-novel-cliche-lint.json; cliché lint will be skipped.");

  const loadedGenreWeights = loadedProfile?.profile.scoring ? await loadGenreWeightProfiles(args.rootDir) : null;
  if (loadedProfile?.profile.scoring && !loadedGenreWeights) {
    throw new NovelCliError(
      "Missing required file: genre-weight-profiles.json (required when platform-profile.json.scoring is present). Copy it from templates/genre-weight-profiles.json.",
      2
    );
  }

  const rel = chapterRelPaths(args.chapter);
  await ensureFilePresent(args.rootDir, rel.staging.chapterMd);
  await ensureFilePresent(args.rootDir, rel.staging.summaryMd);
  await ensureFilePresent(args.rootDir, rel.staging.deltaJson);
  await ensureFilePresent(args.rootDir, rel.staging.crossrefJson);
  await ensureFilePresent(args.rootDir, rel.staging.evalJson);

  // Parse delta early to resolve storyline memory paths and state merge.
  const deltaRaw = await readJsonFile(join(args.rootDir, rel.staging.deltaJson));
  if (!isPlainObject(deltaRaw)) throw new NovelCliError(`Invalid delta file: ${rel.staging.deltaJson} must be an object.`, 2);
  const deltaObj = deltaRaw as Record<string, unknown>;
  const delta: DeltaFile = {
    ...deltaObj,
    chapter: requireInt("chapter", deltaObj.chapter, rel.staging.deltaJson),
    base_state_version: requireInt("base_state_version", deltaObj.base_state_version, rel.staging.deltaJson),
    storyline_id: requireString("storyline_id", deltaObj.storyline_id, rel.staging.deltaJson),
    ops: Array.isArray(deltaObj.ops) ? (deltaObj.ops as unknown[]) : (() => {
      throw new NovelCliError(`Invalid ${rel.staging.deltaJson}: 'ops' must be an array.`, 2);
    })()
  };

  if (delta.chapter !== args.chapter) {
    warnings.push(`Delta.chapter is ${delta.chapter}, expected ${args.chapter}.`);
  }

  rejectPathTraversalInput(delta.storyline_id, "delta.storyline_id");

  const memoryRel = chapterRelPaths(args.chapter, delta.storyline_id).staging.storylineMemoryMd;
  if (!memoryRel) throw new NovelCliError(`Internal error: storyline memory path is null`, 2);
  await ensureFilePresent(args.rootDir, memoryRel);
  const finalMemoryRel = chapterRelPaths(args.chapter, delta.storyline_id).final.storylineMemoryMd;
  if (!finalMemoryRel) throw new NovelCliError(`Internal error: final storyline memory path is null`, 2);

  // Plan moves.
  plan.push(`MOVE ${rel.staging.chapterMd} -> ${rel.final.chapterMd}`);
  plan.push(`MOVE ${rel.staging.summaryMd} -> ${rel.final.summaryMd}`);
  plan.push(`MOVE ${rel.staging.evalJson} -> ${rel.final.evalJson}`);
  plan.push(`MOVE ${rel.staging.crossrefJson} -> ${rel.final.crossrefJson}`);
  plan.push(`MOVE ${memoryRel} -> ${finalMemoryRel}`);

  // Merge state delta.
  plan.push(`MERGE ${rel.staging.deltaJson} -> ${rel.final.stateCurrentJson} (+ append ${rel.final.stateChangelogJsonl})`);

  // Update foreshadowing/global.json
  plan.push(`UPDATE ${rel.final.foreshadowGlobalJson} (from foreshadow ops)`);

  // Cleanup staging delta.
  plan.push(`REMOVE ${rel.staging.deltaJson}`);

  if (loadedProfile) {
    plan.push(`WRITE logs/platform-constraints/platform-constraints-chapter-${pad3(args.chapter)}.json (+ latest.json)`);
    plan.push(`WRITE logs/retention/title-policy/title-policy-chapter-${pad3(args.chapter)}.json (+ latest.json)`);
    plan.push(`WRITE logs/readability/readability-report-chapter-${pad3(args.chapter)}.json (+ latest.json)`);
    plan.push(`WRITE logs/naming/naming-report-chapter-${pad3(args.chapter)}.json (+ latest.json)`);
    plan.push(`PATCH ${rel.final.evalJson} (attach platform_constraints metadata)`);
    plan.push(`PATCH ${rel.final.evalJson} (attach readability_lint metadata)`);
    plan.push(`PATCH ${rel.final.evalJson} (attach naming_lint metadata)`);
  }

  if (loadedCliche) {
    plan.push(`WRITE logs/cliche-lint/cliche-lint-chapter-${pad3(args.chapter)}.json (+ latest.json)`);
    plan.push(`PATCH ${rel.final.evalJson} (attach cliche_lint metadata)`);
  }

  if (loadedGenreWeights) {
    plan.push(`PATCH ${rel.final.evalJson} (attach scoring_weights metadata + per-dimension weights)`);
  }

  // Optional: periodic continuity audits (non-blocking) on a fixed cadence.
  if (shouldPeriodicContinuityAudit) {
    const start = Math.max(1, args.chapter - 9);
    const end = args.chapter;
    plan.push(`WRITE logs/continuity/continuity-report-vol-${pad2(volume)}-ch${pad3(start)}-ch${pad3(end)}.json (+ latest.json)`);
  }

  // Optional: volume-end full continuity audit (non-blocking) when this is the last planned chapter of the volume.
  if (isVolumeEnd && volumeRange) {
    plan.push(`WRITE volumes/vol-${pad2(volume)}/continuity-report.json`);
    plan.push(
      `WRITE logs/continuity/continuity-report-vol-${pad2(volume)}-ch${pad3(volumeRange.start)}-ch${pad3(volumeRange.end)}.json (+ latest.json)`
    );
  }

  // Optional: foreshadow visibility maintenance (non-blocking).
  // This generates a dormancy view + non-spoiler light-touch reminder tasks.
  plan.push(`WRITE logs/foreshadowing/latest.json (monotonic)`);
  const foreshadowHistoryRange = resolveForeshadowVisibilityHistoryRange({ chapter: args.chapter, isVolumeEnd, volumeRange });
  if (foreshadowHistoryRange) {
    plan.push(
      `WRITE logs/foreshadowing/foreshadow-visibility-vol-${pad2(volume)}-ch${pad3(foreshadowHistoryRange.start)}-ch${pad3(
        foreshadowHistoryRange.end
      )}.json`
    );
  }

  // Update checkpoint.
  plan.push(`UPDATE .checkpoint.json (commit chapter ${args.chapter})`);

  if (args.dryRun) {
    return { plan, warnings };
  }

  const chapterAbs = join(args.rootDir, rel.staging.chapterMd);
  const precomputedNer = loadedProfile
    ? await precomputeInfoLoadNer({ rootDir: args.rootDir, chapter: args.chapter, chapterAbsPath: chapterAbs })
    : null;

  const precomputedClicheLint = loadedCliche
    ? await precomputeClicheLintReport({
        rootDir: args.rootDir,
        chapter: args.chapter,
        chapterAbsPath: chapterAbs,
        config: loadedCliche.config,
        configRelPath: loadedCliche.relPath,
        platformProfile: loadedProfile?.profile ?? null
      })
    : null;

  if (precomputedClicheLint?.error) warnings.push(precomputedClicheLint.error);

  const precomputedReadabilityLint = loadedProfile
    ? await precomputeReadabilityReport({
        rootDir: args.rootDir,
        chapter: args.chapter,
        chapterAbsPath: chapterAbs,
        platformProfile: loadedProfile.profile
      })
    : null;

  if (precomputedReadabilityLint?.error) warnings.push(precomputedReadabilityLint.error);

  const precomputedNamingLint = loadedProfile
    ? await precomputeNamingReport({
        rootDir: args.rootDir,
        chapter: args.chapter,
        chapterAbsPath: chapterAbs,
        platformProfile: loadedProfile.profile,
        ...(precomputedNer ? { infoLoadNer: precomputedNer } : {})
      })
    : null;

  if (precomputedNamingLint?.error) warnings.push(precomputedNamingLint.error);

  await withWriteLock(args.rootDir, { chapter: args.chapter }, async () => {
    const checkpointAbs = join(args.rootDir, ".checkpoint.json");
    const stateAbs = join(args.rootDir, rel.final.stateCurrentJson);
    const globalAbs = join(args.rootDir, rel.final.foreshadowGlobalJson);
    const changelogAbs = join(args.rootDir, rel.final.stateChangelogJsonl);
    const deltaAbs = join(args.rootDir, rel.staging.deltaJson);
    const evalStagingAbs = join(args.rootDir, rel.staging.evalJson);

    const originalCheckpoint = await readTextFile(checkpointAbs);
    const originalStateExists = await pathExists(stateAbs);
    const originalState = originalStateExists ? await readTextFile(stateAbs) : null;
    const originalGlobalExists = await pathExists(globalAbs);
    const originalGlobal = originalGlobalExists ? await readTextFile(globalAbs) : null;
    const originalChangelogExists = await pathExists(changelogAbs);
    const originalChangelogSize = originalChangelogExists ? (await stat(changelogAbs)).size : 0;
    const originalDelta = await readTextFile(deltaAbs);
    const originalEval = loadedProfile || loadedCliche ? await readTextFile(evalStagingAbs) : null;

    const platformConstraintsLatestAbs = join(args.rootDir, "logs/platform-constraints/latest.json");
    const platformConstraintsHistoryAbs = join(
      args.rootDir,
      `logs/platform-constraints/platform-constraints-chapter-${pad3(args.chapter)}.json`
    );
    const originalPlatformConstraintsLatestExists = loadedProfile ? await pathExists(platformConstraintsLatestAbs) : false;
    const originalPlatformConstraintsLatest = originalPlatformConstraintsLatestExists ? await readTextFile(platformConstraintsLatestAbs) : null;
    const originalPlatformConstraintsHistoryExists = loadedProfile ? await pathExists(platformConstraintsHistoryAbs) : false;
    const originalPlatformConstraintsHistory = originalPlatformConstraintsHistoryExists ? await readTextFile(platformConstraintsHistoryAbs) : null;

    const titlePolicyLatestAbs = join(args.rootDir, "logs/retention/title-policy/latest.json");
    const titlePolicyHistoryAbs = join(args.rootDir, `logs/retention/title-policy/title-policy-chapter-${pad3(args.chapter)}.json`);
    const originalTitlePolicyLatestExists = loadedProfile ? await pathExists(titlePolicyLatestAbs) : false;
    const originalTitlePolicyLatest = originalTitlePolicyLatestExists ? await readTextFile(titlePolicyLatestAbs) : null;
    const originalTitlePolicyHistoryExists = loadedProfile ? await pathExists(titlePolicyHistoryAbs) : false;
    const originalTitlePolicyHistory = originalTitlePolicyHistoryExists ? await readTextFile(titlePolicyHistoryAbs) : null;

    const readabilityLintLatestAbs = join(args.rootDir, "logs/readability/latest.json");
    const readabilityLintHistoryAbs = join(args.rootDir, `logs/readability/readability-report-chapter-${pad3(args.chapter)}.json`);
    const originalReadabilityLintLatestExists = loadedProfile ? await pathExists(readabilityLintLatestAbs) : false;
    const originalReadabilityLintLatest = originalReadabilityLintLatestExists ? await readTextFile(readabilityLintLatestAbs) : null;
    const originalReadabilityLintHistoryExists = loadedProfile ? await pathExists(readabilityLintHistoryAbs) : false;
    const originalReadabilityLintHistory = originalReadabilityLintHistoryExists ? await readTextFile(readabilityLintHistoryAbs) : null;

    const namingLintLatestAbs = join(args.rootDir, "logs/naming/latest.json");
    const namingLintHistoryAbs = join(args.rootDir, `logs/naming/naming-report-chapter-${pad3(args.chapter)}.json`);
    const originalNamingLintLatestExists = loadedProfile ? await pathExists(namingLintLatestAbs) : false;
    const originalNamingLintLatest = originalNamingLintLatestExists ? await readTextFile(namingLintLatestAbs) : null;
    const originalNamingLintHistoryExists = loadedProfile ? await pathExists(namingLintHistoryAbs) : false;
    const originalNamingLintHistory = originalNamingLintHistoryExists ? await readTextFile(namingLintHistoryAbs) : null;

    const clicheLintLatestAbs = join(args.rootDir, "logs/cliche-lint/latest.json");
    const clicheLintHistoryAbs = join(args.rootDir, `logs/cliche-lint/cliche-lint-chapter-${pad3(args.chapter)}.json`);
    const originalClicheLintLatestExists = loadedCliche ? await pathExists(clicheLintLatestAbs) : false;
    const originalClicheLintLatest = originalClicheLintLatestExists ? await readTextFile(clicheLintLatestAbs) : null;
    const originalClicheLintHistoryExists = loadedCliche ? await pathExists(clicheLintHistoryAbs) : false;
    const originalClicheLintHistory = originalClicheLintHistoryExists ? await readTextFile(clicheLintHistoryAbs) : null;

    const moved: Array<{ from: string; to: string }> = [];
    let platformConstraintsWritten = false;
    let titlePolicyWritten = false;
    let readabilityLintWritten = false;
    let namingLintWritten = false;
    let clicheLintWritten = false;

    const rollback = async (): Promise<void> => {
      // Roll back moved files (best-effort).
      for (const m of moved.slice().reverse()) {
        try {
          await rollbackRename(args.rootDir, m.to, m.from);
        } catch {
          // ignore
        }
      }

      // Roll back checkpoint/state/global.
      try {
        await writeFile(checkpointAbs, originalCheckpoint, "utf8");
      } catch {
        // ignore
      }

      try {
        if (originalStateExists && originalState !== null) {
          await ensureDir(dirname(stateAbs));
          await writeFile(stateAbs, originalState, "utf8");
        } else {
          await removePath(stateAbs);
        }
      } catch {
        // ignore
      }

      try {
        if (originalGlobalExists && originalGlobal !== null) {
          await ensureDir(dirname(globalAbs));
          await writeFile(globalAbs, originalGlobal, "utf8");
        } else {
          await removePath(globalAbs);
        }
      } catch {
        // ignore
      }

      try {
        if (originalChangelogExists) {
          await truncate(changelogAbs, originalChangelogSize);
        } else {
          await removePath(changelogAbs);
        }
      } catch {
        // ignore
      }

      try {
        if (!(await pathExists(deltaAbs))) {
          await ensureDir(dirname(deltaAbs));
          await writeFile(deltaAbs, originalDelta, "utf8");
        }
      } catch {
        // ignore
      }

      try {
        if (originalEval !== null) {
          await ensureDir(dirname(evalStagingAbs));
          await writeFile(evalStagingAbs, originalEval, "utf8");
        }
      } catch {
        // ignore
      }

      if (platformConstraintsWritten) {
        try {
          if (originalPlatformConstraintsLatestExists && originalPlatformConstraintsLatest !== null) {
            await ensureDir(dirname(platformConstraintsLatestAbs));
            await writeFile(platformConstraintsLatestAbs, originalPlatformConstraintsLatest, "utf8");
          } else {
            await removePath(platformConstraintsLatestAbs);
          }
        } catch {
          // ignore
        }

        try {
          if (originalPlatformConstraintsHistoryExists && originalPlatformConstraintsHistory !== null) {
            await ensureDir(dirname(platformConstraintsHistoryAbs));
            await writeFile(platformConstraintsHistoryAbs, originalPlatformConstraintsHistory, "utf8");
          } else {
            await removePath(platformConstraintsHistoryAbs);
          }
        } catch {
          // ignore
        }
      }

      if (titlePolicyWritten) {
        try {
          if (originalTitlePolicyLatestExists && originalTitlePolicyLatest !== null) {
            await ensureDir(dirname(titlePolicyLatestAbs));
            await writeFile(titlePolicyLatestAbs, originalTitlePolicyLatest, "utf8");
          } else {
            await removePath(titlePolicyLatestAbs);
          }
        } catch {
          // ignore
        }

        try {
          if (originalTitlePolicyHistoryExists && originalTitlePolicyHistory !== null) {
            await ensureDir(dirname(titlePolicyHistoryAbs));
            await writeFile(titlePolicyHistoryAbs, originalTitlePolicyHistory, "utf8");
          } else {
            await removePath(titlePolicyHistoryAbs);
          }
        } catch {
          // ignore
        }
      }

      if (readabilityLintWritten) {
        try {
          if (originalReadabilityLintLatestExists && originalReadabilityLintLatest !== null) {
            await ensureDir(dirname(readabilityLintLatestAbs));
            await writeFile(readabilityLintLatestAbs, originalReadabilityLintLatest, "utf8");
          } else {
            await removePath(readabilityLintLatestAbs);
          }
        } catch {
          // ignore
        }

        try {
          if (originalReadabilityLintHistoryExists && originalReadabilityLintHistory !== null) {
            await ensureDir(dirname(readabilityLintHistoryAbs));
            await writeFile(readabilityLintHistoryAbs, originalReadabilityLintHistory, "utf8");
          } else {
            await removePath(readabilityLintHistoryAbs);
          }
        } catch {
          // ignore
        }
      }

      if (namingLintWritten) {
        try {
          if (originalNamingLintLatestExists && originalNamingLintLatest !== null) {
            await ensureDir(dirname(namingLintLatestAbs));
            await writeFile(namingLintLatestAbs, originalNamingLintLatest, "utf8");
          } else {
            await removePath(namingLintLatestAbs);
          }
        } catch {
          // ignore
        }

        try {
          if (originalNamingLintHistoryExists && originalNamingLintHistory !== null) {
            await ensureDir(dirname(namingLintHistoryAbs));
            await writeFile(namingLintHistoryAbs, originalNamingLintHistory, "utf8");
          } else {
            await removePath(namingLintHistoryAbs);
          }
        } catch {
          // ignore
        }
      }

      if (clicheLintWritten) {
        try {
          if (originalClicheLintLatestExists && originalClicheLintLatest !== null) {
            await ensureDir(dirname(clicheLintLatestAbs));
            await writeFile(clicheLintLatestAbs, originalClicheLintLatest, "utf8");
          } else {
            await removePath(clicheLintLatestAbs);
          }
        } catch {
          // ignore
        }

        try {
          if (originalClicheLintHistoryExists && originalClicheLintHistory !== null) {
            await ensureDir(dirname(clicheLintHistoryAbs));
            await writeFile(clicheLintHistoryAbs, originalClicheLintHistory, "utf8");
          } else {
            await removePath(clicheLintHistoryAbs);
          }
        } catch {
          // ignore
        }
      }
    };

    try {
      if (loadedProfile?.profile.hook_policy?.required) {
        const hookPolicy = loadedProfile.profile.hook_policy;
        const evalRaw = await readJsonFile(evalStagingAbs);
        if (isPlainObject(evalRaw)) {
          const evalChapter = (evalRaw as Record<string, unknown>).chapter;
          if (typeof evalChapter === "number" && Number.isFinite(evalChapter) && evalChapter !== args.chapter) {
            warnings.push(`Eval.chapter is ${evalChapter}, expected ${args.chapter}.`);
          }
        }
        const hookCheck = checkHookPolicy({ hookPolicy, evalRaw });
        if (hookCheck.status === "invalid_eval") {
          throw new NovelCliError(`Hook policy enabled but eval is missing required hook fields: ${hookCheck.reason}`, 2);
        }
        if (hookCheck.status === "fail") {
          throw new NovelCliError(`Hook policy violation: ${hookCheck.reason}`, 2);
        }
      }

      // Pre-validate state merge (in-memory).
      const state = await readState(args.rootDir, rel.final.stateCurrentJson);
      if (state.state_version !== delta.base_state_version) {
        throw new NovelCliError(
          `State version mismatch: state.state_version=${state.state_version} delta.base_state_version=${delta.base_state_version}`,
          2
        );
      }

      const normalizedOps = validateOps(delta.ops, warnings);
      const { applied: appliedOps, foreshadowOps } = applyStateOps(state, normalizedOps, warnings);
      state.state_version = state.state_version + 1;
      state.last_updated_chapter = args.chapter;

      const chapterText = loadedProfile || loadedCliche ? await readTextFile(chapterAbs) : null;
      const chapterFingerprintNow =
        chapterText !== null
          ? await (async () => {
              const s = await stat(chapterAbs);
              return { size: s.size, mtime_ms: s.mtimeMs, content_hash: hashText(chapterText) };
            })()
          : null;

      let infoLoadNer = precomputedNer;
      if (precomputedNer?.status === "pass" && precomputedNer.chapter_fingerprint && chapterFingerprintNow) {
        const fpNow = chapterFingerprintNow;
        const fpPrev = precomputedNer.chapter_fingerprint;
        if (!fingerprintsMatch(fpNow, fpPrev)) {
          infoLoadNer = {
            status: "skipped",
            error: "Chapter changed during commit; skipping info-load NER.",
            chapter_fingerprint: null,
            current_index: null,
            recent_texts: null
          };
        }
      }

      let readabilityLintReport: Awaited<ReturnType<typeof computeReadabilityReport>> | null = null;
      if (loadedProfile && chapterText !== null) {
        const pre = precomputedReadabilityLint;
        if (
          pre &&
          pre.status === "pass" &&
          pre.report &&
          pre.chapter_fingerprint &&
          chapterFingerprintNow &&
          fingerprintsMatch(pre.chapter_fingerprint, chapterFingerprintNow)
        ) {
          readabilityLintReport = pre.report;
        } else {
          readabilityLintReport = await computeReadabilityReport({
            rootDir: args.rootDir,
            chapter: args.chapter,
            chapterAbsPath: chapterAbs,
            chapterText,
            platformProfile: loadedProfile.profile,
            preferDeterministicScript: true
          });
        }

        if (readabilityLintReport.mode === "fallback" && readabilityLintReport.script_error) {
          const detail = readabilityLintReport.script_error;
          const msg = `Readability lint degraded: ${detail}`;
          if (!warnings.some((w) => w.includes(detail))) warnings.push(msg);
        }

        if (readabilityLintReport.has_blocking_issues) {
          const blocking = readabilityLintReport.policy?.blocking_severity ?? "hard_only";
          const blockingIssues =
            blocking === "soft_and_hard"
              ? readabilityLintReport.issues.filter((i) => i.severity === "soft" || i.severity === "hard")
              : readabilityLintReport.issues.filter((i) => i.severity === "hard");
          const limit = 3;
          const detailsBase = summarizeReadabilityIssues(blockingIssues, limit);
          const suffix = blockingIssues.length > limit ? " …" : "";
          const details = detailsBase.length > 0 ? `${detailsBase}${suffix}` : "(details in readability lint report)";
          const scriptRel = readabilityLintReport.script?.rel_path ?? "scripts/lint-readability.sh";
          const inspect = `bash "${scriptRel}" "${rel.staging.chapterMd}" "platform-profile.json" ${args.chapter}`;
          throw new NovelCliError(`Mobile readability blocking issue: ${details}. Inspect: ${inspect}`, 2);
        }
      }

      let namingLintReport: Awaited<ReturnType<typeof computeNamingReport>> | null = null;
      if (loadedProfile && chapterText !== null) {
        const pre = precomputedNamingLint;
        if (
          pre &&
          pre.status === "pass" &&
          pre.report &&
          pre.chapter_fingerprint &&
          chapterFingerprintNow &&
          fingerprintsMatch(pre.chapter_fingerprint, chapterFingerprintNow)
        ) {
          namingLintReport = pre.report;
        } else {
          namingLintReport = await computeNamingReport({
            rootDir: args.rootDir,
            chapter: args.chapter,
            chapterText,
            platformProfile: loadedProfile.profile,
            ...(infoLoadNer ? { infoLoadNer } : {})
          });
        }

        if (namingLintReport.has_blocking_issues) {
          const blockingIssues = namingLintReport.issues.filter((i) => i.severity === "hard");
          const limit = 3;
          const detailsBase = summarizeNamingIssues(blockingIssues, limit);
          const suffix = blockingIssues.length > limit ? " …" : "";
          const details = detailsBase.length > 0 ? `${detailsBase}${suffix}` : "(details in naming lint report)";
          throw new NovelCliError(`Naming conflict blocking issue: ${details}`, 2);
        }
      }

      let platformConstraintsReport: Awaited<ReturnType<typeof computePlatformConstraints>> | null = null;
      if (loadedProfile && chapterText !== null) {
        platformConstraintsReport = await computePlatformConstraints({
          rootDir: args.rootDir,
          chapter: args.chapter,
          chapterAbsPath: chapterAbs,
          chapterText,
          platformProfile: loadedProfile.profile,
          state,
          ...(infoLoadNer ? { infoLoadNer } : {})
        });

        if (platformConstraintsReport.has_hard_violations) {
          const hardIssues = platformConstraintsReport.issues.filter((i) => i.severity === "hard");
          const hardSummaries = hardIssues.map((i) => i.summary).slice(0, 3);
          const suffix = hardIssues.length > 3 ? " …" : "";
          throw new NovelCliError(`Platform constraints hard violation: ${hardSummaries.join(" | ")}${suffix}`, 2);
        }
      }

      let clicheLintReport: Awaited<ReturnType<typeof computeClicheLintReport>> | null = null;
      if (loadedCliche && chapterText !== null) {
        const pre = precomputedClicheLint;
        if (
          pre &&
          pre.status === "pass" &&
          pre.report &&
          pre.chapter_fingerprint &&
          chapterFingerprintNow &&
          fingerprintsMatch(pre.chapter_fingerprint, chapterFingerprintNow)
        ) {
          clicheLintReport = pre.report;
        } else {
          clicheLintReport = await computeClicheLintReport({
            rootDir: args.rootDir,
            chapter: args.chapter,
            chapterAbsPath: chapterAbs,
            chapterText,
            config: loadedCliche.config,
            configRelPath: loadedCliche.relPath,
            platformProfile: loadedProfile?.profile ?? null,
            preferDeterministicScript: false
          });
        }

        if (clicheLintReport.has_hard_hits) {
          const hardHits = clicheLintReport.hits.filter((h) => h.severity === "hard");
          const hardSummaries = hardHits
            .map((h) => `${h.word} x${h.count}`)
            .slice(0, 3);
          const suffix = hardHits.length > 3 ? " …" : "";
          const details = hardSummaries.length > 0 ? `${hardSummaries.join(" | ")}${suffix}` : "(details in cliché lint report)";
          throw new NovelCliError(`Cliché lint hard violation: ${details}`, 2);
        }
      }

      // Moves first (rollbackable).
      await doRename(args.rootDir, rel.staging.chapterMd, rel.final.chapterMd);
      moved.push({ from: rel.staging.chapterMd, to: rel.final.chapterMd });
      await doRename(args.rootDir, rel.staging.summaryMd, rel.final.summaryMd);
      moved.push({ from: rel.staging.summaryMd, to: rel.final.summaryMd });
      await doRename(args.rootDir, rel.staging.evalJson, rel.final.evalJson);
      moved.push({ from: rel.staging.evalJson, to: rel.final.evalJson });
      await doRename(args.rootDir, rel.staging.crossrefJson, rel.final.crossrefJson);
      moved.push({ from: rel.staging.crossrefJson, to: rel.final.crossrefJson });
      await doRename(args.rootDir, memoryRel, finalMemoryRel);
      moved.push({ from: memoryRel, to: finalMemoryRel });

      // Now write state + changelog + foreshadowing + checkpoint.
      await writeJsonFile(stateAbs, state);
      await appendJsonl(args.rootDir, rel.final.stateChangelogJsonl, deltaObj);
      warnings.push(`Applied ${appliedOps} state ops.`);

      await updateForeshadowing({ rootDir: args.rootDir, checkpoint, delta, foreshadowOps, warnings, dryRun: false });

      await removePath(join(args.rootDir, rel.staging.deltaJson));

      if (loadedProfile && platformConstraintsReport) {
        platformConstraintsWritten = true;
        const { historyRel } = await writePlatformConstraintsLogs({ rootDir: args.rootDir, chapter: args.chapter, report: platformConstraintsReport });
        await attachPlatformConstraintsToEval({
          evalAbsPath: join(args.rootDir, rel.final.evalJson),
          evalRelPath: rel.final.evalJson,
          platform: loadedProfile.profile.platform,
          reportRelPath: historyRel,
          report: platformConstraintsReport
        });

        if (chapterText !== null) {
          const titleReport = computeTitlePolicyReport({ chapter: args.chapter, chapterText, platformProfile: loadedProfile.profile });
          titlePolicyWritten = true;
          await writeTitlePolicyLogs({ rootDir: args.rootDir, chapter: args.chapter, report: titleReport });
        }
      }

      if (loadedProfile && readabilityLintReport) {
        readabilityLintWritten = true;
        const { historyRel: readabilityHistoryRel } = await writeReadabilityLogs({ rootDir: args.rootDir, chapter: args.chapter, report: readabilityLintReport });
        await attachReadabilityLintToEval({
          evalAbsPath: join(args.rootDir, rel.final.evalJson),
          evalRelPath: rel.final.evalJson,
          reportRelPath: readabilityHistoryRel,
          report: readabilityLintReport
        });
      }

      if (loadedProfile && namingLintReport) {
        namingLintWritten = true;
        const { historyRel: namingHistoryRel } = await writeNamingLintLogs({ rootDir: args.rootDir, chapter: args.chapter, report: namingLintReport });
        await attachNamingLintToEval({
          evalAbsPath: join(args.rootDir, rel.final.evalJson),
          evalRelPath: rel.final.evalJson,
          reportRelPath: namingHistoryRel,
          report: namingLintReport
        });
      }

      if (loadedCliche && clicheLintReport) {
        clicheLintWritten = true;
        const { historyRel } = await writeClicheLintLogs({ rootDir: args.rootDir, chapter: args.chapter, report: clicheLintReport });
        await attachClicheLintToEval({
          evalAbsPath: join(args.rootDir, rel.final.evalJson),
          evalRelPath: rel.final.evalJson,
          reportRelPath: historyRel,
          report: clicheLintReport
        });
      }

      if (loadedProfile && loadedProfile.profile.scoring && loadedGenreWeights) {
        await attachScoringWeightsToEval({
          evalAbsPath: join(args.rootDir, rel.final.evalJson),
          evalRelPath: rel.final.evalJson,
          platformProfile: loadedProfile.profile,
          genreWeightProfiles: loadedGenreWeights
        });
      }

      const updatedCheckpoint: Checkpoint = { ...checkpoint };
      if (updatedCheckpoint.last_completed_chapter >= args.chapter) {
        warnings.push(`Checkpoint last_completed_chapter is already ${updatedCheckpoint.last_completed_chapter}; leaving as-is.`);
      } else {
        updatedCheckpoint.last_completed_chapter = args.chapter;
      }
      updatedCheckpoint.pipeline_stage = "committed";
      updatedCheckpoint.inflight_chapter = null;
      updatedCheckpoint.revision_count = 0;
      updatedCheckpoint.hook_fix_count = 0;
      updatedCheckpoint.title_fix_count = 0;
      updatedCheckpoint.last_checkpoint_time = new Date().toISOString();
      await writeCheckpoint(args.rootDir, updatedCheckpoint);
    } catch (err) {
      await rollback();
      throw err;
    }
  });

  // Post-commit (outside write-lock): optional sliding-window and volume-end continuity audits.
  // These audits are non-blocking (best-effort): failures only add warnings.
  const runContinuityAudit = async (scope: "periodic" | "volume_end", volume: number, start: number, end: number): Promise<ContinuityReport> => {
    const report = await computeContinuityReport({
      rootDir: args.rootDir,
      volume,
      scope,
      chapterRange: { start, end }
    });
    await writeContinuityLogs({ rootDir: args.rootDir, report });
    if (scope === "volume_end") {
      await writeVolumeContinuityReport({ rootDir: args.rootDir, report });
    }
    return report;
  };

  const warnIfNerFullyDegraded = (scope: "periodic" | "volume_end", report: ContinuityReport): void => {
    const nerOk = typeof report.stats.ner_ok === "number" ? report.stats.ner_ok : null;
    const nerFailed = typeof report.stats.ner_failed === "number" ? report.stats.ner_failed : null;
    if (nerOk === 0 && typeof nerFailed === "number" && nerFailed > 0) {
      const sample = typeof report.stats.ner_failed_sample === "string" ? report.stats.ner_failed_sample : null;
      const suffix = sample ? ` (sample: ${sample})` : "";
      warnings.push(`Continuity audit degraded (${scope}): NER failed for ${nerFailed} chapters; report may be empty.${suffix}`);
    }
  };

  // Re-resolve volume range for audits if we couldn't resolve it during planning.
  if (!volumeRange) {
    try {
      volumeRange = await tryResolveVolumeChapterRange({ rootDir: args.rootDir, volume });
    } catch {
      volumeRange = null;
    }
    isVolumeEnd = volumeRange !== null && args.chapter === volumeRange.end;
    shouldPeriodicContinuityAudit = args.chapter % 5 === 0 && !isVolumeEnd;
  }

  // Crash compensation for volume-end audits:
  // - create a pending marker before running volume_end (so a crash leaves a durable "rerun needed" flag)
  // - remove marker after successful report write
  const volumeEndTasks = new Map<number, { start: number; end: number; markerRel: string }>();
  const pendingMarkers = await listPendingVolumeEndAuditMarkers(args.rootDir, warnings);
  for (const it of pendingMarkers) {
    const [start, end] = it.marker.chapter_range;
    const volumeReportAbs = join(args.rootDir, `volumes/vol-${pad2(it.marker.volume)}/continuity-report.json`);
    if (await pathExists(volumeReportAbs)) {
      // Marker was likely left behind; clear it.
      try {
        await removePath(join(args.rootDir, it.rel));
      } catch {
        // ignore
      }
      continue;
    }
    volumeEndTasks.set(it.marker.volume, { start, end, markerRel: it.rel });
  }

  if (isVolumeEnd && volumeRange) {
    volumeEndTasks.set(volume, { start: volumeRange.start, end: volumeRange.end, markerRel: pendingVolumeEndMarkerRel(volume) });
  }

  for (const [taskVolume, task] of Array.from(volumeEndTasks.entries()).sort((a, b) => a[0] - b[0])) {
    const markerAbs = join(args.rootDir, task.markerRel);
    if (!(await pathExists(markerAbs))) {
      try {
        await writeJsonFile(markerAbs, {
          schema_version: 1,
          created_at: new Date().toISOString(),
          volume: taskVolume,
          chapter_range: [task.start, task.end]
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        warnings.push(`Failed to write pending volume-end audit marker: ${task.markerRel}. ${message}`);
      }
    }

    try {
      const report = await runContinuityAudit("volume_end", taskVolume, task.start, task.end);
      warnIfNerFullyDegraded("volume_end", report);
      await removePath(markerAbs);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Continuity audit skipped (volume_end): ${message}`);
    }
  }

  if (shouldPeriodicContinuityAudit) {
    try {
      const start = Math.max(1, args.chapter - 9);
      const end = args.chapter;
      const report = await runContinuityAudit("periodic", volume, start, end);
      warnIfNerFullyDegraded("periodic", report);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Continuity audit skipped (periodic): ${message}`);
    }
  }

  // Post-commit (outside write-lock): foreshadow visibility maintenance (non-blocking).
  try {
    const platform = loadedProfile?.profile.platform ?? null;
    const genreDriveType = typeof loadedProfile?.profile.scoring?.genre_drive_type === "string" ? loadedProfile.profile.scoring.genre_drive_type : null;
    const items = await loadForeshadowGlobalItems(args.rootDir);
    const report = computeForeshadowVisibilityReport({
      items,
      asOfChapter: args.chapter,
      volume,
      platform,
      genreDriveType
    });

    const historyRange = resolveForeshadowVisibilityHistoryRange({ chapter: args.chapter, isVolumeEnd, volumeRange });

    await writeForeshadowVisibilityLogs({ rootDir: args.rootDir, report, historyRange });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    warnings.push(`Foreshadow visibility maintenance skipped: ${message}`);
  }

  return { plan, warnings };
}
