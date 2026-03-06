import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { commitChapter } from "../commit.js";
import { NovelCliError } from "../errors.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function seedCommitFixture(rootDir: string, evalPayload: unknown): Promise<void> {
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    revision_count: 0
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（测试）\n`);
  await writeText(join(rootDir, "staging/summaries/chapter-001-summary.md"), `## 第 1 章摘要\n\n- 测试事件\n`);
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), { schema_version: 1, chapter: 1, entities: [] });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), evalPayload);
  await writeText(join(rootDir, "staging/storylines/main-arc/memory.md"), `- 测试记忆\n`);
  await writeJson(join(rootDir, "staging/state/chapter-001-delta.json"), {
    chapter: 1,
    base_state_version: 0,
    storyline_id: "main-arc",
    ops: [{ op: "set", path: "characters.hero.display_name", value: "阿宁" }]
  });
}

test("commitChapter rejects gated evals that still require revision", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-commit-gate-block-"));
  await seedCommitFixture(rootDir, { chapter: 1, overall: 3.2, recommendation: "revise" });

  await assert.rejects(
    () => commitChapter({ rootDir, chapter: 1, dryRun: false }),
    (err: unknown) => err instanceof NovelCliError && /gate decision is 'revise'/i.test(err.message)
  );
});
