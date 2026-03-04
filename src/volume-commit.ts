import { rename } from "node:fs/promises";
import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, removePath } from "./fs-utils.js";
import { withWriteLock } from "./lock.js";
import { validateStep } from "./validate.js";
import { volumeFinalRelPaths, volumeStagingRelPaths } from "./volume-planning.js";

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
  if (checkpoint.volume_pipeline_stage !== "commit") {
    throw new NovelCliError(
      `Cannot commit volume plan unless volume_pipeline_stage=commit (got ${String(checkpoint.volume_pipeline_stage ?? "null")}). Advance volume steps first.`,
      2
    );
  }
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

    if (finalExists && !stagingExists) {
      warnings.push(`Volume directory already exists (${finalDir}); treating as already committed and only normalizing checkpoint.`);
    } else if (finalExists && stagingExists) {
      throw new NovelCliError(
        `Commit conflict: both staging and final volume directories exist (${staging} and ${finalDir}). Refusing to overwrite; resolve manually.`,
        2
      );
    } else if (!stagingExists) {
      throw new NovelCliError(`Missing staging volume directory: ${staging}`, 2);
    } else {
      await validateStep({ rootDir: args.rootDir, checkpoint, step: { kind: "volume", phase: "validate" } });
      await doRenameDir(args.rootDir, staging, finalDir);
    }

    await removePath(join(args.rootDir, "staging/foreshadowing"));

    const updated: Checkpoint = { ...checkpoint };
    updated.orchestrator_state = "WRITING";
    updated.volume_pipeline_stage = null;
    updated.pipeline_stage = "committed";
    updated.inflight_chapter = null;
    updated.revision_count = 0;
    updated.hook_fix_count = 0;
    updated.title_fix_count = 0;
    updated.last_checkpoint_time = new Date().toISOString();
    await writeCheckpoint(args.rootDir, updated);
  });

  return { plan, warnings };
}

