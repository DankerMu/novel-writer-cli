import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { computeStorylineRhythm } from "../volume-review.js";

test("computeStorylineRhythm counts multiple storyline_id entries per chapter (unique per chapter)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-storyline-rhythm-"));
  await mkdir(join(rootDir, "summaries"), { recursive: true });

  await writeFile(
    join(rootDir, "summaries/chapter-001-summary.md"),
    `storyline_id: main\nstoryline_id: side\nstoryline_id: side\n`,
    "utf8"
  );
  await writeFile(join(rootDir, "summaries/chapter-002-summary.md"), `storyline_id: side\n`, "utf8");

  const res = await computeStorylineRhythm({ rootDir, volume: 1, chapter_range: [1, 2] });
  const obj = res as Record<string, unknown>;

  assert.equal(obj.schema_version, 1);
  assert.deepEqual(obj.appearances, { main: 1, side: 2 });
  assert.deepEqual(obj.last_seen, { main: 1, side: 2 });
  assert.ok(Array.isArray(obj.warnings));
  assert.ok((obj.warnings as string[]).some((w) => w.includes("Missing optional file: volumes/vol-01/storyline-schedule.json")));
});

