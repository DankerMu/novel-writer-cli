import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function repoPath(relPath: string): string {
  return join(repoRoot, relPath);
}

async function readJson(relPath: string): Promise<unknown> {
  return JSON.parse(await readFile(repoPath(relPath), "utf8")) as unknown;
}

function assertPlainObject(value: unknown, label: string): asserts value is Record<string, unknown> {
  assert.ok(typeof value === "object" && value !== null && !Array.isArray(value), `${label} must be a JSON object`);
}

test("templates/style-profile-template.json includes nullable statistical fields (v0.2+ anti-AI)", async () => {
  const raw = await readJson("templates/style-profile-template.json");
  assertPlainObject(raw, "style-profile-template.json");

  assert.equal(raw.sentence_length_std_dev, null);
  assert.equal(raw.paragraph_length_cv, null);
  assert.equal(raw.emotional_volatility, null);
  assert.equal(raw.register_mixing, null);
  assert.equal(raw.vocabulary_richness, null);

  assert.equal(typeof raw._sentence_length_std_dev_comment, "string");
  assert.match(raw._sentence_length_std_dev_comment as string, /8-18/);
  assert.match(raw._sentence_length_std_dev_comment as string, /<\s*6/);

  assert.equal(typeof raw._paragraph_length_cv_comment, "string");
  assert.match(raw._paragraph_length_cv_comment as string, /0\.4-1\.2/);
  assert.match(raw._paragraph_length_cv_comment as string, /<\s*0\.3/);

  for (const key of ["_emotional_volatility_comment", "_register_mixing_comment", "_vocabulary_richness_comment"] as const) {
    assert.equal(typeof raw[key], "string");
    assert.match(raw[key] as string, /high\|medium\|low/);
  }
});

test("templates/ai-blacklist.json v2 expands entries and supports metadata", async () => {
  const raw = await readJson("templates/ai-blacklist.json");
  assertPlainObject(raw, "ai-blacklist.json");

  assert.match(String(raw.version), /^2\./, "ai-blacklist.json.version must remain in v2.x series");
  assert.equal(raw.max_words, 250);
  assert.equal(typeof raw.last_updated, "string");

  assert.ok(Array.isArray(raw.words), "ai-blacklist.json.words must be an array");
  assert.ok((raw.words as unknown[]).every((w) => typeof w === "string" && w.trim().length > 0), "words must be non-empty strings");

  const words = (raw.words as string[]).map((w) => w.trim());
  assert.ok(words.length >= 190, `words.length must be >= 190, got ${words.length}`);
  assert.ok(words.length <= (raw.max_words as number), `words.length must be <= max_words (${raw.max_words})`);

  const wordSet = new Set(words);
  assert.equal(wordSet.size, words.length, "words must be unique");

  assert.ok(Array.isArray(raw.whitelist), "ai-blacklist.json.whitelist must be an array");
  assert.ok(
    (raw.whitelist as unknown[]).every((w) => typeof w === "string" && w.trim().length > 0),
    "whitelist entries must be non-empty strings"
  );

  assertPlainObject(raw.categories, "ai-blacklist.json.categories");
  const categories = raw.categories;

  const requiredCategories = [
    "summary_word",
    "enumeration_template",
    "academic_tone",
    "narration_connector",
    "paragraph_opener",
    "smooth_transition",
    "emotion_cliche",
    "expression_cliche",
    "action_cliche",
    "environment_cliche",
    "narrative_filler",
    "abstract_filler",
    "mechanical_opening",
    "simile_cliche"
  ];
  for (const key of requiredCategories) {
    assert.ok(key in categories, `Missing category: ${key}`);
  }

  assertPlainObject(raw.category_metadata, "ai-blacklist.json.category_metadata");
  const meta = raw.category_metadata;
  assertPlainObject(meta.narration_connector, "category_metadata.narration_connector");
  assert.equal(meta.narration_connector.context, "narration_only");
  assertPlainObject(meta.abstract_filler, "category_metadata.abstract_filler");
  assertPlainObject(meta.abstract_filler.genre_override, "category_metadata.abstract_filler.genre_override");
  assertPlainObject(meta.abstract_filler.genre_override["sci-fi"], "category_metadata.abstract_filler.genre_override.sci-fi");
  assertPlainObject(
    meta.abstract_filler.genre_override["sci-fi"].per_chapter_max,
    "category_metadata.abstract_filler.genre_override.sci-fi.per_chapter_max"
  );

  const allCategoryWords = new Set<string>();
  const narrationConnectorWords = new Set<string>();
  const abstractFillerWords = new Set<string>();
  const categorizedWordCounts = new Map<string, number>();
  const categoryWordSets = new Map<string, Set<string>>();
  const entryIndex = new Map<string, Record<string, unknown>>();

  for (const [categoryName, entries] of Object.entries(categories)) {
    assert.ok(Array.isArray(entries), `categories.${categoryName} must be an array`);
    const categoryWords = new Set<string>();
    categoryWordSets.set(categoryName, categoryWords);
    for (const entry of entries as unknown[]) {
      assertPlainObject(entry, `categories.${categoryName}[]`);
      assert.equal(typeof entry.word, "string");
      const word = (entry.word as string).trim();
      assert.ok(word.length > 0, `categories.${categoryName}[] word must be non-empty`);
      categoryWords.add(word);
      entryIndex.set(`${categoryName}:${word}`, entry as Record<string, unknown>);

      assert.equal(typeof entry.replacement_hint, "string");
      assert.ok((entry.replacement_hint as string).trim().length > 0, `categories.${categoryName}[] replacement_hint must be non-empty`);

      const perChapterMax = (entry as Record<string, unknown>).per_chapter_max;
      if (perChapterMax !== undefined) {
        assert.ok(Number.isInteger(perChapterMax) && (perChapterMax as number) > 0, `Invalid per_chapter_max for word: ${word}`);
      }

      if (categoryName === "narration_connector") {
        narrationConnectorWords.add(word);
        continue;
      }
      if (categoryName === "abstract_filler") abstractFillerWords.add(word);

      allCategoryWords.add(word);
      categorizedWordCounts.set(word, (categorizedWordCounts.get(word) ?? 0) + 1);
    }
  }

  // narration_connector is intentionally excluded from flat words until context-aware lint exists.
  for (const w of narrationConnectorWords) {
    assert.equal(wordSet.has(w), false, `narration_connector word must not appear in words[]: ${w}`);
  }

  assert.equal(allCategoryWords.size, wordSet.size, "categories (excluding narration_connector) must cover words[] exactly");
  for (const w of allCategoryWords) {
    assert.ok(wordSet.has(w), `Missing from words[]: ${w}`);
  }
  for (const w of wordSet) {
    assert.equal(categorizedWordCounts.get(w), 1, `Word must appear exactly once across categories: ${w}`);
  }

  const sciFiPerChapterMax = meta.abstract_filler.genre_override["sci-fi"].per_chapter_max as Record<string, unknown>;
  for (const [key, value] of Object.entries(sciFiPerChapterMax)) {
    assert.ok(abstractFillerWords.has(key), `genre_override.sci-fi.per_chapter_max references missing abstract_filler word: ${key}`);
    assert.ok(Number.isInteger(value), `genre_override.sci-fi.per_chapter_max must be int: ${key}`);
    assert.ok((value as number) > 0, `genre_override.sci-fi.per_chapter_max must be positive: ${key}`);
  }

  for (const word of ["宛如", "恍若", "仿佛置身于"]) {
    assert.ok(wordSet.has(word), `Missing from words[]: ${word}`);
    assert.ok(categoryWordSets.get("simile_cliche")?.has(word), `Missing from simile_cliche: ${word}`);
  }
  assert.ok(categoryWordSets.get("paragraph_opener")?.has("下一刻"), "下一刻 should be classified as paragraph_opener");
  assert.equal(categoryWordSets.get("narrative_filler")?.has("下一刻"), false, "下一刻 should not remain in narrative_filler");

  for (const [categoryName, word, expectedMax] of [
    ["enumeration_template", "首先", 2],
    ["enumeration_template", "其次", 2],
    ["enumeration_template", "最后", 2],
    ["academic_tone", "例如", 2],
    ["emotion_cliche", "不禁", 1],
    ["emotion_cliche", "心中暗道", 1],
    ["action_cliche", "缓缓说道", 1],
    ["action_cliche", "微微一笑", 1]
  ] as const) {
    const entry = entryIndex.get(`${categoryName}:${word}`);
    assert.ok(entry, `Missing entry metadata: ${categoryName}:${word}`);
    assert.equal(entry?.per_chapter_max, expectedMax, `Unexpected per_chapter_max for ${categoryName}:${word}`);
  }

  assert.ok(Array.isArray(raw.update_log), "ai-blacklist.json.update_log must be an array");
  const updateLog = raw.update_log as unknown[];
  assert.ok(updateLog.length >= 1, "update_log should have at least one entry");
  const latest = updateLog[updateLog.length - 1];
  assertPlainObject(latest, "update_log[-1]");
  assert.equal(latest.version, raw.version);
  assert.equal(latest.words_count, words.length);
});
