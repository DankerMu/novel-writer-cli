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

test("chapter-writer prompt removes quota language and includes C16-C24 + Phase 2 checks", async () => {
  const prompt = await readText("agents/chapter-writer.md");

  for (const legacy of ["每角色至少 1 个口头禅", "每章至少 1 处"]) {
    assert.equal(prompt.includes(legacy), false, `chapter-writer must remove legacy quota phrase: ${legacy}`);
  }

  const c11 = prompt.match(/11\.\s\*\*角色语癖（C11）\*\*：([^\n]+)/)?.[1] ?? "";
  const c12 = prompt.match(/12\.\s\*\*反直觉细节（C12）\*\*：([^\n]+)/)?.[1] ?? "";
  const c18 = prompt.match(/18\.\s\*\*人性化技法抽样（C18）\*\*：([^\n]+)/)?.[1] ?? "";
  for (const [label, text] of [
    ["C11", c11],
    ["C12", c12],
    ["C18", c18]
  ] as const) {
    assert.ok(text.length > 0, `${label} text must be present`);
    assert.doesNotMatch(text, /每章.*\d|至少.*\d|≥\d|\d-\d 次/, `${label} must not reintroduce fixed quotas`);
  }

  for (const required of [
    "角色语癖（C11）",
    "反直觉细节（C12）",
    "句长方差（C16）",
    "叙述连接词零容忍（C17）",
    "人性化技法抽样（C18）",
    "对话意图约束（C19）",
    "结构密度约束（C20）",
    "内心活动锚点（C23）",
    "结构呼吸感（C24）",
    "6.5 **叙述连接词清扫**",
    "6.6 **修饰词去重**",
    "6.7 **四字词组密度检查**",
    "6.8 **内心活动锚点检查**",
    "6.9 **结构呼吸感检查**",
    "前后 2-3 句内出现至少一处合法内心活动",
    "连续 5 句纯动作记录流",
    "SP-07 式情绪标签句",
    "一旦触发，就必须补任一合法锚点",
    "角色感知或内心锚点",
    "去掉标签后仍能大致分辨说话人",
    "8-18 的人类常见波动控制",
    "3 句及以上连续句长都落在 ±5 字内",
    "中文引号内的角色对白可以按人物口吻保留",
    "我认为",
    "我觉得我们应该",
    "当一段对话超过 5 个来回时，允许 1-2 句不直接服务冲突推进的“废话”",
    "环境闲描 / 角色闲聊 / 感官片段 / 回忆碎片 / 生活细节",
    "功能性停留总量宜控制在章节字数的 **≤10%**",
    "高压段之后最好仍留 1-2 句过渡"
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.equal(prompt.includes("至少 1 句"), false, "C16 should avoid quota-like phrasing such as '至少 1 句'");
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
    "标点过度",
    "读取文件并建立锚点",
    "结构规则优先",
    "只有在入口 Skill 或 user 明确要求 quick-check / 时间受限时才启用",
    "再回退到 brief 的题材字段",
    "纯动作流超长检测",
    "连续 5+ 句只有外显动作 / 对话记录",
    "没有合法内心活动（感官侵入 / 碎片思绪 / 生理反应 / 思维中断 / 自我纠正）",
    "插入 1-2 句最小必要的感知片段",
    "累计修改量仍需 ≤15%"
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(prompt, /changes\[\]\.reason.*blacklist.*structural_rule.*abstract_to_concrete.*rhythm_test.*style_match/s);
});

test("quality-judge prompt outputs new anti_ai fields and 7-indicator compatibility mode", async () => {
  const prompt = await readText("agents/quality-judge.md");

  for (const required of [
    "\"indicator_mode\": \"13-indicator | 7-indicator | 4-indicator-compat\"",
    "\"indicator_breakdown\"",
    "\"statistical_profile\"",
    "\"detected_humanize_techniques\"",
    "\"structural_rule_violations\"",
    "\"vocabulary_richness_estimate\"",
    "blacklist_hit_rate",
    "sentence_repetition_rate",
    "sentence_length_std_dev",
    "paragraph_length_cv",
    "vocabulary_diversity_score",
    "narration_connector_count",
    "humanize_technique_variety",
    "0 = green；1 个孤立命中 = yellow",
    "≥2 个或连续多段靠连接词推进 = red",
    "indicator_mode: \"4-indicator-compat\"",
    "\"severity\": \"yellow\"",
    "\"evidence\": \"原文片段\"",
    "\"detected_humanize_techniques\": [\"thought_interrupt\", \"mundane_detail\"]",
    "legacy / 轻量消费者读取",
    "关键节点缺失",
    "扣 **0.5 分/处**",
    "纯动作流过长",
    "额外扣 **1 分**",
    "scores.emotional_impact.reason",
    "不要只写抽象评价",
    "不要另起第 14 个独立评分维度",
    "思维中断、自我纠正都属于合法内心活动"
  ]) {
    assert.match(prompt, new RegExp(required.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }

  assert.match(prompt, /manifest\.inline\.statistical_profile/);
  assert.match(prompt, /manifest\.inline\.structural_rule_violations/);
  assert.match(prompt, /deterministic 观测值/);
});

test("issue 177 structural breathing docs stay aligned across prompts and rubric", async () => {
  const chapterWriter = await readText("agents/chapter-writer.md");
  const qualityJudge = await readText("agents/quality-judge.md");
  const styleGuide = await readText("skills/novel-writing/references/style-guide.md");
  const qualityRubric = await readText("skills/novel-writing/references/quality-rubric.md");

  for (const required of [
    "结构呼吸感（C24）",
    "功能性停留",
    "环境闲描、角色闲聊、感官片段、回忆碎片或生活细节",
    "章节字数的 **≤10%**",
    "高压场景后是否留出 1-2 句过渡",
    "任务执行”式推进"
  ]) {
    assert.ok(chapterWriter.includes(required), `chapter-writer must mention: ${required}`);
  }

  for (const required of [
    "结构过密，缺乏呼吸感",
    "建议性扣 **0.5 分**",
    "yellow / suggestion",
    "高压场景间缺乏过渡，沉浸感断裂",
    "不要仅凭这一项触发 `revise` / `review` / `rewrite`"
  ]) {
    assert.ok(qualityJudge.includes(required), `quality-judge must mention: ${required}`);
  }

  for (const required of [
    "### 2.14 结构呼吸感",
    "信息效率过高",
    "功能性停留 = 不直接服务于主线推进",
    "`C13` 约束，单次环境闲描 **≤2 句**",
    "`C19` 的敷衍 / 缓冲 / 转移等合法意图",
    "**坏例子（信息效率过高）**",
    "**好例子（有结构呼吸感）**"
  ]) {
    assert.ok(styleGuide.includes(required), `style-guide must mention: ${required}`);
  }

  for (const required of [
    "是否具备必要的结构呼吸感",
    "高压段之间是否给读者保留了必要的消化空间",
    "结构过密，缺乏呼吸感",
    "yellow / suggestion",
    "高压场景间缺乏过渡，沉浸感断裂"
  ]) {
    assert.ok(qualityRubric.includes(required), `quality-rubric must mention: ${required}`);
  }
});

test("issue 176 inner-activity docs stay aligned across style-guide and rubric", async () => {
  const chapterWriter = await readText("agents/chapter-writer.md");
  const qualityJudge = await readText("agents/quality-judge.md");
  const styleGuide = await readText("skills/novel-writing/references/style-guide.md");
  const qualityRubric = await readText("skills/novel-writing/references/quality-rubric.md");

  for (const required of [
    "前后 2-3 句内出现至少一处合法内心活动",
    "第 6 句必须补一处最小必要的角色感知或内心锚点"
  ]) {
    assert.ok(chapterWriter.includes(required), `chapter-writer must mention: ${required}`);
  }

  for (const required of [
    "ChapterWriter 的生成目标是关键节点前后 2-3 句内尽早落锚",
    "每个应触发却缺失锚点的关键节点",
    "scores.emotional_impact.score` 最低为 **1 分**"
  ]) {
    assert.ok(qualityJudge.includes(required), `quality-judge must mention: ${required}`);
  }

  for (const required of [
    "C23 内心活动锚点",
    "纯动作记录流",
    "SP-07",
    "感官侵入",
    "碎片思绪",
    "生理反应",
    "思维中断",
    "自我纠正",
    "节点前后 **2-3 句**",
    "QualityJudge 以“前后 3 句仍为空”作为扣分阈值",
    "连续 **≤5 句**",
    "合法内心活动",
    "非法情绪标签",
    "**边界案例**",
    "**应触发**",
    "**不应触发**",
    "高速场景写法"
  ]) {
    assert.ok(styleGuide.includes(required), `style-guide must mention: ${required}`);
  }

  for (const required of [
    "内心活动锚点",
    "关键决策 / 重大信息 / 高压节点前后 3 句无内心活动",
    "至少扣 **0.5 分/处**",
    "每个应触发却缺失锚点的关键节点",
    "连续 5 句纯动作流",
    "额外扣 **1 分**",
    "最低只降到 **1 分**",
    "生理反应、感官侵入、碎片思绪、思维中断、自我纠正都属于合法内心活动"
  ]) {
    assert.ok(qualityRubric.includes(required), `quality-rubric must mention: ${required}`);
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
  assert.equal(
    qualityJudgeSpec.includes("lint values override QJ estimates"),
    false,
    "quality-judge spec must not promise unsupported statistical override inputs"
  );
  assert.equal(
    chapterWriterSpec.includes("≥ the style-profile value"),
    false,
    "chapter-writer spec must not overstate C16 as a hard lower bound"
  );
  assert.match(styleRefinerSpec, /Step 1 through Step 4 appear in order/);
  assert.match(qualityJudgeSpec, /structural_rule_violations/);
  assert.match(chapterWriterSpec, /ChapterWriter SHALL enforce dialogue-intent constraints/);
});
