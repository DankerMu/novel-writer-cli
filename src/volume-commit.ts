import { copyFile, readdir, rename } from "node:fs/promises";
import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, removePath, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { withWriteLock } from "./lock.js";
import { QUICKSTART_MINI_PLANNING_RANGE, extractOutlineChapterNumbers, quickstartMiniPlanningChapters, startsWithQuickstartMiniPlanningSeedSequence } from "./quickstart-mini-planning.js";
import { isPlainObject } from "./type-guards.js";
import { validateStep } from "./validate.js";
import { hasQuickstartMiniPlanningSeedBase, volumeFinalRelPaths, volumeStagingRelPaths } from "./volume-planning.js";

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

function stableValueKey(value: unknown): string {
  try {
    return JSON.stringify(value) ?? "undefined";
  } catch {
    return String(value);
  }
}

function uniqueValues(values: unknown[]): unknown[] {
  const out: unknown[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const key = stableValueKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function parseOutline(text: string): { header: string; blocks: Map<number, string> } {
  const lines = text.split(/\r?\n/u);
  const chapterHeadingRe = /^###\s*第\s*(\d+)\s*章/u;
  const headings: Array<{ chapter: number; startLine: number; endLine: number }> = [];

  for (let index = 0; index < lines.length; index++) {
    const match = chapterHeadingRe.exec(lines[index] ?? "");
    if (!match) continue;
    const chapter = Number.parseInt(match[1] ?? "", 10);
    if (!Number.isInteger(chapter) || chapter < 1) continue;
    headings.push({ chapter, startLine: index, endLine: lines.length });
  }

  if (headings.length === 0) {
    return { header: text.trimEnd(), blocks: new Map() };
  }

  for (let index = 0; index < headings.length; index++) {
    const current = headings[index]!;
    const next = headings[index + 1];
    current.endLine = next ? next.startLine : lines.length;
  }

  const blocks = new Map<number, string>();
  for (const heading of headings) {
    if (blocks.has(heading.chapter)) {
      throw new NovelCliError(`Invalid outline during merge: duplicate chapter block for chapter ${heading.chapter}.`, 2);
    }
    blocks.set(heading.chapter, lines.slice(heading.startLine, heading.endLine).join("\n").trim());
  }

  return {
    header: lines.slice(0, headings[0]!.startLine).join("\n").trimEnd(),
    blocks
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
    merged.convergence_events = uniqueValues([
      ...(Array.isArray(existing.convergence_events) ? existing.convergence_events : []),
      ...(Array.isArray(incoming.convergence_events) ? incoming.convergence_events : [])
    ]);
  }

  const existingPattern = existing.interleaving_pattern;
  const incomingPattern = incoming.interleaving_pattern;
  if (Array.isArray(existingPattern) || Array.isArray(incomingPattern)) {
    merged.interleaving_pattern = uniqueValues([
      ...(Array.isArray(existingPattern) ? existingPattern : []),
      ...(Array.isArray(incomingPattern) ? incomingPattern : [])
    ]);
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
      mergedRecord.history = uniqueValues([
        ...(Array.isArray(previous.history) ? previous.history : []),
        ...(Array.isArray(record.history) ? record.history : [])
      ]);
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

async function jsonFilesEquivalent(leftAbs: string, rightAbs: string): Promise<boolean> {
  return stableValueKey(await readJsonFile(leftAbs)) === stableValueKey(await readJsonFile(rightAbs));
}

async function mergeVolumePlanIntoExistingFinal(rootDir: string, volume: number): Promise<void> {
  const staging = volumeStagingRelPaths(volume);
  const final = volumeFinalRelPaths(volume);

  const existingOutline = await readTextFile(join(rootDir, final.outlineMd));
  const incomingOutline = await readTextFile(join(rootDir, staging.outlineMd));
  const existingParsed = parseOutline(existingOutline);
  const incomingParsed = parseOutline(incomingOutline);

  const existingOutlineChapters = [...existingParsed.blocks.keys()].sort((left, right) => left - right);
  const expectedSeedChapters = quickstartMiniPlanningChapters();
  if (!startsWithQuickstartMiniPlanningSeedSequence(existingOutlineChapters)) {
    throw new NovelCliError(
      `Refusing to merge into existing volume seed: expected outline to start with chapters ${expectedSeedChapters.join(", ")}, got ${existingOutlineChapters.join(", ") || "(none)"}.`,
      2
    );
  }

  const incomingOutlineChapters = [...incomingParsed.blocks.keys()].sort((left, right) => left - right);
  const invalidIncomingChapter = incomingOutlineChapters.find((chapter) => chapter <= QUICKSTART_MINI_PLANNING_RANGE.end);
  if (invalidIncomingChapter !== undefined) {
    throw new NovelCliError(
      `Refusing to merge staging outline containing seed chapter ${invalidIncomingChapter}; expected formal plan chapters after ${QUICKSTART_MINI_PLANNING_RANGE.end}.`,
      2
    );
  }

  for (const chapter of existingOutlineChapters) {
    if (chapter <= QUICKSTART_MINI_PLANNING_RANGE.end) continue;
    const existingBlock = existingParsed.blocks.get(chapter)!;
    const incomingBlock = incomingParsed.blocks.get(chapter);
    if (!incomingBlock) {
      throw new NovelCliError(
        `Refusing to resume merge with unexpected existing outline chapter ${chapter} in ${final.outlineMd}.`,
        2
      );
    }
    if (incomingBlock !== existingBlock) {
      throw new NovelCliError(
        `Refusing to resume merge with conflicting outline block for chapter ${chapter} in ${final.outlineMd}.`,
        2
      );
    }
  }

  const mergedOutlineBlocks = new Map(existingParsed.blocks);
  for (const [chapter, block] of incomingParsed.blocks.entries()) {
    const existingBlock = mergedOutlineBlocks.get(chapter);
    if (existingBlock && existingBlock !== block) {
      throw new NovelCliError(`Refusing to merge conflicting outline block for chapter ${chapter}.`, 2);
    }
    mergedOutlineBlocks.set(chapter, block);
  }

  const outlineHeader = existingParsed.header.trimEnd().length > 0 ? existingParsed.header : incomingParsed.header;
  const combinedOutline = [outlineHeader, ...[...mergedOutlineBlocks.keys()].sort((left, right) => left - right).map((chapter) => mergedOutlineBlocks.get(chapter)!)]
    .filter((part) => part.trim().length > 0)
    .join("\n\n");

  const mergedSchedule = mergeSchedule(
    await readJsonFile(join(rootDir, final.storylineScheduleJson)),
    await readJsonFile(join(rootDir, staging.storylineScheduleJson))
  );
  const mergedForeshadowing = mergeForeshadowing(
    await readJsonFile(join(rootDir, final.foreshadowingJson)),
    await readJsonFile(join(rootDir, staging.foreshadowingJson))
  );

  const finalNewCharactersAbs = join(rootDir, final.newCharactersJson);
  const mergedNewCharacters = mergeNewCharacters(
    (await pathExists(finalNewCharactersAbs)) ? await readJsonFile(finalNewCharactersAbs) : [],
    await readJsonFile(join(rootDir, staging.newCharactersJson))
  );

  const contractCopies: Array<{ sourceAbs: string; destinationAbs: string }> = [];
  const incomingContractNames = new Set<string>();
  const contractEntries = await readdir(join(rootDir, staging.chapterContractsDir), { withFileTypes: true });
  for (const entry of contractEntries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const match = /^chapter-(\d+)\.json$/u.exec(entry.name);
    if (!match) {
      throw new NovelCliError(`Unexpected chapter contract filename during merge: ${staging.chapterContractsDir}/${entry.name}`, 2);
    }
    const chapter = Number.parseInt(match[1] ?? "", 10);
    if (chapter <= QUICKSTART_MINI_PLANNING_RANGE.end) {
      throw new NovelCliError(`Refusing to overwrite existing seed contract during merge: ${entry.name}`, 2);
    }
    incomingContractNames.add(entry.name);
    const sourceAbs = join(rootDir, staging.chapterContractsDir, entry.name);
    const destinationAbs = join(rootDir, final.chapterContractsDir, entry.name);
    if (await pathExists(destinationAbs)) {
      if (!(await jsonFilesEquivalent(sourceAbs, destinationAbs))) {
        throw new NovelCliError(`Refusing to overwrite existing destination during merge: ${final.chapterContractsDir}/${entry.name}`, 2);
      }
      continue;
    }
    contractCopies.push({ sourceAbs, destinationAbs });
  }

  const finalContractEntries = await readdir(join(rootDir, final.chapterContractsDir), { withFileTypes: true });
  for (const entry of finalContractEntries) {
    if (entry.name.startsWith(".")) continue;
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const match = /^chapter-(\d+)\.json$/u.exec(entry.name);
    if (!match) {
      throw new NovelCliError(`Unexpected chapter contract filename in final dir during merge: ${final.chapterContractsDir}/${entry.name}`, 2);
    }
    const chapter = Number.parseInt(match[1] ?? "", 10);
    if (chapter <= QUICKSTART_MINI_PLANNING_RANGE.end) continue;
    if (!incomingContractNames.has(entry.name)) {
      throw new NovelCliError(`Refusing to resume merge with unexpected existing destination during merge: ${final.chapterContractsDir}/${entry.name}`, 2);
    }
  }

  await writeTextFile(join(rootDir, final.outlineMd), `${combinedOutline.trimEnd()}\n`);
  await writeJsonFile(join(rootDir, final.storylineScheduleJson), mergedSchedule);
  await writeJsonFile(join(rootDir, final.foreshadowingJson), mergedForeshadowing);
  await writeJsonFile(finalNewCharactersAbs, mergedNewCharacters);

  await ensureDir(join(rootDir, final.chapterContractsDir));
  for (const contractCopy of contractCopies) {
    await copyFile(contractCopy.sourceAbs, contractCopy.destinationAbs);
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
    const canMergeExistingFinal = args.volume === 1 && finalExists && stagingExists && await hasQuickstartMiniPlanningSeedBase(args.rootDir);

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
