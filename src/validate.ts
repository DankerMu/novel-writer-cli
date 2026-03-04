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
import { computeVolumeChapterRange, volumeStagingRelPaths } from "./volume-planning.js";

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

  if (args.step.kind === "volume") {
    const volume = args.checkpoint.current_volume;
    const range = computeVolumeChapterRange({ current_volume: volume, last_completed_chapter: args.checkpoint.last_completed_chapter });
    const rels = volumeStagingRelPaths(volume);

    const requireVolumePlanArtifacts = async (): Promise<void> => {
      requireFile(await pathExists(join(args.rootDir, rels.outlineMd)), rels.outlineMd);
      requireFile(await pathExists(join(args.rootDir, rels.storylineScheduleJson)), rels.storylineScheduleJson);
      requireFile(await pathExists(join(args.rootDir, rels.foreshadowingJson)), rels.foreshadowingJson);
      requireFile(await pathExists(join(args.rootDir, rels.newCharactersJson)), rels.newCharactersJson);
      for (let ch = range.start; ch <= range.end; ch++) {
        requireFile(await pathExists(join(args.rootDir, rels.chapterContractJson(ch))), rels.chapterContractJson(ch));
      }
    };

    const outlineAbs = join(args.rootDir, rels.outlineMd);
    const parseOutlineStorylineIds = async (): Promise<Map<number, string>> => {
      const text = await readTextFile(outlineAbs);
      if (text.trim().length === 0) throw new NovelCliError(`Empty outline file: ${rels.outlineMd}`, 2);

      const lines = text.split(/\r?\n/u);
      const chapters: Array<{ chapter: number; startLine: number; endLine: number }> = [];
      for (let i = 0; i < lines.length; i++) {
        const m = /^### 第 (\d+) 章/u.exec(lines[i] ?? "");
        if (!m) continue;
        const chapter = Number.parseInt(m[1] ?? "", 10);
        if (!Number.isInteger(chapter) || chapter < 1) continue;
        chapters.push({ chapter, startLine: i, endLine: lines.length });
      }
      for (let i = 0; i < chapters.length; i++) {
        const cur = chapters[i]!;
        const next = chapters[i + 1];
        if (next) cur.endLine = next.startLine;
      }

      const seen = new Set<number>();
      for (const c of chapters) {
        if (seen.has(c.chapter)) throw new NovelCliError(`Invalid outline: duplicate chapter block for chapter ${c.chapter} (${rels.outlineMd}).`, 2);
        seen.add(c.chapter);
      }
      for (let ch = range.start; ch <= range.end; ch++) {
        if (!seen.has(ch)) {
          throw new NovelCliError(
            `Invalid outline: missing chapter block for chapter ${ch} (expected continuous coverage ${range.start}-${range.end}). File: ${rels.outlineMd}`,
            2
          );
        }
      }

      const requiredKeys = [
        "Storyline",
        "POV",
        "Location",
        "Conflict",
        "Arc",
        "Foreshadowing",
        "StateChanges",
        "TransitionHint"
      ] as const;

      const storylinesByChapter = new Map<number, string>();
      for (const c of chapters) {
        if (c.chapter < range.start || c.chapter > range.end) continue;
        const blockLines = lines.slice(c.startLine, c.endLine);
        const keyFound = new Set<string>();
        let storylineId: string | null = null;
        for (const line of blockLines) {
          for (const k of requiredKeys) {
            const prefix = `- **${k}**:`;
            if (line.startsWith(prefix)) {
              keyFound.add(k);
              if (k === "Storyline") {
                const val = line.slice(prefix.length).trim();
                if (val.length > 0) storylineId = val;
              }
            }
          }
        }
        for (const k of requiredKeys) {
          if (!keyFound.has(k)) {
            throw new NovelCliError(
              `Invalid outline: chapter ${c.chapter} block missing required key '${k}' line. File: ${rels.outlineMd}`,
              2
            );
          }
        }
        if (!storylineId) {
          throw new NovelCliError(`Invalid outline: chapter ${c.chapter} missing non-empty Storyline value. File: ${rels.outlineMd}`, 2);
        }
        storylinesByChapter.set(c.chapter, storylineId);
      }

      return storylinesByChapter;
    };

    const validateNewCharacters = (raw: unknown): void => {
      if (!Array.isArray(raw)) throw new NovelCliError(`Invalid ${rels.newCharactersJson}: expected an array.`, 2);
      for (const [idx, item] of raw.entries()) {
        if (!isPlainObject(item)) throw new NovelCliError(`Invalid ${rels.newCharactersJson}: entry ${idx} must be an object.`, 2);
        const obj = item as Record<string, unknown>;
        const name = typeof obj.name === "string" ? obj.name.trim() : "";
        const role = typeof obj.role === "string" ? obj.role.trim() : "";
        const brief = typeof obj.brief === "string" ? obj.brief.trim() : "";
        const firstChapter = typeof obj.first_chapter === "number" && Number.isInteger(obj.first_chapter) ? obj.first_chapter : null;
        if (name.length === 0) throw new NovelCliError(`Invalid ${rels.newCharactersJson}: entry ${idx} missing name.`, 2);
        if (brief.length === 0) throw new NovelCliError(`Invalid ${rels.newCharactersJson}: entry ${idx} missing brief.`, 2);
        if (firstChapter === null || firstChapter < range.start || firstChapter > range.end) {
          throw new NovelCliError(
            `Invalid ${rels.newCharactersJson}: entry ${idx} first_chapter=${String(obj.first_chapter)} out of range (${range.start}-${range.end}).`,
            2
          );
        }
        if (role !== "antagonist" && role !== "supporting" && role !== "minor") {
          throw new NovelCliError(
            `Invalid ${rels.newCharactersJson}: entry ${idx} role must be one of: antagonist, supporting, minor.`,
            2
          );
        }
      }
    };

    const validateSchedule = (raw: unknown, storylinesByChapter: Map<number, string>): void => {
      if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${rels.storylineScheduleJson}: must be an object.`, 2);
      const obj = raw as Record<string, unknown>;
      const active = obj.active_storylines;
      if (!Array.isArray(active)) throw new NovelCliError(`Invalid ${rels.storylineScheduleJson}: missing active_storylines array.`, 2);
      const activeIds: string[] = [];
      for (const v of active) {
        if (typeof v !== "string") continue;
        const id = v.trim();
        if (id.length > 0) activeIds.push(id);
      }
      if (activeIds.length === 0) throw new NovelCliError(`Invalid ${rels.storylineScheduleJson}: active_storylines must be non-empty.`, 2);
      if (activeIds.length > 4) throw new NovelCliError(`Invalid ${rels.storylineScheduleJson}: active_storylines length must be <= 4.`, 2);
      const activeSet = new Set(activeIds);

      for (const [ch, storylineId] of storylinesByChapter.entries()) {
        if (!activeSet.has(storylineId)) {
          throw new NovelCliError(
            `Invalid volume plan: outline chapter ${ch} Storyline=${storylineId} not in storyline-schedule.json.active_storylines.`,
            2
          );
        }
      }
    };

    const validateContracts = async (storylinesByChapter: Map<number, string>): Promise<void> => {
      for (let ch = range.start; ch <= range.end; ch++) {
        const rel = rels.chapterContractJson(ch);
        const raw = await readJsonFile(join(args.rootDir, rel));
        if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${rel}: must be an object.`, 2);
        const obj = raw as Record<string, unknown>;
        const chapter = requireNumberField(obj, "chapter", rel);
        if (!Number.isInteger(chapter) || chapter !== ch) throw new NovelCliError(`Invalid ${rel}: chapter=${chapter} expected ${ch}.`, 2);
        const storylineId = requireStringField(obj, "storyline_id", rel).trim();
        const expectedStorylineId = storylinesByChapter.get(ch) ?? null;
        if (!expectedStorylineId || storylineId !== expectedStorylineId) {
          throw new NovelCliError(
            `Invalid ${rel}: storyline_id=${storylineId} expected ${expectedStorylineId ?? "(missing in outline)"}.`,
            2
          );
        }
        const objectivesRaw = obj.objectives;
        if (!Array.isArray(objectivesRaw)) throw new NovelCliError(`Invalid ${rel}: objectives must be an array.`, 2);
        const hasRequired = objectivesRaw.some((it) => isPlainObject(it) && (it as Record<string, unknown>).required === true);
        if (!hasRequired) throw new NovelCliError(`Invalid ${rel}: objectives must include at least one entry with required=true.`, 2);

        // Chain propagation (minimal): prev.postconditions.state_changes keys must exist in current.preconditions.character_states.
        const prevChapter = ch - 1;
        if (prevChapter >= 1) {
          const prevVol = Math.ceil(prevChapter / 30);
          const prevRel =
            prevChapter >= range.start
              ? rels.chapterContractJson(prevChapter)
              : `volumes/vol-${String(prevVol).padStart(2, "0")}/chapter-contracts/chapter-${String(prevChapter).padStart(3, "0")}.json`;

          if (await pathExists(join(args.rootDir, prevRel))) {
            const prevRaw = await readJsonFile(join(args.rootDir, prevRel));
            if (isPlainObject(prevRaw)) {
              const prevObj = prevRaw as Record<string, unknown>;
              const post = isPlainObject(prevObj.postconditions) ? (prevObj.postconditions as Record<string, unknown>) : null;
              const stateChanges = post && isPlainObject(post.state_changes) ? (post.state_changes as Record<string, unknown>) : null;
              const pre = isPlainObject(obj.preconditions) ? (obj.preconditions as Record<string, unknown>) : null;
              const characterStates = pre && isPlainObject(pre.character_states) ? (pre.character_states as Record<string, unknown>) : null;

              if (stateChanges && Object.keys(stateChanges).length > 0) {
                if (!characterStates) {
                  throw new NovelCliError(
                    `Invalid ${rel}: missing preconditions.character_states required by chain propagation from ${prevRel}.`,
                    2
                  );
                }
                for (const characterKey of Object.keys(stateChanges)) {
                  if (!(characterKey in characterStates)) {
                    throw new NovelCliError(
                      `Invalid ${rel}: preconditions.character_states missing '${characterKey}' (required by ${prevRel}.postconditions.state_changes).`,
                      2
                    );
                  }
                }
              }
            }
          }
        }
      }
    };

    if (args.step.phase === "commit") {
      throw new NovelCliError(`Use 'novel commit --volume ${volume}' for commit.`, 2);
    }

    await requireVolumePlanArtifacts();

    const storylinesByChapter = await parseOutlineStorylineIds();

    const scheduleRaw = await readJsonFile(join(args.rootDir, rels.storylineScheduleJson));
    validateSchedule(scheduleRaw, storylinesByChapter);

    // JSON existence + basic schema.
    await readJsonFile(join(args.rootDir, rels.foreshadowingJson));
    const newCharsRaw = await readJsonFile(join(args.rootDir, rels.newCharactersJson));
    validateNewCharacters(newCharsRaw);

    await validateContracts(storylinesByChapter);

    return { ok: true, step: stepId, warnings };
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
