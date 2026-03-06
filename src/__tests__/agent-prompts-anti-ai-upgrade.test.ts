import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function repoPath(relPath: string): string {
  return join(repoRoot, relPath);
}

async function readText(relPath: string): Promise<string> {
  return readFile(repoPath(relPath), "utf8");
}

test("chapter-writer prompt removes quota language and includes C16-C20 + Phase 2 checks", async () => {
  const prompt = await readText("agents/chapter-writer.md");

  for (const legacy of ["每角色至少 1 个口头禅", "每章至少 1 处"]) {
    assert.equal(prompt.includes(legacy), false, `chapter-writer must remove legacy quota phrase: ${legacy}`);
  }

  for (const required of [
    "角色语癖（C11）",
    "反直觉细节（C12）",
    "句长方差（C16）",
    "叙述连接词零容忍（C17）",
    "人性化技法抽样（C18）",
    "对话意图约束（C19）",
    "结构密度约束（C20）",
    "6.5 **叙述连接词清扫**",
    "6.6 **修饰词去重**",
    "6.7 **四字词组密度检查**",
    "去掉标签后仍能大致分辨说话人"
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("style-refiner prompt follows four-step flow and brief-first genre override", async () => {
  const prompt = await readText("agents/style-refiner.md");

  for (const required of [
    "Step 1：黑名单扫描",
    "Step 2：结构规则检查",
    "Step 3：抽象→具体转换",
    "Step 4：节奏朗读测试",
    "template_sentence",
    "adjective_density",
    "idiom_density",
    "dialogue_intent",
    "paragraph_structure",
    "punctuation_rhythm",
    "replacement_hint",
    "paths.project_brief",
    "类型覆写",
    "快速检查模式",
    "四字词组连用",
    "情绪直述",
    "微微系列",
    "缓缓系列",
    "标点过度"
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("quality-judge prompt outputs new anti_ai fields and 7-indicator compatibility mode", async () => {
  const prompt = await readText("agents/quality-judge.md");

  for (const required of [
    "\"indicator_mode\": \"7-indicator | 4-indicator-compat\"",
    "\"statistical_profile\"",
    "\"detected_humanize_techniques\"",
    "\"structural_rule_violations\"",
    "blacklist_hit_rate",
    "sentence_repetition_rate",
    "sentence_length_std_dev",
    "paragraph_length_cv",
    "vocabulary_diversity_score",
    "narration_connector_count",
    "humanize_technique_variety",
    "0 = green；1 个孤立命中 = yellow",
    "indicator_mode: \"4-indicator-compat\""
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("issue 138 OpenSpec artifacts include style-refiner spec and no stale concept.md reference", async () => {
  const tasks = await readText("openspec/changes/m9-anti-ai-agent-prompts/tasks.md");
  const design = await readText("openspec/changes/m9-anti-ai-agent-prompts/design.md");
  const styleRefinerSpec = await readText("openspec/changes/m9-anti-ai-agent-prompts/specs/style-refiner-upgrade/spec.md");
  const qualityJudgeSpec = await readText("openspec/changes/m9-anti-ai-agent-prompts/specs/quality-judge-upgrade/spec.md");
  const chapterWriterSpec = await readText("openspec/changes/m9-anti-ai-agent-prompts/specs/chapter-writer-upgrade/spec.md");

  assert.equal(tasks.includes("concept.md"), false, "tasks.md must use brief-based type override wording");
  assert.equal(design.includes("不修改 StyleRefiner"), false, "design.md must not contradict StyleRefiner scope");
  assert.match(styleRefinerSpec, /Step 1 through Step 4 appear in order/);
  assert.match(qualityJudgeSpec, /structural_rule_violations/);
  assert.match(chapterWriterSpec, /ChapterWriter SHALL enforce dialogue-intent constraints/);
});
