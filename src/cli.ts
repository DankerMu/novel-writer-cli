#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { realpathSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  buildCharacterVoiceProfiles,
  clearCharacterVoiceDriftFile,
  computeCharacterVoiceDrift,
  loadActiveCharacterVoiceDriftIds,
  loadCharacterVoiceProfiles,
  writeCharacterVoiceDriftFile,
  writeCharacterVoiceProfilesFile
} from "./character-voice.js";
import { NovelCliError } from "./errors.js";
import { errJson, okJson, printJson } from "./output.js";
import { pathExists, readJsonFile, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { resolveProjectRoot } from "./project.js";
import { readCheckpoint, writeCheckpoint } from "./checkpoint.js";
import { initProject, normalizePlatformId, resolveInitRootDir } from "./init.js";
import { advanceCheckpointForStep } from "./advance.js";
import { commitChapter } from "./commit.js";
import { commitVolume } from "./volume-commit.js";
import { buildInstructionPacket } from "./instructions.js";
import { getLockStatus, clearStaleLock, withWriteLock } from "./lock.js";
import { computeNextStep } from "./next-step.js";
import { computeEngagementReport, loadEngagementMetricsStream, writeEngagementLogs } from "./engagement.js";
import { parseNovelAskQuestionSpec, type NovelAskQuestionSpec } from "./novel-ask.js";
import { computePromiseLedgerReport, ensurePromiseLedgerInitialized, loadPromiseLedger, writePromiseLedgerLogs } from "./promise-ledger.js";
import { pad2, pad3, parseStepId } from "./steps.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { isPlainObject } from "./type-guards.js";
import { validateStep } from "./validate.js";
import { VOL_REVIEW_RELS, collectVolumeData, computeBridgeCheck, computeForeshadowingAudit, computeStorylineRhythm } from "./volume-review.js";
import { tryResolveVolumeChapterRange } from "./consistency-auditor.js";

type GlobalOpts = {
  json?: boolean;
  project?: string;
};

function detectCommandName(argv: string[]): string {
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!;
    if (token === "--") return "unknown";

    // Global option: consumes the next token as a value.
    if (token === "--project") {
      i++;
      continue;
    }
    if (token.startsWith("--project=")) continue;

    if (!token.startsWith("-")) return token;
  }
  return "unknown";
}

function isJsonMode(argv: string[]): boolean {
  return argv.includes("--json");
}

function buildProgram(argv: string[]): Command {
  const jsonMode = isJsonMode(argv);

  const program = new Command();
  program.name("novel").description("Executor-agnostic novel orchestration CLI.");
  program.option("--json", "Emit machine-readable JSON (single object).");
  program.option("--project <dir>", "Project root directory (defaults to auto-detect via .checkpoint.json).");

  program.configureOutput({
    writeOut: (str) => process.stdout.write(str),
    writeErr: (str) => {
      if (!jsonMode) process.stderr.write(str);
    }
  });

  program.showHelpAfterError(false);
  program.showSuggestionAfterError(false);
  program.exitOverride();

  program
    .command("init")
    .description("Initialize a new novel project directory (.checkpoint.json + staging/** + optional templates).")
    .option("--force", "Overwrite existing files when present.")
    .option("--minimal", "Only create .checkpoint.json + staging/** (skip templates).")
    .option("--platform <id>", "Also write platform-profile.json (+ genre-weight-profiles.json). Supported: qidian|tomato.")
    .action(async (localOpts: { force?: boolean; minimal?: boolean; platform?: string }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = resolveInitRootDir({ cwd: process.cwd(), projectOverride: opts.project });
      const platform = localOpts.platform ? normalizePlatformId(localOpts.platform) : undefined;
      const result = await initProject({
        rootDir,
        force: Boolean(localOpts.force),
        minimal: Boolean(localOpts.minimal),
        platform
      });

      if (json) {
        printJson(okJson("init", result));
        return;
      }

      process.stdout.write(`Project: ${rootDir}\n`);
      for (const d of result.ensuredDirs) process.stdout.write(`MKDIR ${d}\n`);
      for (const p of result.created) process.stdout.write(`CREATE ${p}\n`);
      for (const p of result.overwritten) process.stdout.write(`OVERWRITE ${p}\n`);
      for (const p of result.skipped) process.stdout.write(`SKIP ${p}\n`);
      process.stdout.write(`Next: novel next\n`);
    });

  program
    .command("status")
    .description("Show project status (checkpoint, locks, next action).")
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);
      const lock = await getLockStatus(rootDir);
      const next = await computeNextStep(rootDir, checkpoint);

      const data = { rootDir, checkpoint, lock, next };
      if (json) {
        printJson(okJson("status", data));
        return;
      }

      process.stdout.write(`Project: ${rootDir}\n`);
      process.stdout.write(
        `Checkpoint: state=${checkpoint.orchestrator_state} chapter=${checkpoint.last_completed_chapter} volume=${checkpoint.current_volume}\n`
      );
      process.stdout.write(
        `Pipeline: stage=${checkpoint.pipeline_stage ?? "null"} inflight=${checkpoint.inflight_chapter ?? "null"} revisions=${
          checkpoint.revision_count ?? 0
        } hook_fixes=${checkpoint.hook_fix_count ?? 0} title_fixes=${checkpoint.title_fix_count ?? 0}\n`
      );
      if (lock.exists) {
        process.stdout.write(
          `Lock: present${lock.stale ? " (stale)" : ""} started=${lock.info?.started ?? "unknown"} pid=${
            lock.info?.pid ?? "unknown"
          } chapter=${lock.info?.chapter ?? "unknown"}\n`
        );
      } else {
        process.stdout.write("Lock: none\n");
      }
      process.stdout.write(`Next: ${next.step}\n`);
      if (next.reason) process.stdout.write(`Reason: ${next.reason}\n`);
    });

  program
    .command("next")
    .description("Compute the deterministic next step for the pipeline.")
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);
      const next = await computeNextStep(rootDir, checkpoint);

      if (json) {
        printJson(okJson("next", { rootDir, ...next }));
        return;
      }

      if (isPlainObject(next.evidence)) {
        const blocked = (next.evidence as Record<string, unknown>).recovery_blocked;
        if (isPlainObject(blocked)) {
          const obj = blocked as Record<string, unknown>;
          const checkpointPhase = typeof obj.checkpoint_phase === "string" ? obj.checkpoint_phase : "unknown";
          const inferredPhase = typeof obj.inferred_phase === "string" ? obj.inferred_phase : "unknown";
          const expectedPath = typeof obj.expected_path === "string" ? obj.expected_path : "unknown";
          process.stderr.write(
            `WARN: quickstart recovery blocked (checkpoint_phase=${checkpointPhase}, inferred_phase=${inferredPhase}, expected=${expectedPath}). Run 'novel status' for details.\n`
          );
        }
      }

      process.stdout.write(`${next.step}\n`);
    });

  program
    .command("instructions")
    .description("Emit an instruction packet for a step.")
    .argument("<step>", "Step id, e.g. chapter:048:draft")
    .option("--write-manifest", "Persist packet under staging/manifests/.")
    .option("--embed <mode>", "Optional embed mode (off by default). Example: --embed brief")
    .option("--novel-ask-file <path>", "Project-relative path to a NOVEL_ASK QuestionSpec JSON file (enables gate).")
    .option("--answer-path <path>", "Project-relative path to write the NOVEL_ASK AnswerSpec JSON record.")
    .action(async (step: string, localOpts: { writeManifest?: boolean; embed?: string; novelAskFile?: string; answerPath?: string }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);
      const parsedStep = parseStepId(step);

      const novelAskFile = localOpts.novelAskFile ?? null;
      const answerPath = localOpts.answerPath ?? null;
      let novelAskGate: { novel_ask: NovelAskQuestionSpec; answer_path: string } | null = null;
      if (novelAskFile !== null || answerPath !== null) {
        if (!novelAskFile || !answerPath) {
          throw new NovelCliError(`Invalid NOVEL_ASK gate: provide both --novel-ask-file and --answer-path.`, 2);
        }
        const absAsk = resolveProjectRelativePath(rootDir, novelAskFile, "--novel-ask-file");
        const rawSpec = await readJsonFile(absAsk);
        const spec = parseNovelAskQuestionSpec(rawSpec);
        resolveProjectRelativePath(rootDir, answerPath, "--answer-path");
        novelAskGate = { novel_ask: spec, answer_path: answerPath };
      }

      const packet = await buildInstructionPacket({
        rootDir,
        checkpoint,
        step: parsedStep,
        embedMode: localOpts.embed ?? null,
        writeManifest: Boolean(localOpts.writeManifest),
        novelAskGate
      });

      if (json) {
        printJson(okJson("instructions", packet));
        return;
      }

      process.stdout.write(`${JSON.stringify(packet, null, 2)}\n`);
    });

  program
    .command("validate")
    .description("Validate that a step output is complete and well-formed.")
    .argument("<step>", "Step id to validate.")
    .action(async (step: string) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);
      const parsedStep = parseStepId(step);
      const report = await validateStep({ rootDir, checkpoint, step: parsedStep });

      if (json) {
        printJson(okJson("validate", { rootDir, step: report.step, ok: report.ok, warnings: report.warnings }));
        return;
      }

      process.stdout.write(`OK: ${report.step}\n`);
      if (report.warnings.length > 0) {
        for (const w of report.warnings) process.stdout.write(`WARN: ${w}\n`);
      }
    });

  program
    .command("advance")
    .description("Advance checkpoint after a step validates successfully.")
    .argument("<step>", "Step id to advance.")
    .action(async (step: string) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const parsedStep = parseStepId(step);
      const updated = await advanceCheckpointForStep({ rootDir, step: parsedStep });

      if (json) {
        printJson(okJson("advance", { rootDir, checkpoint: updated }));
        return;
      }

      process.stdout.write(`Advanced: ${step}\n`);
    });

  program
    .command("commit")
    .description("Commit staging artifacts into final locations (transaction).")
    .option("--chapter <n>", "Chapter number to commit.", (v) => Number.parseInt(String(v), 10))
    .option("--volume <n>", "Volume number to commit (volume planning artifacts).", (v) => Number.parseInt(String(v), 10))
    .option("--dry-run", "Show planned actions without applying them.")
    .action(async (localOpts: { chapter?: number; volume?: number; dryRun?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const chapter = localOpts.chapter;
      const volume = localOpts.volume;
      if (chapter !== undefined && volume !== undefined) {
        throw new NovelCliError("Invalid commit: provide exactly one of --chapter or --volume.", 2);
      }
      if (chapter === undefined && volume === undefined) {
        throw new NovelCliError("Invalid commit: missing required option --chapter or --volume.", 2);
      }

      const result =
        chapter !== undefined
          ? await commitChapter({ rootDir, chapter, dryRun: Boolean(localOpts.dryRun) })
          : await commitVolume({ rootDir, volume: volume as number, dryRun: Boolean(localOpts.dryRun) });

      if (json) {
        printJson(okJson("commit", { rootDir, ...result }));
        return;
      }

      for (const line of result.plan) process.stdout.write(`${line}\n`);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) process.stdout.write(`WARN: ${w}\n`);
      }
      if (!localOpts.dryRun) {
        if (chapter !== undefined) process.stdout.write(`Committed chapter ${chapter}.\n`);
        else process.stdout.write(`Committed volume ${volume}.\n`);
      }
    });

  const volumeReview = program.command("volume-review").description("Volume-end review helper commands (issue #144).");

  volumeReview
    .command("collect")
    .description(`Generate ${VOL_REVIEW_RELS.qualitySummary} from committed evals (best-effort).`)
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });

      const result = await withWriteLock(rootDir, {}, async () => {
        const checkpoint = await readCheckpoint(rootDir);
        const summary = await collectVolumeData({ rootDir, checkpoint });
        await writeJsonFile(join(rootDir, VOL_REVIEW_RELS.qualitySummary), summary);
        return { checkpoint, summary };
      });

      if (json) {
        printJson(okJson("volume-review collect", { rootDir, rel: VOL_REVIEW_RELS.qualitySummary, summary: result.summary }));
        return;
      }

      process.stdout.write(`Wrote ${VOL_REVIEW_RELS.qualitySummary}.\n`);
    });

  volumeReview
    .command("report")
    .description(`Generate ${VOL_REVIEW_RELS.reviewReport} from quality summary + audit report (deterministic markdown).`)
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });

      await withWriteLock(rootDir, {}, async () => {
        const checkpoint = await readCheckpoint(rootDir);
        const volume = checkpoint.current_volume;
        const endChapter = checkpoint.last_completed_chapter;

        const resolvedRange =
          (await tryResolveVolumeChapterRange({ rootDir, volume })) ??
          (Number.isInteger(endChapter) && endChapter >= 1 ? { start: Math.max(1, endChapter - 9), end: endChapter } : null);
        if (!resolvedRange) {
          throw new NovelCliError(`Cannot resolve volume review chapter_range (last_completed_chapter=${String(endChapter)}).`, 2);
        }

        // Best-effort reads: validation guards presence.
        let summary: unknown = null;
        let audit: unknown = null;
        try {
          summary = await readJsonFile(join(rootDir, VOL_REVIEW_RELS.qualitySummary));
        } catch {
          summary = null;
        }
        try {
          audit = await readJsonFile(join(rootDir, VOL_REVIEW_RELS.auditReport));
        } catch {
          audit = null;
        }

        const lines: string[] = [];
        lines.push(`# Volume Review Report`);
        lines.push("");
        lines.push(`- volume: ${volume}`);
        lines.push(`- chapter_range: ${resolvedRange.start}-${resolvedRange.end}`);

        if (isPlainObject(summary)) {
          const stats = isPlainObject((summary as Record<string, unknown>).stats)
            ? ((summary as Record<string, unknown>).stats as Record<string, unknown>)
            : null;
          if (stats) {
            const avg = typeof stats.overall_avg === "number" ? stats.overall_avg : null;
            const min = typeof stats.overall_min === "number" ? stats.overall_min : null;
            const max = typeof stats.overall_max === "number" ? stats.overall_max : null;
            lines.push(`- overall_avg: ${avg ?? "n/a"} (min=${min ?? "n/a"}, max=${max ?? "n/a"})`);
          }
          const lows = Array.isArray((summary as Record<string, unknown>).low_chapters)
            ? ((summary as Record<string, unknown>).low_chapters as unknown[])
            : [];
          if (lows.length > 0) {
            lines.push("");
            lines.push(`## Low Score Chapters (<3.5)`);
            for (const it of lows.slice(0, 20)) {
              if (!isPlainObject(it)) continue;
              const ch = (it as Record<string, unknown>).chapter;
              const sc = (it as Record<string, unknown>).overall_final;
              if (typeof ch === "number" && typeof sc === "number") lines.push(`- ch${pad3(ch)}: ${sc}`);
            }
          }
        }

        if (isPlainObject(audit)) {
          const stats = isPlainObject((audit as Record<string, unknown>).stats) ? ((audit as Record<string, unknown>).stats as Record<string, unknown>) : null;
          if (stats) {
            const total = typeof stats.issues_total === "number" ? stats.issues_total : null;
            lines.push("");
            lines.push(`## Consistency Audit`);
            lines.push(`- issues_total: ${total ?? "n/a"}`);
          }
        }

        await writeTextFile(join(rootDir, VOL_REVIEW_RELS.reviewReport), `${lines.join("\n")}\n`);
      });

      if (json) {
        printJson(okJson("volume-review report", { rootDir, rel: VOL_REVIEW_RELS.reviewReport }));
        return;
      }

      process.stdout.write(`Wrote ${VOL_REVIEW_RELS.reviewReport}.\n`);
    });

  volumeReview
    .command("cleanup")
    .description(`Generate ${VOL_REVIEW_RELS.foreshadowStatus} (foreshadowing audit + bridge check + storyline rhythm).`)
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });

      const payload = await withWriteLock(rootDir, {}, async () => {
        const checkpoint = await readCheckpoint(rootDir);
        const volume = checkpoint.current_volume;
        const endChapter = checkpoint.last_completed_chapter;

        const resolvedRange =
          (await tryResolveVolumeChapterRange({ rootDir, volume })) ??
          (Number.isInteger(endChapter) && endChapter >= 1 ? { start: Math.max(1, endChapter - 9), end: endChapter } : null);
        if (!resolvedRange) {
          throw new NovelCliError(`Cannot resolve volume review chapter_range (last_completed_chapter=${String(endChapter)}).`, 2);
        }

        const foreshadowingAudit = await computeForeshadowingAudit({ rootDir, checkpoint });

        // Best-effort: compute bridge check using available foreshadow ids.
        const globalIds = new Set<string>();
        const planIds = new Set<string>();
        try {
          const globalRaw = await readJsonFile(join(rootDir, "foreshadowing/global.json"));
          const list = Array.isArray(globalRaw)
            ? globalRaw
            : isPlainObject(globalRaw) && Array.isArray((globalRaw as Record<string, unknown>).foreshadowing)
              ? ((globalRaw as Record<string, unknown>).foreshadowing as unknown[])
              : [];
          for (const it of list) {
            if (!isPlainObject(it)) continue;
            const id = typeof (it as Record<string, unknown>).id === "string" ? ((it as Record<string, unknown>).id as string).trim() : "";
            if (id) globalIds.add(id);
          }
        } catch {
          // optional
        }
        try {
          const rel = `volumes/vol-${pad2(volume)}/foreshadowing.json`;
          const planRaw = await readJsonFile(join(rootDir, rel));
          const list = Array.isArray(planRaw)
            ? planRaw
            : isPlainObject(planRaw) && Array.isArray((planRaw as Record<string, unknown>).foreshadowing)
              ? ((planRaw as Record<string, unknown>).foreshadowing as unknown[])
              : [];
          for (const it of list) {
            if (!isPlainObject(it)) continue;
            const id = typeof (it as Record<string, unknown>).id === "string" ? ((it as Record<string, unknown>).id as string).trim() : "";
            if (id) planIds.add(id);
          }
        } catch {
          // optional
        }

        const bridgeCheck = await computeBridgeCheck({ rootDir, volume, foreshadowIds: { global: globalIds, plan: planIds } });
        const rhythm = await computeStorylineRhythm({ rootDir, volume, chapter_range: [resolvedRange.start, resolvedRange.end] });

        const out = {
          schema_version: 1,
          generated_at: new Date().toISOString(),
          as_of: { volume, chapter: endChapter },
          foreshadowing_audit: foreshadowingAudit,
          bridge_check: bridgeCheck,
          storyline_rhythm: rhythm
        };
        await writeJsonFile(join(rootDir, VOL_REVIEW_RELS.foreshadowStatus), out);
        return out;
      });

      if (json) {
        printJson(okJson("volume-review cleanup", { rootDir, rel: VOL_REVIEW_RELS.foreshadowStatus, payload }));
        return;
      }

      process.stdout.write(`Wrote ${VOL_REVIEW_RELS.foreshadowStatus}.\n`);
    });

  const promises = program.command("promises").description("Promise ledger (long-horizon narrative promises).");

  promises
    .command("init")
    .description("Initialize promise-ledger.json from brief/outline/summaries (best-effort seed).")
    .option("--apply", "Write promise-ledger.json (otherwise preview-only).")
    .option("--max-recent-summaries <n>", "How many recent summaries to scan for seed candidates (default: 10).", (v) =>
      Number.parseInt(String(v), 10)
    )
    .action(async (localOpts: { apply?: boolean; maxRecentSummaries?: number }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);

      const maxRecentSummaries = localOpts.maxRecentSummaries ?? 10;
      if (!Number.isInteger(maxRecentSummaries) || maxRecentSummaries < 0) {
        throw new NovelCliError(`Invalid --max-recent-summaries: ${String(localOpts.maxRecentSummaries)} (expected int >= 0).`, 2);
      }

      const result = await ensurePromiseLedgerInitialized({
        rootDir,
        volume: checkpoint.current_volume,
        maxRecentSummaries,
        apply: Boolean(localOpts.apply)
      });

      if (json) {
        printJson(okJson("promises init", { rootDir, ...result }));
        return;
      }

      if (result.wrote) {
        process.stdout.write(`Initialized ${result.rel}.\n`);
        return;
      }
      process.stdout.write(`${result.rel} already exists or init is preview-only. Use --json to inspect the seed, or re-run with --apply.\n`);
    });

  promises
    .command("report")
    .description("Generate a promise-ledger report under logs/promises/ (latest.json + optional history).")
    .option("--as-of <n>", "As-of chapter (defaults to checkpoint.last_completed_chapter).", (v) => Number.parseInt(String(v), 10))
    .option("--volume <n>", "Volume number (defaults to checkpoint.current_volume).", (v) => Number.parseInt(String(v), 10))
    .option("--start <n>", "Start chapter for report scope (defaults to max(1, end-9)).", (v) => Number.parseInt(String(v), 10))
    .option("--end <n>", "End chapter for report scope (defaults to as-of chapter).", (v) => Number.parseInt(String(v), 10))
    .option("--history", "Also write a history report file for the selected scope.")
    .action(async (localOpts: { asOf?: number; volume?: number; start?: number; end?: number; history?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);

      const volume = localOpts.volume ?? checkpoint.current_volume;
      const end = localOpts.end ?? localOpts.asOf ?? checkpoint.last_completed_chapter;
      const asOf = localOpts.asOf ?? end;
      const start = localOpts.start ?? Math.max(1, end - 9);

      if (!Number.isInteger(asOf) || asOf < 1) throw new NovelCliError(`Invalid --as-of: ${String(asOf)} (expected int >= 1).`, 2);
      if (!Number.isInteger(volume) || volume < 0) throw new NovelCliError(`Invalid --volume: ${String(volume)} (expected int >= 0).`, 2);
      if (!Number.isInteger(start) || start < 1) throw new NovelCliError(`Invalid --start: ${String(start)} (expected int >= 1).`, 2);
      if (!Number.isInteger(end) || end < 0) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= 0).`, 2);
      if (end === 0) {
        if (checkpoint.last_completed_chapter === 0 && localOpts.end === undefined && localOpts.asOf === undefined) {
          throw new NovelCliError(
            "No committed chapters yet (checkpoint.last_completed_chapter=0). Commit at least one chapter, or pass --end/--as-of >= 1.",
            2
          );
        }
        if (localOpts.asOf !== undefined && localOpts.end === undefined) {
          throw new NovelCliError("Invalid --as-of: 0 (expected int >= 1).", 2);
        }
        throw new NovelCliError("Invalid --end: 0 (expected int >= 1).", 2);
      }
      if (end < start) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= start).`, 2);
      if (asOf < end) throw new NovelCliError(`Invalid --as-of: ${String(asOf)} (expected int >= --end=${end}).`, 2);

      const ledgerAbs = resolve(rootDir, "promise-ledger.json");
      if (!(await pathExists(ledgerAbs))) {
        throw new NovelCliError("Missing promise-ledger.json. Run: novel promises init --apply", 2);
      }

      const loaded = await loadPromiseLedger(rootDir);
      const ledgerWarnings = loaded.warnings.slice();
      const report = computePromiseLedgerReport({ ledger: loaded.ledger, asOfChapter: asOf, volume, chapterRange: { start, end } });
      const written = await writePromiseLedgerLogs({ rootDir, report, historyRange: localOpts.history ? { start, end } : null });

      if (json) {
        printJson(okJson("promises report", { rootDir, report, ledger_warnings: ledgerWarnings, ...written }));
        return;
      }

      if (ledgerWarnings.length > 0) {
        for (const w of ledgerWarnings) process.stdout.write(`WARN: ${w}\n`);
      }
      process.stdout.write(`Wrote ${written.latestRel}.\n`);
      if (written.historyRel) process.stdout.write(`Wrote ${written.historyRel}.\n`);
    });

  const engagement = program.command("engagement").description("Engagement density metrics (per-chapter stream + window reports).");

  engagement
    .command("report")
    .description("Generate an engagement density report under logs/engagement/ (latest.json + optional history).")
    .option("--as-of <n>", "As-of chapter (defaults to checkpoint.last_completed_chapter).", (v) => Number.parseInt(String(v), 10))
    .option("--volume <n>", "Volume number (defaults to checkpoint.current_volume).", (v) => Number.parseInt(String(v), 10))
    .option("--start <n>", "Start chapter for report scope (defaults to max(1, end-9)).", (v) => Number.parseInt(String(v), 10))
    .option("--end <n>", "End chapter for report scope (defaults to as-of chapter).", (v) => Number.parseInt(String(v), 10))
    .option("--history", "Also write a history report file for the selected scope.")
    .action(async (localOpts: { asOf?: number; volume?: number; start?: number; end?: number; history?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);

      const volume = localOpts.volume ?? checkpoint.current_volume;
      const end = localOpts.end ?? localOpts.asOf ?? checkpoint.last_completed_chapter;
      const asOf = localOpts.asOf ?? end;
      const start = localOpts.start ?? Math.max(1, end - 9);

      if (!Number.isInteger(asOf) || asOf < 1) throw new NovelCliError(`Invalid --as-of: ${String(asOf)} (expected int >= 1).`, 2);
      if (!Number.isInteger(volume) || volume < 0) throw new NovelCliError(`Invalid --volume: ${String(volume)} (expected int >= 0).`, 2);
      if (!Number.isInteger(start) || start < 1) throw new NovelCliError(`Invalid --start: ${String(start)} (expected int >= 1).`, 2);
      if (!Number.isInteger(end) || end < 0) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= 0).`, 2);
      if (end === 0) {
        if (checkpoint.last_completed_chapter === 0 && localOpts.end === undefined && localOpts.asOf === undefined) {
          throw new NovelCliError(
            "No committed chapters yet (checkpoint.last_completed_chapter=0). Commit at least one chapter, or pass --end/--as-of >= 1.",
            2
          );
        }
        if (localOpts.asOf !== undefined && localOpts.end === undefined) {
          throw new NovelCliError("Invalid --as-of: 0 (expected int >= 1).", 2);
        }
        throw new NovelCliError("Invalid --end: 0 (expected int >= 1).", 2);
      }
      if (end < start) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= start).`, 2);
      if (asOf < end) throw new NovelCliError(`Invalid --as-of: ${String(asOf)} (expected int >= --end=${end}).`, 2);

      const metricsAbs = resolve(rootDir, "engagement-metrics.jsonl");
      const streamExists = await pathExists(metricsAbs);

      const loaded = await loadEngagementMetricsStream({ rootDir });
      const streamWarnings = loaded.warnings.slice();
      if (!streamExists) streamWarnings.unshift("Missing engagement-metrics.jsonl; report will contain empty metrics.");

      const report = computeEngagementReport({ records: loaded.records, asOfChapter: asOf, volume, chapterRange: { start, end }, metricsRelPath: loaded.rel });
      const written = await writeEngagementLogs({ rootDir, report, historyRange: localOpts.history ? { start, end } : null });

      if (json) {
        printJson(okJson("engagement report", { rootDir, report, stream_warnings: streamWarnings, ...written }));
        return;
      }

      if (streamWarnings.length > 0) {
        for (const w of streamWarnings) process.stdout.write(`WARN: ${w}\n`);
      }
      process.stdout.write(`Wrote ${written.latestRel}.\n`);
      if (written.historyRel) process.stdout.write(`Wrote ${written.historyRel}.\n`);
    });

  const voice = program.command("voice").description("Character voice profiles + drift directives (M7H.3).");

  voice
    .command("init")
    .description("Initialize character-voice-profiles.json from early chapters (baseline calibration).")
    .requiredOption("--protagonist <id>", "Protagonist character id.")
    .option("--core-cast <ids>", "Comma-separated core cast character ids (optional).")
    .option("--start <n>", "Baseline start chapter (default: 1).", (v) => Number.parseInt(String(v), 10))
    .option("--end <n>", "Baseline end chapter (default: min(10, checkpoint.last_completed_chapter)).", (v) => Number.parseInt(String(v), 10))
    .option("--window-chapters <n>", "Rolling window chapters for drift detection (default: 10).", (v) => Number.parseInt(String(v), 10))
    .option("--force", "Allow overwriting character-voice-profiles.json (requires --apply; use with care).")
    .option("--apply", "Write character-voice-profiles.json (otherwise preview-only).")
    .action(
      async (localOpts: {
        protagonist: string;
        coreCast?: string;
        start?: number;
        end?: number;
        windowChapters?: number;
        force?: boolean;
        apply?: boolean;
      }) => {
        const opts = program.opts<GlobalOpts>();
        const json = Boolean(opts.json);

        const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
        const checkpoint = await readCheckpoint(rootDir);

        const existingAbs = resolve(rootDir, "character-voice-profiles.json");
        if (await pathExists(existingAbs)) {
          const force = Boolean(localOpts.force);
          if (!force) {
            const loaded = await loadCharacterVoiceProfiles(rootDir);
            if (json) {
              printJson(okJson("voice init", { rootDir, wrote: false, rel: loaded.rel, warnings: loaded.warnings, profiles: loaded.profiles }));
              return;
            }
            process.stdout.write(`character-voice-profiles.json already exists.\n`);
            for (const w of loaded.warnings) process.stdout.write(`WARN: ${w}\n`);
            process.stdout.write(`Use --json to inspect, or re-run with --force --apply to overwrite.\n`);
            return;
          }
        }

        if (checkpoint.last_completed_chapter < 1) {
          throw new NovelCliError(
            "No committed chapters yet (checkpoint.last_completed_chapter=0). Commit at least one chapter before voice init, or create character-voice-profiles.json manually.",
            2
          );
        }

        const start = localOpts.start ?? 1;
        const end = localOpts.end ?? Math.min(10, checkpoint.last_completed_chapter);
        const windowChapters = localOpts.windowChapters;

        if (!Number.isInteger(start) || start < 1) throw new NovelCliError(`Invalid --start: ${String(start)} (expected int >= 1).`, 2);
        if (!Number.isInteger(end) || end < 1) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= 1).`, 2);
        if (end < start) throw new NovelCliError(`Invalid --end: ${String(end)} (expected int >= start=${start}).`, 2);
        if (end > checkpoint.last_completed_chapter) {
          throw new NovelCliError(
            `Invalid --end: ${String(end)} (expected <= checkpoint.last_completed_chapter=${checkpoint.last_completed_chapter}).`,
            2
          );
        }
        if (windowChapters !== undefined) {
          if (!Number.isInteger(windowChapters) || windowChapters < 1) {
            throw new NovelCliError(`Invalid --window-chapters: ${String(windowChapters)} (expected int >= 1).`, 2);
          }
        }

        const coreCastIds =
          typeof localOpts.coreCast === "string"
            ? Array.from(new Set(localOpts.coreCast.split(",").map((s) => s.trim()).filter((s) => s.length > 0)))
            : [];

        const result = await buildCharacterVoiceProfiles({
          rootDir,
          protagonistId: localOpts.protagonist,
          coreCastIds,
          baselineRange: { start, end },
          ...(windowChapters !== undefined ? { windowChapters } : {})
        });

        let wrote = false;
        if (localOpts.apply) {
          await withWriteLock(rootDir, { chapter: checkpoint.last_completed_chapter }, async () => {
            await writeCharacterVoiceProfilesFile({ rootDir, profiles: result.profiles });
          });
          wrote = true;
        }

        if (json) {
          printJson(okJson("voice init", { rootDir, wrote, ...result }));
          return;
        }

        for (const w of result.warnings) process.stdout.write(`WARN: ${w}\n`);
        if (wrote) {
          process.stdout.write(`Wrote ${result.rel}.\n`);
          return;
        }
        process.stdout.write(`Preview-only. Use --apply to write ${result.rel}.\n`);
      }
    );

  voice
    .command("check")
    .description("Compute voice drift from character-voice-profiles.json (optionally write/clear character-voice-drift.json).")
    .option("--as-of <n>", "As-of chapter (defaults to checkpoint.last_completed_chapter).", (v) => Number.parseInt(String(v), 10))
    .option("--volume <n>", "Volume number (defaults to checkpoint.current_volume).", (v) => Number.parseInt(String(v), 10))
    .option("--apply", "Write/clear character-voice-drift.json (otherwise preview-only).")
    .action(async (localOpts: { asOf?: number; volume?: number; apply?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);

      const asOf = localOpts.asOf ?? checkpoint.last_completed_chapter;
      const volume = localOpts.volume ?? checkpoint.current_volume;

      if (!Number.isInteger(asOf) || asOf < 1) throw new NovelCliError(`Invalid --as-of: ${String(asOf)} (expected int >= 1).`, 2);
      if (!Number.isInteger(volume) || volume < 0) throw new NovelCliError(`Invalid --volume: ${String(volume)} (expected int >= 0).`, 2);

      const profilesAbs = resolve(rootDir, "character-voice-profiles.json");
      if (!(await pathExists(profilesAbs))) {
        throw new NovelCliError("Missing character-voice-profiles.json. Run: novel voice init --protagonist <id> --apply", 2);
      }

      const loaded = await loadCharacterVoiceProfiles(rootDir);
      if (!loaded.profiles) throw new NovelCliError("Invalid character-voice-profiles.json: failed to load.", 2);

      const previousActiveCharacterIds = await loadActiveCharacterVoiceDriftIds(rootDir);
      const computed = await computeCharacterVoiceDrift({ rootDir, profiles: loaded.profiles, asOfChapter: asOf, volume, previousActiveCharacterIds });

      let wrote = false;
      let cleared = false;
      if (localOpts.apply) {
        await withWriteLock(rootDir, { chapter: asOf }, async () => {
          if (computed.drift) {
            await writeCharacterVoiceDriftFile({ rootDir, drift: computed.drift });
            wrote = true;
            return;
          }
          cleared = await clearCharacterVoiceDriftFile(rootDir);
        });
      }

      const allWarnings = [...loaded.warnings, ...computed.warnings];
      if (json) {
        const action = wrote ? "wrote" : cleared ? "cleared" : localOpts.apply ? "noop" : computed.drift ? "preview_would_write" : "preview_no_drift";
        printJson(
          okJson("voice check", {
            rootDir,
            drift: computed.drift,
            warnings: allWarnings,
            drift_rel: "character-voice-drift.json",
            action,
            applied: Boolean(localOpts.apply),
            wrote,
            cleared
          })
        );
        return;
      }

      for (const w of allWarnings) process.stdout.write(`WARN: ${w}\n`);
      if (!computed.drift) {
        process.stdout.write(`No active voice drift.\n`);
        if (cleared) process.stdout.write(`Cleared character-voice-drift.json.\n`);
        else if (!localOpts.apply) process.stdout.write(`Preview-only. Use --apply to clear character-voice-drift.json on recovery.\n`);
        return;
      }

      for (const c of computed.drift.characters) {
        process.stdout.write(`\n[${c.character_id}] ${c.display_name}\n`);
        for (const d of c.directives) process.stdout.write(`- ${d}\n`);
      }
      if (wrote) process.stdout.write(`\nWrote character-voice-drift.json.\n`);
      else if (!localOpts.apply) process.stdout.write(`\nPreview-only. Use --apply to write character-voice-drift.json.\n`);
    });

  program
    .command("repair")
    .description("Repair project state (checkpoint recovery helpers).")
    .option("--reset-quickstart", "Set .checkpoint.json.quickstart_phase to null.")
    .option("--force", "Apply the repair (otherwise preview only).")
    .action(async (localOpts: { resetQuickstart?: boolean; force?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });

      if (!localOpts.resetQuickstart) {
        throw new NovelCliError("Invalid repair: no actions specified. Use --reset-quickstart.", 2);
      }

      if (!localOpts.force) {
        const checkpoint = await readCheckpoint(rootDir);
        const beforePresent = Object.prototype.hasOwnProperty.call(checkpoint, "quickstart_phase");
        const before = (checkpoint.quickstart_phase ?? null) as string | null;
        const wouldChange = !beforePresent || before !== null;

        if (json) {
          printJson(
            okJson("repair", {
              rootDir,
              applied: false,
              actions: ["reset_quickstart"],
              before_present: beforePresent,
              after_present: true,
              changed: false,
              would_change: wouldChange,
              before,
              after: before,
              target_after: null
            })
          );
          return;
        }

        if (!wouldChange) {
          process.stdout.write("No changes needed: quickstart_phase is already null.\n");
          return;
        }
        process.stdout.write(`Preview: set quickstart_phase ${beforePresent ? before : "<missing>"} -> null\n`);
        process.stdout.write("Re-run with --force to apply.\n");
        return;
      }

      const applied = await withWriteLock(rootDir, {}, async () => {
        const checkpoint = await readCheckpoint(rootDir);
        const beforePresent = Object.prototype.hasOwnProperty.call(checkpoint, "quickstart_phase");
        const before = (checkpoint.quickstart_phase ?? null) as string | null;
        const wouldChange = !beforePresent || before !== null;
        if (!wouldChange) return { beforePresent, before, wouldChange, wrote: false, checkpoint };

        const updated = { ...checkpoint, quickstart_phase: null, last_checkpoint_time: new Date().toISOString() };
        await writeCheckpoint(rootDir, updated);
        return { beforePresent, before, wouldChange, wrote: true, checkpoint: await readCheckpoint(rootDir) };
      });

      const afterPresent = Object.prototype.hasOwnProperty.call(applied.checkpoint, "quickstart_phase");
      const after = applied.checkpoint.quickstart_phase ?? null;
      if (!afterPresent || after !== null) {
        throw new NovelCliError(`Repair failed: quickstart_phase is still ${String(after)} (expected null).`, 2);
      }

      if (json) {
        printJson(
          okJson("repair", {
            rootDir,
            applied: true,
            actions: ["reset_quickstart"],
            before_present: applied.beforePresent,
            after_present: afterPresent,
            changed: applied.wrote,
            would_change: applied.wouldChange,
            before: applied.before,
            after: null,
            target_after: null
          })
        );
        return;
      }

      if (!applied.wrote) {
        process.stdout.write("No changes needed: quickstart_phase is already null.\n");
        return;
      }
      process.stdout.write(`Set quickstart_phase ${applied.beforePresent ? applied.before : "<missing>"} -> null\n`);
    });

  const lock = program.command("lock").description("Manage project lock (.novel.lock).");

  lock
    .command("status")
    .description("Show lock status.")
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const status = await getLockStatus(rootDir);

      if (json) {
        printJson(okJson("lock status", { rootDir, ...status }));
        return;
      }

      if (!status.exists) {
        process.stdout.write("No lock.\n");
        return;
      }
      process.stdout.write(
        `Lock present${status.stale ? " (stale)" : ""}: started=${status.info?.started ?? "unknown"} pid=${
          status.info?.pid ?? "unknown"
        } chapter=${status.info?.chapter ?? "unknown"}\n`
      );
    });

  lock
    .command("clear")
    .description("Clear a stale lock (or fail if lock is active).")
    .action(async () => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const cleared = await clearStaleLock(rootDir);

      if (json) {
        printJson(okJson("lock clear", { rootDir, cleared }));
        return;
      }

      process.stdout.write(cleared ? "Cleared stale lock.\n" : "No lock to clear.\n");
    });

  return program;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const jsonMode = isJsonMode(argv);
  const program = buildProgram(argv);

  try {
    await program.parseAsync(argv, { from: "user" });
    return Number(process.exitCode ?? 0);
  } catch (err: unknown) {
    const command = detectCommandName(argv);
    if (err instanceof NovelCliError) {
      if (jsonMode) {
        printJson(errJson(command, err.message));
      } else {
        process.stderr.write(`${err.message}\n`);
      }
      return err.exitCode;
    }

    if (err instanceof CommanderError) {
      if (err.code === "commander.helpDisplayed") {
        return 0;
      }
      if (jsonMode) {
        printJson(errJson(command, err.message, err.code));
        return err.exitCode;
      }
      process.stderr.write(`${err.message}\n`);
      return err.exitCode;
    }

    const message = err instanceof Error ? err.message : String(err);
    if (jsonMode) {
      printJson(errJson(command, message));
    } else {
      process.stderr.write(`${message}\n`);
    }
    return 1;
  }
}

const entryPath = process.argv[1] ? resolve(process.argv[1]) : null;
const selfPath = fileURLToPath(import.meta.url);
const safeRealpath = (p: string): string | null => {
  try {
    return realpathSync(p);
  } catch {
    return null;
  }
};
const entryUrl = entryPath ? pathToFileURL(entryPath).href : null;
const isEntrypoint =
  entryPath !== null &&
  (entryUrl === import.meta.url ||
    (() => {
      const a = safeRealpath(entryPath);
      const b = safeRealpath(selfPath);
      return a !== null && b !== null && a === b;
    })());

if (isEntrypoint) {
  main()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((err: unknown) => {
      const message = err instanceof Error ? err.stack ?? err.message : String(err);
      process.stderr.write(`${message}\n`);
      process.exitCode = 1;
    });
}
