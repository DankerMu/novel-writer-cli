import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { readCheckpoint } from "../checkpoint.js";
import { NovelCliError } from "../errors.js";
import { initProject, normalizePlatformId, resolveInitRootDir } from "../init.js";
import { computeNextStep } from "../next-step.js";
import { parsePlatformProfile } from "../platform-profile.js";

// ── Helpers ──────────────────────────────────────────────────────────────

async function assertDir(absPath: string): Promise<void> {
  const s = await stat(absPath);
  assert.ok(s.isDirectory(), `Expected directory: ${absPath}`);
}

async function assertFile(absPath: string): Promise<void> {
  const s = await stat(absPath);
  assert.ok(s.isFile(), `Expected file: ${absPath}`);
}

async function statExists(absPath: string): Promise<boolean> {
  try {
    await stat(absPath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(absPath: string): Promise<unknown> {
  return JSON.parse(await readFile(absPath, "utf8")) as unknown;
}

// ── resolveInitRootDir ──────────────────────────────────────────────────

test("resolveInitRootDir returns cwd when no projectOverride", () => {
  const result = resolveInitRootDir({ cwd: "/tmp/foo" });
  assert.equal(result, "/tmp/foo");
});

test("resolveInitRootDir resolves relative projectOverride against cwd", () => {
  const result = resolveInitRootDir({ cwd: "/tmp", projectOverride: "my-novel" });
  assert.equal(result, "/tmp/my-novel");
});

test("resolveInitRootDir rejects path traversal", () => {
  assert.throws(
    () => resolveInitRootDir({ cwd: "/tmp", projectOverride: "../../etc" }),
    (err: unknown) => err instanceof NovelCliError && /path traversal/i.test(err.message)
  );
});

// ── normalizePlatformId ─────────────────────────────────────────────────

test("normalizePlatformId accepts valid values", () => {
  assert.equal(normalizePlatformId("qidian"), "qidian");
  assert.equal(normalizePlatformId("tomato"), "tomato");
});

test("normalizePlatformId rejects invalid values", () => {
  assert.throws(
    () => normalizePlatformId("jjwxc"),
    (err: unknown) => err instanceof NovelCliError && /Invalid --platform.*jjwxc/i.test(err.message)
  );
  assert.throws(
    () => normalizePlatformId(42),
    (err: unknown) => err instanceof NovelCliError && /Invalid --platform/i.test(err.message)
  );
});

// ── initProject: basic skeleton ─────────────────────────────────────────

test("initProject creates a runnable skeleton with all checkpoint fields", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-basic-"));
  try {
    const result = await initProject({ rootDir });
    assert.equal(result.rootDir, rootDir);

    // Exact created set (non-minimal = checkpoint + 4 templates)
    assert.deepEqual(
      result.created.sort(),
      [".checkpoint.json", "ai-blacklist.json", "brief.md", "style-profile.json", "web-novel-cliche-lint.json"].sort()
    );

    // All 9 staging dirs ensured
    assert.equal(result.ensuredDirs.length, 9);
    assert.ok(result.ensuredDirs.includes("staging/chapters"));
    assert.ok(result.ensuredDirs.includes("staging/manifests"));
    assert.ok(result.ensuredDirs.includes("staging/volumes"));
    assert.ok(result.ensuredDirs.includes("staging/foreshadowing"));

    // Verify ALL checkpoint fields
    const checkpoint = await readCheckpoint(rootDir);
    assert.equal(checkpoint.last_completed_chapter, 0);
    assert.equal(checkpoint.current_volume, 1);
    assert.equal(checkpoint.pipeline_stage, "committed");
    assert.equal(checkpoint.volume_pipeline_stage, null);
    assert.equal(checkpoint.inflight_chapter, null);
    assert.equal(checkpoint.revision_count, 0);
    assert.equal(checkpoint.hook_fix_count, 0);
    assert.equal(checkpoint.title_fix_count, 0);
    assert.ok(typeof checkpoint.last_checkpoint_time === "string" && checkpoint.last_checkpoint_time.length > 0);

    // Integration: next step should be chapter:001:draft
    const next = await computeNextStep(rootDir, checkpoint);
    assert.equal(next.step, "chapter:001:draft");

    // All staging dirs exist
    for (const relDir of [
      "staging/chapters",
      "staging/summaries",
      "staging/state",
      "staging/evaluations",
      "staging/logs",
      "staging/storylines",
      "staging/volumes",
      "staging/foreshadowing",
      "staging/manifests"
    ]) {
      await assertDir(join(rootDir, relDir));
    }

    // All template files exist
    for (const relFile of ["brief.md", "style-profile.json", "ai-blacklist.json", "web-novel-cliche-lint.json"]) {
      await assertFile(join(rootDir, relFile));
    }
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── Skip / Force: .checkpoint.json ──────────────────────────────────────

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
    assert.equal(result.overwritten.length, 0);

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

// ── Skip / Force: template files ────────────────────────────────────────

test("initProject skips existing template files without --force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-skip-tpl-"));
  try {
    // Pre-create a template file
    await writeFile(join(rootDir, "brief.md"), "custom brief", "utf8");
    await writeFile(join(rootDir, "ai-blacklist.json"), "{}", "utf8");

    const result = await initProject({ rootDir });
    assert.ok(result.skipped.includes("brief.md"));
    assert.ok(result.skipped.includes("ai-blacklist.json"));
    assert.ok(result.created.includes("style-profile.json"));
    assert.ok(result.created.includes("web-novel-cliche-lint.json"));

    // Verify content was NOT overwritten
    const content = await readFile(join(rootDir, "brief.md"), "utf8");
    assert.equal(content, "custom brief");
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test("initProject overwrites template files with --force", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-force-tpl-"));
  try {
    await writeFile(join(rootDir, "brief.md"), "custom brief", "utf8");

    const result = await initProject({ rootDir, force: true });
    assert.ok(result.overwritten.includes("brief.md"));

    // Verify content was overwritten with template content
    const content = await readFile(join(rootDir, "brief.md"), "utf8");
    assert.notEqual(content, "custom brief");
    assert.ok(content.length > 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── Platform: tomato ────────────────────────────────────────────────────

test("initProject writes platform-profile.json + genre-weight-profiles.json for --platform tomato", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-platform-tomato-"));
  try {
    const result = await initProject({ rootDir, minimal: true, platform: "tomato" });
    assert.ok(result.created.includes("platform-profile.json"));
    assert.ok(result.created.includes("genre-weight-profiles.json"));

    const raw = await readJson(join(rootDir, "platform-profile.json"));
    const profile = parsePlatformProfile(raw, "platform-profile.json");
    assert.equal(profile.platform, "tomato");
    assert.ok(typeof profile.created_at === "string" && profile.created_at.length > 0);
    assert.ok(typeof profile.schema_version === "number");

    // genre-weight-profiles.json should be a valid JSON object
    const genreRaw = await readJson(join(rootDir, "genre-weight-profiles.json"));
    assert.ok(typeof genreRaw === "object" && genreRaw !== null && !Array.isArray(genreRaw));
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── Platform: qidian ────────────────────────────────────────────────────

test("initProject writes platform-profile.json for --platform qidian", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-platform-qidian-"));
  try {
    const result = await initProject({ rootDir, minimal: true, platform: "qidian" });
    assert.ok(result.created.includes("platform-profile.json"));
    assert.ok(result.created.includes("genre-weight-profiles.json"));

    const raw = await readJson(join(rootDir, "platform-profile.json"));
    const profile = parsePlatformProfile(raw, "platform-profile.json");
    assert.equal(profile.platform, "qidian");
    assert.ok(typeof profile.created_at === "string" && profile.created_at.length > 0);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── Minimal mode ────────────────────────────────────────────────────────

test("initProject minimal mode skips templates", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-init-minimal-"));
  try {
    const result = await initProject({ rootDir, minimal: true });

    assert.ok(result.created.includes(".checkpoint.json"));
    assert.equal(result.created.length, 1);
    await assertFile(join(rootDir, ".checkpoint.json"));
    await assertDir(join(rootDir, "staging/chapters"));

    assert.equal(await statExists(join(rootDir, "brief.md")), false);
    assert.equal(await statExists(join(rootDir, "style-profile.json")), false);
    assert.equal(await statExists(join(rootDir, "ai-blacklist.json")), false);
    assert.equal(await statExists(join(rootDir, "web-novel-cliche-lint.json")), false);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

// ── Non-existent --project directory ────────────────────────────────────

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

// ── Negative: rootDir is a file ─────────────────────────────────────────

test("initProject throws when rootDir is a file", async () => {
  const parentDir = await mkdtemp(join(tmpdir(), "novel-init-file-"));
  const filePath = join(parentDir, "not-a-dir");
  await writeFile(filePath, "hello", "utf8");

  try {
    await assert.rejects(
      () => initProject({ rootDir: filePath, minimal: true }),
      (err: unknown) => err instanceof NovelCliError && /not a directory/i.test(err.message)
    );
  } finally {
    await rm(parentDir, { recursive: true, force: true });
  }
});
