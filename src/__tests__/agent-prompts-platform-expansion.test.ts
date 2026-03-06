import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readText(relPath: string): Promise<string> {
  return readFile(join(repoRoot, relPath), "utf8");
}

test("chapter-writer prompt accepts platform writing guide", async () => {
  const prompt = await readText("agents/chapter-writer.md");
  assert.match(prompt, /paths\.platform_writing_guide/);
  assert.match(prompt, /平台节奏密度、对话比例、钩子、情绪回报周期与文风要求/);
});

test("quality-judge prompt defines golden chapter gates track and forced revise semantics", async () => {
  const prompt = await readText("agents/quality-judge.md");
  assert.match(prompt, /Track 3: Golden Chapter Gates/);
  assert.match(prompt, /golden_chapter_gates/);
  assert.match(prompt, /recommendation.*必须.*revise|recommendation = "revise"/s);
  assert.match(prompt, /failed_gate_ids/);
});

test("start and continue skills document hidden tomato alias and pass-through packet fields", async () => {
  const start = await readText("skills/start/SKILL.md");
  const cont = await readText("skills/continue/SKILL.md");
  assert.match(start, /fanqie \(番茄\)/);
  assert.match(start, /jinjiang \(晋江\)/);
  assert.equal(start.includes("\n- `tomato`\n"), false);
  assert.match(start, /手动填 `tomato`/);
  assert.match(cont, /platform_writing_guide/);
  assert.match(cont, /golden_chapter_gates/);
});
