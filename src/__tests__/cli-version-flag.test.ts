import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

import { main } from "../cli.js";

const require = createRequire(import.meta.url);
const pkg = require("../../package.json") as { version?: unknown };

async function runCli(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const origOut = process.stdout.write;
  const origErr = process.stderr.write;

  (process.stdout.write as unknown as (chunk: any) => boolean) = (chunk: any) => {
    stdout += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  };
  (process.stderr.write as unknown as (chunk: any) => boolean) = (chunk: any) => {
    stderr += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
    return true;
  };

  const prevExitCode = process.exitCode;
  try {
    const code = await main(argv);
    return { code, stdout, stderr };
  } finally {
    process.exitCode = prevExitCode;
    (process.stdout.write as any) = origOut;
    (process.stderr.write as any) = origErr;
  }
}

test("novel --version prints the package version", async () => {
  const expected = typeof pkg.version === "string" ? pkg.version : null;
  assert.ok(expected, "Expected package.json to contain a string version.");

  const res = await runCli(["--version"]);
  assert.equal(res.code, 0);
  assert.equal(res.stdout.trim(), expected);
  assert.equal(res.stderr, "");
});

