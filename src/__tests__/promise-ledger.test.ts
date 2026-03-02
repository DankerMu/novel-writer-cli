import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  buildPromiseLedgerSeed,
  computePromiseLedgerReport,
  loadPromiseLedger,
  writePromiseLedgerLogs,
  type PromiseLedgerFile,
  type PromiseLedgerReport
} from "../promise-ledger.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

test("loadPromiseLedger returns an empty ledger when promise-ledger.json is missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-"));
  const loaded = await loadPromiseLedger(rootDir);
  assert.equal(loaded.ledger.schema_version, 1);
  assert.equal(loaded.ledger.entries.length, 0);
  assert.equal(loaded.ledger.policy?.dormancy_threshold_chapters, 12);
});

test("buildPromiseLedgerSeed extracts candidates from brief/outline/summaries", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-seed-"));

  await writeText(
    join(rootDir, "brief.md"),
    `# Brief\n\n## 卖点\n- 主角每次突破都会引来异象\n\n## 核心谜团\n- 主角身世之谜\n\n## 关系弧\n- 主角与师姐从敌对到信任\n`
  );

  await writeText(join(rootDir, "volumes/vol-01/outline.md"), `# 卷大纲\n\n## 机制\n- 系统有代价：使用会消耗寿命\n`);

  await writeText(
    join(rootDir, "summaries/chapter-001-summary.md"),
    `## 第 1 章摘要\n\n### 关键事件\n- 主角触发系统提示，发现寿命消耗\n- 与师姐首次冲突\n`
  );

  const seeded = await buildPromiseLedgerSeed({ rootDir, volume: 1, maxRecentSummaries: 5 });
  assert.ok(seeded.ledger.entries.length >= 4);

  const texts = seeded.ledger.entries.map((e) => e.promise_text);
  assert.ok(texts.includes("主角身世之谜"));
  assert.ok(texts.includes("系统有代价：使用会消耗寿命"));

  const mystery = seeded.ledger.entries.find((e) => e.promise_text === "主角身世之谜");
  assert.equal(mystery?.type, "core_mystery");

  const mechanism = seeded.ledger.entries.find((e) => e.promise_text === "系统有代价：使用会消耗寿命");
  assert.equal(mechanism?.type, "mechanism");
});

test("buildPromiseLedgerSeed avoids overmatching headings and supports uppercase CP", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-seed-headings-"));

  await writeText(
    join(rootDir, "brief.md"),
    `# Brief\n\n## 关键点\n- 主角身世之谜\n\n## CP线\n- 主角与师姐从敌对到信任\n`
  );

  const seeded = await buildPromiseLedgerSeed({ rootDir, volume: 1, maxRecentSummaries: 0 });

  const mystery = seeded.ledger.entries.find((e) => e.promise_text === "主角身世之谜");
  assert.equal(mystery?.type, "core_mystery");

  const rel = seeded.ledger.entries.find((e) => e.promise_text === "主角与师姐从敌对到信任");
  assert.equal(rel?.type, "relationship_arc");
});

test("loadPromiseLedger warns and defaults invalid status to promised", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-bad-status-"));

  await writeText(
    join(rootDir, "promise-ledger.json"),
    `${JSON.stringify(
      {
        schema_version: 1,
        entries: [
          {
            id: "promise:p001",
            type: "core_mystery",
            promise_text: "主角身世之谜",
            status: "oops",
            introduced_chapter: 1,
            last_touched_chapter: 1
          }
        ]
      },
      null,
      2
    )}\n`
  );

  const loaded = await loadPromiseLedger(rootDir);
  assert.equal(loaded.ledger.entries[0]?.status, "promised");
  assert.ok(loaded.warnings.some((w) => w.includes("invalid 'status'")));
});

test("computePromiseLedgerReport surfaces dormant promises and suggestions", async () => {
  const ledger: PromiseLedgerFile = {
    $schema: "schemas/promise-ledger.schema.json",
    schema_version: 1,
    policy: { dormancy_threshold_chapters: 3 },
    entries: [
      {
        id: "promise:p001",
        type: "core_mystery",
        promise_text: "主角身世之谜",
        status: "promised",
        introduced_chapter: 1,
        last_touched_chapter: 1
      },
      {
        id: "promise:p002",
        type: "selling_point",
        promise_text: "修炼异象机制",
        status: "advanced",
        introduced_chapter: 1,
        last_touched_chapter: 9
      },
      {
        id: "promise:p003",
        type: "relationship_arc",
        promise_text: "主角与师姐关系弧",
        status: "delivered",
        introduced_chapter: 1,
        last_touched_chapter: 2,
        delivered_chapter: 2
      }
    ]
  };

  const report = computePromiseLedgerReport({ ledger, asOfChapter: 6, volume: 1, chapterRange: { start: 1, end: 6 } });
  assert.equal(report.schema_version, 1);
  assert.equal(report.stats.total_promises, 3);
  assert.equal(report.stats.dormant_total, 1);
  assert.equal(report.dormant_promises[0]?.id, "promise:p001");
  assert.ok(report.dormant_promises[0]?.suggestion.length > 0);
});

test("writePromiseLedgerLogs keeps latest.json monotonic by chapter (and generated_at tie-break)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-log-mono-"));

  const mkReport = (chapter: number, generated_at: string): PromiseLedgerReport => ({
    schema_version: 1,
    generated_at,
    as_of: { chapter, volume: 1 },
    scope: { volume: 1, chapter_start: Math.max(1, chapter - 9), chapter_end: chapter },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: {
      total_promises: 0,
      promised_total: 0,
      advanced_total: 0,
      delivered_total: 0,
      open_total: 0,
      dormant_total: 0
    },
    dormant_promises: [],
    issues: [],
    has_blocking_issues: false
  });

  await writePromiseLedgerLogs({ rootDir, report: mkReport(5, "2026-01-01T00:00:00.000Z"), historyRange: null });
  await writePromiseLedgerLogs({ rootDir, report: mkReport(4, "2026-01-02T00:00:00.000Z"), historyRange: null });

  const latestAbs = join(rootDir, "logs", "promises", "latest.json");
  const raw = JSON.parse(await readFile(latestAbs, "utf8")) as PromiseLedgerReport;
  assert.equal(raw.as_of.chapter, 5);

  await writePromiseLedgerLogs({ rootDir, report: mkReport(5, "2025-01-01T00:00:00.000Z"), historyRange: null });
  const raw2 = JSON.parse(await readFile(latestAbs, "utf8")) as PromiseLedgerReport;
  assert.equal(raw2.generated_at, "2026-01-01T00:00:00.000Z");

  await writePromiseLedgerLogs({ rootDir, report: mkReport(5, "2027-01-01T00:00:00.000Z"), historyRange: null });
  const raw3 = JSON.parse(await readFile(latestAbs, "utf8")) as PromiseLedgerReport;
  assert.equal(raw3.generated_at, "2027-01-01T00:00:00.000Z");
});

test("writePromiseLedgerLogs writes latest + history when requested", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-promise-ledger-logs-"));
  const ledger: PromiseLedgerFile = { $schema: "schemas/promise-ledger.schema.json", schema_version: 1, entries: [] };
  const report = computePromiseLedgerReport({ ledger, asOfChapter: 10, volume: 2, chapterRange: { start: 1, end: 10 } });
  const written = await writePromiseLedgerLogs({ rootDir, report, historyRange: { start: 1, end: 10 } });

  assert.equal(written.latestRel, "logs/promises/latest.json");
  assert.equal(written.historyRel, "logs/promises/promise-ledger-report-vol-02-ch001-ch010.json");

  const latestRaw = JSON.parse(await readFile(join(rootDir, written.latestRel), "utf8")) as any;
  assert.equal(latestRaw.schema_version, 1);
  const historyRaw = JSON.parse(await readFile(join(rootDir, written.historyRel), "utf8")) as any;
  assert.equal(historyRaw.schema_version, 1);
});
