import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { buildInstructionPacket } from "../instructions.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

test("buildInstructionPacket injects compact narrative health summaries into draft/refine packets (best-effort)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-injection-"));

  const longSummary = `${"x".repeat(238)}😀${"y".repeat(20)}`;

  await writeJson(join(rootDir, "logs/engagement/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    metrics_stream_path: "engagement-metrics.jsonl",
    metrics: [],
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
      summary: i === 0 ? longSummary : `Issue ${i + 1}`,
      suggestion: "Add a small reveal or reward beat in the next chapter."
    })),
    has_blocking_issues: false
  });

  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: {
      total_promises: 2,
      promised_total: 2,
      advanced_total: 0,
      delivered_total: 0,
      open_total: 2,
      dormant_total: 1
    },
    dormant_promises: Array.from({ length: 7 }).map((_, i) => ({
      id: `promise.${i + 1}`,
      type: "core_mystery",
      promise_text: `承诺 ${i + 1}`,
      status: "promised",
      introduced_chapter: 1,
      last_touched_chapter: 1,
      chapters_since_last_touch: i,
      dormancy_threshold_chapters: 12,
      suggestion: "轻触谜团：加入一个微小线索（不要揭示答案）。"
    })),
    issues: [
      {
        id: "promise_ledger.dormancy.dormant_promises",
        severity: "warn",
        summary: "Dormant promises detected.",
        suggestion: "Use light-touch reminders to reduce perceived stalling."
      }
    ],
    has_blocking_issues: false
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const draftOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const draftInline = draftOut.packet.manifest.inline;
  assert.equal(typeof draftInline.engagement_report_summary, "object");
  assert.equal(typeof draftInline.promise_ledger_report_summary, "object");
  assert.equal(draftInline.engagement_report_summary.issues.length, 5);
  assert.equal(draftInline.promise_ledger_report_summary.dormant_promises.length, 5);
  assert.ok(String(draftInline.engagement_report_summary.issues[0]?.summary ?? "").endsWith("…"));
  const truncated = String(draftInline.engagement_report_summary.issues[0]?.summary ?? "");
  const lastBeforeEllipsis = truncated.charCodeAt(Math.max(0, truncated.length - 2));
  assert.ok(lastBeforeEllipsis < 0xd800 || lastBeforeEllipsis > 0xdbff);
  assert.equal(draftOut.packet.manifest.paths.engagement_report_latest, "logs/engagement/latest.json");
  assert.equal(draftOut.packet.manifest.paths.promise_ledger_report_latest, "logs/promises/latest.json");

  const refineOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "refine" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const refineInline = refineOut.packet.manifest.inline;
  assert.equal(typeof refineInline.engagement_report_summary, "object");
  assert.equal(typeof refineInline.promise_ledger_report_summary, "object");
  assert.equal(refineInline.engagement_report_summary.issues.length, 5);
  assert.equal(refineInline.promise_ledger_report_summary.dormant_promises.length, 5);
  assert.equal(refineOut.packet.manifest.paths.engagement_report_latest, "logs/engagement/latest.json");
  assert.equal(refineOut.packet.manifest.paths.promise_ledger_report_latest, "logs/promises/latest.json");
});

test("buildInstructionPacket marks degraded when latest reports exist but are invalid", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-injection-degraded-"));

  // Engagement latest exists but is invalid JSON.
  await writeText(join(rootDir, "logs/engagement/latest.json"), "{");

  // Promise latest is valid.
  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: { total_promises: 0, promised_total: 0, advanced_total: 0, delivered_total: 0, open_total: 0, dormant_total: 0 },
    dormant_promises: [],
    issues: [],
    has_blocking_issues: false
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet.manifest.inline;
  assert.equal(inline.engagement_report_summary, undefined);
  assert.equal(inline.engagement_report_summary_degraded, true);
  assert.equal(typeof inline.promise_ledger_report_summary, "object");
  assert.equal(inline.promise_ledger_report_summary_degraded, undefined);
});

test("buildInstructionPacket does not inject narrative health when logs are missing (no summary, no degraded)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-no-logs-"));

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet.manifest.inline;
  assert.equal(inline.engagement_report_summary, undefined);
  assert.equal(inline.engagement_report_summary_degraded, undefined);
  assert.equal(inline.promise_ledger_report_summary, undefined);
  assert.equal(inline.promise_ledger_report_summary_degraded, undefined);

  const paths = out.packet.manifest.paths;
  assert.equal(paths.engagement_report_latest, undefined);
  assert.equal(paths.promise_ledger_report_latest, undefined);
});

test("buildInstructionPacket does not inject narrative health summaries for stage=summarize/judge", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-no-inject-stages-"));

  await writeJson(join(rootDir, "logs/engagement/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    metrics_stream_path: "engagement-metrics.jsonl",
    metrics: [],
    stats: {
      chapters: 10,
      avg_word_count: 3000,
      avg_plot_progression_beats: 2,
      avg_conflict_intensity: 3,
      avg_payoff_score: 2,
      avg_new_info_load_score: 3
    },
    issues: [],
    has_blocking_issues: false
  });

  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: { total_promises: 0, promised_total: 0, advanced_total: 0, delivered_total: 0, open_total: 0, dormant_total: 0 },
    dormant_promises: [],
    issues: [],
    has_blocking_issues: false
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const summarizeOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "summarize" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const summarizeInline = summarizeOut.packet.manifest.inline;
  assert.equal(summarizeInline.engagement_report_summary, undefined);
  assert.equal(summarizeInline.engagement_report_summary_degraded, undefined);
  assert.equal(summarizeInline.promise_ledger_report_summary, undefined);
  assert.equal(summarizeInline.promise_ledger_report_summary_degraded, undefined);

  const judgeOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "judge" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const judgeInline = judgeOut.packet.manifest.inline;
  assert.equal(judgeInline.engagement_report_summary, undefined);
  assert.equal(judgeInline.engagement_report_summary_degraded, undefined);
  assert.equal(judgeInline.promise_ledger_report_summary, undefined);
  assert.equal(judgeInline.promise_ledger_report_summary_degraded, undefined);
});

test("buildInstructionPacket marks degraded on schema_version mismatch when latest files exist", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-schema-mismatch-"));

  await writeJson(join(rootDir, "logs/engagement/latest.json"), {
    schema_version: 2,
    generated_at: "2026-03-03T00:00:00.000Z",
    issues: []
  });

  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: { total_promises: 0, promised_total: 0, advanced_total: 0, delivered_total: 0, open_total: 0, dormant_total: 0 },
    dormant_promises: [],
    issues: [],
    has_blocking_issues: false
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet.manifest.inline;
  assert.equal(inline.engagement_report_summary, undefined);
  assert.equal(inline.engagement_report_summary_degraded, true);
  assert.equal(typeof inline.promise_ledger_report_summary, "object");
  assert.equal(inline.promise_ledger_report_summary_degraded, undefined);
});

test("buildInstructionPacket marks promise ledger degraded on schema_version mismatch when latest file exists", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-promise-schema-mismatch-"));

  await writeJson(join(rootDir, "logs/engagement/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    metrics_stream_path: "engagement-metrics.jsonl",
    metrics: [],
    stats: {
      chapters: 10,
      avg_word_count: 3000,
      avg_plot_progression_beats: 2,
      avg_conflict_intensity: 3,
      avg_payoff_score: 2,
      avg_new_info_load_score: 3
    },
    issues: [],
    has_blocking_issues: false
  });

  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 2,
    generated_at: "2026-03-03T00:00:00.000Z",
    issues: []
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), `# 第1章\n\n（占位）\n`);
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet.manifest.inline;
  assert.equal(typeof inline.engagement_report_summary, "object");
  assert.equal(inline.engagement_report_summary_degraded, undefined);
  assert.equal(inline.promise_ledger_report_summary, undefined);
  assert.equal(inline.promise_ledger_report_summary_degraded, true);
});

test("buildInstructionPacket marks both degraded when both latest files are invalid", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-both-degraded-"));

  await writeText(join(rootDir, "logs/engagement/latest.json"), "not-json");
  await writeText(join(rootDir, "logs/promises/latest.json"), "not-json");

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n（占位）\n");
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet?.manifest?.inline;
  assert.equal(inline.engagement_report_summary, undefined);
  assert.equal(inline.engagement_report_summary_degraded, true);
  assert.equal(inline.promise_ledger_report_summary, undefined);
  assert.equal(inline.promise_ledger_report_summary_degraded, true);
});

test("buildInstructionPacket treats oversized latest.json as degraded", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-narrative-health-oversized-"));

  // Write a latest.json that exceeds 512KB
  const oversizedContent = JSON.stringify({
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    metrics_stream_path: "engagement-metrics.jsonl",
    metrics: [],
    stats: { chapters: 10, avg_word_count: 3000, avg_plot_progression_beats: 2, avg_conflict_intensity: 3, avg_payoff_score: 2, avg_new_info_load_score: 3 },
    issues: [{ id: "pad", severity: "warn", summary: "x".repeat(600000), suggestion: "y" }],
    has_blocking_issues: false
  });
  await writeText(join(rootDir, "logs/engagement/latest.json"), oversizedContent);

  // Promise latest is valid and small
  await writeJson(join(rootDir, "logs/promises/latest.json"), {
    schema_version: 1,
    generated_at: "2026-03-03T00:00:00.000Z",
    as_of: { chapter: 10, volume: 1 },
    scope: { volume: 1, chapter_start: 1, chapter_end: 10 },
    ledger_path: "promise-ledger.json",
    policy: { dormancy_threshold_chapters: 12 },
    stats: { total_promises: 0, promised_total: 0, advanced_total: 0, delivered_total: 0, open_total: 0, dormant_total: 0 },
    dormant_promises: [],
    issues: [],
    has_blocking_issues: false
  });

  await writeText(join(rootDir, "staging/chapters/chapter-001.md"), "# 第1章\n\n（占位）\n");
  const checkpoint = { last_completed_chapter: 10, current_volume: 1, orchestrator_state: "WRITING" as const };

  const out = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const inline = out.packet?.manifest?.inline;
  // Engagement should be degraded due to oversized file
  assert.equal(inline.engagement_report_summary, undefined);
  assert.equal(inline.engagement_report_summary_degraded, true);
  // Promise should be fine
  assert.ok(inline.promise_ledger_report_summary);
  assert.equal(inline.promise_ledger_report_summary_degraded, undefined);
});
