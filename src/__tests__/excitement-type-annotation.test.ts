import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";
import { validateStep } from "../validate.js";

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

function makeJudgeCheckpoint(chapter: number): Checkpoint {
  return {
    last_completed_chapter: chapter - 1,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: chapter,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

function makeDraftCheckpoint(chapter: number): Checkpoint {
  return {
    last_completed_chapter: chapter - 1,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "committed",
    inflight_chapter: chapter,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

function makeVolumeCheckpoint(): Checkpoint {
  return {
    last_completed_chapter: 58,
    current_volume: 2,
    orchestrator_state: "VOL_PLANNING",
    pipeline_stage: null,
    volume_pipeline_stage: null,
    inflight_chapter: null,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

test("issue 129 prompts and skills describe excitement_type flow", async () => {
  const plotArchitect = await readRepoText("agents/plot-architect.md");
  const qualityJudge = await readRepoText("agents/quality-judge.md");
  const continueSkill = await readRepoText("skills/continue/SKILL.md");
  const volumePlanning = await readRepoText("skills/start/references/vol-planning.md");

  assert.match(plotArchitect, /excitement_type/);
  assert.match(plotArchitect, /\*\*ExcitementType\*\*/);
  assert.match(qualityJudge, /excitement_type/);
  assert.match(qualityJudge, /excitement_landing/);
  assert.match(qualityJudge, /铺垫有效性/);
  assert.match(continueSkill, /packet\.manifest\.inline\.excitement_type/);
  assert.match(volumePlanning, /ExcitementType/);
  assert.match(volumePlanning, /未知值仅警告并按 `null` 处理/);
});

test("buildInstructionPacket injects excitement_type for judge packets with contract-first fallback", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-excitement-packet-"));
  try {
    await writeText(
      join(rootDir, "volumes/vol-01/outline.md"),
      [
        "## 第 1 卷大纲",
        "",
        "### 第 1 章: 测试",
        "- **Storyline**: main-arc",
        "- **POV**: hero",
        "- **Location**: city",
        "- **Conflict**: test",
        "- **Arc**: test",
        "- **Foreshadowing**: test",
        "- **StateChanges**: test",
        "- **TransitionHint**: {}",
        "- **ExcitementType**: face_slap",
        ""
      ].join("\n")
    );
    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });
    await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n正文\n");

    const fromOutline = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(1),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as { packet: any };
    assert.equal(fromOutline.packet.manifest.inline.excitement_type, "face_slap");

    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      excitement_type: "setup",
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });

    const fromContract = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(1),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as { packet: any };
    assert.equal(fromContract.packet.manifest.inline.excitement_type, "setup");

    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      excitement_type: "boom",
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });

    const unknownContract = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(1),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as { packet: any };
    assert.equal(unknownContract.packet.manifest.inline.excitement_type, null);

    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      excitement_type: null,
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });

    const explicitNull = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(1),
      step: { kind: "chapter", chapter: 1, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as { packet: any };
    assert.equal(explicitNull.packet.manifest.inline.excitement_type, null);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket does not inject excitement_type for non-judge packets", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-excitement-draft-packet-"));
  try {
    await writeText(
      join(rootDir, "volumes/vol-01/outline.md"),
      [
        "## 第 1 卷大纲",
        "",
        "### 第 1 章: 测试",
        "- **Storyline**: main-arc",
        "- **POV**: hero",
        "- **Location**: city",
        "- **Conflict**: test",
        "- **Arc**: test",
        "- **Foreshadowing**: test",
        "- **StateChanges**: test",
        "- **TransitionHint**: {}",
        "- **ExcitementType**: face_slap",
        ""
      ].join("\n")
    );
    await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), {
      chapter: 1,
      storyline_id: "main-arc",
      excitement_type: "face_slap",
      objectives: [{ id: "OBJ-1", required: true, description: "x" }]
    });

    const packet = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeDraftCheckpoint(1),
      step: { kind: "chapter", chapter: 1, stage: "draft" },
      embedMode: null,
      writeManifest: false
    })) as { packet: any };

    assert.equal(Object.prototype.hasOwnProperty.call(packet.packet.manifest.inline, "excitement_type"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("validateStep(volume:outline) warns for missing or unknown excitement_type without blocking", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-excitement-validate-"));
  try {
    await writeText(
      join(rootDir, "staging/volumes/vol-02/outline.md"),
      [
        "## 第 2 卷大纲",
        "",
        "### 第59章: 测试",
        "- **Storyline**: main-arc",
        "- **POV**: hero",
        "- **Location**: city",
        "- **Conflict**: test",
        "- **Arc**: test",
        "- **Foreshadowing**: test",
        "- **StateChanges**: test",
        "- **TransitionHint**: {}",
        "- **ExcitementType**: setup",
        "",
        "### 第60章: 测试",
        "- **Storyline**: main-arc",
        "- **POV**: hero",
        "- **Location**: city",
        "- **Conflict**: test",
        "- **Arc**: test",
        "- **Foreshadowing**: test",
        "- **StateChanges**: test",
        "- **TransitionHint**: {}",
        "- **ExcitementType**: galaxy_brain",
        ""
      ].join("\n")
    );

    await writeJson(join(rootDir, "staging/volumes/vol-02/storyline-schedule.json"), { active_storylines: ["main-arc"] });
    await writeJson(join(rootDir, "staging/volumes/vol-02/foreshadowing.json"), { schema_version: 1, items: [] });
    await writeJson(join(rootDir, "staging/volumes/vol-02/new-characters.json"), []);

    const contractBase = {
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ", required: true, description: "x" }],
      preconditions: { character_states: { Alice: { location: "city" } } },
      postconditions: { state_changes: {} }
    };
    await writeJson(join(rootDir, "staging/volumes/vol-02/chapter-contracts/chapter-059.json"), { chapter: 59, ...contractBase });
    await writeJson(join(rootDir, "staging/volumes/vol-02/chapter-contracts/chapter-060.json"), {
      chapter: 60,
      excitement_type: "boom",
      ...contractBase
    });

    const report = await validateStep({ rootDir, checkpoint: makeVolumeCheckpoint(), step: { kind: "volume", phase: "outline" } });
    assert.equal(report.ok, true);
    assert.ok(report.warnings.some((w) => w.includes("chapter 60") && w.includes("ExcitementType") && w.includes("galaxy_brain")));
    assert.ok(report.warnings.some((w) => w.includes("chapter-059.json") && w.includes("Missing optional excitement_type")));
    assert.ok(report.warnings.some((w) => w.includes("chapter-060.json") && w.includes("boom")));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
