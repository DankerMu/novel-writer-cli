import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildInstructionPacket } from "../instructions.js";

test("buildInstructionPacket rejects NOVEL_ASK gate for review steps", async () => {
  const rootDir = await mkdtemp(join(tmpdir(), "novel-review-novel-ask-"));

  const questionSpec = {
    version: 1,
    topic: "review_gate",
    questions: [
      {
        id: "ok_to_continue",
        header: "Continue?",
        question: "Continue the review pipeline?",
        kind: "single_choice",
        required: true,
        options: [{ label: "yes", description: "Proceed" }]
      }
    ]
  };

  await assert.rejects(
    async () =>
      buildInstructionPacket({
        rootDir,
        checkpoint: { last_completed_chapter: 0, current_volume: 1, orchestrator_state: "VOL_REVIEW" as const },
        step: { kind: "review", phase: "collect" },
        embedMode: null,
        writeManifest: false,
        novelAskGate: { novel_ask: questionSpec as any, answer_path: "staging/novel-ask/review.json" }
      }),
    /NOVEL_ASK gate is not supported for review steps/
  );
});

