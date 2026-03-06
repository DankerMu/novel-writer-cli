import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";
import { readCheckpoint } from "../checkpoint.js";
import { commitChapter } from "../commit.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

test("advanceCheckpointForStep normalizes orchestrator_state to WRITING for chapter pipeline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-advance-state-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（测试）\n`);

  const updated = await advanceCheckpointForStep({
    rootDir,
    step: { kind: "chapter", chapter: 1, stage: "draft" }
  });
  assert.equal(updated.orchestrator_state, "WRITING");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "WRITING");
});

test("commitChapter resets orchestrator_state to WRITING", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-orchestrator-commit-state-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "CHAPTER_REWRITE",
    pipeline_stage: "judged",
    inflight_chapter: 1
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（测试）\n`);
  await writeText(join(rootDir, "staging/summaries/chapter-001-summary.md"), `## 第 1 章摘要\n\n- 测试事件\n`);
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), { schema_version: 1, chapter: 1, entities: [] });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4.0, recommendation: "pass" });
  await writeText(join(rootDir, "staging/storylines/main-arc/memory.md"), `- 测试记忆\n`);

  await writeJson(join(rootDir, "staging/state/chapter-001-delta.json"), {
    chapter: 1,
    base_state_version: 0,
    storyline_id: "main-arc",
    ops: [{ op: "set", path: "characters.hero.display_name", value: "阿宁" }]
  });

  await commitChapter({ rootDir, chapter: 1, dryRun: false });

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "WRITING");
  assert.equal(checkpoint.pipeline_stage, "committed");
  assert.equal(checkpoint.inflight_chapter, null);
});
