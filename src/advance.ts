import { copyFile, readdir, rename } from "node:fs/promises";
import { dirname, join } from "node:path";

import type { Checkpoint, PipelineStage } from "./checkpoint.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, removePath } from "./fs-utils.js";
import { withWriteLock } from "./lock.js";
import { QUICKSTART_FINAL_RELS, QUICKSTART_STAGING_RELS } from "./quickstart.js";
import { chapterRelPaths, formatStepId, titleFixSnapshotRel, type ChapterStep, type QuickStartStep, type ReviewStep, type Step } from "./steps.js";
import { validateStep } from "./validate.js";
import { volumeFinalRelPaths, volumeStagingRelPaths } from "./volume-planning.js";
import { VOL_REVIEW_RELS } from "./volume-review.js";

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
  if (step.kind === "chapter") {
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

        // If rewinding from a later stage, clear downstream staging artifacts to avoid skipping steps with stale data.
        const prevStage = checkpoint.pipeline_stage ?? null;
        const prevInflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
        if (prevInflight === step.chapter && prevStage && prevStage !== "drafting") {
          const rel = chapterRelPaths(step.chapter);
          await removePath(join(args.rootDir, rel.staging.summaryMd));
          await removePath(join(args.rootDir, rel.staging.deltaJson));
          await removePath(join(args.rootDir, rel.staging.crossrefJson));
          await removePath(join(args.rootDir, rel.staging.evalJson));
          await removePath(join(args.rootDir, rel.staging.styleRefinerChangesJson));

          // Revision loops are driven by gate decision after judge.
          if (prevStage === "judged") {
            const prev = typeof updated.revision_count === "number" ? updated.revision_count : 0;
            updated.revision_count = prev + 1;
            updated.orchestrator_state = "CHAPTER_REWRITE";
          }
        }
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

      // Refine rewrites the chapter draft; invalidate prior eval to force re-judge.
      if (step.stage === "refine") {
        const rel = chapterRelPaths(step.chapter);
        await removePath(join(args.rootDir, rel.staging.evalJson));

        // If we're polishing after a judged gate decision, count it as a revision loop.
        const prevStage = checkpoint.pipeline_stage ?? null;
        const prevInflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
        if (prevInflight === step.chapter && prevStage === "judged") {
          const prev = typeof updated.revision_count === "number" ? updated.revision_count : 0;
          updated.revision_count = prev + 1;
          updated.orchestrator_state = "CHAPTER_REWRITE";
        }
      }

      updated.last_checkpoint_time = new Date().toISOString();

      await writeCheckpoint(args.rootDir, updated);
      return updated;
    });
  }

  if (step.kind === "quickstart") {
    const qsStep = step as QuickStartStep;

    const copyFileSafe = async (fromRel: string, toRel: string): Promise<void> => {
      const fromAbs = join(args.rootDir, fromRel);
      const toAbs = join(args.rootDir, toRel);
      await ensureDir(dirname(toAbs));
      await copyFile(fromAbs, toAbs);
    };

    const commitQuickStartArtifacts = async (): Promise<void> => {
      // Core artifacts
      const requiredRelPaths = [
        QUICKSTART_STAGING_RELS.rulesJson,
        QUICKSTART_STAGING_RELS.styleProfileJson,
        QUICKSTART_STAGING_RELS.trialChapterMd,
        QUICKSTART_STAGING_RELS.evaluationJson
      ] as const;
      for (const rel of requiredRelPaths) {
        const abs = join(args.rootDir, rel);
        if (!(await pathExists(abs))) throw new NovelCliError(`Missing required file: ${rel}`, 2);
      }

      await copyFileSafe(QUICKSTART_STAGING_RELS.rulesJson, QUICKSTART_FINAL_RELS.worldRulesJson);
      await copyFileSafe(QUICKSTART_STAGING_RELS.styleProfileJson, QUICKSTART_FINAL_RELS.styleProfileJson);
      await copyFileSafe(QUICKSTART_STAGING_RELS.trialChapterMd, QUICKSTART_FINAL_RELS.trialChapterMd);
      await copyFileSafe(QUICKSTART_STAGING_RELS.evaluationJson, QUICKSTART_FINAL_RELS.evaluationJson);

      // Contracts dir → characters/active/*.json (overwrite by filename).
      const contractsAbs = join(args.rootDir, QUICKSTART_STAGING_RELS.contractsDir);
      if (!(await pathExists(contractsAbs))) throw new NovelCliError(`Missing required directory: ${QUICKSTART_STAGING_RELS.contractsDir}`, 2);

      const entries = await readdir(contractsAbs, { withFileTypes: true });
      const jsonFiles = entries.filter((e) => e.isFile() && e.name.endsWith(".json")).map((e) => e.name).sort();
      if (jsonFiles.length === 0) {
        throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.contractsDir}: expected at least 1 *.json contract file.`, 2);
      }

      const activeDirAbs = join(args.rootDir, QUICKSTART_FINAL_RELS.charactersActiveDir);
      await ensureDir(activeDirAbs);
      for (const name of jsonFiles) {
        await copyFile(join(contractsAbs, name), join(activeDirAbs, name));
      }
    };

    const commitQuickStartMiniPlanning = async (): Promise<void> => {
      const staging = volumeStagingRelPaths(1);
      const final = volumeFinalRelPaths(1);
      const stagingAbs = join(args.rootDir, staging.dir);
      if (!(await pathExists(stagingAbs))) {
        throw new NovelCliError(`Missing staging volume directory: ${staging.dir}`, 2);
      }

      const finalAbs = join(args.rootDir, final.dir);
      if (await pathExists(finalAbs)) {
        throw new NovelCliError(`Refusing to overwrite existing destination: ${final.dir}`, 2);
      }

      await ensureDir(join(args.rootDir, "volumes"));
      try {
        await rename(stagingAbs, finalAbs);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        throw new NovelCliError(`Failed to move '${staging.dir}' to '${final.dir}': ${message}`, 2);
      }
    };

    return await withWriteLock(args.rootDir, {}, async () => {
      const checkpoint = await readCheckpoint(args.rootDir);

      if (checkpoint.orchestrator_state !== "INIT" && checkpoint.orchestrator_state !== "QUICK_START") {
        throw new NovelCliError(
          `Cannot advance ${formatStepId(qsStep)} unless orchestrator_state=INIT or QUICK_START.`,
          2
        );
      }

      const stage = checkpoint.pipeline_stage ?? null;
      const inflight = typeof checkpoint.inflight_chapter === "number" ? checkpoint.inflight_chapter : null;
      if (inflight !== null) {
        throw new NovelCliError(
          `Checkpoint inconsistent for QUICK_START advance: inflight_chapter=${inflight} (expected null). Finish the chapter pipeline or repair .checkpoint.json.`,
          2
        );
      }
      if (stage !== null && stage !== "committed") {
        throw new NovelCliError(
          `Checkpoint inconsistent for QUICK_START advance: pipeline_stage=${stage} (expected null or committed). Finish the chapter pipeline or repair .checkpoint.json.`,
          2
        );
      }

      // Enforce validate-before-advance to keep deterministic semantics.
      await validateStep({ rootDir: args.rootDir, checkpoint, step: qsStep });

      const updated: Checkpoint = { ...checkpoint };
      updated.inflight_chapter = null;
      updated.pipeline_stage = null;
      updated.quickstart_phase = qsStep.phase;

      if (qsStep.phase === "f0") {
        await commitQuickStartMiniPlanning();
        updated.orchestrator_state = "QUICK_START";
      } else if (qsStep.phase === "results") {
        await commitQuickStartArtifacts();
        updated.orchestrator_state = "VOL_PLANNING";
        updated.volume_pipeline_stage = null;
        updated.quickstart_phase = null;
      } else {
        updated.orchestrator_state = "QUICK_START";
      }

      updated.last_checkpoint_time = new Date().toISOString();

      await writeCheckpoint(args.rootDir, updated);

      if (qsStep.phase === "results") {
        // Best-effort cleanup: keep artifacts committed even if staging removal fails.
        try {
          await removePath(join(args.rootDir, QUICKSTART_STAGING_RELS.dir));
        } catch {
          // ignore
        }
      }
      return updated;
    });
  }

  if (step.kind === "review") {
    const reviewStep = step as ReviewStep;
    return await withWriteLock(args.rootDir, {}, async () => {
      const checkpoint = await readCheckpoint(args.rootDir);

      if (checkpoint.orchestrator_state !== "WRITING" && checkpoint.orchestrator_state !== "VOL_REVIEW") {
        throw new NovelCliError(
          `Refusing to advance review step from orchestrator_state=${checkpoint.orchestrator_state}. Expected WRITING (volume_end) or VOL_REVIEW.`,
          2
        );
      }

      // Enforce validate-before-advance to keep deterministic semantics.
      await validateStep({ rootDir: args.rootDir, checkpoint, step: reviewStep });

      const updated: Checkpoint = { ...checkpoint };
      updated.inflight_chapter = null;

      if (reviewStep.phase === "transition") {
        updated.current_volume = checkpoint.current_volume + 1;
        updated.orchestrator_state = "WRITING";
        updated.pipeline_stage = "committed";
        updated.revision_count = 0;
        updated.hook_fix_count = 0;
        updated.title_fix_count = 0;
        await removePath(join(args.rootDir, VOL_REVIEW_RELS.dir));
      } else {
        updated.orchestrator_state = "VOL_REVIEW";
      }

      updated.last_checkpoint_time = new Date().toISOString();

      await writeCheckpoint(args.rootDir, updated);
      return updated;
    });
  }

  if (step.kind === "volume") {
    return await withWriteLock(args.rootDir, {}, async () => {
      const checkpoint = await readCheckpoint(args.rootDir);
      if (checkpoint.orchestrator_state !== "VOL_PLANNING") {
        throw new NovelCliError(`Cannot advance ${formatStepId(step)} unless orchestrator_state=VOL_PLANNING.`, 2);
      }

      await validateStep({ rootDir: args.rootDir, checkpoint, step });

      const updated: Checkpoint = { ...checkpoint };
      updated.orchestrator_state = "VOL_PLANNING";
      updated.pipeline_stage = "committed";
      updated.inflight_chapter = null;

      const phase = step.phase;
      switch (phase) {
        case "outline":
          updated.volume_pipeline_stage = "validate";
          break;
        case "validate":
          updated.volume_pipeline_stage = "commit";
          break;
        case "commit":
          throw new NovelCliError(`Use 'novel commit --volume <n>' for volume commit.`, 2);
        default: {
          const _exhaustive: never = phase;
          throw new NovelCliError(`Unsupported volume phase: ${String(_exhaustive)}`, 2);
        }
      }
      updated.last_checkpoint_time = new Date().toISOString();

      await writeCheckpoint(args.rootDir, updated);
      return updated;
    });
  }

  // parseStepId ensures this is exhaustive.
  throw new NovelCliError(`Unsupported step kind.`, 2);
}
