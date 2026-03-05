import assert from "node:assert/strict";
import { mkdir, mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { resolveProjectRelativePath } from "../safe-path.js";

test("resolveProjectRelativePath rejects symlink escapes outside project root", async (t) => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-safe-path-root-"));
  const outsideDir = await mkdtemp(join(tmpdir(), "novel-safe-path-outside-"));

  await writeFile(join(outsideDir, "payload.json"), "{}\n", "utf8");
  await mkdir(join(rootDir, "staging"), { recursive: true });

  try {
    await symlink(outsideDir, join(rootDir, "staging/evil"), "dir");
  } catch (err: unknown) {
    const code = err instanceof Error ? (err as any).code : null;
    if (code === "EPERM" || code === "EACCES") {
      t.skip(`symlink not permitted in this environment: ${code}`);
      return;
    }
    throw err;
  }

  assert.throws(
    () => resolveProjectRelativePath(rootDir, "staging/evil/payload.json", "testPath"),
    /Unsafe path outside project root/
  );
});

