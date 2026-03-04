import { join } from "node:path";

import type { Checkpoint, PipelineStage } from "./checkpoint.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { removePath } from "./fs-utils.js";
import { withWriteLock } from "./lock.js";
import { chapterRelPaths, titleFixSnapshotRel, type ChapterStep, type Step } from "./steps.js";
import { validateStep } from "./validate.js";

function stageForStep(step: ChapterStep): PipelineStage {
  switch (step.stage) {
    case "draft":
      return "drafting";
    case "summarize":
      return "drafted";
    case "refine":
      return "refined";
    case "judge":
      return "judged";
    case "title-fix":
      return "refined";
    case "hook-fix":
      return "refined";
    case "review":
    case "commit":
      throw new NovelCliError(`Unsupported step stage for advance: ${step.stage}`, 2);
    default: {
      const _exhaustive: never = step.stage;
      throw new NovelCliError(`Unsupported step stage: ${_exhaustive}`, 2);
    }
  }
}

export async function advanceCheckpointForStep(args: { rootDir: string; step: Step }): Promise<Checkpoint> {
  const step = args.step;
  if (step.kind !== "chapter") throw new NovelCliError(`Unsupported step kind: ${step.kind}`, 2);
  if (step.stage === "commit") throw new NovelCliError(`Use 'novel commit' for commit.`, 2);
  if (step.stage === "review") throw new NovelCliError(`Review is a manual step; do not advance it.`, 2);

  return await withWriteLock(args.rootDir, { chapter: step.chapter }, async () => {
    const checkpoint = await readCheckpoint(args.rootDir);

    // Enforce validate-before-advance to keep deterministic semantics.
    await validateStep({ rootDir: args.rootDir, checkpoint, step });

    const updated: Checkpoint = { ...checkpoint };
    const nextStage = stageForStep(step);

    updated.pipeline_stage = nextStage;
    updated.inflight_chapter = step.chapter;
    updated.orchestrator_state =
      checkpoint.orchestrator_state === "CHAPTER_REWRITE" || checkpoint.pipeline_stage === "revising" ? "CHAPTER_REWRITE" : "WRITING";

    // Ensure revision counter is initialized when starting from draft (revision loops may preserve it).
    if (step.stage === "draft") {
      if (typeof updated.revision_count !== "number") updated.revision_count = 0;
      updated.hook_fix_count = 0;
      updated.title_fix_count = 0;
      await removePath(join(args.rootDir, titleFixSnapshotRel(step.chapter)));
    }

    // Title-fix counts as a bounded micro-revision and invalidates the current eval.
    if (step.stage === "title-fix") {
      const prev = typeof updated.title_fix_count === "number" ? updated.title_fix_count : 0;
      if (prev >= 1) {
        throw new NovelCliError(`Title-fix already attempted for chapter ${step.chapter}; manual review required.`, 2);
      }
      updated.title_fix_count = prev + 1;
      const rel = chapterRelPaths(step.chapter);
      await removePath(join(args.rootDir, rel.staging.evalJson));
    }

    // Hook-fix counts as a bounded micro-revision and invalidates the current eval.
    if (step.stage === "hook-fix") {
      const prev = typeof updated.hook_fix_count === "number" ? updated.hook_fix_count : 0;
      if (prev >= 1) {
        throw new NovelCliError(`Hook-fix already attempted for chapter ${step.chapter}; manual review required.`, 2);
      }
      updated.hook_fix_count = prev + 1;
      const rel = chapterRelPaths(step.chapter);
      await removePath(join(args.rootDir, rel.staging.evalJson));
    }

    updated.last_checkpoint_time = new Date().toISOString();

    await writeCheckpoint(args.rootDir, updated);
    return updated;
  });
}
