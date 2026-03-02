import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  attachHookLedgerToEval,
  computeHookLedgerUpdate,
  loadHookLedger,
  writeHookLedgerFile,
  writeRetentionLogs,
  type HookLedgerFile,
  type RetentionReport
} from "../hook-ledger.js";

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

test("computeHookLedgerUpdate reads hook signals from eval_used wrapper", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = { eval_used: makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段" }) };
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 1,
    volume: 1,
    evalRelPath: "evaluations/chapter-001-eval.json",
    policy,
    reportRange: { start: 1, end: 1 }
  });

  assert.ok(res.entry);
  assert.equal(res.entry.hook_type, "question");
  assert.equal(res.entry.hook_strength, 4);
});

test("computeHookLedgerUpdate uses legacy hook_strength fallback fields when scores are missing", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = {
    chapter: 1,
    hook: { present: true, type: "QUESTION", evidence: "章末证据片段" },
    hook_strength: 5
  };
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 1,
    volume: 1,
    evalRelPath: "evaluations/chapter-001-eval.json",
    policy,
    reportRange: { start: 1, end: 1 }
  });

  assert.ok(res.entry);
  assert.equal(res.entry.hook_type, "question");
  assert.equal(res.entry.hook_strength, 5);
});

test("computeHookLedgerUpdate uses hook.strength fallback when scores are missing", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = {
    chapter: 1,
    hook: { present: true, type: "question", strength: 2, evidence: "章末证据片段" }
  };
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 1,
    volume: 1,
    evalRelPath: "evaluations/chapter-001-eval.json",
    policy,
    reportRange: { start: 1, end: 1 }
  });

  assert.ok(res.entry);
  assert.equal(res.entry.hook_strength, 2);
});

test("computeHookLedgerUpdate evidence_snippet truncation does not split surrogate pairs", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evidence = `${"a".repeat(118)}😀b`;
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence });
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

  assert.ok(res.entry?.evidence_snippet);
  assert.equal(res.entry.evidence_snippet, `${"a".repeat(118)}…`);
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

test("computeHookLedgerUpdate still reports hook debt when debt already exists (even if nothing newly lapses)", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch020",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "lapsed",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ overdue_policy: "hard", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 30,
    volume: 1,
    evalRelPath: "evaluations/chapter-030-eval.json",
    policy,
    reportRange: { start: 21, end: 30 }
  });

  assert.equal(res.report.debt.newly_lapsed_total, 0);
  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.hook_debt" && i.severity === "hard"));
  assert.equal(res.report.has_blocking_issues, true);
});

test("computeHookLedgerUpdate blocks when overdue_policy is hard and hook debt is detected", () => {
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
  const policy = makePolicy({ overdue_policy: "hard" }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 25,
    volume: 1,
    evalRelPath: "evaluations/chapter-025-eval.json",
    policy,
    reportRange: { start: 16, end: 25 }
  });

  assert.equal(res.report.has_blocking_issues, true);
  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.hook_debt" && i.severity === "hard"));
});

test("computeHookLedgerUpdate does not hard-block on diversity issues (even when overdue_policy is hard)", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段" });
  const policy = makePolicy({ overdue_policy: "hard", diversity_window_chapters: 5, min_distinct_types_in_window: 2 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 1,
    volume: 1,
    evalRelPath: "evaluations/chapter-001-eval.json",
    policy,
    reportRange: { start: 1, end: 1 }
  });

  assert.ok(res.report.issues.some((i) => i.id === "retention.hook_ledger.diversity.low_distinct_types" && i.severity === "warn"));
  assert.equal(res.report.has_blocking_issues, false);
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
  assert.equal(res.report.stats.entries_total, 3);
  assert.equal(res.report.stats.open_total, 3);
  assert.equal(res.report.stats.fulfilled_total, 0);
  assert.equal(res.report.stats.lapsed_total, 0);
  assert.equal(res.report.diversity.window_chapters, 3);
  assert.deepEqual(res.report.diversity.range, { start: 1, end: 3 });
  assert.equal(res.report.diversity.distinct_types_in_window, 1);
  assert.equal(res.report.diversity.max_same_type_streak_in_window, 3);
});

test("computeHookLedgerUpdate does not overwrite fulfilled entries on re-commit", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 5,
        promise_text: "自定义承诺点",
        status: "fulfilled",
        fulfillment_window: [11, 20],
        fulfilled_chapter: 12,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        evidence_snippet: "旧证据"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "twist_reveal", strength: 1, evidence: "新证据" });
  const policy = makePolicy({ overdue_policy: "warn", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.equal(ch10.status, "fulfilled");
  assert.equal(ch10.hook_type, "question");
  assert.equal(ch10.hook_strength, 5);
  assert.equal(ch10.promise_text, "自定义承诺点");
  assert.deepEqual(ch10.fulfillment_window, [11, 20]);
  assert.equal(ch10.evidence_snippet, "旧证据");
});

test("computeHookLedgerUpdate dedupes same-status duplicates by newest timestamps", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch005-old",
        chapter: 5,
        hook_type: "question",
        hook_strength: 3,
        promise_text: "旧",
        status: "open",
        fulfillment_window: [6, 9],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "hook:ch005-new",
        chapter: 5,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "新",
        status: "open",
        fulfillment_window: [6, 9],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 6,
    volume: 1,
    evalRelPath: "evaluations/chapter-006-eval.json",
    policy,
    reportRange: { start: 1, end: 6 }
  });

  assert.ok(res.warnings.some((w) => w.includes("Dropped") && w.includes("hook:ch005-old")));
  const ch5 = res.updatedLedger.entries.find((e) => e.chapter === 5);
  assert.ok(ch5);
  assert.equal(ch5.id, "hook:ch005-new");
});

test("computeHookLedgerUpdate dedupes cross-status duplicates by timestamp (keeps newest)", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch020-open-old",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "hook:ch020-lapsed-new",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "lapsed",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 22,
    volume: 1,
    evalRelPath: "evaluations/chapter-022-eval.json",
    policy,
    reportRange: { start: 13, end: 22 }
  });

  assert.ok(res.warnings.some((w) => w.includes("Dropped") && w.includes("hook:ch020")));
  assert.equal(res.updatedLedger.entries.filter((e) => e.chapter === 20).length, 1);
  const ch20 = res.updatedLedger.entries.find((e) => e.chapter === 20);
  assert.ok(ch20);
  assert.equal(ch20.id, "hook:ch020-lapsed-new");
  assert.equal(ch20.status, "lapsed");
});

test("computeHookLedgerUpdate dedupes cross-status duplicates when one is missing updated_at (keeps lapsed)", () => {
  const ledger = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch020-lapsed",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "lapsed",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z"
      },
      {
        id: "hook:ch020-open-missing-updated",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-02T00:00:00Z"
      }
    ]
  } as unknown as HookLedgerFile;

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 22,
    volume: 1,
    evalRelPath: "evaluations/chapter-022-eval.json",
    policy,
    reportRange: { start: 13, end: 22 }
  });

  assert.ok(res.warnings.some((w) => w.includes("missing updated_at")));
  const ch20 = res.updatedLedger.entries.find((e) => e.chapter === 20);
  assert.ok(ch20);
  assert.equal(ch20.id, "hook:ch020-lapsed");
  assert.equal(ch20.status, "lapsed");
});

test("computeHookLedgerUpdate preserves fulfilled status when deduping", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch020-fulfilled-old",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "fulfilled",
        fulfillment_window: [21, 24],
        fulfilled_chapter: 22,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z"
      },
      {
        id: "hook:ch020-open-new",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [21, 24],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-03T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 22,
    volume: 1,
    evalRelPath: "evaluations/chapter-022-eval.json",
    policy,
    reportRange: { start: 13, end: 22 }
  });

  assert.equal(res.updatedLedger.entries.filter((e) => e.chapter === 20).length, 1);
  const ch20 = res.updatedLedger.entries.find((e) => e.chapter === 20);
  assert.ok(ch20);
  assert.equal(ch20.id, "hook:ch020-fulfilled-old");
  assert.equal(ch20.status, "fulfilled");
});

test("computeHookLedgerUpdate backfills missing fulfillment_window and clears _needs_window_backfill", () => {
  const ledger = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        // fulfillment_window intentionally missing
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ]
  } as unknown as HookLedgerFile;

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ fulfillment_window_chapters: 4, diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 12,
    volume: 1,
    evalRelPath: "evaluations/chapter-012-eval.json",
    policy,
    reportRange: { start: 1, end: 12 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.deepEqual(ch10.fulfillment_window, [11, 14]);
  assert.equal((ch10 as any)._needs_window_backfill, undefined);
  assert.ok(Array.isArray(ch10.history) && ch10.history.some((h) => h.action === "window_backfilled"));
});

test("computeHookLedgerUpdate backfills fulfillment_window when it is behind the entry chapter", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [1, 2],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "none", strength: 3, present: false });
  const policy = makePolicy({ fulfillment_window_chapters: 4, diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 12,
    volume: 1,
    evalRelPath: "evaluations/chapter-012-eval.json",
    policy,
    reportRange: { start: 1, end: 12 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.deepEqual(ch10.fulfillment_window, [11, 14]);
  assert.equal(ch10.status, "open");
  assert.ok(res.warnings.some((w) => w.includes("invalid fulfillment_window")));
});

test("loadHookLedger returns an empty, schema-pointed ledger when hook-ledger.json is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-missing-file-test-"));
  const loaded = await loadHookLedger(rootDir);

  assert.equal(loaded.ledger.$schema, "schemas/hook-ledger.schema.json");
  assert.equal(loaded.ledger.schema_version, 1);
  assert.deepEqual(loaded.ledger.entries, []);
  assert.deepEqual(loaded.warnings, []);
});

test("loadHookLedger rejects non-object JSON to avoid silent data loss", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-non-object-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  await writeFile(abs, `[]\n`, "utf8");

  await assert.rejects(() => loadHookLedger(rootDir), /expected a JSON object/);
});

test("loadHookLedger rejects unsupported schema_version values", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-bad-sv-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = { schema_version: 2, entries: [] };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadHookLedger(rootDir), /schema_version.*must be 1/);
});

test("loadHookLedger drops entries missing id/chapter and returns warnings", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-missing-fields-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = {
    schema_version: 1,
    entries: [{ id: "hook:ch001" }, { chapter: 1 }]
  };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  const loaded = await loadHookLedger(rootDir);
  assert.equal(loaded.ledger.entries.length, 0);
  assert.ok(loaded.warnings.some((w) => w.includes("missing id/chapter")));
});

test("loadHookLedger preserves user comment fields and normalizes links", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-comments-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = {
    schema_version: 1,
    _comment: "root comment",
    entries: [
      {
        id: "hook:ch001",
        chapter: 1,
        hook_type: "Question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [2, 5],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        _note: "entry note",
        links: { promise_ids: [" a ", "a", ""], foreshadowing_ids: ["b", " b "] }
      }
    ]
  };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  const loaded = await loadHookLedger(rootDir);
  assert.equal(loaded.ledger.$schema, "schemas/hook-ledger.schema.json");
  assert.equal((loaded.ledger as any)._comment, "root comment");
  assert.equal(loaded.ledger.entries.length, 1);

  const e = loaded.ledger.entries[0] as any;
  assert.equal(e.hook_type, "question");
  assert.equal(e._note, "entry note");
  assert.deepEqual(e.links.promise_ids, ["a"]);
  assert.deepEqual(e.links.foreshadowing_ids, ["b"]);
});

test("loadHookLedger normalizes unknown fields, invalid strengths, and missing windows", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = {
    schema_version: 1,
    foo: "bar",
    entries: [
      {
        id: "hook:ch002",
        chapter: 2,
        hook_type: "question",
        hook_strength: 6,
        promise_text: "留悬念：未解之问",
        status: "open",
        created_at: "2026-01-01",
        updated_at: " 2026-01-01T00:00:00Z ",
        // fulfillment_window missing
        fulfilled_chapter: 3,
        extra_field: "drop-me"
      }
    ]
  };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  const loaded = await loadHookLedger(rootDir);
  assert.equal((loaded.ledger as any).foo, undefined);
  assert.equal(loaded.ledger.entries.length, 1);

  const e = loaded.ledger.entries[0] as any;
  assert.equal(e.extra_field, undefined);
  assert.equal(e.hook_strength, 3);
  assert.ok(e._invalid_hook_strength !== undefined);
  assert.equal(e._invalid_created_at, "2026-01-01");
  assert.equal(e._invalid_updated_at, undefined);
  assert.equal(e.updated_at, "2026-01-01T00:00:00Z");
  assert.ok(typeof e.created_at === "string" && e.created_at.endsWith("Z"));
  assert.equal(e.status, "fulfilled");
  assert.ok(Array.isArray(e.history) && e.history.some((h: any) => h.action === "status_auto_fixed"));
  assert.ok(Array.isArray(e.fulfillment_window) && e.fulfillment_window.length === 2);
  assert.equal(e._needs_window_backfill, true);
  assert.ok(Array.isArray(loaded.warnings) && loaded.warnings.length > 0);
});

test("loadHookLedger rejects invalid entries type to avoid silent data loss", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-invalid-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = { schema_version: 1, entries: { bad: true } };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadHookLedger(rootDir), /entries.*array/);
});

test("loadHookLedger rejects missing schema_version (schema SSOT)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-missing-sv-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = { entries: [] };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadHookLedger(rootDir), /schema_version/);
});

test("loadHookLedger rejects missing entries (schema SSOT)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-missing-entries-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = { schema_version: 1 };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  await assert.rejects(() => loadHookLedger(rootDir), /entries/);
});

test("computeHookLedgerUpdate refreshes auto promise_text when hook_type changes", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [11, 14],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "twist_reveal", strength: 4, evidence: "新证据" });
  const policy = makePolicy({ overdue_policy: "warn", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.equal(ch10.hook_type, "twist_reveal");
  assert.equal(ch10.promise_text, "留悬念：反转揭示");
});

test("computeHookLedgerUpdate does not overwrite custom promise_text when hook_type changes", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "自定义承诺点",
        status: "open",
        fulfillment_window: [11, 14],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "twist_reveal", strength: 4, evidence: "新证据" });
  const policy = makePolicy({ overdue_policy: "warn", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.equal(ch10.hook_type, "twist_reveal");
  assert.equal(ch10.promise_text, "自定义承诺点");
});

test("computeHookLedgerUpdate refreshes evidence_snippet on re-commit for open entries", () => {
  const ledger: HookLedgerFile = {
    schema_version: 1,
    entries: [
      {
        id: "hook:ch010",
        chapter: 10,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "open",
        fulfillment_window: [11, 14],
        fulfilled_chapter: null,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-02T00:00:00Z",
        evidence_snippet: "旧证据"
      }
    ]
  };

  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "新证据" });
  const policy = makePolicy({ overdue_policy: "warn", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  const ch10 = res.updatedLedger.entries.find((e) => e.chapter === 10);
  assert.ok(ch10);
  assert.equal(ch10.evidence_snippet, "新证据");
});

test("computeHookLedgerUpdate does not lapse on window end (inclusive)", () => {
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

  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 24,
    volume: 1,
    evalRelPath: "evaluations/chapter-024-eval.json",
    policy,
    reportRange: { start: 20, end: 24 }
  });

  const e = res.updatedLedger.entries.find((x) => x.chapter === 20);
  assert.ok(e);
  assert.equal(e.status, "open");
  assert.equal(res.report.debt.newly_lapsed_total, 0);
  assert.ok(!res.report.issues.some((i) => i.id === "retention.hook_ledger.hook_debt"));
});

test("computeHookLedgerUpdate warns when eval hook.present=true but hook.type is missing", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = {
    chapter: 1,
    hook: { present: true },
    scores: { hook_strength: { score: 4 } }
  };
  const policy = makePolicy({ diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 1,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });

  assert.equal(res.entry, null);
  assert.ok(res.warnings.some((w) => w.includes("hook.present=true")));
});

test("loadHookLedger drops __proto__ comment field to avoid prototype pollution", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-load-proto-test-"));
  const abs = join(rootDir, "hook-ledger.json");
  const raw = {
    schema_version: 1,
    __proto__: { polluted: true },
    entries: []
  };
  await writeFile(abs, `${JSON.stringify(raw, null, 2)}\n`, "utf8");

  const loaded = await loadHookLedger(rootDir);
  assert.equal((loaded.ledger as any).polluted, undefined);
  assert.equal(({} as any).polluted, undefined);
});

test("computeHookLedgerUpdate skips when hook is not present", () => {
  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = makeEval({ hookType: "none", strength: 3, evidence: "章末证据片段", present: false });
  const policy = makePolicy({ diversity_window_chapters: 5, min_distinct_types_in_window: 2, overdue_policy: "warn" }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 1,
    volume: 1,
    evalRelPath: "evaluations/chapter-001-eval.json",
    policy,
    reportRange: { start: 1, end: 1 }
  });

  assert.equal(res.entry, null);
  assert.equal(res.updatedLedger.entries.length, 0);
  assert.equal(res.report.issues.length, 0);
  assert.equal(res.report.has_blocking_issues, false);
});

test("computeHookLedgerUpdate strips unknown fields to keep hook-ledger.json schema-valid and returns warnings", () => {
  const ledger = {
    schema_version: 1,
    foo: "bar",
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
        updated_at: "2026-01-01T00:00:00Z",
        extra_field: "should_be_dropped"
      },
      {
        id: "hook:ch020-dup",
        chapter: 20,
        hook_type: "question",
        hook_strength: 4,
        promise_text: "留悬念：未解之问",
        status: "fulfilled",
        fulfillment_window: [21, 24],
        fulfilled_chapter: 21,
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        extra_field: "should_be_dropped"
      }
    ]
  } as unknown as HookLedgerFile;

  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段" });
  const policy = makePolicy({ overdue_policy: "warn", diversity_window_chapters: 1, min_distinct_types_in_window: 1 }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 22,
    volume: 1,
    evalRelPath: "evaluations/chapter-022-eval.json",
    policy,
    reportRange: { start: 13, end: 22 }
  });

  assert.ok(Array.isArray(res.warnings) && res.warnings.some((w) => w.includes("Dropped") && w.includes("duplicate")));
  assert.equal((res.updatedLedger as any).foo, undefined);
  assert.equal(res.updatedLedger.entries.filter((e) => e.chapter === 20).length, 1);
  assert.equal(res.updatedLedger.entries.length, 2);
  const ch20 = res.updatedLedger.entries.find((e) => e.chapter === 20);
  assert.ok(ch20);
  assert.equal((ch20 as any).extra_field, undefined);
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

test("attachHookLedgerToEval writes hook_ledger metadata with paths and issue counts", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-hook-ledger-attach-test-"));
  await mkdir(join(rootDir, "evaluations"), { recursive: true });

  const ledger: HookLedgerFile = { schema_version: 1, entries: [] };
  const evalRaw = makeEval({ hookType: "question", strength: 4, evidence: "章末证据片段" });
  const policy = makePolicy({ diversity_window_chapters: 1, max_same_type_streak: 99, min_distinct_types_in_window: 1, overdue_policy: "warn" }) as any;

  const res = computeHookLedgerUpdate({
    ledger,
    evalRaw,
    chapter: 10,
    volume: 2,
    evalRelPath: "evaluations/chapter-010-eval.json",
    policy,
    reportRange: { start: 1, end: 10 }
  });
  assert.ok(res.entry);
  assert.equal(res.report.issues.length, 0);

  const evalRel = "evaluations/chapter-010-eval.json";
  const evalAbs = join(rootDir, evalRel);
  await writeFile(evalAbs, `${JSON.stringify({ chapter: 10 }, null, 2)}\n`, "utf8");

  await attachHookLedgerToEval({
    evalAbsPath: evalAbs,
    evalRelPath: evalRel,
    ledgerRelPath: "hook-ledger.json",
    reportLatestRelPath: "logs/retention/latest.json",
    entry: res.entry,
    report: res.report
  });

  const written = JSON.parse(await readFile(evalAbs, "utf8")) as any;
  assert.ok(written.hook_ledger);
  assert.equal(written.hook_ledger.ledger_path, "hook-ledger.json");
  assert.equal(written.hook_ledger.report_latest_path, "logs/retention/latest.json");
  assert.equal(written.hook_ledger.entry.id, "hook:ch010");
  assert.equal(written.hook_ledger.issues_total, 0);
  assert.deepEqual(written.hook_ledger.issues_by_severity, { warn: 0, soft: 0, hard: 0 });
});
