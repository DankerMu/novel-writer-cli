import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildCharacterVoiceProfiles,
  clearCharacterVoiceDriftFile,
  computeCharacterVoiceDrift,
  loadCharacterVoiceProfiles,
  writeCharacterVoiceDriftFile
} from "../character-voice.js";
import { buildInstructionPacket } from "../instructions.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

test("buildCharacterVoiceProfiles attributes dialogue to characters and extracts signature phrases", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-profiles-"));

  await writeJson(join(rootDir, "state/current-state.json"), {
    schema_version: 1,
    state_version: 1,
    last_updated_chapter: 2,
    characters: {
      hero: { display_name: "阿宁" },
      side: { display_name: "老周" }
    }
  });

  await writeText(
    join(rootDir, "chapters/chapter-001.md"),
    `# 第1章\n\n` +
      `阿宁说：“嗯，我知道了。” 风从窗缝里钻进来，吹得烛火一跳。\n\n` +
      `阿宁又说：“嗯，我们走吧。” 她抬眼望向门外，雨声像针一样密。\n\n` +
      `阿宁低声：“嗯，先别急。” 她把手收进袖里，声音很稳。\n`
  );

  await writeText(
    join(rootDir, "chapters/chapter-002.md"),
    `# 第2章\n\n` +
      `阿宁说：“嗯，还是按计划吧。” 她把袖口往上拢了拢。\n\n` +
      `阿宁笑道：“嗯，我会的。” 她声音很轻，却不退。\n`
  );

  await writeText(
    join(rootDir, "chapters/chapter-003.md"),
    `# 第3章\n\n` +
      `老周冷笑：“哼，你太天真了。” 风从门缝里钻进来，把烛火吹得忽明忽暗。\n\n` +
      `老周又道：“哼，别做梦了。” 他把刀鞘轻轻一磕，声线冷硬。\n\n` +
      `老周皱眉：“哼，你又来了。” 他的眼神像钉子一样钉在地上。\n`
  );

  await writeText(
    join(rootDir, "chapters/chapter-004.md"),
    `# 第4章\n\n` +
      `老周道：“哼，动手！” 他不再废话，脚步一沉。\n\n` +
      `老周说：“哼。” 这一声像是从鼻腔里挤出来的。\n`
  );

  const result = await buildCharacterVoiceProfiles({
    rootDir,
    protagonistId: "hero",
    coreCastIds: ["side"],
    baselineRange: { start: 1, end: 4 },
    windowChapters: 3
  });

  assert.equal(result.rel, "character-voice-profiles.json");
  assert.equal(result.warnings.length, 0);
  assert.equal(result.profiles.schema_version, 1);
  assert.equal(result.profiles.selection.protagonist_id, "hero");
  assert.deepEqual(result.profiles.selection.core_cast_ids, ["side"]);
  assert.equal(result.profiles.policy.window_chapters, 3);

  assert.equal(result.profiles.profiles.length, 2);
  assert.equal(result.profiles.profiles[0]?.character_id, "hero");

  const hero = result.profiles.profiles.find((p) => p.character_id === "hero");
  const side = result.profiles.profiles.find((p) => p.character_id === "side");
  assert.ok(hero);
  assert.ok(side);
  assert.ok(hero.baseline_metrics.dialogue_samples >= 5);
  assert.ok(side.baseline_metrics.dialogue_samples >= 5);
  assert.ok(hero.signature_phrases.includes("嗯"));
  assert.ok(side.signature_phrases.includes("哼"));
});

test("buildCharacterVoiceProfiles ignores addressed names inside dialogue when attributing speaker", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-attr-"));

  await writeJson(join(rootDir, "state/current-state.json"), {
    schema_version: 1,
    state_version: 1,
    last_updated_chapter: 1,
    characters: {
      hero: { display_name: "阿宁" },
      side: { display_name: "老周" }
    }
  });

  await writeText(
    join(rootDir, "chapters/chapter-001.md"),
    `# 第1章\n\n` +
      `阿宁说：“老周，你听我说。”\n\n` +
      `阿宁说：“老周，别急。”\n\n` +
      `阿宁说：“老周，我们走。”\n\n` +
      `阿宁说：“老周，先等等。”\n\n` +
      `阿宁说：“老周，跟上。”\n`
  );

  const result = await buildCharacterVoiceProfiles({
    rootDir,
    protagonistId: "hero",
    coreCastIds: ["side"],
    baselineRange: { start: 1, end: 1 },
    windowChapters: 3
  });

  const hero = result.profiles.profiles.find((p) => p.character_id === "hero");
  const side = result.profiles.profiles.find((p) => p.character_id === "side");
  assert.ok(hero);
  assert.ok(side);
  assert.ok(hero.baseline_metrics.dialogue_samples >= 5);
  assert.equal(side.baseline_metrics.dialogue_samples, 0);
});

test("computeCharacterVoiceDrift flags drift and clears on recovery", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-drift-"));

  await writeJson(join(rootDir, "state/current-state.json"), {
    schema_version: 1,
    state_version: 1,
    last_updated_chapter: 5,
    characters: {
      hero: { display_name: "阿宁" }
    }
  });

  // Baseline: stable, low exclamation density.
  await writeText(
    join(rootDir, "chapters/chapter-001.md"),
    `# 第1章\n\n` +
      `阿宁说：“嗯，我知道了。” 这句话落下之后，空气沉默了好一会儿。\n\n` +
      `阿宁说：“嗯，我们走吧。” 她抬眼望向门外。\n\n` +
      `阿宁低声：“嗯，先别急。” 说完她侧过身。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-002.md"),
    `# 第2章\n\n` +
      `阿宁说：“嗯，还是按计划吧。” 她把袖口往上拢了拢。\n\n` +
      `阿宁笑道：“嗯，我会的。” 她声音很轻，却很稳。\n`
  );

  const built = await buildCharacterVoiceProfiles({
    rootDir,
    protagonistId: "hero",
    coreCastIds: [],
    baselineRange: { start: 1, end: 2 },
    windowChapters: 3
  });
  assert.equal(built.warnings.length, 0);

  // Window (3..5): exclamation-heavy drift.
  await writeText(
    join(rootDir, "chapters/chapter-003.md"),
    `# 第3章\n\n` +
      `阿宁怒道：“够了！！！” 她的声音像碎冰一样炸开。\n\n` +
      `阿宁又喊：“快走！！！” 她抬手一挥，衣袖猎猎作响。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-004.md"),
    `# 第4章\n\n` +
      `阿宁厉声：“别再逼我！！！” 她眼底的光像刀。\n\n` +
      `阿宁咬牙：“我说过了！！！” 话音落下，空气都震了一下。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-005.md"),
    `# 第5章\n\n` +
      `阿宁冷笑：“你听清楚！！！” 她一步一步逼近。\n`
  );

  const computed = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 5,
    volume: 1,
    previousActiveCharacterIds: new Set<string>()
  });

  assert.ok(computed.drift);
  assert.equal(computed.drift?.schema_version, 1);
  assert.equal(computed.drift?.window.chapter_start, 3);
  assert.equal(computed.drift?.window.chapter_end, 5);
  assert.equal(computed.drift?.characters.length, 1);
  const hero = computed.drift?.characters[0];
  assert.equal(hero?.character_id, "hero");
  assert.ok(hero?.drifted_metrics.some((m) => m.id === "exclamation_per_100_chars_delta"));
  assert.ok((hero?.directives ?? []).some((d) => d.includes("感叹")));
  assert.ok((hero?.evidence ?? []).length > 0);

  await writeCharacterVoiceDriftFile({ rootDir, drift: computed.drift! });
  const driftAbs = join(rootDir, "character-voice-drift.json");
  const raw = JSON.parse(await readFile(driftAbs, "utf8")) as any;
  assert.equal(raw.schema_version, 1);

  // Recovery: stable again, with enough samples.
  await writeText(
    join(rootDir, "chapters/chapter-006.md"),
    `# 第6章\n\n` +
      `阿宁说：“嗯，我们先回去。” 她把手收进袖里。\n\n` +
      `阿宁说：“嗯，别急。” 她的语气恢复了平静。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-007.md"),
    `# 第7章\n\n` +
      `阿宁说：“嗯，我明白。” 她点了点头。\n\n` +
      `阿宁说：“嗯，就这样吧。” 她不再多言。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-008.md"),
    `# 第8章\n\n` +
      `阿宁说：“嗯。” 她只回了一个音节。\n`
  );

  const recovered = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 8,
    volume: 1,
    previousActiveCharacterIds: new Set<string>(["hero"])
  });
  assert.equal(recovered.drift, null);

  const cleared = await clearCharacterVoiceDriftFile(rootDir);
  assert.equal(cleared, true);
});

test("computeCharacterVoiceDrift uses recovery thresholds for active drift (hysteresis)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-hysteresis-"));

  await writeJson(join(rootDir, "state/current-state.json"), {
    schema_version: 1,
    state_version: 1,
    last_updated_chapter: 11,
    characters: {
      hero: { display_name: "阿宁" }
    }
  });

  // Baseline: similar dialogue length, no exclamation.
  await writeText(
    join(rootDir, "chapters/chapter-001.md"),
    `# 1\n\n` +
      `阿宁说：“嗯，我们先按计划走，别急着出手，等我给信号再动。”\n\n` +
      `阿宁说：“嗯，你盯紧后门，我去前面探路，听到风声就撤回。”\n\n` +
      `阿宁说：“嗯，稳住呼吸，把话说清楚，别被情绪带跑偏。”\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-002.md"),
    `# 2\n\n` +
      `阿宁说：“嗯，记住每个细节，别漏掉任何一步，出错会很麻烦。”\n\n` +
      `阿宁说：“嗯，到了就停，先看清对方底牌，再决定怎么收尾。”\n`
  );

  const built = await buildCharacterVoiceProfiles({
    rootDir,
    protagonistId: "hero",
    coreCastIds: [],
    baselineRange: { start: 1, end: 2 },
    windowChapters: 3
  });

  // Window (3..5): heavy drift triggers activation.
  await writeText(join(rootDir, "chapters/chapter-003.md"), `# 3\n\n阿宁怒道：“够了！！！”\n\n阿宁喊：“快走！！！”\n`);
  await writeText(join(rootDir, "chapters/chapter-004.md"), `# 4\n\n阿宁厉声：“别逼我！！！”\n\n阿宁咬牙：“我说过了！！！”\n`);
  await writeText(join(rootDir, "chapters/chapter-005.md"), `# 5\n\n阿宁冷笑：“你听清楚！！！”\n\n阿宁道：“现在！！！”\n`);

  const first = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 5,
    volume: 1,
    previousActiveCharacterIds: new Set<string>()
  });
  assert.ok(first.drift);
  assert.ok(first.activeCharacterIds.has("hero"));

  // Window (6..8): exclamation density between drift vs recovery thresholds:
  // - drift: abs_delta must be > 3.5 (should NOT trigger)
  // - recovery: abs_delta must be > 2.0 (should remain active)
  await writeText(
    join(rootDir, "chapters/chapter-006.md"),
    `# 6\n\n` +
      `阿宁说：“嗯，我们先按计划走，别急着出手，等我给信号再动！”\n\n` +
      `阿宁说：“嗯，你盯紧后门，我去前面探路，听到风声就撤回。”\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-007.md"),
    `# 7\n\n` +
      `阿宁说：“嗯，稳住呼吸，把话说清楚，别被情绪带跑偏！”\n\n` +
      `阿宁说：“嗯，记住每个细节，别漏掉任何一步，出错会很麻烦！”\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-008.md"),
    `# 8\n\n` +
      `阿宁说：“嗯，到了就停，先看清对方底牌，再决定怎么收尾！”\n`
  );

  const wouldNotTrigger = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 8,
    volume: 1,
    previousActiveCharacterIds: new Set<string>()
  });
  assert.equal(wouldNotTrigger.drift, null);

  const stillActive = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 8,
    volume: 1,
    previousActiveCharacterIds: new Set<string>(["hero"])
  });
  assert.ok(stillActive.drift);
  assert.ok(stillActive.activeCharacterIds.has("hero"));

  // Window (9..11): fully recovered (no exclamation).
  await writeText(
    join(rootDir, "chapters/chapter-009.md"),
    `# 9\n\n` +
      `阿宁说：“嗯，我们先按计划走，别急着出手，等我给信号再动。”\n\n` +
      `阿宁说：“嗯，你盯紧后门，我去前面探路，听到风声就撤回。”\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-010.md"),
    `# 10\n\n` +
      `阿宁说：“嗯，稳住呼吸，把话说清楚，别被情绪带跑偏。”\n\n` +
      `阿宁说：“嗯，记住每个细节，别漏掉任何一步，出错会很麻烦。”\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-011.md"),
    `# 11\n\n` +
      `阿宁说：“嗯，到了就停，先看清对方底牌，再决定怎么收尾。”\n\n` +
      `阿宁说：“嗯，照我说的做，先把后路封住，再慢慢逼他们露出破绽。”\n`
  );

  const recovered = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 11,
    volume: 1,
    previousActiveCharacterIds: new Set<string>(["hero"])
  });
  assert.equal(recovered.drift, null);
});

test("computeCharacterVoiceDrift freezes active state when current window has insufficient samples", async () => {
  // Covers the !enough && wasActive path: character should stay active (frozen),
  // not spuriously recover due to lack of data.
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-frozen-"));

  await writeJson(join(rootDir, "state/current-state.json"), {
    schema_version: 1,
    state_version: 1,
    last_updated_chapter: 5,
    characters: { hero: { display_name: "阿宁" } }
  });

  // Baseline (ch1-2): stable, no exclamation.
  await writeText(
    join(rootDir, "chapters/chapter-001.md"),
    `# 1\n\n` +
      `阿宁说："嗯，我们先按计划走，别急着出手，等我给信号再动。" 她把袖口拢了拢。\n\n` +
      `阿宁说："嗯，你盯紧后门，我去前面探路，听到风声就撤回。" 她抜腹起身。\n\n` +
      `阿宁说："嗯，稳住呼吸，把话说清楚，别被情绪带跑偏。"
`
  );
  await writeText(
    join(rootDir, "chapters/chapter-002.md"),
    `# 2\n\n` +
      `阿宁说："嗯，记住每个细节，别漏掉任何一步，出错会很麻烦。" 她不再多言。\n\n` +
      `阿宁说："嗯，到了就停，先看清对方底牌，再决定怎么收尾。"
`
  );

  const built = await buildCharacterVoiceProfiles({
    rootDir,
    protagonistId: "hero",
    coreCastIds: [],
    baselineRange: { start: 1, end: 2 },
    windowChapters: 3
  });
  assert.equal(built.warnings.length, 0);

  // Drift window (ch3-5): heavy exclamation triggers active state.
  await writeText(
    join(rootDir, "chapters/chapter-003.md"),
    `# 3\n\n阿宁怒道："够了！！！" 她弹身而起。\n\n阿宁喚："快走！！！" 她一手推开门。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-004.md"),
    `# 4\n\n阿宁厉声："别再逃我！！！" 她的声音像刻刀。\n\n阿宁咋牙："我说过了！！！" 话音落下，空气都震了一下。\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-005.md"),
    `# 5\n\n阿宁冷笑："你听清楚！！！" 她一步一步逢近。\n`
  );

  const drifted = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 5,
    volume: 1,
    previousActiveCharacterIds: new Set<string>()
  });
  assert.ok(drifted.drift, "should detect drift");
  assert.ok(drifted.activeCharacterIds.has("hero"));

  // Sparse window (ch6-8): only 2 dialogue samples — below min_dialogue_samples=5.
  // With wasActive=true and !enough, character must FREEZE active (not spuriously recover).
  await writeText(join(rootDir, "chapters/chapter-006.md"), `# 6\n\n阿宁说："嗯。" 她只回了一个音节。\n`);
  await writeText(join(rootDir, "chapters/chapter-007.md"), `# 7\n\n阿宁说："嗯，行。"\n`);
  await writeText(join(rootDir, "chapters/chapter-008.md"), `# 8\n\n`);

  const frozen = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 8,
    volume: 1,
    previousActiveCharacterIds: new Set<string>(["hero"])
  });
  // Must remain active (frozen), even though current samples are insufficient.
  assert.ok(frozen.drift, "should freeze active when samples insufficient");
  assert.ok(frozen.activeCharacterIds.has("hero"));
  const frozenHero = frozen.drift?.characters[0];
  assert.ok(frozenHero?.directives.some((d) => d.includes("数据不足")), "should warn about insufficient data");

  // Full recovery window (ch9-11): stable, no exclamation, sufficient samples.
  await writeText(
    join(rootDir, "chapters/chapter-009.md"),
    `# 9\n\n` +
      `阿宁说："嗯，我们先按计划走，别急着出手，等我给信号再动。"\n\n` +
      `阿宁说："嗯，你盯紧后门，我去前面探路，听到风声就撤回。"\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-010.md"),
    `# 10\n\n` +
      `阿宁说："嗯，稳住呼吸，把话说清楚，别被情绪带跑偏。"\n\n` +
      `阿宁说："嗯，记住每个细节，别漏掉任何一步，出错会很麺烦。"\n`
  );
  await writeText(
    join(rootDir, "chapters/chapter-011.md"),
    `# 11\n\n` +
      `阿宁说："嗯，到了就停，先看清对方底牌，再决定怎么收尾。"\n`
  );

  const fullyRecovered = await computeCharacterVoiceDrift({
    rootDir,
    profiles: built.profiles,
    asOfChapter: 11,
    volume: 1,
    previousActiveCharacterIds: new Set<string>(["hero"])
  });
  assert.equal(fullyRecovered.drift, null, "should recover when samples are sufficient and metrics stable");
  assert.equal(fullyRecovered.activeCharacterIds.size, 0, "should clear active set on full recovery");
});

test("loadCharacterVoiceProfiles defaults invalid thresholds and drops invalid profile entries", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-load-"));

  await writeJson(join(rootDir, "character-voice-profiles.json"), {
    schema_version: 1,
    created_at: "2026-03-02T00:00:00.000Z",
    selection: { protagonist_id: "hero", core_cast_ids: ["side"] },
    policy: {
      window_chapters: 10,
      min_dialogue_samples: 5,
      drift_thresholds: {
        avg_dialogue_chars_ratio_low: 0.6,
        avg_dialogue_chars_ratio_high: 1.67,
        exclamation_per_100_chars_delta: 3.5,
        question_per_100_chars_delta: 3.5,
        ellipsis_per_100_chars_delta: 3.5,
        signature_overlap_min: 2
      },
      recovery_thresholds: {
        avg_dialogue_chars_ratio_low: 0.75,
        avg_dialogue_chars_ratio_high: 1.33,
        exclamation_per_100_chars_delta: 2.0,
        question_per_100_chars_delta: 2.0,
        ellipsis_per_100_chars_delta: 2.0,
        signature_overlap_min: 0.3
      }
    },
    profiles: [
      {
        character_id: "hero",
        display_name: "阿宁",
        baseline_range: { chapter_start: 1, chapter_end: 2 },
        baseline_metrics: {
          dialogue_samples: 10,
          dialogue_chars: 100,
          dialogue_len_avg: 10,
          dialogue_len_p25: 8,
          dialogue_len_p50: 10,
          dialogue_len_p75: 12,
          sentence_len_avg: 8,
          sentence_len_p25: 6,
          sentence_len_p50: 8,
          sentence_len_p75: 10,
          exclamation_per_100_chars: 1,
          question_per_100_chars: 1,
          ellipsis_per_100_chars: 1
        },
        signature_phrases: ["嗯"]
      },
      {
        display_name: "老周"
      }
    ]
  });

  const loaded = await loadCharacterVoiceProfiles(rootDir);
  assert.ok(loaded.profiles);
  assert.ok(loaded.warnings.some((w) => w.includes("invalid thresholds")));
  assert.equal(loaded.profiles?.policy.window_chapters, 10);
  assert.equal(loaded.profiles?.profiles.length, 1);
  assert.equal(loaded.profiles?.profiles[0]?.character_id, "hero");
});

test("buildInstructionPacket injects character voice drift directives into draft/refine packets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-character-voice-instructions-"));

  await writeJson(join(rootDir, "character-voice-drift.json"), {
    schema_version: 1,
    generated_at: "2026-03-02T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    window: { chapter_start: 1, chapter_end: 10, window_chapters: 10 },
    profiles_path: "character-voice-profiles.json",
    characters: [
      {
        character_id: "hero",
        display_name: "阿宁",
        directives: ["台词偏长：把长句拆短。", "口癖回归：适度加入“嗯”。"]
      }
    ]
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);

  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const draftOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const draftInline = draftOut.packet?.manifest?.inline;
  assert.ok(draftInline?.character_voice_drift);
  assert.equal(draftInline.character_voice_drift.directives.length, 1);
  assert.equal(draftInline.character_voice_drift.directives[0]?.character_id, "hero");
  assert.equal(draftOut.packet?.manifest?.paths?.character_voice_drift, "character-voice-drift.json");

  const refineOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "refine" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const refineInline = refineOut.packet?.manifest?.inline;
  assert.ok(refineInline?.character_voice_drift);
  assert.equal(refineOut.packet?.manifest?.paths?.character_voice_drift, "character-voice-drift.json");

  // Clearing drift removes injection.
  await rm(join(rootDir, "character-voice-drift.json"), { force: true });
  const draftOut2 = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;
  assert.equal(draftOut2.packet?.manifest?.inline?.character_voice_drift, undefined);
  assert.equal(draftOut2.packet?.manifest?.inline?.character_voice_drift_degraded, undefined);
  assert.equal(draftOut2.packet?.manifest?.paths?.character_voice_drift, undefined);
});
