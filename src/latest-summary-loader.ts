import { realpath, stat } from "node:fs/promises";
import { join, relative } from "node:path";

import { pathExists, readJsonFile } from "./fs-utils.js";
import { assertInsideProjectRoot } from "./safe-path.js";

export async function loadLatestJsonSummary<T>(args: {
  rootDir: string;
  relPath: string;
  maxBytes: number;
  summarize: (raw: unknown) => T | null;
}): Promise<T | null> {
  const abs = join(args.rootDir, args.relPath);
  if (!(await pathExists(abs))) return null;
  try {
    const rootReal = await realpath(args.rootDir);
    const absReal = await realpath(abs);
    // Ensure the resolved path stays under the project root (defense against symlink escapes).
    assertInsideProjectRoot(rootReal, absReal);
    // Also guard against pathological cases where realpath changes drive letters/roots.
    if (relative(rootReal, absReal).startsWith("..")) return null;
    const st = await stat(absReal);
    if (!st.isFile()) return null;
    if (st.size > args.maxBytes) return null;

    const raw = await readJsonFile(absReal);
    return args.summarize(raw);
  } catch {
    return null;
  }
}
