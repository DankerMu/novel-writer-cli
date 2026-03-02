import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import type { Checkpoint } from "../checkpoint.js";
import { buildInstructionPacket } from "../instructions.js";
import { computeNextStep } from "../next-step.js";

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makePlatformProfileRaw(extra: Record<string, unknown>): Record<string, unknown> {
  return {
    schema_version: 1,
    platform: "qidian",
    created_at: "2026-01-01T00:00:00Z",
    word_count: { target_min: 1, target_max: 2, hard_min: 1, hard_max: 2 },
    hook_policy: { required: false, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 0, max_unknown_entities_per_chapter: 0, max_new_terms_per_1k_words: 0 },
    compliance: { banned_words: [], duplicate_name_policy: "warn" },
    ...extra
  };
}

async function setupProjectDir(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-prejudge-guardrails-"));
  await writeJson(join(rootDir, ".checkpoint.json"), { last_completed_chapter: 0, current_volume: 1, pipeline_stage: null, inflight_chapter: null });
  return rootDir;
}

test("computeNextStep returns review when naming lint has blocking issues", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:prejudge_guardrails_blocking:naming_lint");
});

test("computeNextStep returns review when readability lint has blocking issues (deterministic script)", async () => {
  const rootDir = await setupProjectDir();
  await mkdir(join(rootDir, "scripts"), { recursive: true });

  const stubJson =
    '{"schema_version":1,"generated_at":"2026-01-01T00:00:00.000Z","scope":{"chapter":1},"policy":{"enabled":true,"max_paragraph_chars":10,"max_consecutive_exposition_paragraphs":2,"blocking_severity":"hard_only"},"issues":[{"id":"readability.mobile.overlong_paragraph","severity":"hard","summary":"Hard issue blocks."}]}';
  const stubScript = `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' '${stubJson}'\n`;
  await writeFile(join(rootDir, "scripts/lint-readability.sh"), stubScript, "utf8");

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      compliance: { banned_words: [], duplicate_name_policy: "warn", script_paths: { lint_readability: "scripts/lint-readability.sh" } },
      retention: null,
      readability: { mobile: { enabled: true, max_paragraph_chars: 10, max_consecutive_exposition_paragraphs: 2, blocking_severity: "hard_only" } },
      naming: null
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:prejudge_guardrails_blocking:readability_lint");
});

test("buildInstructionPacket (judge) includes prejudge guardrails report path and writes the report file", async () => {
  const rootDir = await setupProjectDir();
  await mkdir(join(rootDir, "scripts"), { recursive: true });

  const stubJson =
    '{"schema_version":1,"generated_at":"2026-01-01T00:00:00.000Z","scope":{"chapter":1},"policy":{"enabled":true,"max_paragraph_chars":10,"max_consecutive_exposition_paragraphs":2,"blocking_severity":"hard_only"},"issues":[]}';
  const stubScript = `#!/usr/bin/env bash\nset -euo pipefail\nprintf '%s\\n' '${stubJson}'\n`;
  await writeFile(join(rootDir, "scripts/lint-readability.sh"), stubScript, "utf8");

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      compliance: { banned_words: [], duplicate_name_policy: "warn", script_paths: { lint_readability: "scripts/lint-readability.sh" } },
      retention: null,
      readability: { mobile: { enabled: true, max_paragraph_chars: 10, max_consecutive_exposition_paragraphs: 2, blocking_severity: "hard_only" } },
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/state"), { recursive: true });
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), {});

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  const built = await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  });

  const packet = (built as { packet: any }).packet;
  const guardrailRel = packet?.manifest?.paths?.prejudge_guardrails;
  assert.equal(typeof guardrailRel, "string");

  const reportRaw = JSON.parse(await readFile(join(rootDir, guardrailRel), "utf8")) as unknown;
  assert.equal((reportRaw as any).schema_version, 2);
  assert.equal((reportRaw as any).scope?.chapter, 1);
  assert.equal((reportRaw as any).dependencies?.characters_active?.rel_path, "characters/active");
  assert.equal(typeof (reportRaw as any).dependencies?.characters_active?.fingerprint, "string");
  assert.equal((reportRaw as any).readability_lint?.schema_version, 1);

  const inlineRef = packet?.manifest?.inline?.prejudge_guardrails?.report_path;
  assert.equal(inlineRef, guardrailRel);
});

test("computeNextStep returns review on refined stage when naming lint blocks", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "refined:prejudge_guardrails_blocking:naming_lint");
});

test("computeNextStep returns draft (not crash) when judged but staging chapter is missing", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: null
    })
  );

  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:draft");
  assert.equal(next.reason, "judged:missing_chapter");
});

test("computeNextStep tolerates invalid cached prejudge guardrails JSON (recomputes)", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  await mkdir(join(rootDir, "staging/guardrails"), { recursive: true });
  await writeFile(join(rootDir, "staging/guardrails/prejudge-guardrails-chapter-001.json"), "{not-json", "utf8");

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:prejudge_guardrails_blocking:naming_lint");
});

test("computeNextStep does not use cached report when platform profile changes (fingerprint invalidation)", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  // Generate and persist a cached guardrails report via judge instructions.
  const checkpointRefined: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  await buildInstructionPacket({
    rootDir,
    checkpoint: checkpointRefined,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  });

  // Now change platform profile to disable naming (cached report should be ignored).
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ retention: null, readability: null, naming: null }));

  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  const checkpointJudged: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpointJudged);
  assert.equal(next.step, "chapter:001:commit");
});

test("computeNextStep uses cached prejudge guardrails report when fresh", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/state"), { recursive: true });
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), {});

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  // Generate and persist a cached guardrails report via judge instructions.
  const checkpointRefined: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  await buildInstructionPacket({
    rootDir,
    checkpoint: checkpointRefined,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  });

  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  const checkpointJudged: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpointJudged);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:prejudge_guardrails_blocking:naming_lint");
  assert.equal((next.evidence as any)?.prejudge_guardrails?.cache?.status, "hit");
});

test("computeNextStep ignores cached guardrails report when characters change", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/state"), { recursive: true });
  await writeJson(join(rootDir, "staging/state/chapter-001-crossref.json"), {});
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  await mkdir(join(rootDir, "characters/active"), { recursive: true });
  await writeJson(join(rootDir, "characters/active/a.json"), { id: "a", display_name: "张三", aliases: [] });
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "张三", aliases: [] });

  // Generate cached report with a blocking duplicate.
  const checkpointRefined: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  await buildInstructionPacket({
    rootDir,
    checkpoint: checkpointRefined,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  });

  // Fix the duplicate by renaming a character; cache must be ignored.
  await writeJson(join(rootDir, "characters/active/b.json"), { id: "b", display_name: "李四", aliases: [] });

  const checkpointJudged: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpointJudged);
  assert.equal(next.step, "chapter:001:commit");
});

test("computeNextStep returns review when guardrails computation errors", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ retention: null, readability: null, naming: null }));

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  // Make chapter path a directory to trigger EISDIR read error.
  await mkdir(join(rootDir, "staging/chapters/chapter-001.md"), { recursive: true });
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), { chapter: 1, overall: 4, recommendation: "pass" });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "judged", inflight_chapter: 1 };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
  assert.equal(next.reason, "judged:prejudge_guardrails_error");
});

test("buildInstructionPacket (judge) sets prejudge_guardrails_degraded when report compute fails", async () => {
  const rootDir = await setupProjectDir();

  await writeJson(
    join(rootDir, "platform-profile.json"),
    makePlatformProfileRaw({
      retention: null,
      readability: null,
      naming: { enabled: true, near_duplicate_threshold: 0.9, blocking_conflict_types: ["duplicate"], exemptions: {} }
    })
  );

  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  // Intentionally create a directory at the chapter path to trigger fingerprint/read failure.
  await mkdir(join(rootDir, "staging/chapters/chapter-001.md"), { recursive: true });

  const checkpoint: Checkpoint = { last_completed_chapter: 0, current_volume: 1, pipeline_stage: "refined", inflight_chapter: 1 };
  const built = await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  });

  const packet = (built as { packet: any }).packet;
  assert.equal(packet?.manifest?.inline?.prejudge_guardrails, null);
  assert.equal(packet?.manifest?.inline?.prejudge_guardrails_degraded, true);
  assert.equal(packet?.manifest?.paths?.prejudge_guardrails, undefined);
});
