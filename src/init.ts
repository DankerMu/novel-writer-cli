import { stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { PlatformId } from "./platform-profile.js";
import { createDefaultCheckpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile, writeTextFile } from "./fs-utils.js";
import { rejectPathTraversalInput } from "./safe-path.js";
import { isPlainObject } from "./type-guards.js";

export type InitProjectResult = {
  rootDir: string;
  ensuredDirs: string[];
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

export function normalizePlatformId(value: unknown): PlatformId {
  if (value === "qidian" || value === "tomato") return value;
  throw new NovelCliError(`Invalid --platform: ${String(value)} (expected qidian|tomato).`, 2);
}

function moduleRootDir(): string {
  // src/init.ts → <repo_root>; dist/init.js → <package_root>
  // NOTE: Not compatible with single-file bundlers (esbuild/rollup).
  return resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
}

const TEMPLATE_DIR = join(moduleRootDir(), "templates");

async function ensureRootIsDirectory(absPath: string): Promise<void> {
  try {
    const s = await stat(absPath);
    if (!s.isDirectory()) {
      throw new NovelCliError(`Project root is not a directory: ${absPath}`, 2);
    }
  } catch (err: unknown) {
    if (err instanceof NovelCliError) throw err;
    // Path does not exist or is inaccessible — attempt to create it.
    await ensureDir(absPath);
  }
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
  try {
    return await readTextFile(join(TEMPLATE_DIR, name));
  } catch (err: unknown) {
    if (err instanceof NovelCliError) {
      throw new NovelCliError(`Built-in template missing or unreadable: templates/${name}. ${err.message}`, 2);
    }
    throw err;
  }
}

async function loadTemplateJson(name: string): Promise<Record<string, unknown>> {
  let raw: unknown;
  try {
    raw = await readJsonFile(join(TEMPLATE_DIR, name));
  } catch (err: unknown) {
    if (err instanceof NovelCliError) {
      throw new NovelCliError(`Built-in template missing or unreadable: templates/${name}. ${err.message}`, 2);
    }
    throw err;
  }
  if (!isPlainObject(raw)) {
    throw new NovelCliError(`Built-in template templates/${name}: expected a JSON object, got ${typeof raw}.`, 2);
  }
  return raw;
}

async function loadPlatformProfileTemplate(platform: PlatformId): Promise<Record<string, unknown>> {
  const raw = await loadTemplateJson("platform-profile.json");
  const defaults = raw.defaults;
  if (!isPlainObject(defaults)) {
    throw new NovelCliError("Invalid templates/platform-profile.json: missing 'defaults' object.", 2);
  }
  const selected = defaults[platform];
  if (!isPlainObject(selected)) {
    throw new NovelCliError(`Invalid templates/platform-profile.json: missing defaults.${platform} object.`, 2);
  }
  return selected;
}

type TemplateEntry =
  | { relPath: string; templateName: string; kind: "text" }
  | { relPath: string; templateName: string; kind: "json" };

const DEFAULT_TEMPLATES: TemplateEntry[] = [
  { relPath: "brief.md", templateName: "brief-template.md", kind: "text" },
  { relPath: "style-profile.json", templateName: "style-profile-template.json", kind: "json" },
  { relPath: "ai-blacklist.json", templateName: "ai-blacklist.json", kind: "json" },
  { relPath: "web-novel-cliche-lint.json", templateName: "web-novel-cliche-lint.json", kind: "json" }
];

const STAGING_SUBDIRS = [
  "staging/chapters",
  "staging/summaries",
  "staging/state",
  "staging/evaluations",
  "staging/logs",
  "staging/storylines",
  "staging/manifests"
];

export async function initProject(args: {
  rootDir: string;
  force?: boolean;
  minimal?: boolean;
  platform?: PlatformId;
}): Promise<InitProjectResult> {
  const force = Boolean(args.force);
  const minimal = Boolean(args.minimal);
  const platform = args.platform ?? null;

  const result: InitProjectResult = {
    rootDir: args.rootDir,
    ensuredDirs: [],
    created: [],
    overwritten: [],
    skipped: []
  };

  await ensureRootIsDirectory(args.rootDir);

  for (const relDir of STAGING_SUBDIRS) {
    await ensureDir(join(args.rootDir, relDir));
    result.ensuredDirs.push(relDir);
  }

  // Intentionally capture time once for transactional consistency.
  const nowIso = new Date().toISOString();
  await writeIfMissingOrForce({
    rootDir: args.rootDir,
    relPath: ".checkpoint.json",
    contents: { kind: "json", json: createDefaultCheckpoint(nowIso) },
    force,
    result
  });

  if (!minimal) {
    for (const tmpl of DEFAULT_TEMPLATES) {
      const contents =
        tmpl.kind === "text"
          ? { kind: "text" as const, text: await loadTemplateText(tmpl.templateName) }
          : { kind: "json" as const, json: await loadTemplateJson(tmpl.templateName) };
      await writeIfMissingOrForce({ rootDir: args.rootDir, relPath: tmpl.relPath, contents, force, result });
    }
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
