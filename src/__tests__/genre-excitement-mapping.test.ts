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

async function readRepoJson(relPath: string): Promise<any> {
  return JSON.parse(await readRepoText(relPath));
}

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function makeVolumeCheckpoint(lastCompletedChapter = 0): Checkpoint {
  return {
    last_completed_chapter: lastCompletedChapter,
    current_volume: 1,
    orchestrator_state: "VOL_PLANNING",
    pipeline_stage: null,
    volume_pipeline_stage: null,
    inflight_chapter: null,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
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

function makeQuickstartCheckpoint(lastCompletedChapter = 0): Checkpoint {
  return {
    last_completed_chapter: lastCompletedChapter,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    volume_pipeline_stage: null,
    inflight_chapter: null,
    revision_count: 0,
    hook_fix_count: 0,
    title_fix_count: 0
  };
}

async function seedGenreAwareProject(rootDir: string, genreLine = "- **题材**：言情"): Promise<void> {
  await writeText(
    join(rootDir, "brief.md"),
    [
      "# 创作纲领",
      "",
      "## 基本信息",
      "",
      genreLine,
      "- **目标平台**：晋江",
      ""
    ].join("\n")
  );
  await writeJson(join(rootDir, "genre-excitement-map.json"), await readRepoJson("templates/genre-excitement-map.json"));
  await writeJson(join(rootDir, "genre-golden-standards.json"), await readRepoJson("templates/genre-golden-standards.json"));
  await writeJson(join(rootDir, "volumes/vol-01/chapter-contracts/chapter-002.json"), {
    chapter: 2,
    storyline_id: "main-arc",
    objectives: [{ id: "OBJ-2-1", required: true, description: "x" }]
  });
  await writeText(join(rootDir, "staging/chapters/chapter-002.md"), "# 第2章\n\n正文\n");
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), "# 试写章\n\n正文\n");
}

test("issue 131 prompts, skills, templates, and openspec docs describe genre-aware opening guidance", async () => {
  const plotArchitect = await readRepoText("agents/plot-architect.md");
  const qualityJudge = await readRepoText("agents/quality-judge.md");
  const continueSkill = await readRepoText("skills/continue/SKILL.md");
  const startSkill = await readRepoText("skills/start/SKILL.md");
  const contextContracts = await readRepoText("skills/continue/references/context-contracts.md");
  const proposal = await readRepoText("openspec/changes/m8-genre-excitement-mapping/proposal.md");
  const tasks = await readRepoText("openspec/changes/m8-genre-excitement-mapping/tasks.md");
  const genreMapSpec = await readRepoText("openspec/changes/m8-genre-excitement-mapping/specs/genre-excitement-map/spec.md");
  const genreStandardsSpec = await readRepoText("openspec/changes/m8-genre-excitement-mapping/specs/genre-golden-standards/spec.md");

  assert.match(plotArchitect, /genre_excitement_map/);
  assert.match(plotArchitect, /禁止新增第 10 个/);
  assert.match(plotArchitect, /不得新增 `ExcitementTypeOverrideReason`/);
  assert.match(plotArchitect, /自由分配/);

  assert.match(qualityJudge, /genre_golden_standards/);
  assert.match(qualityJudge, /minimum_thresholds/);
  assert.match(qualityJudge, /平台门控和题材门槛都会独立生效/);
  assert.match(qualityJudge, /recommendation.*"revise"/s);

  assert.match(continueSkill, /packet\.manifest\.inline\.genre_golden_standards/);
  assert.match(startSkill, /言情 \(romance\)/);
  assert.match(startSkill, /invalid_combinations/);
  assert.match(startSkill, /packet\.manifest\.inline\.genre_excitement_map/);
  assert.match(startSkill, /若两处都不可读/);
  assert.match(contextContracts, /genre_golden_standards\?:/);

  assert.match(proposal, /src\/instructions\.ts/);
  assert.match(proposal, /quickstart:results/);
  assert.match(tasks, /src\/instructions\.ts/);
  assert.match(tasks, /quickstart:results/);
  assert.match(genreMapSpec, /src\/instructions\.ts/);
  assert.match(genreStandardsSpec, /quickstart:results/);

  const excitementMap = await readRepoJson("templates/genre-excitement-map.json");
  assert.equal(excitementMap.schema_version, 1);
  assert.deepEqual(Object.keys(excitementMap.genres).sort(), ["dushi", "history", "romance", "scifi", "suspense", "xuanhuan"]);
  assert.equal(excitementMap.genres.xuanhuan.chapters["1"], "setup");
  assert.equal(excitementMap.genres.xuanhuan.chapters["2"], "power_up");
  assert.equal(excitementMap.genres.xuanhuan.chapters["3"], "face_slap");
  assert.equal(excitementMap.genres.romance.chapters["2"], "reveal");

  const goldenStandards = await readRepoJson("templates/genre-golden-standards.json");
  assert.equal(goldenStandards.schema_version, 1);
  assert.deepEqual(Object.keys(goldenStandards.genres).sort(), ["dushi", "history", "romance", "scifi", "suspense", "xuanhuan"]);
  assert.equal(goldenStandards.genres.xuanhuan.minimum_thresholds.immersion, 3.5);
  assert.equal(goldenStandards.genres.suspense.minimum_thresholds.plot_logic, 4.0);
  assert.equal(goldenStandards.genres.romance.minimum_thresholds.character, 4.0);
  assert.equal(goldenStandards.genres.romance.minimum_thresholds.style_naturalness, 3.5);
  assert.ok(
    goldenStandards.invalid_combinations.some(
      (item: any) => item.genre === "romance" && item.platform === "qidian"
    )
  );
  assert.ok(
    goldenStandards.invalid_combinations.some(
      (item: any) => item.genre === "xuanhuan" && item.platform === "jinjiang"
    )
  );
});

test("buildInstructionPacket injects selected genre excitement map and genre standards", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-genre-map-"));
  try {
    await seedGenreAwareProject(rootDir);

    const volumePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeVolumeCheckpoint(),
      step: { kind: "volume", phase: "outline" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(volumePacket.packet.manifest.inline.genre_excitement_map, {
      genre: "romance",
      chapters: { "1": "setup", "2": "reveal", "3": "reversal" },
      source: "genre-excitement-map.json"
    });

    const judgePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(2),
      step: { kind: "chapter", chapter: 2, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.deepEqual(judgePacket.packet.manifest.inline.genre_golden_standards, {
      genre: "romance",
      focus_dimensions: ["character", "style_naturalness", "emotional_impact"],
      criteria: [
        "人物性格与关系张力要通过动作、对白和情绪反应落地，不能只靠旁白概括。",
        "CP 化学反应、情绪钩子或关系预期必须在前三章站住。"
      ],
      minimum_thresholds: { character: 4, style_naturalness: 3.5 },
      source: "genre-golden-standards.json"
    });

    const quickstartResultsPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeQuickstartCheckpoint(),
      step: { kind: "quickstart", phase: "results" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;

    assert.equal((quickstartResultsPacket.packet.manifest.inline.genre_golden_standards as any).genre, "romance");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket accepts supported brief genre formats and aliases", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-genre-map-brief-"));
  try {
    await seedGenreAwareProject(rootDir);

    const cases = [
      { genreLine: "- **题材**：言情", expectedGenre: "romance" },
      { genreLine: "- **题材**: 言情（女频）", expectedGenre: "romance" },
      { genreLine: "- **Genre**: romance", expectedGenre: "romance" },
      { genreLine: "- **Genre**:   SUSPENSE  ", expectedGenre: "suspense" },
      { genreLine: "- **Genre**: Sci-Fi", expectedGenre: "scifi" }
    ] as const;

    for (const testCase of cases) {
      await writeText(
        join(rootDir, "brief.md"),
        [
          "# 创作纲领",
          "",
          "## 基本信息",
          "",
          testCase.genreLine,
          "- **目标平台**：晋江",
          ""
        ].join("\n")
      );

      const volumePacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeVolumeCheckpoint(),
        step: { kind: "volume", phase: "outline" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal((volumePacket.packet.manifest.inline.genre_excitement_map as any).genre, testCase.expectedGenre, testCase.genreLine);

      const judgePacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeJudgeCheckpoint(2),
        step: { kind: "chapter", chapter: 2, stage: "judge" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal((judgePacket.packet.manifest.inline.genre_golden_standards as any).genre, testCase.expectedGenre, testCase.genreLine);

      const quickstartPacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeQuickstartCheckpoint(),
        step: { kind: "quickstart", phase: "results" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal((quickstartPacket.packet.manifest.inline.genre_golden_standards as any).genre, testCase.expectedGenre, testCase.genreLine);
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket skips genre-specific injections when templates are missing, malformed, or genre is unknown", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-genre-map-skip-"));
  try {
    await seedGenreAwareProject(rootDir, "- **题材**：仙侠");

    const unknownGenreVolume = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeVolumeCheckpoint(),
      step: { kind: "volume", phase: "outline" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(unknownGenreVolume.packet.manifest.inline, "genre_excitement_map"), false);

    const unknownGenreJudge = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(2),
      step: { kind: "chapter", chapter: 2, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(unknownGenreJudge.packet.manifest.inline, "genre_golden_standards"), false);

    await seedGenreAwareProject(rootDir);
    await rm(join(rootDir, "genre-excitement-map.json"), { force: true });
    await rm(join(rootDir, "genre-golden-standards.json"), { force: true });

    const missingTemplateVolume = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeVolumeCheckpoint(),
      step: { kind: "volume", phase: "outline" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(missingTemplateVolume.packet.manifest.inline, "genre_excitement_map"), false);

    const chapterFourJudge = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeJudgeCheckpoint(4),
      step: { kind: "chapter", chapter: 4, stage: "judge" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(chapterFourJudge.packet.manifest.inline, "genre_golden_standards"), false);

    const lateVolumePacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeVolumeCheckpoint(3),
      step: { kind: "volume", phase: "outline" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(lateVolumePacket.packet.manifest.inline, "genre_excitement_map"), false);

    const lateQuickstartPacket = (await buildInstructionPacket({
      rootDir,
      checkpoint: makeQuickstartCheckpoint(3),
      step: { kind: "quickstart", phase: "results" },
      embedMode: null,
      writeManifest: false
    })) as PacketResult;
    assert.equal(Object.prototype.hasOwnProperty.call(lateQuickstartPacket.packet.manifest.inline, "genre_golden_standards"), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("buildInstructionPacket quietly skips malformed optional genre templates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-genre-map-malformed-"));
  try {
    await seedGenreAwareProject(rootDir);

    const malformedCases = [
      {
        name: "invalid JSON files",
        mutate: async () => {
          await writeText(join(rootDir, "genre-excitement-map.json"), "{\n");
          await writeText(join(rootDir, "genre-golden-standards.json"), "{\n");
        }
      },
      {
        name: "wrong schema_version",
        mutate: async () => {
          const excitementMap = await readRepoJson("templates/genre-excitement-map.json");
          const goldenStandards = await readRepoJson("templates/genre-golden-standards.json");
          excitementMap.schema_version = 2;
          goldenStandards.schema_version = 2;
          await writeJson(join(rootDir, "genre-excitement-map.json"), excitementMap);
          await writeJson(join(rootDir, "genre-golden-standards.json"), goldenStandards);
        }
      },
      {
        name: "malformed entry shapes and unknown dimensions",
        mutate: async () => {
          const excitementMap = await readRepoJson("templates/genre-excitement-map.json");
          const goldenStandards = await readRepoJson("templates/genre-golden-standards.json");
          excitementMap.genres.romance = { chapters: { "1": "setup", "2": "boom", "3": "reversal" } };
          goldenStandards.genres.romance = {
            focus_dimensions: ["styleNaturalness"],
            criteria: ["x"],
            minimum_thresholds: { styleNaturalness: 3.5 }
          };
          await writeJson(join(rootDir, "genre-excitement-map.json"), excitementMap);
          await writeJson(join(rootDir, "genre-golden-standards.json"), goldenStandards);
        }
      }
    ] as const;

    for (const malformedCase of malformedCases) {
      await malformedCase.mutate();

      const volumePacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeVolumeCheckpoint(),
        step: { kind: "volume", phase: "outline" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal(Object.prototype.hasOwnProperty.call(volumePacket.packet.manifest.inline, "genre_excitement_map"), false, malformedCase.name);

      const judgePacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeJudgeCheckpoint(2),
        step: { kind: "chapter", chapter: 2, stage: "judge" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal(Object.prototype.hasOwnProperty.call(judgePacket.packet.manifest.inline, "genre_golden_standards"), false, malformedCase.name);

      const quickstartPacket = (await buildInstructionPacket({
        rootDir,
        checkpoint: makeQuickstartCheckpoint(),
        step: { kind: "quickstart", phase: "results" },
        embedMode: null,
        writeManifest: false
      })) as PacketResult;
      assert.equal(Object.prototype.hasOwnProperty.call(quickstartPacket.packet.manifest.inline, "genre_golden_standards"), false, malformedCase.name);

      await seedGenreAwareProject(rootDir);
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
