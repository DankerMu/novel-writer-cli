import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildPromiseLedgerSeed, computePromiseLedgerReport, loadPromiseLedger, writePromiseLedgerLogs, type PromiseLedgerFile } from "../promise-ledger.js";

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

