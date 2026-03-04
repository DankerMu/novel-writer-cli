import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";
import { computeNextStep } from "../next-step.js";

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("computeNextStep progresses through volume review phases based on artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-vol-review-phases-"));

  // 1) no artifacts => collect
  let next = await computeNextStep(rootDir, {
    last_completed_chapter: 10,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:collect");

  // 2) quality summary exists => audit
  await mkdir(join(rootDir, "staging/vol-review"), { recursive: true });
  await writeJson(join(rootDir, "staging/vol-review/quality-summary.json"), { schema_version: 1, generated_at: new Date().toISOString() });
  next = await computeNextStep(rootDir, {
    last_completed_chapter: 10,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:audit");

  // 3) audit report exists => report
  await writeJson(join(rootDir, "staging/vol-review/audit-report.json"), { schema_version: 1, generated_at: new Date().toISOString(), stats: {} });
  next = await computeNextStep(rootDir, {
    last_completed_chapter: 10,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:report");

  // 4) review report exists => cleanup
  await writeFile(join(rootDir, "staging/vol-review/review-report.md"), "# report\n", "utf8");
  next = await computeNextStep(rootDir, {
    last_completed_chapter: 10,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:cleanup");

  // 5) foreshadow status exists => transition
  await writeJson(join(rootDir, "staging/vol-review/foreshadow-status.json"), { schema_version: 1, generated_at: new Date().toISOString() });
  next = await computeNextStep(rootDir, {
    last_completed_chapter: 10,
    current_volume: 1,
    orchestrator_state: "VOL_REVIEW",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:transition");
});

test("advanceCheckpointForStep(review:transition) increments volume and sets VOL_PLANNING", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-vol-review-transition-"));
  await mkdir(join(rootDir, "staging/vol-review"), { recursive: true });

  // checkpoint
  await writeFile(
    join(rootDir, ".checkpoint.json"),
    `${JSON.stringify(
      { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "VOL_REVIEW", pipeline_stage: "committed", inflight_chapter: null },
      null,
      2
    )}\n`,
    "utf8"
  );

  // required artifacts for transition validation
  await writeJson(join(rootDir, "staging/vol-review/quality-summary.json"), { schema_version: 1, generated_at: new Date().toISOString() });
  await writeJson(join(rootDir, "staging/vol-review/audit-report.json"), { schema_version: 1, generated_at: new Date().toISOString(), stats: {} });
  await writeFile(join(rootDir, "staging/vol-review/review-report.md"), "# report\n", "utf8");
  await writeJson(join(rootDir, "staging/vol-review/foreshadow-status.json"), { schema_version: 1, generated_at: new Date().toISOString() });

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "review", phase: "transition" } });
  assert.equal(updated.current_volume, 2);
  assert.equal(updated.orchestrator_state, "VOL_PLANNING");
});

test("computeNextStep enters volume review after committing volume-end chapter when outline range matches", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-vol-review-enter-"));
  await mkdir(join(rootDir, "volumes/vol-01"), { recursive: true });
  await writeFile(join(rootDir, "volumes/vol-01/outline.md"), "### 第 1 章\n\n### 第 2 章\n", "utf8");

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 2,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "committed",
    inflight_chapter: null
  });
  assert.equal(next.step, "review:collect");
  assert.equal(next.reason, "volume_end:vol_review:missing_quality_summary");
});
