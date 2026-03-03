import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readCheckpoint } from "../checkpoint.js";
import { initProject } from "../init.js";
import { computeNextStep } from "../next-step.js";
import { parsePlatformProfile } from "../platform-profile.js";

async function assertDir(absPath: string): Promise<void> {
  const s = await stat(absPath);
  assert.ok(s.isDirectory(), `Expected directory: ${absPath}`);
}

async function assertFile(absPath: string): Promise<void> {
  const s = await stat(absPath);
  assert.ok(s.isFile(), `Expected file: ${absPath}`);
}

async function readJson(absPath: string): Promise<unknown> {
  return JSON.parse(await readFile(absPath, "utf8")) as unknown;
}

test("initProject creates a runnable skeleton", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-basic-"));
  try {
    const result = await initProject({ rootDir });
    assert.equal(result.rootDir, rootDir);
    assert.ok(result.created.includes(".checkpoint.json"));

    const checkpoint = await readCheckpoint(rootDir);
    assert.equal(checkpoint.last_completed_chapter, 0);
    assert.equal(checkpoint.current_volume, 1);

    const next = await computeNextStep(rootDir, checkpoint);
    assert.equal(next.step, "chapter:001:draft");

    for (const relDir of [
      "staging/chapters",
      "staging/summaries",
      "staging/state",
      "staging/evaluations",
      "staging/logs",
      "staging/storylines",
      "staging/manifests"
    ]) {
      await assertDir(join(rootDir, relDir));
    }

    for (const relFile of ["brief.md", "style-profile.json", "ai-blacklist.json", "web-novel-cliche-lint.json"]) {
      await assertFile(join(rootDir, relFile));
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("initProject does not overwrite .checkpoint.json without --force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-no-force-"));
  try {
    await writeFile(
      join(rootDir, ".checkpoint.json"),
      `${JSON.stringify({ last_completed_chapter: 5, current_volume: 1, pipeline_stage: "committed", inflight_chapter: null }, null, 2)}\n`,
      "utf8"
    );

    const result = await initProject({ rootDir, minimal: true });
    assert.ok(result.skipped.includes(".checkpoint.json"));

    const checkpoint = await readCheckpoint(rootDir);
    assert.equal(checkpoint.last_completed_chapter, 5);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("initProject overwrites .checkpoint.json with --force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-force-"));
  try {
    await writeFile(
      join(rootDir, ".checkpoint.json"),
      `${JSON.stringify({ last_completed_chapter: 5, current_volume: 1, pipeline_stage: "committed", inflight_chapter: null }, null, 2)}\n`,
      "utf8"
    );

    const result = await initProject({ rootDir, minimal: true, force: true });
    assert.ok(result.overwritten.includes(".checkpoint.json"));

    const checkpoint = await readCheckpoint(rootDir);
    assert.equal(checkpoint.last_completed_chapter, 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("initProject writes platform-profile.json + genre-weight-profiles.json when --platform is set", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-platform-"));
  try {
    const result = await initProject({ rootDir, minimal: true, platform: "tomato" });
    assert.ok(result.created.includes("platform-profile.json"));
    assert.ok(result.created.includes("genre-weight-profiles.json"));

    const raw = await readJson(join(rootDir, "platform-profile.json"));
    const profile = parsePlatformProfile(raw, "platform-profile.json");
    assert.equal(profile.platform, "tomato");
    assert.ok(typeof profile.created_at === "string" && profile.created_at.length > 0);

    await assertFile(join(rootDir, "genre-weight-profiles.json"));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("initProject minimal mode skips templates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-minimal-"));
  try {
    await initProject({ rootDir, minimal: true });

    assert.ok(await stat(join(rootDir, ".checkpoint.json")));
    await assertDir(join(rootDir, "staging/chapters"));

    assert.equal(await statExists(join(rootDir, "brief.md")), false);
    assert.equal(await statExists(join(rootDir, "style-profile.json")), false);
    assert.equal(await statExists(join(rootDir, "ai-blacklist.json")), false);
    assert.equal(await statExists(join(rootDir, "web-novel-cliche-lint.json")), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

async function statExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

test("initProject can initialize a non-existent --project directory", async () => {
  const parentDir = await mkdtemp(join(tmpdir(), "novel-init-project-"));
  const rootDir = join(parentDir, "child-project");

  try {
    const result = await initProject({ rootDir, minimal: true });
    assert.equal(result.rootDir, rootDir);
    await assertFile(join(rootDir, ".checkpoint.json"));
  } finally {
    await rm(parentDir, { recursive: true, force: true });
  }
});
