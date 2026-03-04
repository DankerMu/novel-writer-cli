import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import type { Checkpoint } from "../checkpoint.js";
import { advanceCheckpointForStep } from "../advance.js";
import { buildInstructionPacket } from "../instructions.js";
import { computeNextStep } from "../next-step.js";
import { titleFixSnapshotRel } from "../steps.js";
import { validateStep } from "../validate.js";

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function makePlatformProfileRaw(args: { enabled: boolean; auto_fix: boolean; max_chars?: number }): Record<string, unknown> {
  const max_chars = args.max_chars ?? 10;
  return {
    schema_version: 1,
    platform: "qidian",
    created_at: "2026-01-01T00:00:00Z",
    word_count: { target_min: 1, target_max: 2, hard_min: 1, hard_max: 2 },
    hook_policy: { required: false, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 0, max_unknown_entities_per_chapter: 0, max_new_terms_per_1k_words: 0 },
    compliance: { banned_words: [], duplicate_name_policy: "warn" },
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    retention: args.enabled
      ? {
          title_policy: {
            enabled: true,
            min_chars: 2,
            max_chars,
            forbidden_patterns: [],
            auto_fix: args.auto_fix
          },
          hook_ledger: {
            enabled: false,
            fulfillment_window_chapters: 10,
            diversity_window_chapters: 5,
            max_same_type_streak: 2,
            min_distinct_types_in_window: 2,
            overdue_policy: "warn"
          }
        }
      : null
  };
}

async function setupProjectDir(): Promise<string> {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-next-title-fix-"));
  await writeJson(join(rootDir, ".checkpoint.json"), { last_completed_chapter: 0, current_volume: 1, pipeline_stage: null, inflight_chapter: null });
  return rootDir;
}

test("computeNextStep returns title-fix on hard title violations when auto_fix=true", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 0
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:title-fix");
});

test("computeNextStep returns review after title-fix was already attempted", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 1
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
});

test("computeNextStep returns review on hard title violations when auto_fix=false", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: false }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 0
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:review");
});

test("computeNextStep does not block on warn-only title issues when auto_fix=false", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: false, max_chars: 3 }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 太长的标题\n正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 0
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:judge");
});

test("computeNextStep returns title-fix on warn-only title issues when auto_fix=true", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true, max_chars: 3 }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "# 太长的标题\n正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 0
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:title-fix");
});

test("computeNextStep returns title-fix on judged stage when eval exists and title violates policy (auto_fix=true)", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  await writeFile(join(rootDir, "staging/chapters/chapter-001.md"), "正文\n", "utf8");
  await mkdir(join(rootDir, "staging/evaluations"), { recursive: true });
  await writeJson(join(rootDir, "staging/evaluations/chapter-001-eval.json"), {});

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "judged",
    inflight_chapter: 1,
    title_fix_count: 0
  };
  const next = await computeNextStep(rootDir, checkpoint);
  assert.equal(next.step, "chapter:001:title-fix");
});

test("title-fix snapshot is write-once (rerunning instructions does not bypass body guard)", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  const chapterAbs = join(rootDir, "staging/chapters/chapter-001.md");
  await writeFile(chapterAbs, "# 标题\n正文\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: "refined",
    inflight_chapter: 1,
    title_fix_count: 0
  };

  await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "title-fix" },
    embedMode: null,
    writeManifest: false
  });

  const snapshotRel = titleFixSnapshotRel(1);
  const snapshotAbs = join(rootDir, snapshotRel);
  const snapshot1 = await readFile(snapshotAbs, "utf8");

  // Illegal edit: body changed.
  await writeFile(chapterAbs, "# 标题\n正文改了\n", "utf8");

  // Re-run instructions (snapshot must not be overwritten).
  await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "title-fix" },
    embedMode: null,
    writeManifest: false
  });
  const snapshot2 = await readFile(snapshotAbs, "utf8");
  assert.equal(snapshot2, snapshot1);

  await assert.rejects(
    () => validateStep({ rootDir, checkpoint, step: { kind: "chapter", chapter: 1, stage: "title-fix" } }),
    /chapter body changed/i
  );
});

test("advance draft cleans up title-fix snapshot to avoid stale reuse", async () => {
  const rootDir = await setupProjectDir();
  await writeJson(join(rootDir, "platform-profile.json"), makePlatformProfileRaw({ enabled: true, auto_fix: true }));
  await mkdir(join(rootDir, "staging/chapters"), { recursive: true });
  const chapterAbs = join(rootDir, "staging/chapters/chapter-001.md");
  await writeFile(chapterAbs, "# 标题\n正文\n", "utf8");
  await mkdir(join(rootDir, "staging/logs"), { recursive: true });
  const snapshotRel = titleFixSnapshotRel(1);
  await writeFile(join(rootDir, snapshotRel), "old snapshot\n", "utf8");

  const checkpoint: Checkpoint = {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "WRITING",
    pipeline_stage: null,
    inflight_chapter: null,
    title_fix_count: 1
  };
  await writeJson(join(rootDir, ".checkpoint.json"), checkpoint);

  await advanceCheckpointForStep({ rootDir, step: { kind: "chapter", chapter: 1, stage: "draft" } });
  // validate cleanup is best-effort; the file should be gone.
  await assert.rejects(() => readFile(join(rootDir, snapshotRel), "utf8"));
});
