import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildCharacterVoiceProfiles,
  clearCharacterVoiceDriftFile,
  computeCharacterVoiceDrift,
  writeCharacterVoiceDriftFile
} from "../character-voice.js";

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
