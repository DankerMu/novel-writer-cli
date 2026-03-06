import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { canonicalPlatformId, parsePlatformProfile } from "../platform-profile.js";

function makeBaseRaw(): Record<string, unknown> {
  return {
    schema_version: 1,
    platform: "qidian",
    created_at: "2026-01-01T00:00:00Z",
    word_count: { target_min: 1, target_max: 2, hard_min: 1, hard_max: 2 },
    hook_policy: { required: true, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" },
    info_load: { max_new_entities_per_chapter: 0, max_unknown_entities_per_chapter: 0, max_new_terms_per_1k_words: 0 },
    compliance: { banned_words: [], duplicate_name_policy: "warn" },
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" }
  };
}

test("parsePlatformProfile loads legacy profile without retention/readability/naming", () => {
  const raw = makeBaseRaw();

  const profile = parsePlatformProfile(raw, "platform-profile.json");
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "retention"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "readability"), false);
  assert.equal(Object.prototype.hasOwnProperty.call(profile, "naming"), false);
});

test("canonicalPlatformId maps tomato to fanqie and preserves canonical ids", () => {
  assert.equal(canonicalPlatformId("tomato"), "fanqie");
  assert.equal(canonicalPlatformId("fanqie"), "fanqie");
  assert.equal(canonicalPlatformId("qidian"), "qidian");
  assert.equal(canonicalPlatformId("jinjiang"), "jinjiang");
});

test("parsePlatformProfile accepts fanqie and jinjiang platform ids", () => {
  const fanqie = parsePlatformProfile({ ...makeBaseRaw(), platform: "fanqie" }, "platform-profile.json");
  const jinjiang = parsePlatformProfile({ ...makeBaseRaw(), platform: "jinjiang" }, "platform-profile.json");
  assert.equal(fanqie.platform, "fanqie");
  assert.equal(jinjiang.platform, "jinjiang");
});

test("parsePlatformProfile accepts explicit null retention/readability/naming", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: null,
    readability: null,
    naming: null
  };

  const profile = parsePlatformProfile(raw, "platform-profile.json");
  assert.equal(profile.retention, null);
  assert.equal(profile.readability, null);
  assert.equal(profile.naming, null);
});

test("parsePlatformProfile accepts fractional max_new_terms_per_1k_words", () => {
  const raw = {
    ...makeBaseRaw(),
    info_load: {
      max_new_entities_per_chapter: 0,
      max_unknown_entities_per_chapter: 0,
      max_new_terms_per_1k_words: 2.5
    }
  };

  const profile = parsePlatformProfile(raw, "platform-profile.json");
  assert.equal(profile.info_load.max_new_terms_per_1k_words, 2.5);
});

test("parsePlatformProfile loads extended profile with retention/readability/naming", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: { enabled: true, min_chars: 2, max_chars: 30, forbidden_patterns: [], auto_fix: false },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "warn"
      }
    },
    readability: { mobile: { enabled: true, max_paragraph_chars: 320, max_consecutive_exposition_paragraphs: 3, blocking_severity: "hard_only" } },
    naming: { enabled: true, near_duplicate_threshold: 0.88, blocking_conflict_types: ["duplicate"], exemptions: {} }
  };

  const profile = parsePlatformProfile(raw, "platform-profile.json");
  assert.ok(profile.retention);
  assert.equal(profile.retention?.hook_ledger.overdue_policy, "warn");
  assert.equal(profile.readability?.mobile.blocking_severity, "hard_only");
  assert.deepEqual(profile.naming?.blocking_conflict_types, ["duplicate"]);
});

test("parsePlatformProfile rejects unknown naming conflict types", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: 0.5, blocking_conflict_types: ["typo"] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /blocking_conflict_types.*unknown type/i);
});

test("parsePlatformProfile rejects naming.near_duplicate_threshold > 1", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: 1.01, blocking_conflict_types: ["near_duplicate"] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /near_duplicate_threshold.*<= 1/i);
});

test("parsePlatformProfile rejects naming.near_duplicate_threshold when negative", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: -0.1, blocking_conflict_types: ["near_duplicate"] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /near_duplicate_threshold.*finite number/i);
});

test("parsePlatformProfile rejects naming.near_duplicate_threshold when non-finite", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: Number.POSITIVE_INFINITY, blocking_conflict_types: ["near_duplicate"] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /near_duplicate_threshold.*finite number/i);
});

test("parsePlatformProfile rejects naming.blocking_conflict_types when contains non-string items", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: 0.5, blocking_conflict_types: [123] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /blocking_conflict_types.*string array/i);
});

test("parsePlatformProfile rejects naming.exemptions when non-object", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: true, near_duplicate_threshold: 0.5, blocking_conflict_types: ["duplicate"], exemptions: "foo" }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /exemptions.*object/i);
});

test("parsePlatformProfile rejects invalid retention.title_policy regex patterns", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: { enabled: true, min_chars: 2, max_chars: 30, forbidden_patterns: ["("], auto_fix: false },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "warn"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /forbidden_patterns\[0\].*regex/i);
});

test("parsePlatformProfile rejects invalid retention.title_policy required_patterns regex patterns", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: {
        enabled: true,
        min_chars: 2,
        max_chars: 30,
        forbidden_patterns: [],
        required_patterns: ["("],
        auto_fix: false
      },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "warn"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /required_patterns\[0\].*regex/i);
});

test("parsePlatformProfile rejects retention.title_policy min_chars > max_chars", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: { enabled: true, min_chars: 10, max_chars: 5, forbidden_patterns: [], auto_fix: false },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "warn"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /min_chars.*<=.*max_chars/i);
});

test("parsePlatformProfile rejects word_count target_min > target_max", () => {
  const raw = {
    ...makeBaseRaw(),
    word_count: { target_min: 3000, target_max: 2000, hard_min: 1500, hard_max: 3500 }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /word_count\.target_min.*<=.*word_count\.target_max/i);
});

test("parsePlatformProfile rejects word_count hard_min > hard_max", () => {
  const raw = {
    ...makeBaseRaw(),
    word_count: { target_min: 2000, target_max: 3000, hard_min: 3600, hard_max: 3500 }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /word_count\.hard_min.*<=.*word_count\.hard_max/i);
});

test("parsePlatformProfile rejects retention.title_policy min_chars when float", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: { enabled: true, min_chars: 2.5, max_chars: 30, forbidden_patterns: [], auto_fix: false },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "warn"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /min_chars.*int/i);
});

test("parsePlatformProfile rejects retention when non-object", () => {
  const raw = { ...makeBaseRaw(), retention: 42 };
  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'retention'.*object/i);
});

test("parsePlatformProfile rejects retention.hook_ledger overdue_policy when unknown", () => {
  const raw = {
    ...makeBaseRaw(),
    retention: {
      title_policy: { enabled: true, min_chars: 2, max_chars: 30, forbidden_patterns: [], auto_fix: false },
      hook_ledger: {
        enabled: true,
        fulfillment_window_chapters: 12,
        diversity_window_chapters: 5,
        max_same_type_streak: 2,
        min_distinct_types_in_window: 2,
        overdue_policy: "block"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /overdue_policy.*warn, soft, hard/i);
});

test("parsePlatformProfile rejects invalid readability.mobile blocking_severity", () => {
  const raw = {
    ...makeBaseRaw(),
    readability: {
      mobile: {
        enabled: true,
        max_paragraph_chars: 320,
        max_consecutive_exposition_paragraphs: 3,
        blocking_severity: "warn"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /blocking_severity.*hard_only/i);
});

test("parsePlatformProfile rejects readability.mobile max_paragraph_chars = 0", () => {
  const raw = {
    ...makeBaseRaw(),
    readability: {
      mobile: {
        enabled: true,
        max_paragraph_chars: 0,
        max_consecutive_exposition_paragraphs: 3,
        blocking_severity: "hard_only"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /max_paragraph_chars.*>= 1/i);
});

test("parsePlatformProfile rejects readability.mobile max_consecutive_exposition_paragraphs = 0", () => {
  const raw = {
    ...makeBaseRaw(),
    readability: {
      mobile: {
        enabled: true,
        max_paragraph_chars: 320,
        max_consecutive_exposition_paragraphs: 0,
        blocking_severity: "hard_only"
      }
    }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /max_consecutive_exposition_paragraphs.*>= 1/i);
});

test("parsePlatformProfile rejects non-boolean values for enabled fields", () => {
  const raw = {
    ...makeBaseRaw(),
    naming: { enabled: "true", near_duplicate_threshold: 0.5, blocking_conflict_types: ["duplicate"] }
  };

  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'naming\.enabled'.*boolean/i);
});

test("parsePlatformProfile rejects readability when non-object", () => {
  const raw = { ...makeBaseRaw(), readability: 42 };
  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'readability'.*object/i);
});

test("parsePlatformProfile rejects naming when non-object", () => {
  const raw = { ...makeBaseRaw(), naming: 42 };
  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'naming'.*object/i);
});

test("parsePlatformProfile rejects hook_policy when non-object", () => {
  const raw = { ...makeBaseRaw(), hook_policy: 42 };
  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'hook_policy'.*object/i);
});

test("parsePlatformProfile rejects scoring when non-object", () => {
  const raw = { ...makeBaseRaw(), scoring: 42 };
  assert.throws(() => parsePlatformProfile(raw, "platform-profile.json"), /'scoring'.*object/i);
});

test("parsePlatformProfile rejects non-object raw input", () => {
  assert.throws(() => parsePlatformProfile(null, "platform-profile.json"), /expected a JSON object/i);
});

test("templates/platform-profile.json defaults parse as valid platform profiles", async () => {
  const raw = JSON.parse(await readFile("templates/platform-profile.json", "utf8")) as { defaults?: Record<string, unknown> };
  assert.ok(raw.defaults, "expected templates/platform-profile.json to have defaults");

  for (const [platform, profileRaw] of Object.entries(raw.defaults)) {
    const profile = parsePlatformProfile(profileRaw, `templates/platform-profile.json#defaults.${platform}`);
    assert.ok(profile.retention, `expected defaults.${platform}.retention to be present`);
    assert.ok(profile.readability, `expected defaults.${platform}.readability to be present`);
    assert.ok(profile.naming, `expected defaults.${platform}.naming to be present`);
  }
});

test("templates/platform-profile.json keeps fanqie and tomato shared defaults aligned", async () => {
  const raw = JSON.parse(await readFile("templates/platform-profile.json", "utf8")) as { defaults?: Record<string, Record<string, unknown>> };
  assert.ok(raw.defaults, "expected templates/platform-profile.json to have defaults");

  const fanqie = raw.defaults?.fanqie;
  const tomato = raw.defaults?.tomato;
  assert.ok(fanqie && tomato, "expected fanqie and tomato defaults");

  const sharedSubset = (profile: Record<string, unknown>) => ({
    word_count: profile.word_count,
    hook_policy: profile.hook_policy,
    info_load: profile.info_load,
    compliance: profile.compliance,
    scoring: profile.scoring,
    retention: profile.retention,
    readability: profile.readability,
    naming: profile.naming
  });

  assert.deepEqual(sharedSubset(fanqie), sharedSubset(tomato));
});
