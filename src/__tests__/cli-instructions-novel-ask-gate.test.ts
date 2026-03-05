import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { main } from "../cli.js";

async function writeText(absPath: string, contents: string): Promise<void> {
  await mkdir(dirname(absPath), { recursive: true });
  await writeFile(absPath, contents, "utf8");
}

async function writeJson(absPath: string, payload: unknown): Promise<void> {
  await writeText(absPath, `${JSON.stringify(payload, null, 2)}\n`);
}

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

test("novel instructions rejects --novel-ask-file without --answer-path (json mode)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-cli-novel-ask-missing-answer-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });

  const res = await runCli([
    "--json",
    "--project",
    rootDir,
    "instructions",
    "quickstart:world",
    "--novel-ask-file",
    "staging/novel-ask/question.json"
  ]);
  assert.equal(res.code, 2);
  const payload = JSON.parse(res.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /provide both --novel-ask-file and --answer-path/);
});

test("novel instructions rejects --answer-path without --novel-ask-file (json mode)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-cli-novel-ask-missing-ask-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "INIT",
    pipeline_stage: null,
    inflight_chapter: null
  });

  const res = await runCli([
    "--json",
    "--project",
    rootDir,
    "instructions",
    "quickstart:world",
    "--answer-path",
    "staging/novel-ask/answer.json"
  ]);
  assert.equal(res.code, 2);
  const payload = JSON.parse(res.stdout.trim());
  assert.equal(payload.ok, false);
  assert.match(payload.error.message, /provide both --novel-ask-file and --answer-path/);
});
