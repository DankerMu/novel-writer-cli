import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { commitChapter } from "../commit.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

test("commitChapter drops __proto__/constructor/prototype path segments to prevent prototype pollution", async () => {
  delete (Object.prototype as any).polluted;

  const rootDir = await mkdtemp(join(tmpdir(), "novel-commit-proto-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（测试）\n`);
  await writeText(join(rootDir, "staging/summaries/chapter-001-summary.md"), `## 第 1 章摘要\n\n- 测试事件\n`);
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), { schema_version: 1, chapter: 1, entities: [] });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1 });
  await writeText(join(rootDir, "staging/storylines/main-arc/memory.md"), `- 测试记忆\n`);

  await writeJson(join(rootDir, "staging/state/chapter-001-delta.json"), {
    chapter: 1,
    base_state_version: 0,
    storyline_id: "main-arc",
    ops: [
      { op: "set", path: "characters.__proto__.polluted", value: "yes" },
      { op: "set", path: "characters.hero.display_name", value: "阿宁" }
    ]
  });

  const result = await commitChapter({ rootDir, chapter: 1, dryRun: false });
  assert.equal(({} as any).polluted, undefined);
  assert.ok(result.warnings.some((w) => w.includes("forbidden path segment")));
});

