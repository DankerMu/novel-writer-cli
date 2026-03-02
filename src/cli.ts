#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { NovelCliError } from "./errors.js";
import { errJson, okJson, printJson } from "./output.js";
import { pathExists } from "./fs-utils.js";
import { resolveProjectRoot } from "./project.js";
import { readCheckpoint } from "./checkpoint.js";
import { advanceCheckpointForStep } from "./advance.js";
import { commitChapter } from "./commit.js";
import { buildInstructionPacket } from "./instructions.js";
import { getLockStatus, clearStaleLock } from "./lock.js";
import { computeNextStep } from "./next-step.js";
import { computeEngagementReport, loadEngagementMetricsStream, writeEngagementLogs } from "./engagement.js";
import { computePromiseLedgerReport, ensurePromiseLedgerInitialized, loadPromiseLedger, writePromiseLedgerLogs } from "./promise-ledger.js";
import { parseStepId } from "./steps.js";
import { validateStep } from "./validate.js";

type GlobalOpts = {
  json?: boolean;
  project?: string;
};

function detectCommandName(argv: string[]): string {
  for (const token of argv) {
    if (token === "--") return "unknown";
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
      process.stdout.write(`Checkpoint: chapter=${checkpoint.last_completed_chapter} volume=${checkpoint.current_volume}\n`);
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

      process.stdout.write(`${next.step}\n`);
    });

  program
    .command("instructions")
    .description("Emit an instruction packet for a step.")
    .argument("<step>", "Step id, e.g. chapter:048:draft")
    .option("--write-manifest", "Persist packet under staging/manifests/.")
    .option("--embed <mode>", "Optional embed mode (off by default). Example: --embed brief")
    .action(async (step: string, localOpts: { writeManifest?: boolean; embed?: string }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const checkpoint = await readCheckpoint(rootDir);
      const parsedStep = parseStepId(step);
      const packet = await buildInstructionPacket({
        rootDir,
        checkpoint,
        step: parsedStep,
        embedMode: localOpts.embed ?? null,
        writeManifest: Boolean(localOpts.writeManifest)
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
    .requiredOption("--chapter <n>", "Chapter number to commit.", (v) => Number.parseInt(String(v), 10))
    .option("--dry-run", "Show planned actions without applying them.")
    .action(async (localOpts: { chapter: number; dryRun?: boolean }) => {
      const opts = program.opts<GlobalOpts>();
      const json = Boolean(opts.json);

      const rootDir = await resolveProjectRoot({ cwd: process.cwd(), projectOverride: opts.project });
      const result = await commitChapter({ rootDir, chapter: localOpts.chapter, dryRun: Boolean(localOpts.dryRun) });

      if (json) {
        printJson(okJson("commit", { rootDir, ...result }));
        return;
      }

      for (const line of result.plan) process.stdout.write(`${line}\n`);
      if (result.warnings.length > 0) {
        for (const w of result.warnings) process.stdout.write(`WARN: ${w}\n`);
      }
      if (!localOpts.dryRun) process.stdout.write(`Committed chapter ${localOpts.chapter}.\n`);
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
if (entryPath && import.meta.url === pathToFileURL(entryPath).href) {
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
