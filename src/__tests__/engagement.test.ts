import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import {
  appendEngagementMetricRecord,
  computeEngagementMetricRecord,
  computeEngagementReport,
  loadEngagementMetricsStream,
  summarizeEngagementReport,
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

test("computeEngagementMetricRecord falls back to summary bullets when key events are missing", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-metric-bullets-"));

  await writeText(join(rootDir, "chapters/chapter-001.md"), "你好 世界\n");
  await writeText(
    join(rootDir, "summaries/chapter-001-summary.md"),
    `## 第 1 章摘要\n\n- 主角遭遇危机，与强敌对峙\n- 反转揭示真相，获得奖励\n`
  );

  const computed = await computeEngagementMetricRecord({
    rootDir,
    chapter: 1,
    volume: 1,
    chapterRel: "chapters/chapter-001.md",
    summaryRel: "summaries/chapter-001-summary.md",
    evalRel: "evaluations/chapter-001-eval.json"
  });

  assert.equal(computed.record.plot_progression_beats, 2);
  assert.ok(computed.record.conflict_intensity >= 2);
  assert.ok(computed.record.payoff_score >= 2);
  assert.ok(computed.record.notes.includes("summary_bullets"));
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

test("computeEngagementReport does not treat gaps as consecutive stretches", () => {
  const records: EngagementMetricRecord[] = [
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 1,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 1,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 3,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 1,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 4,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 1,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    }
  ];

  const report = computeEngagementReport({ records, asOfChapter: 4, volume: 1, chapterRange: { start: 1, end: 4 } });
  assert.equal(report.issues.length, 0);
});

test("computeEngagementReport skips tail-based warnings when the last 5 chapters are incomplete", () => {
  const records: EngagementMetricRecord[] = [
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 1,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 2,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 2,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 2,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 3,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 2,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 4,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 2,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    },
    {
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 6,
      volume: 1,
      word_count: 1000,
      plot_progression_beats: 2,
      conflict_intensity: 1,
      payoff_score: 1,
      new_info_load_score: 1,
      notes: "test"
    }
  ];

  const report = computeEngagementReport({ records, asOfChapter: 6, volume: 1, chapterRange: { start: 1, end: 6 } });
  assert.equal(report.issues.length, 0);
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

test("appendEngagementMetricRecord writes a JSONL line under the default path", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-jsonl-"));

  const record: EngagementMetricRecord = {
    schema_version: 1,
    generated_at: "2026-01-01T00:00:00.000Z",
    chapter: 1,
    volume: 1,
    word_count: 100,
    plot_progression_beats: 2,
    conflict_intensity: 2,
    payoff_score: 3,
    new_info_load_score: 2,
    notes: "test"
  };

  const written = await appendEngagementMetricRecord({ rootDir, record });
  assert.equal(written.rel, "engagement-metrics.jsonl");

  const raw = await readFile(join(rootDir, written.rel), "utf8");
  const lines = raw.trim().split(/\r?\n/gu);
  assert.equal(lines.length, 1);

  const parsed = JSON.parse(lines[0] ?? "") as EngagementMetricRecord;
  assert.equal(parsed.chapter, 1);
  assert.equal(parsed.word_count, 100);
});

test("loadEngagementMetricsStream skips invalid JSON and invalid records", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-load-"));

  const lines: string[] = [];
  lines.push(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 1,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "ok"
    })
  );
  lines.push("{");
  lines.push(
    JSON.stringify({
      schema_version: 2,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 2,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "wrong schema"
    })
  );
  lines.push(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-01-01T00:00:00.000Z",
      chapter: 3,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2
    })
  );
  lines.push(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-01-01",
      chapter: 4,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "bad timestamp"
    })
  );
  lines.push(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-02-29T00:00:00.000Z",
      chapter: 5,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "invalid calendar date"
    })
  );
  lines.push(
    JSON.stringify({
      schema_version: 1,
      generated_at: "2026-01-02T00:00:00.000Z",
      chapter: 5,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "ok2"
    })
  );

  await writeText(join(rootDir, "engagement-metrics.jsonl"), `${lines.join("\n")}\n`);

  const loaded = await loadEngagementMetricsStream({ rootDir });
  assert.equal(loaded.rel, "engagement-metrics.jsonl");
  assert.equal(loaded.records.length, 2);
  assert.equal(loaded.records[0]?.chapter, 1);
  assert.equal(loaded.records[1]?.chapter, 5);
  assert.ok(loaded.warnings.length >= 5);
});

test("loadEngagementMetricsStream rejects invalid calendar dates (no Date.parse normalization)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-engagement-load-date-"));

  await writeText(
    join(rootDir, "engagement-metrics.jsonl"),
    `${JSON.stringify({
      schema_version: 1,
      generated_at: "2026-02-29T00:00:00Z",
      chapter: 1,
      volume: 1,
      word_count: 100,
      plot_progression_beats: 2,
      conflict_intensity: 2,
      payoff_score: 3,
      new_info_load_score: 2,
      notes: "invalid calendar date"
    })}\n`
  );

  const loaded = await loadEngagementMetricsStream({ rootDir });
  assert.equal(loaded.records.length, 0);
  assert.equal(loaded.warnings.length, 1);
});

test("summarizeEngagementReport trims, caps issues, and truncates surrogate-pair-safe", () => {
  const longSummary = `${"x".repeat(238)}😀${"y".repeat(20)}`;
  const raw = {
    schema_version: 1,
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    stats: {
      chapters: 10,
      avg_word_count: 3000,
      avg_plot_progression_beats: 2,
      avg_conflict_intensity: 3,
      avg_payoff_score: 2,
      avg_new_info_load_score: 3
    },
    issues: Array.from({ length: 7 }).map((_, i) => ({
      id: `engagement.issue.${i + 1}`,
      severity: "warn",
      summary: i === 0 ? `  ${longSummary}  ` : `Issue ${i + 1}`,
      suggestion: "Add a small reveal or reward beat in the next chapter."
    })),
    has_blocking_issues: false
  };

  const summary = summarizeEngagementReport(raw) as any;
  assert.equal(summary.as_of.chapter, 10);
  assert.equal(summary.stats.chapters, 10);
  assert.equal(summary.has_blocking_issues, false);
  assert.equal(summary.issues.length, 5);

  const truncated = String(summary.issues[0]?.summary ?? "");
  assert.ok(truncated.endsWith("…"));
  const lastBeforeEllipsis = truncated.charCodeAt(Math.max(0, truncated.length - 2));
  assert.ok(lastBeforeEllipsis < 0xd800 || lastBeforeEllipsis > 0xdbff);

  assert.equal(summarizeEngagementReport({ schema_version: 2 }), null);
});
