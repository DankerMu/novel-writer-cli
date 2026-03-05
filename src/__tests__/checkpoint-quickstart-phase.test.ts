import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { readCheckpoint } from "../checkpoint.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

test("readCheckpoint rejects invalid quickstart_phase string", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-checkpoint-quickstart-phase-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "banana"
  });

  await assert.rejects(() => readCheckpoint(rootDir), /quickstart_phase must be one of:/);
});

test("readCheckpoint rejects non-string quickstart_phase", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-checkpoint-quickstart-phase-non-string-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: 42
  });

  await assert.rejects(() => readCheckpoint(rootDir), /quickstart_phase must be a string/);
});

test("readCheckpoint accepts legacy checkpoint without quickstart_phase", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-checkpoint-quickstart-phase-legacy-missing-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(Object.prototype.hasOwnProperty.call(checkpoint, "quickstart_phase"), false);
  assert.equal(checkpoint.quickstart_phase, undefined);
});
