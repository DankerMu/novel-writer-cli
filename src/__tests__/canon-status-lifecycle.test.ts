import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type PacketResult = {
  packet: {
    manifest: {
      inline: Record<string, unknown>;
      paths: Record<string, unknown>;
    };
  };
};

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

test("issue 128 prompts and skill docs describe canon_status lifecycle", async () => {
  const worldBuilder = await readRepoText("agents/world-builder.md");
  const characterWeaver = await readRepoText("agents/character-weaver.md");
  const chapterWriter = await readRepoText("agents/chapter-writer.md");
  const qualityJudge = await readRepoText("agents/quality-judge.md");
  const continueSkill = await readRepoText("skills/continue/SKILL.md");

  assert.match(worldBuilder, /canon_status/);
  assert.match(characterWeaver, /canon_status/);
  assert.match(chapterWriter, /planned_rules_info/);
  assert.match(chapterWriter, /`canon_status == "planned"`|可引用、可铺垫/);
  assert.match(qualityJudge, /skip `planned` \/ `deprecated`|跳过 `planned` \/ `deprecated`/);
  assert.match(continueSkill, /planned_rules_info/);
  assert.match(continueSkill, /deprecated.*character_contracts/);
});

test("buildInstructionPacket filters rules and characters by canon_status", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-canon-status-"));
  try {
    await writeJson(join(rootDir, "world/rules.json"), {
      schema_version: 1,
      rules: [
        { id: "W-001", category: "physics", rule: "旧规则也要生效", constraint_type: "hard" },
        { id: "W-002", category: "physics", rule: "当前已生效规则", constraint_type: "hard", canon_status: "established" },
        { id: "W-003", category: "magic_system", rule: "未来卷才生效的设定", constraint_type: "hard", canon_status: " Planned " },
        { id: "W-004", category: "social", rule: "已废弃规则", constraint_type: "hard", canon_status: "deprecated" },
        { id: "W-005", category: "social", rule: "未来的软规则提示", constraint_type: "soft", canon_status: " PLANNED " }
      ]
    });

    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      preconditions: {
        character_states: {
          Alice: { location: "city" },
          Bob: { location: "city" },
          Carol: { location: "city" }
        }
      },
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });

    for (const [slug, displayName, canonStatus] of [
      ["alice", "Alice", undefined],
      ["bob", "Bob", " Planned "],
      ["carol", "Carol", "deprecated"],
      ["dave", "Dave", "established"]
    ] as const) {
      await writeJson(join(rootDir, `characters/active/${slug}.json`), {
        id: slug,
        display_name: displayName,
        ...(canonStatus ? { canon_status: canonStatus } : {}),
        contracts: [{ id: `C-${slug.toUpperCase()}-001`, type: "personality", rule: "rule" }]
      });
      await writeText(join(rootDir, `characters/active/${slug}.md`), `# ${displayName}\n`);
    }

    await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const draftPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, [
      "W-001: 旧规则也要生效",
      "W-002: 当前已生效规则"
    ]);
    assert.deepEqual(draftPacket.packet.manifest.inline.planned_rules_info, [
      {
        id: "W-003",
        category: "magic_system",
        constraint_type: "hard",
        canon_status: "planned",
        rule: "未来卷才生效的设定"
      },
      {
        id: "W-005",
        category: "social",
        constraint_type: "soft",
        canon_status: "planned",
        rule: "未来的软规则提示"
      }
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.inline, "world_rules_context_degraded"), false);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_contracts, [
      "characters/active/alice.json",
      "characters/active/bob.json"
    ]);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_profiles, [
      "characters/active/alice.md",
      "characters/active/bob.md"
    ]);

    const judgePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("refined"),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(judgePacket.packet.manifest.inline.hard_rules_list, [
      "W-001: 旧规则也要生效",
      "W-002: 当前已生效规则"
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.inline, "planned_rules_info"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.inline, "world_rules_context_degraded"), false);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_contracts, [
      "characters/active/alice.json",
      "characters/active/bob.json"
    ]);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_profiles, [
      "characters/active/alice.md",
      "characters/active/bob.md"
    ]);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket caps fallback character context and keeps empty hard_rules_list explicit", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-canon-status-fallback-"));
  try {
    await writeJson(join(rootDir, "world/rules.json"), {
      schema_version: 1,
      rules: []
    });

    for (let index = 1; index <= 18; index += 1) {
      const slug = `char-${String(index).padStart(2, "0")}`;
      const canonStatus = index === 5 ? "planned" : index === 18 ? "deprecated" : "established";
      await writeJson(join(rootDir, `characters/active/${slug}.json`), {
        id: slug,
        display_name: `角色${index}`,
        canon_status: canonStatus,
        contracts: [{ id: `C-${index}`, type: "personality", rule: `rule-${index}` }]
      });
      await writeText(join(rootDir, `characters/active/${slug}.md`), `# 角色${index}\n`);
    }

    await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const expectedContracts = Array.from({ length: 15 }, (_, index) => `characters/active/char-${String(index + 1).padStart(2, "0")}.json`);
    const expectedProfiles = Array.from({ length: 15 }, (_, index) => `characters/active/char-${String(index + 1).padStart(2, "0")}.md`);

    const draftPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, []);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.inline, "world_rules_context_degraded"), false);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_contracts, expectedContracts);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_profiles, expectedProfiles);
    assert.match(String((draftPacket.packet.manifest.paths.character_contracts as string[])[4]), /char-05\.json$/);
    assert.equal((draftPacket.packet.manifest.paths.character_contracts as string[]).includes("characters/active/char-18.json"), false);

    const judgePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("refined"),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(judgePacket.packet.manifest.inline.hard_rules_list, []);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_contracts, expectedContracts);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_profiles, expectedProfiles);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket marks malformed world rules as degraded and tolerates missing character directory", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-canon-status-degraded-"));
  try {
    await writeText(join(rootDir, "world/rules.json"), '{"rules": [}\n');
    await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const draftPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, []);
    assert.equal(draftPacket.packet.manifest.inline.world_rules_context_degraded, true);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.paths, "character_contracts"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.paths, "character_profiles"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
