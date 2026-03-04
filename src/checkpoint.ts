import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { readJsonFile, writeJsonFile } from "./fs-utils.js";
import { ORCHESTRATOR_STATES, VOLUME_PHASES, type OrchestratorState, type VolumePhase } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

export const PIPELINE_STAGES = ["drafting", "drafted", "refined", "judged", "revising", "committed"] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export type Checkpoint = Record<string, unknown> & {
  last_completed_chapter: number;
  current_volume: number;
  orchestrator_state: OrchestratorState;
  pipeline_stage?: PipelineStage | null;
  volume_pipeline_stage?: VolumePhase | null;
  inflight_chapter?: number | null;
  revision_count?: number;
  hook_fix_count?: number;
  title_fix_count?: number;
  pending_actions?: unknown[];
  last_checkpoint_time?: string;
};

export function createDefaultCheckpoint(nowIso?: string): Checkpoint {
  return {
    last_completed_chapter: 0,
    current_volume: 1,
    // TODO(CS-O3): Default to INIT once the quickstart pipeline is implemented.
    orchestrator_state: "WRITING",
    pipeline_stage: "committed",
    volume_pipeline_stage: null,
    inflight_chapter: null,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0,
    last_checkpoint_time: nowIso ?? new Date().toISOString()
  };
}

function asInt(value: unknown): number | null {
  if (typeof value !== "number") return null;
  if (!Number.isInteger(value)) return null;
  return value;
}

function asString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return value;
}

function asNullableInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return asInt(value);
}

function isOrchestratorState(value: string): value is OrchestratorState {
  return (ORCHESTRATOR_STATES as readonly string[]).includes(value);
}

export function inferLegacyState(args: {
  pipeline_stage?: PipelineStage | null;
  inflight_chapter?: number | null;
}): OrchestratorState {
  const stage = args.pipeline_stage ?? null;
  const inflight = args.inflight_chapter ?? null;

  // Inconsistent legacy checkpoint: inflight present but stage is idle.
  if ((stage === null || stage === "committed") && inflight !== null) return "ERROR_RETRY";

  // Inconsistent legacy checkpoint: pipeline in-flight but missing chapter pointer.
  if (stage !== null && stage !== "committed" && inflight === null) return "ERROR_RETRY";

  if (stage === "revising") return "CHAPTER_REWRITE";

  // Default to WRITING to preserve the legacy single-chapter pipeline behavior.
  return "WRITING";
}

function parseCheckpoint(data: unknown): Checkpoint {
  if (!isPlainObject(data)) {
    throw new NovelCliError(".checkpoint.json must be a JSON object.", 2);
  }

  const lastCompleted = asInt(data.last_completed_chapter);
  if (lastCompleted === null || lastCompleted < 0) {
    throw new NovelCliError(".checkpoint.json.last_completed_chapter must be an int >= 0.", 2);
  }

  const currentVolume = asInt(data.current_volume);
  if (currentVolume === null || currentVolume < 1) {
    throw new NovelCliError(".checkpoint.json.current_volume must be an int >= 1.", 2);
  }

  const pipelineStageRaw = data.pipeline_stage;
  let pipelineStage: PipelineStage | null | undefined;
  if (pipelineStageRaw === undefined) {
    pipelineStage = undefined;
  } else if (pipelineStageRaw === null) {
    pipelineStage = null;
  } else if (typeof pipelineStageRaw === "string") {
    if ((PIPELINE_STAGES as readonly string[]).includes(pipelineStageRaw)) {
      pipelineStage = pipelineStageRaw as PipelineStage;
    } else {
      throw new NovelCliError(`.checkpoint.json.pipeline_stage must be one of: ${PIPELINE_STAGES.join(", ")} (or null)`, 2);
    }
  } else {
    throw new NovelCliError(`.checkpoint.json.pipeline_stage must be a string (or null)`, 2);
  }

  const inflightRaw = data.inflight_chapter;
  const inflight = asNullableInt(inflightRaw);
  if (inflightRaw !== undefined && inflight === null && inflightRaw !== null) {
    throw new NovelCliError(".checkpoint.json.inflight_chapter must be an int >= 1 (or null).", 2);
  }
  if (inflight !== undefined && inflight !== null && inflight < 1) {
    throw new NovelCliError(".checkpoint.json.inflight_chapter must be an int >= 1 (or null).", 2);
  }

  const volumeStageRaw = data.volume_pipeline_stage;
  let volumeStage: VolumePhase | null | undefined;
  if (volumeStageRaw === undefined) {
    volumeStage = undefined;
  } else if (volumeStageRaw === null) {
    volumeStage = null;
  } else if (typeof volumeStageRaw === "string") {
    if ((VOLUME_PHASES as readonly string[]).includes(volumeStageRaw)) {
      volumeStage = volumeStageRaw as VolumePhase;
    } else {
      throw new NovelCliError(
        `.checkpoint.json.volume_pipeline_stage must be one of: ${VOLUME_PHASES.join(", ")} (or null)`,
        2
      );
    }
  } else {
    throw new NovelCliError(`.checkpoint.json.volume_pipeline_stage must be a string (or null)`, 2);
  }

  const revision = data.revision_count;
  if (revision !== undefined) {
    const rc = asInt(revision);
    if (rc === null || rc < 0) {
      throw new NovelCliError(".checkpoint.json.revision_count must be an int >= 0 when present.", 2);
    }
  }

  const hookFix = data.hook_fix_count;
  if (hookFix !== undefined) {
    const hc = asInt(hookFix);
    if (hc === null || hc < 0) {
      throw new NovelCliError(".checkpoint.json.hook_fix_count must be an int >= 0 when present.", 2);
    }
  }

  const titleFix = data.title_fix_count;
  if (titleFix !== undefined) {
    const tc = asInt(titleFix);
    if (tc === null || tc < 0) {
      throw new NovelCliError(".checkpoint.json.title_fix_count must be an int >= 0 when present.", 2);
    }
  }

  const pending = data.pending_actions;
  if (pending !== undefined && !Array.isArray(pending)) {
    throw new NovelCliError(".checkpoint.json.pending_actions must be an array when present.", 2);
  }

  const lastTime = data.last_checkpoint_time;
  if (lastTime !== undefined && asString(lastTime) === null) {
    throw new NovelCliError(".checkpoint.json.last_checkpoint_time must be a string when present.", 2);
  }

  const orchestratorStateRaw = data.orchestrator_state;
  let orchestratorState: OrchestratorState;
  if (orchestratorStateRaw === undefined) {
    orchestratorState = inferLegacyState({ pipeline_stage: pipelineStage ?? null, inflight_chapter: inflight ?? null });
  } else {
    const raw = asString(orchestratorStateRaw);
    if (raw === null) {
      throw new NovelCliError(".checkpoint.json.orchestrator_state must be a string when present.", 2);
    }
    if (!isOrchestratorState(raw)) {
      throw new NovelCliError(
        `.checkpoint.json.orchestrator_state must be one of: ${ORCHESTRATOR_STATES.join(", ")} (or omit for legacy inference).`,
        2
      );
    }
    orchestratorState = raw;
  }

  const checkpoint: Checkpoint = {
    ...data,
    last_completed_chapter: lastCompleted,
    current_volume: currentVolume,
    orchestrator_state: orchestratorState
  };

  if (pipelineStage !== undefined) checkpoint.pipeline_stage = pipelineStage;
  if (volumeStage !== undefined) checkpoint.volume_pipeline_stage = volumeStage;
  if (inflight !== undefined) checkpoint.inflight_chapter = inflight;

  return checkpoint;
}

export async function readCheckpoint(projectRootDir: string): Promise<Checkpoint> {
  const checkpointPath = join(projectRootDir, ".checkpoint.json");
  const raw = await readJsonFile(checkpointPath);
  try {
    return parseCheckpoint(raw);
  } catch (err: unknown) {
    if (err instanceof NovelCliError) throw err;
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Invalid checkpoint: ${message}`, 2);
  }
}

export async function writeCheckpoint(projectRootDir: string, checkpoint: Checkpoint): Promise<void> {
  const checkpointPath = join(projectRootDir, ".checkpoint.json");
  await writeJsonFile(checkpointPath, checkpoint);
}
