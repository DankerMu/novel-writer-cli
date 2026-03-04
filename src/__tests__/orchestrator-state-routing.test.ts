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

test("computeNextStep routes INIT to quickstart:world", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-init-"));
  const next = await computeNextStep(rootDir, {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });
  assert.equal(next.step, "quickstart:world");
});

test("computeNextStep throws for QUICK_START placeholder", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-quickstart-"));
  await assert.rejects(
    () =>
      computeNextStep(rootDir, {
        last_completed_chapter: 0,
        current_volume: 1,
        orchestrator_state: "QUICK_START",
        pipeline_stage: null,
        inflight_chapter: null
      }),
    /Not implemented: orchestrator_state=QUICK_START/
  );
});

