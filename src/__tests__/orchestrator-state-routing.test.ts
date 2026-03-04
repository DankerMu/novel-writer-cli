import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readCheckpoint } from "../checkpoint.js";
import { computeNextStep } from "../next-step.js";

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("readCheckpoint injects orchestrator_state via legacy inference", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-state-legacy-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: null,
    inflight_chapter: null
  });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "WRITING");
});

test("readCheckpoint infers CHAPTER_REWRITE when pipeline_stage=revising", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-state-revising-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: "revising",
    inflight_chapter: 7
  });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "CHAPTER_REWRITE");
});

test("readCheckpoint infers ERROR_RETRY when pipeline_stage=revising but inflight_chapter is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-state-revising-missing-inflight-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: "revising",
    inflight_chapter: null
  });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "ERROR_RETRY");
});

test("readCheckpoint infers ERROR_RETRY when inflight_chapter is set but pipeline_stage is idle", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-state-idle-inflight-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: null,
    inflight_chapter: 7
  });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "ERROR_RETRY");
});

test("readCheckpoint rejects inflight_chapter=0", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-state-inflight-zero-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: "drafting",
    inflight_chapter: 0
  });

  await assert.rejects(() => readCheckpoint(rootDir), /inflight_chapter must be an int >= 1/);
});

test("computeNextStep routes INIT to quickstart pipeline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-init-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });
  assert.equal(next.step, "quickstart:world");
  assert.equal(next.reason, "init:quickstart:world");
});

test("computeNextStep throws when pipeline_stage=committed but inflight_chapter is set", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-committed-inflight-"));
  await assert.rejects(
    () =>
      computeNextStep(rootDir, {
        last_completed_chapter: 0,
        current_volume: 1,
        orchestrator_state: "WRITING",
        pipeline_stage: "committed",
        inflight_chapter: 7
      }),
    /Checkpoint inconsistent: pipeline_stage=committed but inflight_chapter=7/
  );
});

test("computeNextStep routes QUICK_START to quickstart pipeline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-quickstart-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });
  assert.equal(next.step, "quickstart:world");
  assert.equal(next.reason, "quickstart:world");
});

test("computeNextStep prefixes reason for ERROR_RETRY", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-error-retry-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "ERROR_RETRY",
    pipeline_stage: null,
    inflight_chapter: null
  });
  assert.equal(next.step, "chapter:001:draft");
  assert.equal(next.reason, "error_retry:fresh");
});

test("computeNextStep heals ERROR_RETRY when pipeline_stage is committed but inflight_chapter is set", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-error-retry-heal-committed-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "ERROR_RETRY",
    pipeline_stage: "committed",
    inflight_chapter: 7
  });
  assert.equal(next.step, "chapter:001:draft");
  assert.equal(next.reason, "error_retry:healed_drop_inflight:fresh");
});

test("computeNextStep heals ERROR_RETRY when pipeline_stage is in-flight but inflight_chapter is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-error-retry-heal-drafting-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 6,
    current_volume: 1,
    orchestrator_state: "ERROR_RETRY",
    pipeline_stage: "drafting",
    inflight_chapter: null
  });
  assert.equal(next.step, "chapter:007:draft");
  assert.equal(next.reason, "error_retry:healed_infer_inflight:drafting:missing_chapter");
});

test("computeNextStep delegates CHAPTER_REWRITE to chapter routing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-chapter-rewrite-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 6,
    current_volume: 1,
    orchestrator_state: "CHAPTER_REWRITE",
    pipeline_stage: "revising",
    inflight_chapter: 7
  });
  assert.equal(next.step, "chapter:007:draft");
  assert.equal(next.reason, "revising:restart_draft");
  assert.deepEqual(next.inflight, { chapter: 7, pipeline_stage: "revising" });
});

test("computeNextStep routes VOL_PLANNING to volume pipeline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-vol-planning-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "VOL_PLANNING",
    pipeline_stage: null,
    inflight_chapter: null,
    volume_pipeline_stage: null
  });
  assert.equal(next.step, "volume:outline");
  assert.equal(next.reason, "vol_planning:outline");
});

test("computeNextStep routes VOL_REVIEW to review pipeline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-vol-review-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: null,
    inflight_chapter: null
  });
  assert.equal(next.step, "review:collect");
  assert.equal(next.reason, "vol_review:missing_quality_summary");
});
