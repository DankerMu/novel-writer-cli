import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";
import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";
import { validateStep } from "../validate.js";
import { commitVolume } from "../volume-commit.js";
import { resolveVolumeChapterRange, volumeFinalRelPaths, volumeStagingRelPaths } from "../volume-planning.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function exists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

type VolumePlanRels = ReturnType<typeof volumeStagingRelPaths>;

function makeQuickstartCheckpoint(phase?: "style" | "f0" | "trial"): Checkpoint {
  return {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    volume_pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: phase ?? null,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

async function writeQuickstartPrereqs(rootDir: string): Promise<void> {
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
}

function outlineForRange(range: { start: number; end: number }, prefix: string): string {
  const excitementByChapter = ["setup", "reveal", "cliffhanger", "power_up", "reversal", "setup"] as const;
  const lines = ["## 第 1 卷大纲", ""];
  for (let chapter = range.start; chapter <= range.end; chapter++) {
    lines.push(`### 第 ${chapter} 章: ${prefix}${chapter}`);
    lines.push("- **Storyline**: main-arc");
    lines.push("- **POV**: hero");
    lines.push(`- **Location**: zone-${chapter}`);
    lines.push(`- **Conflict**: 冲突 ${chapter}`);
    lines.push(`- **Arc**: 弧线 ${chapter}`);
    lines.push(`- **Foreshadowing**: seed-${chapter}`);
    lines.push(`- **StateChanges**: Hero 抵达 zone-${chapter}`);
    lines.push(`- **TransitionHint**: next-${chapter}`);
    lines.push(`- **ExcitementType**: ${excitementByChapter[(chapter - range.start) % excitementByChapter.length]}`);
    lines.push("");
  }
  return lines.join("\n");
}

async function writeVolumePlanArtifacts(args: {
  rootDir: string;
  rels: VolumePlanRels;
  range: { start: number; end: number };
  prefix: string;
  initialHeroLocation: string;
}): Promise<void> {
  const { rootDir, rels, range, prefix } = args;
  let previousLocation = args.initialHeroLocation;

  await writeText(join(rootDir, rels.outlineMd), outlineForRange(range, prefix));
  await writeJson(join(rootDir, rels.storylineScheduleJson), { active_storylines: ["main-arc"] });
  await writeJson(join(rootDir, rels.foreshadowingJson), {
    schema_version: 1,
    items: [{ id: `seed-${range.start}`, scope: "short", status: "planned" }]
  });
  await writeJson(join(rootDir, rels.newCharactersJson), []);

  for (let chapter = range.start; chapter <= range.end; chapter++) {
    const nextLocation = `zone-${chapter}`;
    await writeJson(join(rootDir, rels.chapterContractJson(chapter)), {
      chapter,
      storyline_id: "main-arc",
      storyline_context: {
        last_chapter_summary: `summary-${chapter - 1}`,
        chapters_since_last: 0,
        line_arc_progress: `progress-${chapter}`,
        concurrent_state: "steady"
      },
      excitement_type: chapter % 2 === 0 ? "reveal" : "setup",
      preconditions: { character_states: { Hero: { location: previousLocation } }, required_world_rules: [] },
      objectives: [{ id: `OBJ-${chapter}-1`, type: "plot", required: true, description: `推进 ${chapter}` }],
      postconditions: { state_changes: { Hero: { location: nextLocation } }, foreshadowing_updates: {} },
      acceptance_criteria: [`OBJ-${chapter}-1 落地`]
    });
    previousLocation = nextLocation;
  }
}

test("buildInstructionPacket(quickstart:f0) emits mini-planning packet and genre map", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-f0-packet-"));
  try {
    await writeQuickstartPrereqs(rootDir);
    await writeText(join(rootDir, "brief.md"), ["# brief", "", "- **题材**：言情", ""].join("\n"));
    await writeJson(join(rootDir, "genre-excitement-map.json"), {
      schema_version: 1,
      genres: {
        romance: { chapters: { "1": "setup", "2": "reveal", "3": "reversal" } }
      }
    });

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeQuickstartCheckpoint("style"),
      step: { kind: "quickstart", phase: "f0" },
      embedMode: null,
      writeManifest: false
    })) as any;

    assert.equal(built.packet.step, "quickstart:f0");
    assert.equal(built.packet.agent.name, "plot-architect");
    assert.equal(built.packet.manifest.inline.quickstart_mini_planning, true);
    assert.deepEqual(built.packet.manifest.inline.volume_plan, { volume: 1, chapter_range: [1, 3] });
    assert.deepEqual(built.packet.manifest.inline.genre_excitement_map, {
      genre: "romance",
      chapters: { "1": "setup", "2": "reveal", "3": "reversal" },
      source: "genre-excitement-map.json"
    });
    assert.ok(built.packet.expected_outputs.some((item: any) => item.path === "staging/volumes/vol-01/outline.md"));
    assert.ok(built.packet.expected_outputs.some((item: any) => item.path === "staging/volumes/vol-01/chapter-contracts/chapter-003.json"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket(quickstart:trial) uses committed mini-planning artifacts when available", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-trial-mini-plan-"));
  try {
    await writeQuickstartPrereqs(rootDir);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeQuickstartCheckpoint("f0"),
      step: { kind: "quickstart", phase: "trial" },
      embedMode: null,
      writeManifest: false
    })) as any;

    assert.equal(built.packet.manifest.paths.chapter_contract, "volumes/vol-01/chapter-contracts/chapter-001.json");
    assert.equal(built.packet.manifest.paths.volume_outline, "volumes/vol-01/outline.md");
    assert.equal(built.packet.manifest.paths.volume_foreshadowing, "volumes/vol-01/foreshadowing.json");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("advanceCheckpointForStep(quickstart:f0) commits mini-planning into volumes/vol-01", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-advance-f0-"));
  try {
    await writeJson(join(rootDir, ".checkpoint.json"), makeQuickstartCheckpoint("style"));
    await writeQuickstartPrereqs(rootDir);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeStagingRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });

    const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "f0" } });
    assert.equal(updated.orchestrator_state, "QUICK_START");
    assert.equal(updated.quickstart_phase, "f0");
    assert.equal(await exists(join(rootDir, "staging/volumes/vol-01")), false);
    assert.equal(await exists(join(rootDir, "volumes/vol-01/outline.md")), true);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("validateStep(quickstart:f0) rejects missing mini-plan outline", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-f0-outline-"));
  try {
    await writeQuickstartPrereqs(rootDir);
    const rels = volumeStagingRelPaths(1);
    await writeJson(join(rootDir, rels.storylineScheduleJson), { active_storylines: ["main-arc"] });
    await writeJson(join(rootDir, rels.foreshadowingJson), { schema_version: 1, items: [] });
    await writeJson(join(rootDir, rels.newCharactersJson), []);
    for (const chapter of [1, 2, 3]) {
      await writeJson(join(rootDir, rels.chapterContractJson(chapter)), {
        chapter,
        storyline_id: "main-arc",
        objectives: [{ id: `OBJ-${chapter}-1`, required: true, description: "x" }],
        preconditions: { character_states: { Hero: { location: "x" } } },
        postconditions: { state_changes: { Hero: { location: "y" } } }
      });
    }

    await assert.rejects(
      () =>
        validateStep({
          rootDir,
          checkpoint: makeQuickstartCheckpoint("style"),
          step: { kind: "quickstart", phase: "f0" }
        }),
      /Missing required file: staging\/volumes\/vol-01\/outline\.md/
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("resolveVolumeChapterRange and volume:outline packet continue vol-01 from chapter 4 after F0", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-range-after-f0-"));
  try {
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });

    const range = await resolveVolumeChapterRange({ rootDir, current_volume: 1, last_completed_chapter: 0 });
    assert.deepEqual(range, { start: 4, end: 30 });

    const built = (await buildInstructionPacket({
      rootDir,
      checkpoint: {
        last_completed_chapter: 0,
        current_volume: 1,
        orchestrator_state: "VOL_PLANNING",
        pipeline_stage: null,
        volume_pipeline_stage: null,
        inflight_chapter: null,
        revision_count: 0,
        hook_fix_count: 0,
        title_fix_count: 0
      },
      step: { kind: "volume", phase: "outline" },
      embedMode: null,
      writeManifest: false
    })) as any;

    assert.deepEqual(built.packet.manifest.inline.volume_plan, { volume: 1, chapter_range: [4, 30] });
    assert.deepEqual(built.packet.manifest.inline.volume_plan_seed_range, [1, 3]);
    assert.equal(built.packet.manifest.paths.existing_volume_outline, "volumes/vol-01/outline.md");
    assert.equal(built.packet.manifest.paths.existing_chapter_contracts_dir, "volumes/vol-01/chapter-contracts");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume merges formal vol-01 plan into existing F0 seed artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-merge-f0-"));
  try {
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeStagingRelPaths(1),
      range: { start: 4, end: 30 },
      prefix: "formal-",
      initialHeroLocation: "zone-3"
    });
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });

    await commitVolume({ rootDir, volume: 1, dryRun: false });

    const outline = await readFile(join(rootDir, "volumes/vol-01/outline.md"), "utf8");
    assert.match(outline, /### 第 1 章: seed-1/);
    assert.match(outline, /### 第 30 章: formal-30/);
    assert.equal(await exists(join(rootDir, "staging/volumes/vol-01")), false);

    const chapter1 = JSON.parse(await readFile(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-001.json"), "utf8"));
    const chapter4 = JSON.parse(await readFile(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-004.json"), "utf8"));
    assert.equal(chapter1.chapter, 1);
    assert.equal(chapter4.chapter, 4);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});


test("resolveVolumeChapterRange does not skip chapters when vol-01 seed already contains later contracts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-range-mixed-seed-"));
  try {
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    await writeJson(join(rootDir, volumeFinalRelPaths(1).chapterContractJson(4)), {
      chapter: 4,
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ-4-1", required: true, description: "bad extra" }],
      preconditions: { character_states: { Hero: { location: "zone-3" } } },
      postconditions: { state_changes: { Hero: { location: "zone-4" } } }
    });

    const range = await resolveVolumeChapterRange({ rootDir, current_volume: 1, last_completed_chapter: 0 });
    assert.deepEqual(range, { start: 1, end: 30 });
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume rejects duplicate seed contracts during merge without mutating final files", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-merge-preflight-"));
  try {
    const finalRels = volumeFinalRelPaths(1);
    const stagingRels = volumeStagingRelPaths(1);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: finalRels,
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    await writeVolumePlanArtifacts({
      rootDir,
      rels: stagingRels,
      range: { start: 4, end: 30 },
      prefix: "formal-",
      initialHeroLocation: "zone-3"
    });
    await writeJson(join(rootDir, stagingRels.chapterContractJson(1)), {
      chapter: 1,
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ-1-1", required: true, description: "duplicate seed" }],
      preconditions: { character_states: { Hero: { location: "prologue" } } },
      postconditions: { state_changes: { Hero: { location: "zone-1" } } }
    });
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });

    const outlineBefore = await readFile(join(rootDir, finalRels.outlineMd), "utf8");
    const scheduleBefore = await readFile(join(rootDir, finalRels.storylineScheduleJson), "utf8");
    const foreshadowingBefore = await readFile(join(rootDir, finalRels.foreshadowingJson), "utf8");
    const newCharactersBefore = await readFile(join(rootDir, finalRels.newCharactersJson), "utf8");

    await assert.rejects(() => commitVolume({ rootDir, volume: 1, dryRun: false }), /unexpected contract chapter 1 outside required range/);

    assert.equal(await readFile(join(rootDir, finalRels.outlineMd), "utf8"), outlineBefore);
    assert.equal(await readFile(join(rootDir, finalRels.storylineScheduleJson), "utf8"), scheduleBefore);
    assert.equal(await readFile(join(rootDir, finalRels.foreshadowingJson), "utf8"), foreshadowingBefore);
    assert.equal(await readFile(join(rootDir, finalRels.newCharactersJson), "utf8"), newCharactersBefore);
    assert.equal(await exists(join(rootDir, stagingRels.dir)), true);
    assert.equal(await exists(join(rootDir, finalRels.chapterContractJson(4))), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});


test("validateStep(volume:validate) rejects staging outline that rewrites seed chapters", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-validate-outline-seed-"));
  try {
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    const stagingRels = volumeStagingRelPaths(1);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: stagingRels,
      range: { start: 4, end: 30 },
      prefix: "formal-",
      initialHeroLocation: "zone-3"
    });
    const formalOutline = await readFile(join(rootDir, stagingRels.outlineMd), "utf8");
    const formalBody = formalOutline.split(/\r?\n/u).slice(2).join("\n").trim();
    const pollutedOutline = `${outlineForRange({ start: 1, end: 1 }, "bad-seed-").trimEnd()}\n\n${formalBody}\n`;
    await writeText(join(rootDir, stagingRels.outlineMd), pollutedOutline);

    await assert.rejects(
      () =>
        validateStep({
          rootDir,
          checkpoint: {
            last_completed_chapter: 0,
            current_volume: 1,
            orchestrator_state: "VOL_PLANNING",
            pipeline_stage: null,
            volume_pipeline_stage: "validate",
            inflight_chapter: null,
            quickstart_phase: null,
            revision_count: 0,
            hook_fix_count: 0,
            title_fix_count: 0
          },
          step: { kind: "volume", phase: "validate" }
        }),
      /unexpected chapter block\(s\) 1 outside required range/
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("validateStep(volume:validate) rejects staging contracts that rewrite seed chapters", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-validate-contract-seed-"));
  try {
    await writeVolumePlanArtifacts({
      rootDir,
      rels: volumeFinalRelPaths(1),
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    const stagingRels = volumeStagingRelPaths(1);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: stagingRels,
      range: { start: 4, end: 30 },
      prefix: "formal-",
      initialHeroLocation: "zone-3"
    });
    await writeJson(join(rootDir, stagingRels.chapterContractJson(1)), {
      chapter: 1,
      storyline_id: "main-arc",
      objectives: [{ id: "OBJ-1-1", required: true, description: "duplicate seed" }],
      preconditions: { character_states: { Hero: { location: "prologue" } } },
      postconditions: { state_changes: { Hero: { location: "zone-1" } } }
    });

    await assert.rejects(
      () =>
        validateStep({
          rootDir,
          checkpoint: {
            last_completed_chapter: 0,
            current_volume: 1,
            orchestrator_state: "VOL_PLANNING",
            pipeline_stage: null,
            volume_pipeline_stage: "validate",
            inflight_chapter: null,
            quickstart_phase: null,
            revision_count: 0,
            hook_fix_count: 0,
            title_fix_count: 0
          },
          step: { kind: "volume", phase: "validate" }
        }),
      /unexpected contract chapter 1 outside required range/
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("commitVolume resumes merge when final already contains formal vol-01 artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-volume-merge-resume-"));
  try {
    const finalRels = volumeFinalRelPaths(1);
    const stagingRels = volumeStagingRelPaths(1);
    await writeVolumePlanArtifacts({
      rootDir,
      rels: finalRels,
      range: { start: 1, end: 3 },
      prefix: "seed-",
      initialHeroLocation: "prologue"
    });
    await writeVolumePlanArtifacts({
      rootDir,
      rels: stagingRels,
      range: { start: 4, end: 30 },
      prefix: "formal-",
      initialHeroLocation: "zone-3"
    });
    const formalOutline = await readFile(join(rootDir, stagingRels.outlineMd), "utf8");
    const formalBody = formalOutline.split(/\r?\n/u).slice(2).join("\n").trim();
    const mergedOutline = `${outlineForRange({ start: 1, end: 3 }, "seed-").trimEnd()}\n\n${formalBody}\n`;
    await writeText(join(rootDir, finalRels.outlineMd), mergedOutline);
    await writeFile(
      join(rootDir, finalRels.chapterContractJson(4)),
      await readFile(join(rootDir, stagingRels.chapterContractJson(4)))
    );
    await writeJson(join(rootDir, ".checkpoint.json"), {
      last_completed_chapter: 0,
      current_volume: 1,
      orchestrator_state: "VOL_PLANNING",
      pipeline_stage: null,
      inflight_chapter: null,
      volume_pipeline_stage: "commit"
    });

    await commitVolume({ rootDir, volume: 1, dryRun: false });

    assert.equal(await exists(join(rootDir, stagingRels.dir)), false);
    assert.equal(await exists(join(rootDir, finalRels.chapterContractJson(30))), true);
    const outline = await readFile(join(rootDir, finalRels.outlineMd), "utf8");
    assert.match(outline, /### 第 1 章: seed-1/);
    assert.match(outline, /### 第 30 章: formal-30/);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
