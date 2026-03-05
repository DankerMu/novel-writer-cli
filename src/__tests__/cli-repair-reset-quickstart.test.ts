import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";

import { main } from "../cli.js";
import { readCheckpoint } from "../checkpoint.js";

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

test("novel repair previews reset-quickstart without --force (json mode)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-cli-repair-quickstart-preview-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "characters"
  });

  const res = await runCli(["--json", "--project", rootDir, "repair", "--reset-quickstart"]);
  assert.equal(res.code, 0);
  const payload = JSON.parse(res.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.command, "repair");
  assert.equal(payload.data.applied, false);
  assert.equal(payload.data.changed, true);
  assert.equal(payload.data.before, "characters");
  assert.equal(payload.data.after, "characters");

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.quickstart_phase, "characters");
});

test("novel repair --reset-quickstart --force sets quickstart_phase=null (json mode)", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-cli-repair-quickstart-force-"));
  await writeJson(join(rootDir, ".checkpoint.json"), {
    last_completed_chapter: 0,
    current_volume: 1,
    orchestrator_state: "QUICK_START",
    pipeline_stage: null,
    inflight_chapter: null,
    quickstart_phase: "characters"
  });

  const res = await runCli(["--json", "--project", rootDir, "repair", "--reset-quickstart", "--force"]);
  assert.equal(res.code, 0);
  const payload = JSON.parse(res.stdout.trim());
  assert.equal(payload.ok, true);
  assert.equal(payload.command, "repair");
  assert.equal(payload.data.applied, true);
  assert.equal(payload.data.changed, true);
  assert.equal(payload.data.before, "characters");
  assert.equal(payload.data.after, null);

  const checkpoint = await readCheckpoint(rootDir);
  assert.equal(checkpoint.quickstart_phase, null);

  const raw = await readFile(join(rootDir, ".checkpoint.json"), "utf8");
  assert.match(raw, /\"quickstart_phase\": null/);
});

