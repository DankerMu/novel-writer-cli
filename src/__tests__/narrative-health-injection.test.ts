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
  const checkpoint = { last_completed_chapter: 10, current_volume: 1 };

  const draftOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "draft" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const draftInline = draftOut.packet?.manifest?.inline;
  assert.ok(draftInline?.engagement_report_summary);
  assert.ok(draftInline?.promise_ledger_report_summary);
  assert.equal(draftInline.engagement_report_summary.issues.length, 5);
  assert.equal(draftInline.promise_ledger_report_summary.dormant_promises.length, 5);
  assert.ok(String(draftInline.engagement_report_summary.issues[0]?.summary ?? "").endsWith("…"));
  const truncated = String(draftInline.engagement_report_summary.issues[0]?.summary ?? "");
  const lastBeforeEllipsis = truncated.charCodeAt(Math.max(0, truncated.length - 2));
  assert.ok(lastBeforeEllipsis < 0xd800 || lastBeforeEllipsis > 0xdbff);
  assert.equal(draftOut.packet?.manifest?.paths?.engagement_report_latest, "logs/engagement/latest.json");
  assert.equal(draftOut.packet?.manifest?.paths?.promise_ledger_report_latest, "logs/promises/latest.json");

  const refineOut = (await buildInstructionPacket({
    rootDir,
    checkpoint,
    step: { kind: "chapter", chapter: 1, stage: "refine" },
    embedMode: null,
    writeManifest: false
  })) as any;

  const refineInline = refineOut.packet?.manifest?.inline;
  assert.ok(refineInline?.engagement_report_summary);
  assert.ok(refineInline?.promise_ledger_report_summary);
  assert.equal(refineInline.engagement_report_summary.issues.length, 5);
  assert.equal(refineInline.promise_ledger_report_summary.dormant_promises.length, 5);
  assert.equal(refineOut.packet?.manifest?.paths?.engagement_report_latest, "logs/engagement/latest.json");
  assert.equal(refineOut.packet?.manifest?.paths?.promise_ledger_report_latest, "logs/promises/latest.json");
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
  const checkpoint = { last_completed_chapter: 10, current_volume: 1 };

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
  assert.ok(inline.promise_ledger_report_summary);
  assert.equal(inline.promise_ledger_report_summary_degraded, undefined);
});
