import assert from "node:assert/strict";
import test from "node:test";

import { parseGoldenChapterGates } from "../golden-chapter-gates.js";

function makeBaseConfig(): Record<string, unknown> {
  const baseRule = {
    id: "hook_present",
    requirement: "章末必须留下钩子",
    threshold: {
      metric: "hook_strength",
      operator: ">=",
      value: 3
    }
  };

  const chapterConfig = { gates: [baseRule] };
  return {
    schema_version: 1,
    invalid_combinations: [],
    platforms: {
      fanqie: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } },
      qidian: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } },
      jinjiang: { chapters: { "1": chapterConfig, "2": chapterConfig, "3": chapterConfig } }
    }
  };
}

test("parseGoldenChapterGates rejects unsupported threshold operators", () => {
  const raw = makeBaseConfig();
  ((raw.platforms as Record<string, any>).fanqie.chapters["1"].gates[0].threshold.operator as string) = "approx";

  assert.throws(
    () => parseGoldenChapterGates(raw, "golden-chapter-gates.json"),
    /threshold\.operator.*<, <=, >, >=, ==, !=/i
  );
});
