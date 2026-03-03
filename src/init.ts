import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlatformId } from "./platform-profile.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { rejectPathTraversalInput } from "./safe-path.js";
import { isPlainObject } from "./type-guards.js";

export type InitProjectResult = {
  rootDir: string;
  ensured_dirs: string[];
  created: string[];
  overwritten: string[];
  skipped: string[];
};

export function resolveInitRootDir(args: { cwd: string; projectOverride?: string }): string {
  const cwdAbs = resolve(args.cwd);
  if (!args.projectOverride) return cwdAbs;
  rejectPathTraversalInput(args.projectOverride, "--project");
  return resolve(cwdAbs, args.projectOverride);
}

function moduleRootDir(): string {
  // src/init.ts → <repo_root>; dist/init.js → <package_root>
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
}

const TEMPLATE_DIR = join(moduleRootDir(), "templates");

async function ensureDirectoryExists(absPath: string): Promise<void> {
  if (!(await pathExists(absPath))) {
    await ensureDir(absPath);
    return;
  }
  let s: Awaited<ReturnType<typeof stat>>;
  try {
    s = await stat(absPath);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Project root is not accessible: ${absPath}. ${message}`, 2);
  }
  if (!s.isDirectory()) {
    throw new NovelCliError(`Project root is not a directory: ${absPath}`, 2);
  }
}

function normalizePlatformId(value: unknown): PlatformId {
  if (value === "qidian" || value === "tomato") return value;
  throw new NovelCliError(`Invalid --platform: ${String(value)} (expected qidian|tomato).`, 2);
}

async function writeIfMissingOrForce(args: {
  rootDir: string;
  relPath: string;
  contents: { kind: "text"; text: string } | { kind: "json"; json: unknown };
  force: boolean;
  result: InitProjectResult;
}): Promise<void> {
  const abs = join(args.rootDir, args.relPath);
  const exists = await pathExists(abs);
  if (exists && !args.force) {
    args.result.skipped.push(args.relPath);
    return;
  }

  if (args.contents.kind === "text") await writeTextFile(abs, args.contents.text);
  else await writeJsonFile(abs, args.contents.json);

  if (exists) args.result.overwritten.push(args.relPath);
  else args.result.created.push(args.relPath);
}

async function loadTemplateText(name: string): Promise<string> {
  return await readTextFile(join(TEMPLATE_DIR, name));
}

async function loadTemplateJson(name: string): Promise<unknown> {
  return await readJsonFile(join(TEMPLATE_DIR, name));
}

async function loadPlatformProfileTemplate(platform: PlatformId): Promise<Record<string, unknown>> {
  const raw = await loadTemplateJson("platform-profile.json");
  if (!isPlainObject(raw)) {
    throw new NovelCliError("Invalid templates/platform-profile.json: expected a JSON object.", 2);
  }
  const defaults = (raw as Record<string, unknown>).defaults;
  if (!isPlainObject(defaults)) {
    throw new NovelCliError("Invalid templates/platform-profile.json: missing 'defaults' object.", 2);
  }
  const selected = (defaults as Record<string, unknown>)[platform];
  if (!isPlainObject(selected)) {
    throw new NovelCliError(`Invalid templates/platform-profile.json: missing defaults.${platform} object.`, 2);
  }
  return selected;
}

export async function initProject(args: {
  rootDir: string;
  force?: boolean;
  minimal?: boolean;
  platform?: string;
}): Promise<InitProjectResult> {
  const force = Boolean(args.force);
  const minimal = Boolean(args.minimal);
  const platform = args.platform !== undefined ? normalizePlatformId(args.platform) : null;

  const result: InitProjectResult = {
    rootDir: args.rootDir,
    ensured_dirs: [],
    created: [],
    overwritten: [],
    skipped: []
  };

  await ensureDirectoryExists(args.rootDir);

  const ensuredDirs = [
    "staging/chapters",
    "staging/summaries",
    "staging/state",
    "staging/evaluations",
    "staging/logs",
    "staging/storylines",
    "staging/manifests"
  ];
  for (const relDir of ensuredDirs) {
    await ensureDir(join(args.rootDir, relDir));
    result.ensured_dirs.push(relDir);
  }

  const nowIso = new Date().toISOString();
  await writeIfMissingOrForce({
    rootDir: args.rootDir,
    relPath: ".checkpoint.json",
    contents: {
      kind: "json",
      json: {
        last_completed_chapter: 0,
        current_volume: 1,
        pipeline_stage: "committed",
        inflight_chapter: null,
        revision_count: 0,
        hook_fix_count: 0,
        title_fix_count: 0,
        last_checkpoint_time: nowIso
      }
    },
    force,
    result
  });

  if (!minimal) {
    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "brief.md",
      contents: { kind: "text", text: await loadTemplateText("brief-template.md") },
      force,
      result
    });

    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "style-profile.json",
      contents: { kind: "json", json: await loadTemplateJson("style-profile-template.json") },
      force,
      result
    });

    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "ai-blacklist.json",
      contents: { kind: "json", json: await loadTemplateJson("ai-blacklist.json") },
      force,
      result
    });

    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "web-novel-cliche-lint.json",
      contents: { kind: "json", json: await loadTemplateJson("web-novel-cliche-lint.json") },
      force,
      result
    });
  }

  if (platform) {
    const templateProfile = await loadPlatformProfileTemplate(platform);
    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "platform-profile.json",
      contents: { kind: "json", json: { ...templateProfile, created_at: nowIso } },
      force,
      result
    });

    // genre-weight-profiles.json is required when platform-profile.json.scoring is present.
    await writeIfMissingOrForce({
      rootDir: args.rootDir,
      relPath: "genre-weight-profiles.json",
      contents: { kind: "json", json: await loadTemplateJson("genre-weight-profiles.json") },
      force,
      result
    });
  }

  return result;
}

