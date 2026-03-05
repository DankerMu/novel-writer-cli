import { existsSync, realpathSync } from "node:fs";
import { dirname, isAbsolute, join, sep } from "node:path";

import { NovelCliError } from "./errors.js";

export function rejectPathTraversalInput(inputPath: string, label: string): void {
  const normalized = inputPath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.includes("..")) {
    throw new NovelCliError(`${label} must not contain '..' path traversal segments.`, 2);
  }
}

export function assertInsideProjectRoot(projectRootAbs: string, absolutePath: string): void {
  const root = projectRootAbs.endsWith(sep) ? projectRootAbs : `${projectRootAbs}${sep}`;
  if (absolutePath === projectRootAbs) return;
  if (!absolutePath.startsWith(root)) {
    throw new NovelCliError(`Unsafe path outside project root: ${absolutePath}`, 2);
  }
}

export function resolveProjectRelativePath(projectRootAbs: string, relPath: string, label: string): string {
  if (typeof relPath !== "string" || relPath.trim().length === 0) {
    throw new NovelCliError(`Invalid ${label}: must be a non-empty string.`, 2);
  }
  if (isAbsolute(relPath)) {
    throw new NovelCliError(`Invalid ${label}: must be a project-relative path.`, 2);
  }
  rejectPathTraversalInput(relPath, label);
  const abs = join(projectRootAbs, relPath);
  assertInsideProjectRoot(projectRootAbs, abs);

  // Symlink-aware containment check: prevent resolving to a path outside the project root.
  // - If the target exists, validate its realpath.
  // - If the target doesn't exist yet (write target), validate the nearest existing ancestor dir realpath.
  const rootReal = realpathSync(projectRootAbs);
  if (existsSync(abs)) {
    const realAbs = realpathSync(abs);
    assertInsideProjectRoot(rootReal, realAbs);
  } else {
    let probe = dirname(abs);
    while (probe !== projectRootAbs && !existsSync(probe)) {
      const parent = dirname(probe);
      if (parent === probe) break;
      probe = parent;
    }
    if (existsSync(probe)) {
      const realProbe = realpathSync(probe);
      assertInsideProjectRoot(rootReal, realProbe);
    }
  }

  return abs;
}
