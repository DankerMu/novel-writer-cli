import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { pathExists } from "./fs-utils.js";
import type { NextStepResult } from "./next-step.js";
import { formatStepId, pad2, pad3 } from "./steps.js";

export type VolumeChapterRange = { start: number; end: number };

export const CHAPTERS_PER_VOLUME = 30;
export const QUICKSTART_MINI_PLANNING_RANGE = { start: 1, end: 3 } as const;

export function volumeForChapter(chapter: number): number {
  if (!Number.isInteger(chapter) || chapter < 1) {
    throw new NovelCliError(`Invalid chapter: ${String(chapter)} (expected int >= 1).`, 2);
  }
  return Math.ceil(chapter / CHAPTERS_PER_VOLUME);
}

export function computeVolumeChapterRange(args: { current_volume: number; last_completed_chapter: number }): VolumeChapterRange {
  const volume = args.current_volume;
  const planStart = args.last_completed_chapter + 1;
  const planEnd = volume * CHAPTERS_PER_VOLUME;
  if (planStart > planEnd) {
    throw new NovelCliError(
      `Invalid volume chapter range: plan_start=${planStart} > plan_end=${planEnd}. Fix .checkpoint.json (current_volume=${volume}, last_completed_chapter=${args.last_completed_chapter}).`,
      2
    );
  }
  return { start: planStart, end: planEnd };
}

export function volumeStagingRelPaths(volume: number): {
  dir: string;
  outlineMd: string;
  storylineScheduleJson: string;
  foreshadowingJson: string;
  newCharactersJson: string;
  chapterContractsDir: string;
  chapterContractJson: (chapter: number) => string;
} {
  const dir = `staging/volumes/vol-${pad2(volume)}`;
  const chapterContractsDir = `${dir}/chapter-contracts`;
  return {
    dir,
    outlineMd: `${dir}/outline.md`,
    storylineScheduleJson: `${dir}/storyline-schedule.json`,
    foreshadowingJson: `${dir}/foreshadowing.json`,
    newCharactersJson: `${dir}/new-characters.json`,
    chapterContractsDir,
    chapterContractJson: (chapter: number) => `${chapterContractsDir}/chapter-${pad3(chapter)}.json`
  };
}

export function volumeFinalRelPaths(volume: number): {
  dir: string;
  outlineMd: string;
  storylineScheduleJson: string;
  foreshadowingJson: string;
  newCharactersJson: string;
  chapterContractsDir: string;
  chapterContractJson: (chapter: number) => string;
} {
  const dir = `volumes/vol-${pad2(volume)}`;
  const chapterContractsDir = `${dir}/chapter-contracts`;
  return {
    dir,
    outlineMd: `${dir}/outline.md`,
    storylineScheduleJson: `${dir}/storyline-schedule.json`,
    foreshadowingJson: `${dir}/foreshadowing.json`,
    newCharactersJson: `${dir}/new-characters.json`,
    chapterContractsDir,
    chapterContractJson: (chapter: number) => `${chapterContractsDir}/chapter-${pad3(chapter)}.json`
  };
}

export async function hasQuickstartMiniPlanningArtifacts(rootDir: string): Promise<boolean> {
  const final = volumeFinalRelPaths(1);
  const requiredPaths = [
    final.outlineMd,
    final.storylineScheduleJson,
    final.foreshadowingJson,
    final.chapterContractJson(QUICKSTART_MINI_PLANNING_RANGE.start),
    final.chapterContractJson(2),
    final.chapterContractJson(QUICKSTART_MINI_PLANNING_RANGE.end)
  ];
  for (const relPath of requiredPaths) {
    if (!(await pathExists(join(rootDir, relPath)))) return false;
  }
  return true;
}

export async function resolveVolumeChapterRange(args: { rootDir: string; current_volume: number; last_completed_chapter: number }): Promise<VolumeChapterRange> {
  const range = computeVolumeChapterRange({ current_volume: args.current_volume, last_completed_chapter: args.last_completed_chapter });
  if (
    args.current_volume !== 1
    || range.start !== QUICKSTART_MINI_PLANNING_RANGE.start
    || range.end <= QUICKSTART_MINI_PLANNING_RANGE.end
  ) {
    return range;
  }

  if (!(await hasQuickstartMiniPlanningArtifacts(args.rootDir))) return range;
  return { start: QUICKSTART_MINI_PLANNING_RANGE.end + 1, end: range.end };
}

function normalizeVolumePipelineStage(value: unknown): "outline" | "validate" | "commit" | null {
  if (value === null || value === undefined) return null;
  if (value === "outline" || value === "validate" || value === "commit") return value;
  return null;
}

async function hasAllPlanningArtifacts(args: { rootDir: string; volume: number; range: VolumeChapterRange }): Promise<{
  ok: boolean;
  evidence: Record<string, unknown>;
}> {
  const rels = volumeStagingRelPaths(args.volume);

  const hasOutline = await pathExists(join(args.rootDir, rels.outlineMd));
  const hasSchedule = await pathExists(join(args.rootDir, rels.storylineScheduleJson));
  const hasForeshadowing = await pathExists(join(args.rootDir, rels.foreshadowingJson));
  const hasNewCharacters = await pathExists(join(args.rootDir, rels.newCharactersJson));
  const hasContractsDir = await pathExists(join(args.rootDir, rels.chapterContractsDir));

  let missingContracts = 0;
  const contractPresenceSample: Array<{ chapter: number; exists: boolean }> = [];
  for (let ch = args.range.start; ch <= args.range.end; ch++) {
    const exists = await pathExists(join(args.rootDir, rels.chapterContractJson(ch)));
    if (!exists) missingContracts += 1;
    if (contractPresenceSample.length < 3) contractPresenceSample.push({ chapter: ch, exists });
  }

  const ok = hasOutline && hasSchedule && hasForeshadowing && hasNewCharacters && hasContractsDir && missingContracts === 0;
  return {
    ok,
    evidence: {
      volume: args.volume,
      chapter_range: [args.range.start, args.range.end],
      staging: {
        hasOutline,
        hasSchedule,
        hasForeshadowing,
        hasNewCharacters,
        hasContractsDir,
        missingContracts,
        contractPresenceSample
      }
    }
  };
}

export async function computeVolumeNextStep(rootDir: string, checkpoint: Checkpoint): Promise<NextStepResult> {
  const stage = normalizeVolumePipelineStage(checkpoint.volume_pipeline_stage);

  const stageIdle = checkpoint.pipeline_stage ?? null;
  const inflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
  if ((stageIdle === null || stageIdle === "committed") && inflight !== null) {
    throw new NovelCliError(
      `Checkpoint inconsistent for VOL_PLANNING: pipeline_stage=${stageIdle ?? "null"} but inflight_chapter=${inflight}. Set inflight_chapter to null.`,
      2
    );
  }
  if (stageIdle !== null && stageIdle !== "committed") {
    throw new NovelCliError(
      `Checkpoint inconsistent for VOL_PLANNING: pipeline_stage=${stageIdle} (expected null or committed). Finish the chapter pipeline or repair .checkpoint.json.`,
      2
    );
  }

  const volume = checkpoint.current_volume;
  const range = await resolveVolumeChapterRange({ rootDir, current_volume: volume, last_completed_chapter: checkpoint.last_completed_chapter });

  const artifacts = await hasAllPlanningArtifacts({ rootDir, volume, range });

  if (stage === null || stage === "outline") {
    return {
      step: formatStepId({ kind: "volume", phase: "outline" }),
      reason: artifacts.ok ? "vol_planning:outline:artifacts_present" : "vol_planning:outline",
      inflight: { chapter: null, pipeline_stage: null },
      evidence: artifacts.evidence
    };
  }

  if (stage === "validate") {
    if (!artifacts.ok) {
      return {
        step: formatStepId({ kind: "volume", phase: "outline" }),
        reason: "vol_planning:validate:missing_artifacts",
        inflight: { chapter: null, pipeline_stage: null },
        evidence: artifacts.evidence
      };
    }
    return {
      step: formatStepId({ kind: "volume", phase: "validate" }),
      reason: "vol_planning:validate",
      inflight: { chapter: null, pipeline_stage: null },
      evidence: artifacts.evidence
    };
  }

  if (stage === "commit") {
    if (!artifacts.ok) {
      return {
        step: formatStepId({ kind: "volume", phase: "outline" }),
        reason: "vol_planning:commit:missing_artifacts",
        inflight: { chapter: null, pipeline_stage: null },
        evidence: artifacts.evidence
      };
    }
    return {
      step: formatStepId({ kind: "volume", phase: "commit" }),
      reason: "vol_planning:commit",
      inflight: { chapter: null, pipeline_stage: null },
      evidence: artifacts.evidence
    };
  }

  throw new NovelCliError(`Unsupported volume_pipeline_stage: ${String(checkpoint.volume_pipeline_stage)}`, 2);
}
