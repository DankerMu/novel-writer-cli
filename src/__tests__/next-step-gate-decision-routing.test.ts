import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { computeNextStep } from "../next-step.js";

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("computeNextStep routes judged+eval to commit on gate pass", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-pass-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4.0, recommendation: "pass" });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 0
  });
  assert.equal(next.step, "chapter:001:commit");
  assert.equal(next.reason, "judged:gate:pass");
});

test("computeNextStep routes judged+eval to refine on gate polish", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-polish-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 3.6, recommendation: "polish" });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 0
  });
  assert.equal(next.step, "chapter:001:refine");
  assert.equal(next.reason, "judged:gate:polish");
});

test("computeNextStep routes judged+eval to draft on gate revise", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-revise-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 3.2, recommendation: "revise" });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 0
  });
  assert.equal(next.step, "chapter:001:draft");
  assert.equal(next.reason, "judged:gate:revise");
});

test("computeNextStep routes judged+eval to commit on force_passed when revisions exhausted", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-force-passed-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 3.2, recommendation: "revise" });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 2
  });
  assert.equal(next.step, "chapter:001:commit");
  assert.equal(next.reason, "judged:gate:force_passed");
});

test("computeNextStep routes judged+eval to manual review on pause bands", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-pause-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 2.4, recommendation: "pause" });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 0
  });
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:gate:pause_for_user");
});

test("computeNextStep forces revise when eval has high-confidence violations", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-step-gate-violation-"));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "chapter text\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), {
    chapter: 1,
    overall: 4.8,
    recommendation: "pass",
    contract_verification: { l1_checks: [{ status: "violation", confidence: "high" }] }
  });

  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    revision_count: 0
  });
  assert.equal(next.step, "chapter:001:draft");
  assert.equal(next.reason, "judged:gate:revise");
});
