import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import type { InfoLoadNerPrecompute } from "../platform-constraints.js";
import { parsePlatformProfile } from "../platform-profile.js";
import { computeNamingReport, writeNamingLintLogs, type NamingReport } from "../naming-lint.js";

function makeProfileRaw(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    schema_version: 1,
    platform: "qidian",
    created_at: "2026-01-01T00:00:00Z",
    word_count: { target_min: 1, target_max: 2, hard_min: 1, hard_max: 2 },
    hook_policy: { required: false, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 0, max_unknown_entities_per_chapter: 0, max_new_terms_per_1k_words: 0 },
    compliance: { banned_words: [], duplicate_name_policy: "warn" },
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    ...extra
  };
}

function makeNamingPolicy(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    enabled: true,
    near_duplicate_threshold: 0.88,
    blocking_conflict_types: ["duplicate"],
    exemptions: {},
    ...overrides
  };
}

async function writeCharacterProfile(rootDir: string, slug: string, payload: Record<string, unknown>): Promise<void> {
  const dirAbs = join(rootDir, "characters", "active");
  await mkdir(dirAbs, { recursive: true });
  await writeFile(join(dirAbs, `${slug}.json`), `${JSON.stringify({ id: slug, ...payload }, null, 2)}\n`, "utf8");
}

test("computeNamingReport skips when naming policy is missing/disabled", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-skip-test-"));
  const profile = parsePlatformProfile(makeProfileRaw({ naming: null }), "platform-profile.json");
  const report = await computeNamingReport({
    rootDir,
    chapter: 1,
    chapterText: "# T\n正文\n",
    platformProfile: profile
  });
  assert.equal(report.status, "skipped");
  assert.equal(report.issues.length, 0);
});

test("computeNamingReport flags duplicate canonical display_name as blocking when configured", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-duplicate-test-"));

  const profile = parsePlatformProfile(makeProfileRaw({ naming: makeNamingPolicy({ blocking_conflict_types: ["duplicate"] }) }), "platform-profile.json");

  await writeCharacterProfile(rootDir, "lin-feng", { display_name: "林枫" });
  await writeCharacterProfile(rootDir, "lin-feng-2", { display_name: "林枫" });

  const report = await computeNamingReport({
    rootDir,
    chapter: 1,
    chapterText: "# T\n正文\n",
    platformProfile: profile
  });

  assert.equal(report.has_blocking_issues, true);
  assert.equal(report.status, "violation");
  assert.ok(report.issues.some((i) => i.id === "naming.duplicate_display_name" && i.severity === "hard"));
});

test("computeNamingReport flags near-duplicate names based on similarity threshold", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-near-dup-test-"));

  const profile = parsePlatformProfile(makeProfileRaw({ naming: makeNamingPolicy({ blocking_conflict_types: ["duplicate"] }) }), "platform-profile.json");

  await writeCharacterProfile(rootDir, "lin-feng", { display_name: "林枫" });
  await writeCharacterProfile(rootDir, "lin-feng-2", { display_name: "林峰" });

  const report = await computeNamingReport({
    rootDir,
    chapter: 1,
    chapterText: "# T\n正文\n",
    platformProfile: profile
  });

  const near = report.issues.find((i) => i.id === "naming.near_duplicate");
  assert.ok(near, "expected naming.near_duplicate issue");
  assert.equal(near.severity, "soft");
  assert.ok(typeof near.similarity === "number" && near.similarity >= 0.88);
  assert.equal(report.has_blocking_issues, false);
  assert.equal(report.status, "warn");
});

test("computeNamingReport flags alias collision when alias matches another character's canonical name", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-alias-collision-test-"));

  const profile = parsePlatformProfile(
    makeProfileRaw({ naming: makeNamingPolicy({ blocking_conflict_types: ["alias_collision"] }) }),
    "platform-profile.json"
  );

  await writeCharacterProfile(rootDir, "lin-feng", { display_name: "林枫", aliases: ["小枫"] });
  await writeCharacterProfile(rootDir, "xiao-feng", { display_name: "小枫" });

  const report = await computeNamingReport({
    rootDir,
    chapter: 1,
    chapterText: "# T\n正文\n",
    platformProfile: profile
  });

  assert.equal(report.has_blocking_issues, true);
  assert.ok(report.issues.some((i) => i.id === "naming.alias_collision" && i.severity === "hard"));
});

test("computeNamingReport uses NER index to warn on confusing unknown character-like entities", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-ner-confusion-test-"));

  const profile = parsePlatformProfile(makeProfileRaw({ naming: makeNamingPolicy() }), "platform-profile.json");

  await writeCharacterProfile(rootDir, "lin-feng", { display_name: "林枫" });

  const current_index = new Map<string, { category: string; evidence: string | null }>();
  current_index.set("林峰", { category: "character", evidence: "L1: 林峰走了进来。" });

  const infoLoadNer: InfoLoadNerPrecompute = {
    status: "pass",
    chapter_fingerprint: null,
    current_index,
    recent_texts: new Set()
  };

  const report = await computeNamingReport({
    rootDir,
    chapter: 1,
    chapterText: "# T\n林峰走了进来。\n",
    platformProfile: profile,
    infoLoadNer
  });

  assert.equal(report.has_blocking_issues, false);
  assert.equal(report.status, "warn");
  assert.ok(report.issues.some((i) => i.id === "naming.unknown_entity_confusion" && i.severity === "warn"));
});

test("writeNamingLintLogs writes history under naming-report-chapter-*.json", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-naming-logs-test-"));

  const report: NamingReport = {
    schema_version: 1,
    generated_at: "2026-01-01T00:00:00.000Z",
    scope: { chapter: 1 },
    policy: null,
    registry: { total_characters: 0, total_names: 0 },
    status: "pass",
    issues: [],
    has_blocking_issues: false
  };

  const out = await writeNamingLintLogs({ rootDir, chapter: 1, report });
  assert.equal(out.latestRel, "logs/naming/latest.json");
  assert.equal(out.historyRel, "logs/naming/naming-report-chapter-001.json");
});

