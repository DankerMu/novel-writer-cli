import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

async function readRepoText(relPath: string): Promise<string> {
  return readFile(join(repoRoot, relPath), "utf8");
}

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

test("buildInstructionPacket includes platform writing guide for chapter and quickstart writer packets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-platform-guide-packet-"));
  await writeJson(join(rootDir, "platform-profile.json"), {
    schema_version: 1,
    platform: "fanqie",
    created_at: "2026-03-01T00:00:00Z",
    word_count: { target_min: 1500, target_max: 2500, hard_min: 1000, hard_max: 3500 },
    hook_policy: { required: true, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 5, max_unknown_entities_per_chapter: 3, max_new_terms_per_1k_words: 5 },
    compliance: { banned_words: [], duplicate_name_policy: "soft" },
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" }
  });
  await writeText(join(rootDir, "platform-writing-guide.md"), "# 平台指南\n");

  const chapterPacket = (await buildInstructionPacket({
    rootDir,
    checkpoint: makeCheckpoint("committed"),
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as { packet: any };
  assert.equal(chapterPacket.packet.manifest.paths.platform_writing_guide, "platform-writing-guide.md");

  const quickstartPacket = (await buildInstructionPacket({
    rootDir,
    checkpoint: {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "QUICK_START",
      pipeline_stage: null,
      inflight_chapter: null
    },
    step: { kind: "quickstart", phase: "trial" },
    embedMode: null,
    writeManifest: false
  })) as { packet: any };
  assert.equal(quickstartPacket.packet.manifest.paths.platform_writing_guide, "platform-writing-guide.md");
});

test("buildInstructionPacket injects platform-aware scoring and golden chapter gates for judge packets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-platform-judge-packet-"));
  await writeJson(join(rootDir, "platform-profile.json"), {
    schema_version: 1,
    platform: "tomato",
    created_at: "2026-03-01T00:00:00Z",
    word_count: { target_min: 1500, target_max: 2500, hard_min: 1000, hard_max: 3500 },
    hook_policy: { required: true, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 5, max_unknown_entities_per_chapter: 3, max_new_terms_per_1k_words: 5 },
    compliance: { banned_words: [], duplicate_name_policy: "soft" },
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" }
  });
  await writeText(join(rootDir, "platform-writing-guide.md"), "# 番茄平台写作指南\n");
  await writeJson(join(rootDir, "genre-weight-profiles.json"), JSON.parse(await readRepoText("templates/genre-weight-profiles.json")));
  await writeJson(join(rootDir, "golden-chapter-gates.json"), JSON.parse(await readRepoText("templates/golden-chapter-gates.json")));
  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");

  const packet = (await buildInstructionPacket({
    rootDir,
    checkpoint: makeCheckpoint("refined"),
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  })) as { packet: any };

  assert.equal(packet.packet.manifest.paths.platform_writing_guide, "platform-writing-guide.md");
  assert.equal(packet.packet.manifest.inline.golden_chapter_gates.platform, "fanqie");
  assert.equal(packet.packet.manifest.inline.golden_chapter_gates.chapter, 1);
  assert.equal(packet.packet.manifest.inline.golden_chapter_gates.source, "golden-chapter-gates.json");
  assert.ok(packet.packet.manifest.inline.scoring_weights.weights.hook_strength > 0);
});

test("buildInstructionPacket omits golden chapter gates after chapter 3", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-platform-judge-no-gates-"));
  await writeJson(join(rootDir, "platform-profile.json"), {
    schema_version: 1,
    platform: "jinjiang",
    created_at: "2026-03-01T00:00:00Z",
    word_count: { target_min: 2000, target_max: 3000, hard_min: 1500, hard_max: 3800 },
    hook_policy: { required: true, min_strength: 3, allowed_types: ["emotional_cliff"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 4, max_unknown_entities_per_chapter: 2, max_new_terms_per_1k_words: 4 },
    compliance: { banned_words: [], duplicate_name_policy: "soft" },
    scoring: { genre_drive_type: "character", weight_profile_id: "character:v1" }
  });
  await writeJson(join(rootDir, "genre-weight-profiles.json"), JSON.parse(await readRepoText("templates/genre-weight-profiles.json")));
  await writeJson(join(rootDir, "golden-chapter-gates.json"), JSON.parse(await readRepoText("templates/golden-chapter-gates.json")));
  await writeText(join(rootDir, "staging/chapters/chapter-004.md"), "# 第4章\n\n正文\n");

  const packet = (await buildInstructionPacket({
    rootDir,
    checkpoint: {
      ...makeCheckpoint("refined"),
      inflight_chapter: 4
    },
    step: { kind: "chapter", chapter: 4, stage: "judge" },
    embedMode: null,
    writeManifest: false
  })) as { packet: any };

  assert.equal(packet.packet.manifest.inline.golden_chapter_gates, undefined);
});
