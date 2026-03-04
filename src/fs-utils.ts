import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { NovelCliError } from "./errors.js";

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function readTextFile(path: string): Promise<string> {
  try {
    return await readFile(path, "utf8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to read file: ${path}. ${message}`);
  }
}

export async function readJsonFile(path: string): Promise<unknown> {
  const raw = await readTextFile(path);
  try {
    return JSON.parse(raw) as unknown;
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Invalid JSON: ${path}. ${message}`);
  }
}

export async function writeTextFile(path: string, contents: string): Promise<void> {
  try {
    await ensureDir(dirname(path));
    await writeFile(path, contents, "utf8");
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to write file: ${path}. ${message}`);
  }
}

export async function writeTextFileIfMissing(path: string, contents: string): Promise<void> {
  try {
    await ensureDir(dirname(path));
    await writeFile(path, contents, { encoding: "utf8", flag: "wx" });
  } catch (err: unknown) {
    if (err && typeof err === "object" && "code" in err && (err as { code?: unknown }).code === "EEXIST") return;
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to write file: ${path}. ${message}`);
  }
}

export async function writeJsonFile(path: string, payload: unknown): Promise<void> {
  const content = `${JSON.stringify(payload, null, 2)}\n`;
  const tmp = join(dirname(path), `.${process.pid}.tmp`);
  try {
    await ensureDir(dirname(path));
    await writeFile(tmp, content, "utf8");
    await rename(tmp, path);
  } catch (err: unknown) {
    // Best-effort cleanup of temp file on failure.
    try { await rm(tmp, { force: true }); } catch { /* ignore */ }
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to write file: ${path}. ${message}`);
  }
}

export async function removePath(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    throw new NovelCliError(`Failed to remove path: ${path}. ${message}`);
  }
}
