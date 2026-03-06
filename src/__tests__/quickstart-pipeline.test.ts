import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { advanceCheckpointForStep } from "../advance.js";
import { readCheckpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";
import { computeNextStep } from "../next-step.js";

import { writeCommittedMiniPlanning } from "./helpers/quickstart-mini-planning.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

async function pathExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}



test("advance quickstart:world transitions INIT -> QUICK_START", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-init-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), {
    rules: [
      {
        id: "W-001",
        category: "magic_system",
        rule: "力量体系上限为九阶。",
        constraint_type: "hard",
        exceptions: [],
        introduced_chapter: null,
        last_verified: null
      }
    ]
  });

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "world" } });
  assert.equal(updated.orchestrator_state, "QUICK_START");
  assert.equal(updated.quickstart_phase, "world");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "QUICK_START");
  assert.equal(checkpoint.quickstart_phase, "world");
});

test("advance quickstart:characters writes quickstart_phase correctly", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-characters-advance-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "characters" } });
  assert.equal(updated.orchestrator_state, "QUICK_START");
  assert.equal(updated.quickstart_phase, "characters");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "QUICK_START");
  assert.equal(checkpoint.quickstart_phase, "characters");
});

test("advance quickstart:style writes quickstart_phase correctly", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-style-advance-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "style" } });
  assert.equal(updated.orchestrator_state, "QUICK_START");
  assert.equal(updated.quickstart_phase, "style");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "QUICK_START");
  assert.equal(checkpoint.quickstart_phase, "style");
});

test("advance quickstart:trial writes quickstart_phase correctly", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-trial-advance-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeCommittedMiniPlanning(rootDir);
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), "# Trial\n\nText\n");

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "trial" } });
  assert.equal(updated.orchestrator_state, "QUICK_START");
  assert.equal(updated.quickstart_phase, "trial");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.orchestrator_state, "QUICK_START");
  assert.equal(checkpoint.quickstart_phase, "trial");
});

test("advance quickstart:trial requires committed mini-planning artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-trial-requires-f0-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), "# Trial\n\nText\n");

  await assert.rejects(
    () => advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "trial" } }),
    /Missing committed quickstart mini-planning artifacts/
  );
});

test("advance quickstart rejects wrong orchestrator_state", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-advance-wrong-state-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: null,
    inflight_chapter: null
  });

  await assert.rejects(
    () => advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "world" } }),
    /Cannot advance quickstart:world unless orchestrator_state=INIT or QUICK_START/
  );
});

test("computeNextStep recovers quickstart phase from staging artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-resume-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null
  });

  // No artifacts yet → world
  let next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:world");

  // rules.json present → characters
  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:characters");

  // contracts dir + one contract → style
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:style");

  // style profile present → f0
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:f0");

  // committed mini-planning artifacts present → trial
  await writeCommittedMiniPlanning(rootDir);
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:trial");

  // trial chapter present → results
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), `# 试写章

（测试）
`);
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:results");
  assert.equal(next.reason, "quickstart:results");

  // evaluation present → results (ready to advance/commit)
  await writeJson(join(rootDir, "staging/quickstart/evaluation.json"), { overall: 4.2, recommendation: "pass" });
  next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:results");
  assert.equal(next.reason, "quickstart:results:artifacts_present");
});

test("computeNextStep allows redoing current quickstart phase when artifacts are missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-recover-checkpoint-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "world"
  });

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:world");
  assert.equal(next.reason, "quickstart:world");
});

test("computeNextStep blocks quickstart rollback when quickstart_phase=characters but world artifacts are missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-recover-characters-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "characters"
  });

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:world");
  assert.match(next.reason, /quickstart:recovery_blocked/);
  assert.equal((next.evidence as any).recovery_blocked.checkpoint_phase, "characters");
  assert.equal((next.evidence as any).recovery_blocked.inferred_phase, "world");
  assert.equal((next.evidence as any).recovery_blocked.expected_path, "staging/quickstart/rules.json");
});

test("computeNextStep allows redoing style phase when style profile is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-recover-style-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "style"
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:style");
  assert.equal(next.reason, "quickstart:style");
});

test("computeNextStep falls back to f0 when trial phase is missing committed mini-planning artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-recover-trial-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "trial"
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:f0");
  assert.match(next.reason, /quickstart:recovery_blocked/);
  assert.equal((next.evidence as any).recovery_blocked.checkpoint_phase, "trial");
  assert.equal((next.evidence as any).recovery_blocked.expected_path, "volumes/vol-01/outline.md");
});

test("computeNextStep continues forward into f0 when checkpoint quickstart_phase is consistent with style artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-recover-happy-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "style"
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:f0");
  assert.equal(next.reason, "quickstart:f0");
  assert.equal((next.evidence as any).recovery_blocked ?? null, null);
});

test("computeNextStep resumes from quickstart_phase=f0 into trial when mini-planning is committed", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-resume-f0-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "f0"
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeCommittedMiniPlanning(rootDir);

  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "quickstart:trial");
  assert.equal(next.reason, "quickstart:trial");
  assert.equal((next.evidence as any).recovery_blocked ?? null, null);
});

test("buildInstructionPacket (quickstart) includes NOVEL_ASK gate when provided", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-novel-ask-"));

  const questionSpec = {
    version: 1,
    topic: "quickstart_gate",
    questions: [
      {
        id: "genre",
        header: "Genre",
        question: "Pick a genre.",
        kind: "single_choice",
        required: true,
        options: [{ label: "xuanhuan", description: "玄幻" }]
      }
    ]
  };
  const answerPath = "staging/novel-ask/quickstart.json";

  const built = (await buildInstructionPacket({
    rootDir,
    checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "INIT" as const },
    step: { kind: "quickstart", phase: "world" },
    embedMode: null,
    writeManifest: false,
    novelAskGate: { novel_ask: questionSpec as any, answer_path: answerPath }
  })) as any;

  assert.equal(built.packet.step, "quickstart:world");
  assert.equal(built.packet.answer_path, answerPath);
  assert.equal(built.packet.novel_ask.topic, questionSpec.topic);
  assert.equal(built.packet.expected_outputs[0].path, answerPath);
});

test("advance quickstart:results requires committed mini-planning artifacts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-results-requires-f0-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    volume_pipeline_stage: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), { rules: [] });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), `# 试写章

（测试）
`);
  await writeJson(join(rootDir, "staging/quickstart/evaluation.json"), { overall: 4.2, recommendation: "pass" });

  await assert.rejects(
    () => advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "results" } }),
    /Missing committed quickstart mini-planning artifacts/
  );
});

test("advance quickstart:results commits artifacts and transitions to VOL_PLANNING", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-commit-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    volume_pipeline_stage: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), {
    rules: [
      {
        id: "W-001",
        category: "magic_system",
        rule: "力量体系上限为九阶。",
        constraint_type: "hard",
        exceptions: [],
        introduced_chapter: null,
        last_verified: null
      }
    ]
  });
  await writeJson(join(rootDir, "staging/quickstart/contracts/hero.json"), { id: "hero", display_name: "阿宁", contracts: [] });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeCommittedMiniPlanning(rootDir);
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), `# 试写章\n\n（测试）\n`);
  await writeJson(join(rootDir, "staging/quickstart/evaluation.json"), { overall: 4.2, recommendation: "pass" });

  const updated = await advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "results" } });
  assert.equal(updated.orchestrator_state, "VOL_PLANNING");
  assert.equal(updated.volume_pipeline_stage, null);
  assert.equal(updated.quickstart_phase ?? null, null);

  // Staging quickstart cleared
  assert.equal(await pathExists(join(rootDir, "staging/quickstart")), false);

  // Final artifacts exist
  assert.equal(await pathExists(join(rootDir, "world/rules.json")), true);
  assert.equal(await pathExists(join(rootDir, "style-profile.json")), true);
  assert.equal(await pathExists(join(rootDir, "characters/active/hero.json")), true);
  assert.equal(await pathExists(join(rootDir, "logs/quickstart/trial-chapter.md")), true);
  assert.equal(await pathExists(join(rootDir, "logs/quickstart/evaluation.json")), true);

  // Pipeline now in volume planning and should not re-enter quickstart.
  const next = await computeNextStep(rootDir, await readCheckpoint(rootDir));
  assert.equal(next.step, "volume:outline");
});

test("advance quickstart:results validates all contracts (not just a slice)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-quickstart-contracts-all-"));

  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    volume_pipeline_stage: null
  });

  await writeJson(join(rootDir, "staging/quickstart/rules.json"), {
    rules: [
      {
        id: "W-001",
        category: "magic_system",
        rule: "力量体系上限为九阶。",
        constraint_type: "hard",
        exceptions: [],
        introduced_chapter: null,
        last_verified: null
      }
    ]
  });
  await writeJson(join(rootDir, "staging/quickstart/style-profile.json"), { source_type: "template" });
  await writeCommittedMiniPlanning(rootDir);
  await writeText(join(rootDir, "staging/quickstart/trial-chapter.md"), `# 试写章\n\n（测试）\n`);
  await writeJson(join(rootDir, "staging/quickstart/evaluation.json"), { overall: 4.2, recommendation: "pass" });

  for (let i = 1; i <= 10; i++) {
    const id = String(i).padStart(2, "0");
    await writeJson(join(rootDir, `staging/quickstart/contracts/contract-${id}.json`), { id: `c-${id}`, display_name: `角色${id}`, contracts: [] });
  }
  // 11th contract is invalid: validate:results must still catch it.
  await writeJson(join(rootDir, "staging/quickstart/contracts/contract-11.json"), []);

  await assert.rejects(
    () => advanceCheckpointForStep({ rootDir, step: { kind: "quickstart", phase: "results" } }),
    /Invalid contract JSON/
  );
});
