import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateStep } from "../validate.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function writeCommittedMiniPlanning(rootDir: string): Promise<void> {
  await writeText(
    join(rootDir, "volumes/vol-01/outline.md"),
    [
      "## 第 1 卷大纲",
      "",
      "### 第 1 章: 开端",
      "- **Storyline**: main-arc",
      "- **POV**: hero",
      "- **Location**: village",
      "- **Conflict**: 离乡试炼",
      "- **Arc**: 踏出第一步",
      "- **Foreshadowing**: seed-1",
      "- **StateChanges**: Hero 离开村庄",
      "- **TransitionHint**: 继续前往外城",
      "- **ExcitementType**: setup",
      "",
      "### 第 2 章: 入城",
      "- **Storyline**: main-arc",
      "- **POV**: hero",
      "- **Location**: outer-city",
      "- **Conflict**: 初次受挫",
      "- **Arc**: 认清差距",
      "- **Foreshadowing**: seed-1 触发",
      "- **StateChanges**: Hero 进入外城",
      "- **TransitionHint**: 目睹异常征兆",
      "- **ExcitementType**: reveal",
      "",
      "### 第 3 章: 异兆",
      "- **Storyline**: main-arc",
      "- **POV**: hero",
      "- **Location**: academy-gate",
      "- **Conflict**: 秘密现身",
      "- **Arc**: 决定追查",
      "- **Foreshadowing**: seed-2",
      "- **StateChanges**: Hero 站到学院门前",
      "- **TransitionHint**: 进入正式剧情",
      "- **ExcitementType**: cliffhanger",
      ""
    ].join("\n")
  );
  await writeJson(join(rootDir, "volumes/vol-01/storyline-schedule.json"), { active_storylines: ["main-arc"] });
  await writeJson(join(rootDir, "volumes/vol-01/foreshadowing.json"), { schema_version: 1, items: [{ id: "seed-1" }] });
  await writeJson(join(rootDir, "volumes/vol-01/new-characters.json"), []);
  for (const chapter of [1, 2, 3]) {
    await writeJson(join(rootDir, `volumes/vol-01/chapter-contracts/chapter-${String(chapter).padStart(3, "0")}.json`), {
      chapter,
      storyline_id: "main-arc",
      objectives: [{ id: `OBJ-${chapter}-1`, required: true, description: `推进第 ${chapter} 章` }],
      preconditions: { character_states: { Hero: { location: chapter === 1 ? "village" : chapter === 2 ? "outer-city" : "academy-gate" } } },
      postconditions: { state_changes: { Hero: { location: chapter === 1 ? "outer-city" : chapter === 2 ? "academy-gate" : "academy-gate" } } },
      acceptance_criteria: ["required objective 落地"]
    });
  }
}

test("validateStep(quickstart:characters) requires rules.json", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-characters-"));

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "characters" }
      }),
    /Missing required file: staging\/quickstart\/rules\.json/
  );
});

test("validateStep(quickstart:style) requires contracts dir", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-style-"));
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "style" }
      }),
    /Missing required file: staging\/quickstart\/contracts/
  );
});

test("validateStep(quickstart:characters) rejects empty contracts dir", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-empty-contracts-"));
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await mkdir(join(rootDir, "staging/quickstart/contracts"), { recursive: true });

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "characters" }
      }),
    /expected at least 1 \*\.json contract file/
  );
});

test("validateStep(quickstart:style) rejects invalid style source_type", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-invalid-style-"));
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "banana" });

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "style" }
      }),
    /Invalid staging\/quickstart\/style-profile\.json: source_type must be one of:/
  );
});

test("validateStep(quickstart:trial) requires style-profile.json", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-trial-"));
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "trial" }
      }),
    /Missing required file: staging\/quickstart\/style-profile\.json/
  );
});

test("validateStep(quickstart:trial) rejects empty trial chapter", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-validate-quickstart-empty-trial-"));
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeCommittedMiniPlanning(rootDir);
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), "");

  await assert.rejects(
    () =>
      validateStep({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "QUICK_START" as const },
        step: { kind: "quickstart", phase: "trial" }
      }),
    /Empty draft file: staging\/quickstart\/trial-chapter\.md/
  );
});
