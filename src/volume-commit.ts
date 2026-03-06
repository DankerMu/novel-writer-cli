import { copyFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, removePath, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { withWriteLock } from "./lock.js";
import { isPlainObject } from "./type-guards.js";
import { validateStep } from "./validate.js";
import { hasQuickstartMiniPlanningArtifacts, QUICKSTART_MINI_PLANNING_RANGE, volumeFinalRelPaths, volumeStagingRelPaths } from "./volume-planning.js";

export type VolumeCommitResult = {
  plan: string[];
  warnings: string[];
};

type CommitArgs = {
  rootDir: string;
  volume: number;
  dryRun: boolean;
};

async function doRenameDir(rootDir: string, fromRel: string, toRel: string): Promise<void> {
  const fromAbs = join(rootDir, fromRel);
  const toAbs = join(rootDir, toRel);
  if (await pathExists(toAbs)) {
    throw new NovelCliError(`Refusing to overwrite existing destination: ${toRel}`, 2);
  }
  await ensureDir(join(rootDir, "volumes"));
  try {
    await rename(fromAbs, toAbs);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to move '${fromRel}' to '${toRel}': ${message}`, 2);
  }
}

function requireVolume(volume: number): void {
  if (!Number.isInteger(volume) || volume < 1) {
    throw new NovelCliError(`Invalid --volume: ${String(volume)} (expected int >= 1).`, 2);
  }
}

function requireCheckpointReady(checkpoint: Checkpoint, volume: number): void {
  if (checkpoint.current_volume !== volume) {
    throw new NovelCliError(
      `Volume mismatch: checkpoint.current_volume=${checkpoint.current_volume}, but commit requested --volume ${volume}.`,
      2
    );
  }
  if (checkpoint.orchestrator_state !== "VOL_PLANNING") {
    throw new NovelCliError(
      `Cannot commit volume plan unless orchestrator_state=VOL_PLANNING (got ${checkpoint.orchestrator_state}).`,
      2
    );
  }
  const stage = checkpoint.pipeline_stage ?? null;
  const inflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
  if (!(stage === null || stage === "committed") || inflight !== null) {
    throw new NovelCliError(
      `Cannot commit volume plan unless chapter pipeline is idle (pipeline_stage=null|committed and inflight_chapter=null). Got pipeline_stage=${stage ?? "null"} inflight_chapter=${inflight ?? "null"}.`,
      2
    );
  }
  if (checkpoint.volume_pipeline_stage !== "commit") {
    throw new NovelCliError(
      `Cannot commit volume plan unless volume_pipeline_stage=commit (got ${String(checkpoint.volume_pipeline_stage ?? "null")}). Advance volume steps first.`,
      2
    );
  }
}

function uniqueStrings(values: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function splitOutline(text: string): { header: string; body: string } {
  const lines = text.split(/\r?\n/u);
  const chapterStart = lines.findIndex((line) => /^###\s*第\s*\d+\s*章/u.test(line));
  if (chapterStart < 0) return { header: text.trimEnd(), body: "" };
  return {
    header: lines.slice(0, chapterStart).join("\n").trimEnd(),
    body: lines.slice(chapterStart).join("\n").trim()
  };
}

function mergeSchedule(existingRaw: unknown, incomingRaw: unknown): unknown {
  if (!isPlainObject(existingRaw) || !isPlainObject(incomingRaw)) return incomingRaw;
  const existing = existingRaw as Record<string, unknown>;
  const incoming = incomingRaw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existing, ...incoming };

  merged.active_storylines = uniqueStrings([
    ...(Array.isArray(existing.active_storylines) ? existing.active_storylines : []),
    ...(Array.isArray(incoming.active_storylines) ? incoming.active_storylines : [])
  ]);

  if (Array.isArray(existing.convergence_events) || Array.isArray(incoming.convergence_events)) {
    merged.convergence_events = [
      ...(Array.isArray(existing.convergence_events) ? existing.convergence_events : []),
      ...(Array.isArray(incoming.convergence_events) ? incoming.convergence_events : [])
    ];
  }

  const existingPattern = existing.interleaving_pattern;
  const incomingPattern = incoming.interleaving_pattern;
  if (Array.isArray(existingPattern) || Array.isArray(incomingPattern)) {
    merged.interleaving_pattern = [
      ...(Array.isArray(existingPattern) ? existingPattern : []),
      ...(Array.isArray(incomingPattern) ? incomingPattern : [])
    ];
  } else if (isPlainObject(existingPattern) && isPlainObject(incomingPattern)) {
    merged.interleaving_pattern = { ...(existingPattern as Record<string, unknown>), ...(incomingPattern as Record<string, unknown>) };
  }

  return merged;
}

function mergeForeshadowing(existingRaw: unknown, incomingRaw: unknown): unknown {
  if (!isPlainObject(existingRaw) || !isPlainObject(incomingRaw)) return incomingRaw;
  const existing = existingRaw as Record<string, unknown>;
  const incoming = incomingRaw as Record<string, unknown>;
  const merged: Record<string, unknown> = { ...existing, ...incoming };

  const items = new Map<string, Record<string, unknown>>();
  const appendItem = (item: unknown): void => {
    if (!isPlainObject(item)) return;
    const record = item as Record<string, unknown>;
    const id = typeof record.id === "string" ? record.id.trim() : "";
    if (id.length === 0) {
      items.set(`__anon_${items.size}`, record);
      return;
    }
    const previous = items.get(id);
    if (!previous) {
      items.set(id, record);
      return;
    }
    const mergedRecord: Record<string, unknown> = { ...previous, ...record };
    if (Array.isArray(previous.history) || Array.isArray(record.history)) {
      mergedRecord.history = [
        ...(Array.isArray(previous.history) ? previous.history : []),
        ...(Array.isArray(record.history) ? record.history : [])
      ];
    }
    items.set(id, mergedRecord);
  };

  for (const item of Array.isArray(existing.items) ? existing.items : []) appendItem(item);
  for (const item of Array.isArray(incoming.items) ? incoming.items : []) appendItem(item);
  merged.items = Array.from(items.values());
  if (existing.schema_version !== undefined && incoming.schema_version === undefined) merged.schema_version = existing.schema_version;
  return merged;
}

function mergeNewCharacters(existingRaw: unknown, incomingRaw: unknown): unknown {
  const existing = Array.isArray(existingRaw) ? existingRaw : [];
  const incoming = Array.isArray(incomingRaw) ? incomingRaw : [];
  const merged: unknown[] = [];
  const seen = new Set<string>();
  for (const item of [...existing, ...incoming]) {
    if (!isPlainObject(item)) {
      merged.push(item);
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    const firstChapter = typeof record.first_chapter === "number" ? record.first_chapter : "?";
    const key = `${name}|${String(firstChapter)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(record);
  }
  return merged;
}

async function mergeVolumePlanIntoExistingFinal(rootDir: string, volume: number): Promise<void> {
  const staging = volumeStagingRelPaths(volume);
  const final = volumeFinalRelPaths(volume);

  const existingOutline = await readTextFile(join(rootDir, final.outlineMd));
  const incomingOutline = await readTextFile(join(rootDir, staging.outlineMd));
  const existingSplit = splitOutline(existingOutline);
  const incomingSplit = splitOutline(incomingOutline);
  const combinedOutline = [existingSplit.header, existingSplit.body, incomingSplit.body].filter((part) => part.trim().length > 0).join("\n\n");
  await writeTextFile(join(rootDir, final.outlineMd), `${combinedOutline.trimEnd()}\n`);

  const mergedSchedule = mergeSchedule(
    await readJsonFile(join(rootDir, final.storylineScheduleJson)),
    await readJsonFile(join(rootDir, staging.storylineScheduleJson))
  );
  await writeJsonFile(join(rootDir, final.storylineScheduleJson), mergedSchedule);

  const mergedForeshadowing = mergeForeshadowing(
    await readJsonFile(join(rootDir, final.foreshadowingJson)),
    await readJsonFile(join(rootDir, staging.foreshadowingJson))
  );
  await writeJsonFile(join(rootDir, final.foreshadowingJson), mergedForeshadowing);

  const finalNewCharactersAbs = join(rootDir, final.newCharactersJson);
  const mergedNewCharacters = mergeNewCharacters(
    (await pathExists(finalNewCharactersAbs)) ? await readJsonFile(finalNewCharactersAbs) : [],
    await readJsonFile(join(rootDir, staging.newCharactersJson))
  );
  await writeJsonFile(finalNewCharactersAbs, mergedNewCharacters);

  await ensureDir(join(rootDir, final.chapterContractsDir));
  const contractEntries = await readdir(join(rootDir, staging.chapterContractsDir), { withFileTypes: true });
  for (const entry of contractEntries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const match = /^chapter-(\d+)\.json$/u.exec(entry.name);
    const chapter = match ? Number.parseInt(match[1] ?? "", 10) : null;
    if (chapter !== null && chapter <= QUICKSTART_MINI_PLANNING_RANGE.end) {
      throw new NovelCliError(`Refusing to overwrite existing seed contract during merge: ${entry.name}`, 2);
    }
    const destination = join(rootDir, final.chapterContractsDir, entry.name);
    if (await pathExists(destination)) {
      throw new NovelCliError(`Refusing to overwrite existing destination during merge: ${final.chapterContractsDir}/${entry.name}`, 2);
    }
    await copyFile(join(rootDir, staging.chapterContractsDir, entry.name), destination);
  }

  await removePath(join(rootDir, staging.dir));
}

export async function commitVolume(args: CommitArgs): Promise<VolumeCommitResult> {
  requireVolume(args.volume);

  const plan: string[] = [];
  const warnings: string[] = [];

  const staging = volumeStagingRelPaths(args.volume).dir;
  const finalDir = volumeFinalRelPaths(args.volume).dir;
  plan.push(`MOVE ${staging} -> ${finalDir}`);
  plan.push(`CLEAN staging/foreshadowing`);
  plan.push(`UPDATE .checkpoint.json (orchestrator_state=WRITING)`);

  if (args.dryRun) {
    return { plan, warnings };
  }

  await withWriteLock(args.rootDir, {}, async () => {
    const checkpoint = await readCheckpoint(args.rootDir);
    requireCheckpointReady(checkpoint, args.volume);

    const stagingAbs = join(args.rootDir, staging);
    const finalAbs = join(args.rootDir, finalDir);

    const stagingExists = await pathExists(stagingAbs);
    const finalExists = await pathExists(finalAbs);
    const canMergeExistingFinal = args.volume === 1 && finalExists && stagingExists && await hasQuickstartMiniPlanningArtifacts(args.rootDir);

    if (finalExists && !stagingExists) {
      const required = join(args.rootDir, volumeFinalRelPaths(args.volume).outlineMd);
      if (!(await pathExists(required))) {
        throw new NovelCliError(
          `Commit recovery refused: final volume directory exists but is missing ${volumeFinalRelPaths(args.volume).outlineMd}. Resolve manually.`,
          2
        );
      }
      warnings.push(`Volume directory already exists (${finalDir}); treating as already committed and only normalizing checkpoint.`);
    } else if (finalExists && stagingExists && !canMergeExistingFinal) {
      throw new NovelCliError(
        `Commit conflict: both staging and final volume directories exist (${staging} and ${finalDir}). Refusing to overwrite; resolve manually.`,
        2
      );
    } else if (!stagingExists) {
      throw new NovelCliError(`Missing staging volume directory: ${staging}`, 2);
    } else {
      await validateStep({ rootDir: args.rootDir, checkpoint, step: { kind: "volume", phase: "validate" } });
      if (canMergeExistingFinal) {
        await mergeVolumePlanIntoExistingFinal(args.rootDir, args.volume);
      } else {
        await doRenameDir(args.rootDir, staging, finalDir);
      }
    }

    const updated: Checkpoint = { ...checkpoint };
    updated.orchestrator_state = "WRITING";
    updated.volume_pipeline_stage = null;
    updated.last_committed_volume = args.volume;
    updated.pipeline_stage = "committed";
    updated.inflight_chapter = null;
    updated.revision_count = 0;
    updated.hook_fix_count = 0;
    updated.title_fix_count = 0;
    updated.last_checkpoint_time = new Date().toISOString();
    await writeCheckpoint(args.rootDir, updated);

    try {
      await removePath(join(args.rootDir, "staging/foreshadowing"));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      warnings.push(`Failed to clean staging/foreshadowing after commit (non-fatal): ${message}`);
    }
  });

  return { plan, warnings };
}
