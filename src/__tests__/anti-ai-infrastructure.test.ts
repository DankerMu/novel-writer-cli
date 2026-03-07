import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type PacketResult = Awaited<ReturnType<typeof buildInstructionPacket>>;

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeCheckpoint(stage: Checkpoint["pipeline_stage"]): Checkpoint {
  return {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: stage,
    inflight_chapter: 1,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

async function setupProject(rootDir: string, options: { genre?: string; overrideNotes?: string | null } = {}): Promise<void> {
  const genre = options.genre ?? "科幻";
  const overrideNotes = options.overrideNotes ?? "单句段 15%-30%；段长上限 120 字；感叹号 ≤ 5/章。";

  await writeText(
    join(rootDir, "brief.md"),
    [
      "# brief",
      "",
      `- **题材**：${genre}`,
      ...(overrideNotes !== null ? [`- **覆写说明**：${overrideNotes}`] : []),
      ""
    ].join("\n")
  );

  await writeJson(join(rootDir, "style-profile.json"), {
    source_type: "original",
    reference_author: null,
    avg_sentence_length: 18,
    sentence_length_range: [8, 32],
    dialogue_ratio: 0.35,
    description_ratio: 0.3,
    action_ratio: 0.35,
    sentence_length_std_dev: 11.2,
    paragraph_length_cv: null,
    emotional_volatility: "high",
    register_mixing: null,
    vocabulary_richness: "high",
    style_exemplars: ["示例片段"],
    writing_directives: [{ directive: "短句推进", do: "他抬手。", dont: "他缓慢地抬起了自己的手臂。" }],
    paragraph_style: { avg_paragraph_length: 78, dialogue_format: "引号式" },
    narrative_voice: "第三人称限制",
    rhetoric_preferences: [],
    forbidden_words: [],
    preferred_expressions: [],
    character_speech_patterns: {},
    analysis_notes: "fixture"
  });

  await writeJson(join(rootDir, "ai-blacklist.json"), {
    version: "2.1.0",
    max_words: 250,
    words: ["深吸一口气"],
    categories: {
      narration_connector: [
        { word: "然而", replacement_hint: "删掉连接词，改用动作或信息落差推进" }
      ],
      action_cliche: [
        { word: "深吸一口气", replacement_hint: "直接写呼吸和动作变化", per_chapter_max: 1 }
      ]
    },
    category_metadata: {
      narration_connector: {
        context: "narration_only",
        description: "仅叙述文禁止"
      }
    },
    whitelist: []
  });

  await writeJson(join(rootDir, "world/rules.json"), { schema_version: 1, rules: [] });
  await writeText(
    join(rootDir, "volumes/vol-01/outline.md"),
    [
      "## 第 1 卷大纲",
      "",
      "### 第 1 章: 开端",
      "- **Storyline**: main-arc",
      "- **POV**: hero",
      "- **Location**: city",
      "- **Conflict**: 初入险境",
      "- **Arc**: 建立危机",
      "- **Foreshadowing**: seed-1",
      "- **StateChanges**: Hero 进入城门",
      "- **TransitionHint**: 继续深入",
      "- **ExcitementType**: setup",
      ""
    ].join("\n")
  );
  await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
    chapter: 1,
    storyline_id: "main-arc",
    excitement_type: "setup",
    objectives: [{ id: "OBJ-1", required: true, description: "推进开场" }],
    preconditions: { character_states: { Hero: { location: "gate" } } },
    postconditions: { state_changes: { Hero: { location: "city" } } },
    acceptance_criteria: ["推进开场"]
  });
  await writeJson(join(rootDir, "state/current-state.json"), { state_version: 1, current_volume: 1, current_chapter: 0, characters: {} });
  await writeText(join(rootDir, "storylines/main-arc/memory.md"), "# 主线\n");
  await writeJson(join(rootDir, "storylines/storyline-spec.json"), { schema_version: 1, storylines: [] });
}

test("buildInstructionPacket injects anti-AI statistical targets and genre overrides for chapter draft", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-anti-ai-draft-"));
  try {
    await setupProject(rootDir);

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    const inline = ((built as any).packet.manifest.inline) as Record<string, unknown>;
    const targets = inline.statistical_targets as Record<string, unknown>;
    assert.equal(typeof targets, "object");
    assert.equal((targets.sentence_length_std_dev as Record<string, unknown>).target, 11.2);
    assert.deepEqual((targets.paragraph_length_cv as Record<string, unknown>).fallback_range, [0.4, 1.2]);
    assert.equal((targets.paragraph_length_cv as Record<string, unknown>).fallback_applied, true);
    assert.equal((targets.vocabulary_diversity as Record<string, unknown>).target, "high");
    assert.equal((targets.register_mixing as Record<string, unknown>).target, "medium");
    assert.equal((targets.narration_connectors as Record<string, unknown>).target, 0);

    const overrides = inline.genre_overrides as Record<string, unknown>;
    assert.equal(overrides.genre, "scifi");
    assert.equal((overrides.source as Record<string, unknown>).mode, "brief_override_notes");
    assert.equal((overrides.punctuation_rhythm as Record<string, unknown>).exclamation_max_per_chapter, 5);
    assert.equal((overrides.paragraph_structure as Record<string, unknown>).max_paragraph_chars, 120);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket parses explicit brief overrides into genre overrides", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-anti-ai-draft-explicit-"));
  try {
    await setupProject(rootDir, {
      genre: "悬疑",
      overrideNotes: "单句段 18%-28%；段长上限 140 字；省略号 ≤ 6/章；感叹号 ≤ 4/章。"
    });

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    const inline = ((built as any).packet.manifest.inline) as Record<string, unknown>;
    const overrides = inline.genre_overrides as Record<string, unknown>;
    assert.equal(overrides.genre, "suspense");
    assert.equal((overrides.source as Record<string, unknown>).mode, "brief_override_notes");
    assert.deepEqual((overrides.paragraph_structure as Record<string, unknown>).single_sentence_ratio, { min: 0.18, max: 0.28 });
    assert.equal((overrides.paragraph_structure as Record<string, unknown>).max_paragraph_chars, 140);
    assert.equal((overrides.punctuation_rhythm as Record<string, unknown>).ellipsis_max_per_chapter, 6);
    assert.equal((overrides.punctuation_rhythm as Record<string, unknown>).exclamation_max_per_chapter, 4);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket judge keeps structural lint enabled for default genres without special overrides", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-anti-ai-judge-default-genre-"));
  try {
    await setupProject(rootDir, { genre: "玄幻", overrideNotes: null });
    await writeText(
      join(rootDir, "staging/chapters/chapter-001.md"),
      [
        "# 第1章",
        "",
        "他心潮澎湃、热血沸腾，抬头看见天门洞开！！",
        ""
      ].join("\n")
    );
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("refined"),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    const inline = ((built as any).packet.manifest.inline) as Record<string, unknown>;
    const structural = inline.structural_rule_violations as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(structural));
    assert.ok(structural.length > 0);
    assert.equal(inline.structural_rule_violations_degraded, undefined);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket injects deterministic statistical profile and structural violations for judge", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-anti-ai-judge-"));
  try {
    await setupProject(rootDir);
    await writeText(
      join(rootDir, "staging/chapters/chapter-001.md"),
      [
        "# 第1章",
        "",
        "“然而我偏要进去。”她说。",
        "",
        "然而他没有动。深吸一口气，深吸一口气。",
        "",
        "心潮澎湃、热血沸腾。门开了——是她！！",
        ""
      ].join("\n")
    );
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("refined"),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    const inline = ((built as any).packet.manifest.inline) as Record<string, unknown>;
    const blacklistLint = inline.blacklist_lint as Record<string, unknown>;
    assert.equal(typeof blacklistLint, "object");
    const profile = inline.statistical_profile as Record<string, unknown>;
    assert.equal(profile.source, "deterministic_lint+heuristic");
    assert.equal(profile.narration_connector_count, 1);
    assert.equal(typeof profile.sentence_length_std_dev, "number");
    assert.equal(typeof profile.paragraph_length_cv, "number");
    assert.equal(typeof profile.vocabulary_diversity_score, "number");
    assert.equal(typeof profile.humanize_technique_variety, "number");

    const structural = inline.structural_rule_violations as Array<Record<string, unknown>>;
    assert.ok(Array.isArray(structural));
    assert.ok(structural.some((item) => item.rule_id === "L6.em_dash_per_chapter"));
    assert.ok(structural.some((item) => item.rule_id === "L6.repeated_exclamation_marks"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("lint-blacklist.sh skips narration_only hits in dialogue and reports per_chapter_max warnings", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-lint-blacklist-"));
  try {
    const chapter = join(rootDir, "chapter.md");
    const blacklist = join(rootDir, "ai-blacklist.json");
    await writeText(chapter, ["# 第1章", "", "“然而我不想等。”", "", "然而他还是没动。深吸一口气，深吸一口气。", ""].join("\n"));
    await writeJson(blacklist, {
      words: ["深吸一口气"],
      categories: {
        narration_connector: [{ word: "然而", replacement_hint: "删掉连接词" }],
        action_cliche: [{ word: "深吸一口气", replacement_hint: "写动作变化", per_chapter_max: 1 }]
      },
      category_metadata: {
        narration_connector: { context: "narration_only", description: "仅叙述文" }
      },
      whitelist: []
    });

    const { stdout } = await execFileAsync("bash", [join(repoRoot, "scripts/lint-blacklist.sh"), chapter, blacklist], { cwd: repoRoot });
    const report = JSON.parse(stdout) as Record<string, unknown>;
    assert.equal((report.statistical_profile as Record<string, unknown>).narration_connector_count, 1);
    const hits = report.hits as Array<Record<string, unknown>>;
    assert.ok(hits.some((item) => item.word === "然而" && item.count === 1));
    assert.ok(hits.some((item) => item.word === "深吸一口气" && item.replacement_hint === "写动作变化"));
    const warnings = report.warnings as Array<Record<string, unknown>>;
    assert.ok(warnings.some((item) => item.code === "per_chapter_max_exceeded"));
    const perChapterLimitHits = report.per_chapter_limit_hits as Array<Record<string, unknown>>;
    assert.deepEqual(perChapterLimitHits[0]?.word, "深吸一口气");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("lint-blacklist.sh emits non-blocking warning for quote parity mismatch", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-lint-blacklist-quotes-"));
  try {
    const chapter = join(rootDir, "chapter.md");
    const blacklist = join(rootDir, "ai-blacklist.json");
    await writeText(chapter, ["# 第1章", "", "“然而我不想等。", ""].join("\n"));
    await writeJson(blacklist, { words: [], categories: {}, whitelist: [] });
    const { stdout } = await execFileAsync("bash", [join(repoRoot, "scripts/lint-blacklist.sh"), chapter, blacklist], { cwd: repoRoot });
    const report = JSON.parse(stdout) as Record<string, unknown>;
    const warnings = report.warnings as Array<Record<string, unknown>>;
    assert.ok(warnings.some((item) => item.code === "quote_parity_mismatch"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("lint-structural.sh flags violations and respects sci-fi genre overrides", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-lint-structural-"));
  try {
    const cleanChapter = join(rootDir, "clean.md");
    const noisyChapter = join(rootDir, "noisy.md");
    const sciFiChapter = join(rootDir, "scifi.md");

    await writeText(cleanChapter, [
      "# 第1章",
      "",
      "他推门进去。屋里很安静。灯还亮着。",
      "",
      "她抬眼看他，没有说话。杯子边缘还冒着热气，她把杯底轻轻转了半圈，才把它推到他手边。",
      "",
      "他坐下后先看了一眼窗外。",
      ""
    ].join("\n"));

    await writeText(noisyChapter, [
      "# 第1章",
      "",
      "非常巨大冰冷漆黑荒凉的风猛地灌了进来，十分沉重，无比压抑，极其潮湿，苍白而急促。",
      "",
      "心潮澎湃、热血沸腾、激动万分。",
      "",
      "门开了——是她！！",
      ""
    ].join("\n"));

    await writeText(sciFiChapter, [
      "# 第1章",
      "",
      "他盯着舷窗外的碎光！她听见告警！舰桥尽头还有人喊！引擎又抖了一下！警报仍在催促！空气像烧红的铁！",
      ""
    ].join("\n"));

    const clean = JSON.parse((await execFileAsync("bash", [join(repoRoot, "scripts/lint-structural.sh"), cleanChapter], { cwd: repoRoot })).stdout) as Record<string, unknown>;
    assert.deepEqual((clean.summary as Record<string, unknown>).total, 0);

    const noisy = JSON.parse((await execFileAsync("bash", [join(repoRoot, "scripts/lint-structural.sh"), noisyChapter], { cwd: repoRoot })).stdout) as Record<string, unknown>;
    const noisyRules = new Set(((noisy.violations as Array<Record<string, unknown>>) ?? []).map((item) => item.rule_id));
    assert.ok(noisyRules.has("L2.emphasis_density"));
    assert.ok(noisyRules.has("L3.idiom_chain"));
    assert.ok(noisyRules.has("L6.em_dash_per_chapter"));
    assert.ok(noisyRules.has("L6.repeated_exclamation_marks"));

    const sciFi = JSON.parse((await execFileAsync("bash", [join(repoRoot, "scripts/lint-structural.sh"), sciFiChapter, "--genre", "科幻"], { cwd: repoRoot })).stdout) as Record<string, unknown>;
    assert.ok(((sciFi.violations as Array<Record<string, unknown>>) ?? []).some((item) => item.rule_id === "L6.exclamation_per_chapter"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("anti-AI docs and style-analyzer prompt describe the new infrastructure", async () => {
  const styleAnalyzer = await readFile(join(repoRoot, "agents/style-analyzer.md"), "utf8");
  const contextContracts = await readFile(join(repoRoot, "skills/continue/references/context-contracts.md"), "utf8");
  const qualityRubric = await readFile(join(repoRoot, "skills/novel-writing/references/quality-rubric.md"), "utf8");
  const periodicMaintenance = await readFile(join(repoRoot, "skills/continue/references/periodic-maintenance.md"), "utf8");

  assert.match(styleAnalyzer, /sentence_length_std_dev/);
  assert.match(styleAnalyzer, /paragraph_length_cv/);
  assert.match(styleAnalyzer, /emotional_volatility/);
  assert.match(styleAnalyzer, /register_mixing/);
  assert.match(styleAnalyzer, /vocabulary_richness/);
  assert.match(contextContracts, /statistical_targets/);
  assert.match(contextContracts, /genre_overrides/);
  assert.match(contextContracts, /structural_rule_violations_degraded/);
  assert.match(qualityRubric, /zone → score 映射/);
  assert.match(qualityRubric, /structural_rule_violations/);
  assert.match(periodicMaintenance, /max_words=250/);
  assert.match(periodicMaintenance, /logs\/anti-ai\/technique-history\.json/);
});

test("labeled chapter schema exposes optional anti-AI fields and keeps existing samples compatible", async () => {
  const schema = JSON.parse(await readFile(join(repoRoot, "eval/schema/labeled-chapter.schema.json"), "utf8")) as Record<string, unknown>;
  const properties = schema.properties as Record<string, unknown>;
  assert.equal(typeof properties.anti_ai_statistical_profile, "object");
  assert.equal(typeof properties.structural_rule_violations, "object");

  const lines = (await readFile(join(repoRoot, "eval/fixtures/labels.demo.jsonl"), "utf8"))
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);

  for (const record of lines) {
    assert.equal(record.schema_version, 1);
    assert.equal(typeof record.chapter, "number");
    assert.equal(typeof record.labels, "object");
    assert.equal(typeof record.human_scores, "object");
    assert.equal(Object.prototype.hasOwnProperty.call(record, "anti_ai_statistical_profile"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(record, "structural_rule_violations"), false);
  }
});
