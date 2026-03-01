import assert from "node:assert/strict";
import { mkdir, mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeHookLedgerUpdate, writeHookLedgerFile, writeRetentionLogs, type HookLedgerFile, type RetentionReport } from "../hook-ledger.js";

function makePolicy(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    enabled: true,
    fulfillment_window_chapters: 4,
    diversity_window_chapters: 5,
    max_same_type_streak: 2,
    min_distinct_types_in_window: 2,
    overdue_policy: "warn",
    ...overrides
  };
}

function makeEval(args: { hookType: string; strength: number; evidence?: string; present?: boolean }): Record<string, unknown> {
  return {
    chapter: 1,
    hook: {
      present: args.present ?? true,
      type: args.hookType,
      evidence: args.evidence ?? "章末证据片段"
    },
    scores: {
      hook_strength: {
        score: args.strength,
        evidence: args.evidence ?? "章末证据片段"
      }
    }
  };
}

test("computeHookLedgerUpdate creates an entry with window and evidence snippet", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "最后一段：他停在门口，迟迟没有推开门……" });
  const policy = makePolicy() as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  assert.ok(res.entry);
  assert.equal(res.entry.id, "hook:ch010");
  assert.equal(res.entry.chapter, 10);
  assert.equal(res.entry.hook_type, "question");
  assert.equal(res.entry.hook_strength, 4);
  assert.deepEqual(res.entry.fulfillment_window, [11, 14]);
  assert.equal(res.entry.status, "open");
  assert.ok(typeof res.entry.created_at === "string" && res.entry.created_at.length > 0);
  assert.ok(typeof res.entry.updated_at === "string" && res.entry.updated_at.length > 0);
  assert.ok(typeof res.entry.evidence_snippet === "string" && res.entry.evidence_snippet.length > 0);
  assert.equal(res.entry.sources?.eval_path, "evaluations/chapter-010-eval.json");

  assert.equal(res.updatedLedger.entries.length, 1);
  assert.equal(res.report.debt.open.length, 1);
  assert.equal(res.report.debt.lapsed.length, 0);
});

test("computeHookLedgerUpdate marks overdue open promises as lapsed and reports hook debt", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch020",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]
  };
  const evalRaw = makeEval({ hookType: "threat_reveal", strength: 3, evidence: "章末证据片段：危险更近了一步。" });
  const policy = makePolicy({ overdue_policy: "warn" }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 25,
    volume: 1,
    evalRelPath: "evaluations/chapter-025-eval.json",
    policy,
    reportRange: { start: 16, end: 25 }
  });

  const old = res.updatedLedger.entries.find((e) => e.chapter === 20);
  assert.ok(old);
  assert.equal(old.status, "lapsed");
  assert.ok(Array.isArray(old.history) && old.history.some((h) => h.action === "lapsed"));

  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.hook_debt"));
  assert.equal(res.report.debt.newly_lapsed_total, 1);
});

test("computeHookLedgerUpdate flags diversity streak and low distinct types in window", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch001",
        chapter: 1,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [2, 5],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "hook:ch002",
        chapter: 2,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [3, 6],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      }
    ]
  };

  const policy = makePolicy({ diversity_window_chapters: 3, max_same_type_streak: 2, min_distinct_types_in_window: 2, overdue_policy: "warn" }) as any;
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段：疑问仍在。" });

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 3,
    volume: 1,
    evalRelPath: "evaluations/chapter-003-eval.json",
    policy,
    reportRange: { start: 1, end: 3 }
  });

  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.diversity.streak_exceeded"));
  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.diversity.low_distinct_types"));
});

test("writeHookLedgerFile + writeRetentionLogs write expected paths", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-write-test-"));
  await mkdir(join(rootDir, "logs"), { recursive: true });

  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段" });
  const policy = makePolicy() as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 2,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  const { rel: ledgerRel } = await writeHookLedgerFile({ rootDir, ledger: res.updatedLedger });
  assert.equal(ledgerRel, "hook-ledger.json");
  assert.ok((await stat(join(rootDir, ledgerRel))).isFile());

  const { latestRel, historyRel } = await writeRetentionLogs({ rootDir, report: res.report as RetentionReport, writeHistory: true });
  assert.equal(latestRel, "logs/retention/latest.json");
  assert.ok((await stat(join(rootDir, latestRel))).isFile());
  assert.equal(historyRel, "logs/retention/retention-report-vol-02-ch001-ch010.json");
  assert.ok((await stat(join(rootDir, historyRel ?? ""))).isFile());
});

