import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { validateStep } from "../validate.js";

import { writeCommittedMiniPlanning } from "./helpers/quickstart-mini-planning.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
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
