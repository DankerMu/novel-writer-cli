import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import type { Checkpoint } from "./checkpoint.js";
import { pathExists, readJsonFile, readTextFile } from "./fs-utils.js";
import { checkHookPolicy } from "./hook-policy.js";
import { loadPlatformProfile } from "./platform-profile.js";
import { rejectPathTraversalInput } from "./safe-path.js";
import { chapterRelPaths, formatStepId, titleFixSnapshotRel, type Step } from "./steps.js";
import { assertTitleFixOnlyChangedTitleLine, extractChapterTitleFromMarkdown } from "./title-policy.js";
import { isPlainObject } from "./type-guards.js";
import { VOL_REVIEW_RELS } from "./volume-review.js";

export type ValidateReport = {
  ok: true;
  step: string;
  warnings: string[];
};

function requireFile(exists: boolean, relPath: string): void {
  if (!exists) throw new NovelCliError(`Missing required file: ${relPath}`, 2);
}

function requireStringField(obj: Record<string, unknown>, field: string, file: string): string {
  const v = obj[field];
  if (typeof v !== "string" || v.length === 0) throw new NovelCliError(`Invalid ${file}: missing string field '${field}'.`, 2);
  return v;
}

function requireNumberField(obj: Record<string, unknown>, field: string, file: string): number {
  const v = obj[field];
  if (typeof v !== "number" || !Number.isFinite(v)) throw new NovelCliError(`Invalid ${file}: missing number field '${field}'.`, 2);
  return v;
}

export async function validateStep(args: { rootDir: string; checkpoint: Checkpoint; step: Step }): Promise<ValidateReport> {
  const warnings: string[] = [];
  const stepId = formatStepId(args.step);

  if (args.step.kind === "review") {
    const qualitySummaryAbs = join(args.rootDir, VOL_REVIEW_RELS.qualitySummary);
    const auditReportAbs = join(args.rootDir, VOL_REVIEW_RELS.auditReport);
    const reviewReportAbs = join(args.rootDir, VOL_REVIEW_RELS.reviewReport);
    const foreshadowAbs = join(args.rootDir, VOL_REVIEW_RELS.foreshadowStatus);

    if (args.step.phase === "collect") {
      requireFile(await pathExists(qualitySummaryAbs), VOL_REVIEW_RELS.qualitySummary);
      const raw = await readJsonFile(qualitySummaryAbs);
      if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${VOL_REVIEW_RELS.qualitySummary}: expected JSON object.`, 2);
      if ((raw as Record<string, unknown>).schema_version !== 1) warnings.push(`Unexpected schema_version in ${VOL_REVIEW_RELS.qualitySummary}.`);
      return { ok: true, step: stepId, warnings };
    }

    if (args.step.phase === "audit") {
      requireFile(await pathExists(qualitySummaryAbs), VOL_REVIEW_RELS.qualitySummary);
      requireFile(await pathExists(auditReportAbs), VOL_REVIEW_RELS.auditReport);
      const raw = await readJsonFile(auditReportAbs);
      if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${VOL_REVIEW_RELS.auditReport}: expected JSON object.`, 2);
      if ((raw as Record<string, unknown>).schema_version !== 1) warnings.push(`Unexpected schema_version in ${VOL_REVIEW_RELS.auditReport}.`);
      return { ok: true, step: stepId, warnings };
    }

    if (args.step.phase === "report") {
      requireFile(await pathExists(qualitySummaryAbs), VOL_REVIEW_RELS.qualitySummary);
      requireFile(await pathExists(auditReportAbs), VOL_REVIEW_RELS.auditReport);
      requireFile(await pathExists(reviewReportAbs), VOL_REVIEW_RELS.reviewReport);
      const text = await readTextFile(reviewReportAbs);
      if (text.trim().length === 0) throw new NovelCliError(`Empty report file: ${VOL_REVIEW_RELS.reviewReport}`, 2);
      return { ok: true, step: stepId, warnings };
    }

    if (args.step.phase === "cleanup") {
      requireFile(await pathExists(foreshadowAbs), VOL_REVIEW_RELS.foreshadowStatus);
      const raw = await readJsonFile(foreshadowAbs);
      if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${VOL_REVIEW_RELS.foreshadowStatus}: expected JSON object.`, 2);
      if ((raw as Record<string, unknown>).schema_version !== 1) warnings.push(`Unexpected schema_version in ${VOL_REVIEW_RELS.foreshadowStatus}.`);
      return { ok: true, step: stepId, warnings };
    }

    if (args.step.phase === "transition") {
      requireFile(await pathExists(qualitySummaryAbs), VOL_REVIEW_RELS.qualitySummary);
      requireFile(await pathExists(auditReportAbs), VOL_REVIEW_RELS.auditReport);
      requireFile(await pathExists(reviewReportAbs), VOL_REVIEW_RELS.reviewReport);
      requireFile(await pathExists(foreshadowAbs), VOL_REVIEW_RELS.foreshadowStatus);
      return { ok: true, step: stepId, warnings };
    }

    const _exhaustive: never = args.step.phase;
    throw new NovelCliError(`Unsupported review phase: ${String(_exhaustive)}`, 2);
  }

  if (args.step.kind !== "chapter") throw new NovelCliError(`Unsupported step: ${stepId}`, 2);

  const rel = chapterRelPaths(args.step.chapter);

  if (args.step.stage === "draft") {
    const absChapter = join(args.rootDir, rel.staging.chapterMd);
    const exists = await pathExists(absChapter);
    requireFile(exists, rel.staging.chapterMd);
    const content = await readTextFile(absChapter);
    if (content.trim().length === 0) throw new NovelCliError(`Empty draft file: ${rel.staging.chapterMd}`, 2);
    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "summarize") {
    requireFile(await pathExists(join(args.rootDir, rel.staging.chapterMd)), rel.staging.chapterMd);
    requireFile(await pathExists(join(args.rootDir, rel.staging.summaryMd)), rel.staging.summaryMd);
    requireFile(await pathExists(join(args.rootDir, rel.staging.deltaJson)), rel.staging.deltaJson);
    requireFile(await pathExists(join(args.rootDir, rel.staging.crossrefJson)), rel.staging.crossrefJson);

    const deltaRaw = await readJsonFile(join(args.rootDir, rel.staging.deltaJson));
    if (!isPlainObject(deltaRaw)) throw new NovelCliError(`Invalid delta JSON: ${rel.staging.deltaJson} must be an object.`, 2);
    const delta = deltaRaw as Record<string, unknown>;
    const chapter = requireNumberField(delta, "chapter", rel.staging.deltaJson);
    if (chapter !== args.step.chapter) warnings.push(`Delta.chapter is ${chapter}, expected ${args.step.chapter}.`);
    const storylineId = requireStringField(delta, "storyline_id", rel.staging.deltaJson);
    rejectPathTraversalInput(storylineId, "delta.storyline_id");
    const memoryRel = chapterRelPaths(args.step.chapter, storylineId).staging.storylineMemoryMd;
    if (!memoryRel) throw new NovelCliError(`Internal error: storyline memory path is null`, 2);
    requireFile(await pathExists(join(args.rootDir, memoryRel)), memoryRel);

    // Crossref sanity.
    const crossrefRaw = await readJsonFile(join(args.rootDir, rel.staging.crossrefJson));
    if (!isPlainObject(crossrefRaw)) throw new NovelCliError(`Invalid crossref JSON: ${rel.staging.crossrefJson} must be an object.`, 2);
    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "refine") {
    requireFile(await pathExists(join(args.rootDir, rel.staging.chapterMd)), rel.staging.chapterMd);
    const changesExists = await pathExists(join(args.rootDir, rel.staging.styleRefinerChangesJson));
    if (!changesExists) warnings.push(`Missing optional changes log: ${rel.staging.styleRefinerChangesJson}`);
    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "judge") {
    requireFile(await pathExists(join(args.rootDir, rel.staging.chapterMd)), rel.staging.chapterMd);
    requireFile(await pathExists(join(args.rootDir, rel.staging.evalJson)), rel.staging.evalJson);
    const evalRaw = await readJsonFile(join(args.rootDir, rel.staging.evalJson));
    if (!isPlainObject(evalRaw)) throw new NovelCliError(`Invalid eval JSON: ${rel.staging.evalJson} must be an object.`, 2);
    const evalObj = evalRaw as Record<string, unknown>;
    const chapter = requireNumberField(evalObj, "chapter", rel.staging.evalJson);
    if (chapter !== args.step.chapter) warnings.push(`Eval.chapter is ${chapter}, expected ${args.step.chapter}.`);
    requireNumberField(evalObj, "overall", rel.staging.evalJson);
    requireStringField(evalObj, "recommendation", rel.staging.evalJson);

    const loadedProfile = await loadPlatformProfile(args.rootDir);
    const hookPolicy = loadedProfile?.profile.hook_policy;
    if (hookPolicy?.required) {
      const check = checkHookPolicy({ hookPolicy, evalRaw });
      if (check.status === "invalid_eval") {
        throw new NovelCliError(
          `Hook policy enabled but eval is missing required hook fields (${rel.staging.evalJson}): ${check.reason}. Re-run QualityJudge with the updated contract.`,
          2
        );
      }
      if (check.status === "fail") warnings.push(`Hook policy failing: ${check.reason}`);
    }

    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "hook-fix") {
    const absChapter = join(args.rootDir, rel.staging.chapterMd);
    const exists = await pathExists(absChapter);
    requireFile(exists, rel.staging.chapterMd);
    const content = await readTextFile(absChapter);
    if (content.trim().length === 0) throw new NovelCliError(`Empty draft file: ${rel.staging.chapterMd}`, 2);
    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "title-fix") {
    const absChapter = join(args.rootDir, rel.staging.chapterMd);
    requireFile(await pathExists(absChapter), rel.staging.chapterMd);
    const content = await readTextFile(absChapter);
    if (content.trim().length === 0) throw new NovelCliError(`Empty draft file: ${rel.staging.chapterMd}`, 2);

    const snapshotRel = titleFixSnapshotRel(args.step.chapter);
    const snapshotAbs = join(args.rootDir, snapshotRel);
    requireFile(await pathExists(snapshotAbs), snapshotRel);
    const before = await readTextFile(snapshotAbs);

    assertTitleFixOnlyChangedTitleLine({ before, after: content, file: rel.staging.chapterMd });

    const title = extractChapterTitleFromMarkdown(content);
    if (!title.has_h1 || !title.title_text) {
      throw new NovelCliError(`Invalid ${rel.staging.chapterMd}: title-fix must produce a non-empty Markdown H1 title line.`, 2);
    }

    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "review") {
    warnings.push("Review step has no machine-validated outputs; resolve issues manually and re-run judge.");
    return { ok: true, step: stepId, warnings };
  }

  if (args.step.stage === "commit") {
    throw new NovelCliError(`Use 'novel commit --chapter ${args.step.chapter}' for commit.`, 2);
  }

  throw new NovelCliError(`Unsupported step: ${stepId}`, 2);
}
