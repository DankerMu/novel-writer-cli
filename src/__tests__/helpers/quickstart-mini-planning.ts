import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

export async function writeCommittedMiniPlanning(rootDir: string): Promise<void> {
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
