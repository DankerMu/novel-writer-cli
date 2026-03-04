import assert from "node:assert/strict";
import { mkdtemp, mkdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

test("advanceCheckpointForStep(chapter:refine) invalidates eval and counts polish revisions after judge", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-advance-refine-"));

  await writeFile(
    join(rootDir, ".checkpoint.json"),
    `${JSON.stringify(
      {
        last_completed_chapter: 0,
        current_volume: 1,
        orchestrator_state: "WRITING",
        pipeline_stage: "judged",
        inflight_chapter: 1,
        revision_count: 0
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "draft text\n", "utf8");

  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeFile(join(rootDir, "staging/evaluations/chapter-001-eval.json"), `{"chapter":1,"overall":3.6,"recommendation":"polish"}\n`, "utf8");

  assert.equal(await exists(join(rootDir, "staging/evaluations/chapter-001-eval.json")), true);

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "chapter", chapter: 1, stage: "refine" } });
  assert.equal(updated.pipeline_stage, "refined");
  assert.equal(updated.inflight_chapter, 1);
  assert.equal(updated.revision_count, 1);
  assert.equal(updated.orchestrator_state, "CHAPTER_REWRITE");

  assert.equal(await exists(join(rootDir, "staging/evaluations/chapter-001-eval.json")), false);
});

