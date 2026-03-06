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

test("issue 169 prompts and skill docs describe split planned character context", async () => {
  const chapterWriter = await readRepoText("agents/chapter-writer.md");
  const qualityJudge = await readRepoText("agents/quality-judge.md");
  const continueSkill = await readRepoText("skills/continue/SKILL.md");
  const contextContracts = await readRepoText("skills/continue/references/context-contracts.md");

  assert.match(chapterWriter, /planned_character_contracts/);
  assert.match(chapterWriter, /planned_character_profiles/);
  assert.match(qualityJudge, /planned \/ deprecated 不会进入 judge packet/);
  assert.match(continueSkill, /planned_character_contracts/);
  assert.match(contextContracts, /planned_character_contracts\?:/);
  assert.match(contextContracts, /character_contracts: .*仅 established \/ 缺失 canon_status/);
});

test("buildInstructionPacket splits active and planned character context by canon_status", async () => {
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
    assert.deepEqual(draftPacket.packet.manifest.paths.character_contracts, ["characters/active/alice.json"]);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_profiles, ["characters/active/alice.md"]);
    assert.deepEqual(draftPacket.packet.manifest.paths.planned_character_contracts, ["characters/active/bob.json"]);
    assert.deepEqual(draftPacket.packet.manifest.paths.planned_character_profiles, ["characters/active/bob.md"]);

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
    assert.deepEqual(judgePacket.packet.manifest.paths.character_contracts, ["characters/active/alice.json"]);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_profiles, ["characters/active/alice.md"]);
    assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.paths, "planned_character_contracts"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.paths, "planned_character_profiles"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket prioritizes planned draft characters on fallback and keeps judge active-only", async () => {
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

    const draftPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, []);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.inline, "world_rules_context_degraded"), false);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_contracts, [
      "characters/active/char-01.json",
      "characters/active/char-02.json",
      "characters/active/char-03.json",
      "characters/active/char-04.json",
      "characters/active/char-06.json",
      "characters/active/char-07.json",
      "characters/active/char-08.json",
      "characters/active/char-09.json",
      "characters/active/char-10.json",
      "characters/active/char-11.json",
      "characters/active/char-12.json",
      "characters/active/char-13.json",
      "characters/active/char-14.json",
      "characters/active/char-15.json"
    ]);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_profiles, [
      "characters/active/char-01.md",
      "characters/active/char-02.md",
      "characters/active/char-03.md",
      "characters/active/char-04.md",
      "characters/active/char-06.md",
      "characters/active/char-07.md",
      "characters/active/char-08.md",
      "characters/active/char-09.md",
      "characters/active/char-10.md",
      "characters/active/char-11.md",
      "characters/active/char-12.md",
      "characters/active/char-13.md",
      "characters/active/char-14.md",
      "characters/active/char-15.md"
    ]);
    assert.deepEqual(draftPacket.packet.manifest.paths.planned_character_contracts, ["characters/active/char-05.json"]);
    assert.deepEqual(draftPacket.packet.manifest.paths.planned_character_profiles, ["characters/active/char-05.md"]);
    assert.equal((draftPacket.packet.manifest.paths.character_contracts as string[]).includes("characters/active/char-18.json"), false);

    const judgePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("refined"),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(judgePacket.packet.manifest.inline.hard_rules_list, []);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_contracts, [
      "characters/active/char-01.json",
      "characters/active/char-02.json",
      "characters/active/char-03.json",
      "characters/active/char-04.json",
      "characters/active/char-06.json",
      "characters/active/char-07.json",
      "characters/active/char-08.json",
      "characters/active/char-09.json",
      "characters/active/char-10.json",
      "characters/active/char-11.json",
      "characters/active/char-12.json",
      "characters/active/char-13.json",
      "characters/active/char-14.json",
      "characters/active/char-15.json",
      "characters/active/char-16.json"
    ]);
    assert.deepEqual(judgePacket.packet.manifest.paths.character_profiles, [
      "characters/active/char-01.md",
      "characters/active/char-02.md",
      "characters/active/char-03.md",
      "characters/active/char-04.md",
      "characters/active/char-06.md",
      "characters/active/char-07.md",
      "characters/active/char-08.md",
      "characters/active/char-09.md",
      "characters/active/char-10.md",
      "characters/active/char-11.md",
      "characters/active/char-12.md",
      "characters/active/char-13.md",
      "characters/active/char-14.md",
      "characters/active/char-15.md",
      "characters/active/char-16.md"
    ]);
    assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.paths, "planned_character_contracts"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket returns empty character context for all deprecated characters and soft rules", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-canon-status-empty-"));
  try {
    await writeJson(join(rootDir, "world/rules.json"), {
      schema_version: 1,
      rules: [
        { id: "W-001", category: "physics", rule: "soft established", constraint_type: "soft", canon_status: "established" },
        { id: "W-002", category: "magic", rule: "soft default", constraint_type: "soft" }
      ]
    });

    for (const slug of ["alice", "bob"]) {
      await writeJson(join(rootDir, `characters/active/${slug}.json`), {
        id: slug,
        display_name: slug,
        canon_status: "deprecated",
        contracts: [{ id: `C-${slug}`, type: "personality", rule: "rule" }]
      });
      await writeText(join(rootDir, `characters/active/${slug}.md`), `# ${slug}\n`);
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

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, []);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.paths, "character_contracts"), false);
    assert.equal(Object.prototype.hasOwnProperty.call(draftPacket.packet.manifest.paths, "planned_character_contracts"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket warns and degrades invalid canon_status values to established", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-canon-status-invalid-"));
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map((arg) => String(arg)).join(" "));
  };

  try {
    await writeJson(join(rootDir, "world/rules.json"), {
      schema_version: 1,
      rules: [{ id: "W-001", category: "physics", rule: "非法值也按 established", constraint_type: "hard", canon_status: "garbage" }]
    });
    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      preconditions: { character_states: { Alice: { location: "city" } } },
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });
    await writeJson(join(rootDir, "characters/active/alice.json"), {
      id: "alice",
      display_name: "Alice",
      canon_status: true,
      contracts: [{ id: "C-ALICE-001", type: "personality", rule: "rule" }]
    });
    await writeText(join(rootDir, "characters/active/alice.md"), "# Alice\n");
    await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");
    await writeText(join(rootDir, "staging/state/chapter-001-crossref.json"), "{}\n");

    const draftPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeCheckpoint("committed"),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(draftPacket.packet.manifest.inline.hard_rules_list, ["W-001: 非法值也按 established"]);
    assert.deepEqual(draftPacket.packet.manifest.paths.character_contracts, ["characters/active/alice.json"]);
    assert.equal(warnings.length, 2);
    const firstWarning = warnings[0] ?? "";
    const secondWarning = warnings[1] ?? "";
    assert.match(firstWarning, /Invalid canon_status/);
    assert.match(secondWarning, /Invalid non-string canon_status/);
  } finally {
    console.warn = originalWarn;
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
