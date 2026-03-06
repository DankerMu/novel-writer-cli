import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseGoldenChapterGates, selectGoldenChapterGatesForPlatform } from "../golden-chapter-gates.js";

function makeBaseConfig(): Record<string, unknown> {
  const baseRule = {
    id: "hook_present",
    requirement: "章末必须留下钩子",
    threshold: {
      metric: "hook_strength",
      operator: ">=",
      value: 3
    }
  };

  const chapterConfig = { gates: [baseRule] };
  return {
    schema_version: 1,
    invalid_combinations: [],
    platforms: {
      fanqie: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } },
      qidian: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } },
      jinjiang: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } }
    }
  };
}

test("parseGoldenChapterGates rejects unsupported threshold operators", () => {
  const raw = makeBaseConfig();
  ((raw.platforms as Record<string, any>).fanqie.chapters["1"].gates[0].threshold.operator as string) = "approx";

  assert.throws(
    () => parseGoldenChapterGates(raw, "golden-chapter-gates.json"),
    /threshold\.operator.*<, <=, >, >=, ==, !=/i
  );
});

test("parseGoldenChapterGates parses template happy path", async () => {
  const raw = JSON.parse(await readFile("templates/golden-chapter-gates.json", "utf8")) as unknown;
  const parsed = parseGoldenChapterGates(raw, "templates/golden-chapter-gates.json");

  assert.equal(parsed.schema_version, 1);
  assert.ok((parsed.platforms.fanqie.chapters["1"]?.gates.length ?? 0) > 0);
  assert.ok((parsed.platforms.qidian.chapters["2"]?.gates.length ?? 0) > 0);
  assert.ok((parsed.platforms.jinjiang.chapters["3"]?.gates.length ?? 0) > 0);
});

test("parseGoldenChapterGates rejects non-object input", () => {
  assert.throws(() => parseGoldenChapterGates(null, "golden-chapter-gates.json"), /expected a JSON object/i);
});

test("parseGoldenChapterGates rejects invalid schema version", () => {
  const raw = makeBaseConfig();
  raw.schema_version = 2;
  assert.throws(() => parseGoldenChapterGates(raw, "golden-chapter-gates.json"), /schema_version.*must be 1/i);
});

test("parseGoldenChapterGates rejects missing platform objects", () => {
  const raw = makeBaseConfig();
  delete (raw.platforms as Record<string, unknown>).jinjiang;
  assert.throws(() => parseGoldenChapterGates(raw, "golden-chapter-gates.json"), /missing 'platforms\.jinjiang'/i);
});

test("parseGoldenChapterGates rejects empty chapter gates", () => {
  const raw = makeBaseConfig();
  ((raw.platforms as Record<string, any>).fanqie.chapters["1"].gates as unknown[]) = [];
  assert.throws(() => parseGoldenChapterGates(raw, "golden-chapter-gates.json"), /chapters\.1\.gates.*non-empty array/i);
});

test("selectGoldenChapterGatesForPlatform canonicalizes tomato and returns invalid-combination warnings", () => {
  const raw = makeBaseConfig();
  raw.invalid_combinations = [
    { genre: "litRPG", platform: "fanqie", warning: "fanqie warning" },
    { genre: "xianxia", platform: "qidian", warning: "qidian warning" }
  ];
  const parsed = parseGoldenChapterGates(raw, "golden-chapter-gates.json");

  const selected = selectGoldenChapterGatesForPlatform({
    config: parsed,
    platformId: "tomato",
    chapter: 2
  });

  assert.ok(selected);
  assert.equal(selected?.platform, "fanqie");
  assert.equal(selected?.chapter, 2);
  assert.equal(selected?.current_chapter.gates.length, 1);
  assert.deepEqual(selected?.invalid_combination_warnings, [{ genre: "litRPG", warning: "fanqie warning" }]);
});

test("selectGoldenChapterGatesForPlatform returns null for chapters outside 1-3", () => {
  const parsed = parseGoldenChapterGates(makeBaseConfig(), "golden-chapter-gates.json");
  assert.equal(selectGoldenChapterGatesForPlatform({ config: parsed, platformId: "qidian", chapter: 0 }), null);
  assert.equal(selectGoldenChapterGatesForPlatform({ config: parsed, platformId: "qidian", chapter: 4 }), null);
});
