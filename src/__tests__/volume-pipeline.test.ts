import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";
import { commitVolume } from "../volume-commit.js";
import { readCheckpoint, writeCheckpoint } from "../checkpoint.js";
import { computeNextStep } from "../next-step.js";
import { validateStep } from "../validate.js";
import { computeVolumeChapterRange, volumeStagingRelPaths } from "../volume-planning.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

test("computeVolumeChapterRange enforces deterministic bounds", () => {
  assert.deepEqual(computeVolumeChapterRange({ current_volume: 1, last_completed_chapter: 0 }), { start: 1, end: 30 });
  assert.deepEqual(computeVolumeChapterRange({ current_volume: 2, last_completed_chapter: 58 }), { start: 59, end: 60 });
  assert.throws(() => computeVolumeChapterRange({ current_volume: 1, last_completed_chapter: 30 }), /plan_start=31 > plan_end=30/);
});

test("volume planning pipeline routes outline -> validate -> commit -> writing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-pipeline-"));
  try {
    const initial = {
      last_completed_chapter: 58,
      current_volume: 2,
      orchestrator_state: "VOL_PLANNING" as const,
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: null
    };
    await writeJson(join(rootDir, ".checkpoint.json"), initial);

    const volume = 2;
    const range = computeVolumeChapterRange({ current_volume: volume, last_completed_chapter: initial.last_completed_chapter });
    const rels = volumeStagingRelPaths(volume);

    // Minimal planning artifacts for a 2-chapter range (59-60)
    await writeText(
      join(rootDir, rels.outlineMd),
      [
        `## 第 ${volume} 卷大纲`,
        ``,
        `### 第${range.start}章: 测试`,
        `- **Storyline**: main-arc`,
        `- **POV**: hero`,
        `- **Location**: city`,
        `- **Conflict**: test`,
        `- **Arc**: test`,
        `- **Foreshadowing**: test`,
        `- **StateChanges**: test`,
        `- **TransitionHint**: {}`,
        ``,
        `### 第 ${range.end}章: 测试`,
        `- **Storyline**: main-arc`,
        `- **POV**: hero`,
        `- **Location**: city`,
        `- **Conflict**: test`,
        `- **Arc**: test`,
        `- **Foreshadowing**: test`,
        `- **StateChanges**: test`,
        `- **TransitionHint**: {}`,
        ``
      ].join("\n")
    );

    await writeJson(join(rootDir, rels.storylineScheduleJson), { active_storylines: ["main-arc"] });
    await writeJson(join(rootDir, rels.foreshadowingJson), { schema_version: 1, items: [] });
    await writeJson(join(rootDir, rels.newCharactersJson), []);

    const contractBase = {
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ", required: true, description: "x" }],
      preconditions: { character_states: { Alice: { location: "city" } } },
      postconditions: { state_changes: {} }
    };
    await writeJson(join(rootDir, rels.chapterContractJson(range.start)), { chapter: range.start, ...contractBase });
    await writeJson(join(rootDir, rels.chapterContractJson(range.end)), { chapter: range.end, ...contractBase });

    // Next step: outline
    let checkpoint = await readCheckpoint(rootDir);
    let next = await computeNextStep(rootDir, checkpoint);
    assert.equal(next.step, "volume:outline");

    // Validate outputs for outline, then advance outline -> validate stage.
    await validateStep({ rootDir, checkpoint, step: { kind: "volume", phase: "outline" } });
    checkpoint = await advanceCheckpointForStep({ rootDir, step: { kind: "volume", phase: "outline" } });
    next = await computeNextStep(rootDir, checkpoint);
    assert.equal(next.step, "volume:validate");

    // Advance validate -> commit stage.
    await validateStep({ rootDir, checkpoint, step: { kind: "volume", phase: "validate" } });
    checkpoint = await advanceCheckpointForStep({ rootDir, step: { kind: "volume", phase: "validate" } });
    next = await computeNextStep(rootDir, checkpoint);
    assert.equal(next.step, "volume:commit");

    // Commit volume plan.
    const result = await commitVolume({ rootDir, volume, dryRun: false });
    assert.ok(result.plan.length > 0);

    const after = await readCheckpoint(rootDir);
    assert.equal(after.orchestrator_state, "WRITING");
    assert.equal(after.volume_pipeline_stage, null);
    assert.equal(after.pipeline_stage, "committed");
    assert.equal(after.inflight_chapter, null);

    assert.ok(await exists(join(rootDir, `volumes/vol-02/outline.md`)));
    assert.equal(await exists(join(rootDir, rels.dir)), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume normalizes checkpoint when final dir exists but staging is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-commit-recover-"));
  try {
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });

    await writeText(join(rootDir, "volumes/vol-01/outline.md"), "# vol 1\n");

    const result = await commitVolume({ rootDir, volume: 1, dryRun: false });
    assert.ok(result.warnings.some((w) => /already exists/i.test(w)));

    const after = await readCheckpoint(rootDir);
    assert.equal(after.orchestrator_state, "WRITING");
    assert.equal(after.volume_pipeline_stage, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("advanceCheckpointForStep rejects volume advance outside VOL_PLANNING", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-advance-guard-"));
  try {
    await writeCheckpoint(rootDir, {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "WRITING",
      pipeline_stage: "committed",
      volume_pipeline_stage: null,
      inflight_chapter: null
    });

    await assert.rejects(
      () => advanceCheckpointForStep({ rootDir, step: { kind: "volume", phase: "outline" } }),
      /orchestrator_state=VOL_PLANNING/
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("computeNextStep falls back to volume:outline when validate stage is selected but artifacts are missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-next-missing-"));
  try {
    const next = await computeNextStep(rootDir, {
      last_completed_chapter: 58,
      current_volume: 2,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "validate"
    });
    assert.equal(next.step, "volume:outline");
    assert.equal(next.reason, "vol_planning:validate:missing_artifacts");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume dryRun does not touch checkpoint", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-commit-dryrun-"));
  try {
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });

    const before = await readFile(join(rootDir, ".checkpoint.json"), "utf8");
    const result = await commitVolume({ rootDir, volume: 1, dryRun: true });
    assert.ok(result.plan.some((l) => l.includes("MOVE")));
    const after = await readFile(join(rootDir, ".checkpoint.json"), "utf8");
    assert.equal(after, before);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume rejects when both staging and final volume dirs exist", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-commit-conflict-"));
  try {
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });
    await mkdir(join(rootDir, "staging/volumes/vol-01"), { recursive: true });
    await mkdir(join(rootDir, "volumes/vol-01"), { recursive: true });

    await assert.rejects(() => commitVolume({ rootDir, volume: 1, dryRun: false }), /Commit conflict/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume recovery refuses when final dir exists but outline.md is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-commit-recover-missing-outline-"));
  try {
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });
    await mkdir(join(rootDir, "volumes/vol-01"), { recursive: true });

    await assert.rejects(() => commitVolume({ rootDir, volume: 1, dryRun: false }), /missing .*outline\.md/i);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
