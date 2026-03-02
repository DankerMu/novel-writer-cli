import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  computeEngagementMetricRecord,
  computeEngagementReport,
  writeEngagementLogs,
  type EngagementMetricRecord,
  type EngagementReport
} from "../engagement.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

test("computeEngagementMetricRecord prefers platform_constraints word_count and key events beats", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-metric-"));

  await writeText(join(rootDir, "chapters/chapter-001.md"), "你好 世界\n");
  await writeText(
    join(rootDir, "summaries/chapter-001-summary.md"),
    `## 第 1 章摘要\n\n### 关键事件\n- 主角遭遇危机\n- 反转揭示真相\n`
  );
  await writeJson(join(rootDir, "evaluations/chapter-001-eval.json"), {
    platform_constraints: { word_count: { chars: 123 }, info_load: { new_terms_per_1k_words: 2.5 } }
  });

  const computed = await computeEngagementMetricRecord({
    rootDir,
    chapter: 1,
    volume: 1,
    chapterRel: "chapters/chapter-001.md",
    summaryRel: "summaries/chapter-001-summary.md",
    evalRel: "evaluations/chapter-001-eval.json"
  });

  assert.equal(computed.record.word_count, 123);
  assert.equal(computed.record.plot_progression_beats, 2);
  assert.ok(computed.record.notes.includes("platform_constraints"));
  assert.ok(computed.record.notes.includes("key_events"));
});

test("computeEngagementReport flags low-density stretches and trends", () => {
  const records: EngagementMetricRecord[] = [];
  for (let chapter = 1; chapter <= 5; chapter += 1) {
    records.push({
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 1,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    });
  }

  const report = computeEngagementReport({ records, asOfChapter: 5, volume: 1, chapterRange: { start: 1, end: 5 } });
  const ids = new Set(report.issues.map((i) => i.id));
  assert.ok(ids.has("engagement.low_density.low_plot_beats_stretch"));
  assert.ok(ids.has("engagement.low_density.low_payoff_trend"));
  assert.ok(ids.has("engagement.low_density.conflict_plateau"));
  assert.equal(report.has_blocking_issues, false);
});

test("writeEngagementLogs keeps latest.json monotonic by chapter (and generated_at tie-break)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-log-mono-"));

  const mkReport = (chapter: number, generated_at: string): EngagementReport => ({
    schema_version: 1,
    generated_at,
    as_of: { chapter, volume: 1 },
    scope: { volume: 1, chapter_start: Math.max(1, chapter - 9), chapter_end: chapter },
    metrics_stream_path: "engagement-metrics.jsonl",
    metrics: [],
    stats: {
      chapters: 0,
      avg_word_count: null,
      avg_plot_progression_beats: null,
      avg_conflict_intensity: null,
      avg_payoff_score: null,
      avg_new_info_load_score: null
    },
    issues: [],
    has_blocking_issues: false
  });

  await writeEngagementLogs({ rootDir, report: mkReport(5, "2026-01-01T00:00:00.000Z"), historyRange: null });
  await writeEngagementLogs({ rootDir, report: mkReport(4, "2026-01-02T00:00:00.000Z"), historyRange: null });

  const latestAbs = join(rootDir, "logs", "engagement", "latest.json");
  const raw = JSON.parse(await readFile(latestAbs, "utf8")) as EngagementReport;
  assert.equal(raw.as_of.chapter, 5);

  await writeEngagementLogs({ rootDir, report: mkReport(5, "2025-01-01T00:00:00.000Z"), historyRange: null });
  const raw2 = JSON.parse(await readFile(latestAbs, "utf8")) as EngagementReport;
  assert.equal(raw2.generated_at, "2026-01-01T00:00:00.000Z");

  await writeEngagementLogs({ rootDir, report: mkReport(5, "2027-01-01T00:00:00.000Z"), historyRange: null });
  const raw3 = JSON.parse(await readFile(latestAbs, "utf8")) as EngagementReport;
  assert.equal(raw3.generated_at, "2027-01-01T00:00:00.000Z");
});

test("writeEngagementLogs writes latest + history when requested", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-logs-"));
  const report = computeEngagementReport({ records: [], asOfChapter: 10, volume: 2, chapterRange: { start: 1, end: 10 } });
  const written = await writeEngagementLogs({ rootDir, report, historyRange: { start: 1, end: 10 } });

  assert.equal(written.latestRel, "logs/engagement/latest.json");
  assert.equal(written.historyRel, "logs/engagement/engagement-report-vol-02-ch001-ch010.json");

  const latestRaw = JSON.parse(await readFile(join(rootDir, written.latestRel), "utf8")) as any;
  assert.equal(latestRaw.schema_version, 1);
  const historyRaw = JSON.parse(await readFile(join(rootDir, written.historyRel), "utf8")) as any;
  assert.equal(historyRaw.schema_version, 1);
});

