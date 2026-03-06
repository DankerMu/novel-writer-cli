import assert from "node:assert/strict";
import test from "node:test";

import { formatStepId, parseStepId } from "../steps.js";

test("formatStepId formats chapter ids with pad3", () => {
  assert.equal(formatStepId({ kind: "chapter", chapter: 7, stage: "draft" }), "chapter:007:draft");
});

test("formatStepId formats volume/quickstart/review ids", () => {
  assert.equal(formatStepId({ kind: "volume", phase: "outline" }), "volume:outline");
  assert.equal(formatStepId({ kind: "quickstart", phase: "world" }), "quickstart:world");
  assert.equal(formatStepId({ kind: "quickstart", phase: "f0" }), "quickstart:f0");
  assert.equal(formatStepId({ kind: "review", phase: "report" }), "review:report");
});

test("parseStepId parses chapter ids and trims whitespace", () => {
  assert.deepEqual(parseStepId("  chapter:7:refine  "), { kind: "chapter", chapter: 7, stage: "refine" });
});

test("parseStepId parses volume/quickstart/review ids", () => {
  assert.deepEqual(parseStepId("volume:validate"), { kind: "volume", phase: "validate" });
  assert.deepEqual(parseStepId("quickstart:trial"), { kind: "quickstart", phase: "trial" });
  assert.deepEqual(parseStepId("quickstart:f0"), { kind: "quickstart", phase: "f0" });
  assert.deepEqual(parseStepId("review:cleanup"), { kind: "review", phase: "cleanup" });
});

test("parseStepId rejects unknown kind and invalid phases", () => {
  assert.throws(() => parseStepId("foo:bar"), /Supported kinds: chapter, volume, quickstart, review/);
  assert.throws(() => parseStepId("volume:badphase"), /Phase must be one of:/);
});

