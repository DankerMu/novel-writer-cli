import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

function repoPath(relPath: string): string {
  return join(process.cwd(), relPath);
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

  assert.equal(raw.version, "2.0.0");
  assert.equal(raw.max_words, 250);
  assert.equal(typeof raw.last_updated, "string");

  assert.ok(Array.isArray(raw.words), "ai-blacklist.json.words must be an array");
  assert.ok((raw.words as unknown[]).every((w) => typeof w === "string" && w.trim().length > 0), "words must be non-empty strings");

  const words = (raw.words as string[]).map((w) => w.trim());
  assert.ok(words.length >= 190 && words.length <= 220, `words.length must be between 190-220, got ${words.length}`);
  assert.ok(words.length <= (raw.max_words as number), `words.length must be <= max_words (${raw.max_words})`);

  const wordSet = new Set(words);
  assert.equal(wordSet.size, words.length, "words must be unique");

  assertPlainObject(raw.categories, "ai-blacklist.json.categories");
  const categories = raw.categories;

  const requiredCategories = [
    "summary_word",
    "enumeration_template",
    "academic_tone",
    "narration_connector",
    "emotion_cliche",
    "action_cliche",
    "environment_cliche",
    "narrative_filler",
    "abstract_filler",
    "mechanical_opening"
  ];
  for (const key of requiredCategories) {
    assert.ok(key in categories, `Missing category: ${key}`);
  }

  assertPlainObject(raw.category_metadata, "ai-blacklist.json.category_metadata");
  const meta = raw.category_metadata;
  assertPlainObject(meta.narration_connector, "category_metadata.narration_connector");
  assert.equal(meta.narration_connector.context, "narration_only");

  const allCategoryWords = new Set<string>();
  const narrationConnectorWords = new Set<string>();

  for (const [categoryName, entries] of Object.entries(categories)) {
    assert.ok(Array.isArray(entries), `categories.${categoryName} must be an array`);
    for (const entry of entries as unknown[]) {
      assertPlainObject(entry, `categories.${categoryName}[]`);
      assert.equal(typeof entry.word, "string");
      const word = (entry.word as string).trim();
      assert.ok(word.length > 0, `categories.${categoryName}[] word must be non-empty`);

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
      allCategoryWords.add(word);
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

  assert.ok(Array.isArray(raw.update_log), "ai-blacklist.json.update_log must be an array");
  const updateLog = raw.update_log as unknown[];
  assert.ok(updateLog.length >= 1, "update_log should have at least one entry");
  const latest = updateLog[updateLog.length - 1];
  assertPlainObject(latest, "update_log[-1]");
  assert.equal(latest.version, "2.0.0");
  assert.equal(latest.words_count, words.length);
});

