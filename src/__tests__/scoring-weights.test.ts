import assert from "node:assert/strict";
import test from "node:test";

import { computeEffectiveScoringWeights, parseGenreWeightProfiles } from "../scoring-weights.js";

const baseConfigRaw = {
  schema_version: 1,
  dimensions: [
    "plot_logic",
    "character",
    "immersion",
    "foreshadowing",
    "pacing",
    "style_naturalness",
    "emotional_impact",
    "storyline_coherence",
    "hook_strength"
  ],
  normalization: {
    method: "scale_to_sum",
    sum_to: 1.0,
    tolerance: 0.0001
  },
  default_profile_by_drive_type: {
    plot: "plot:v1",
    character: "character:v1"
  },
  platform_multipliers: {
    fanqie: { hook_strength: 1.5, pacing: 1.3 },
    qidian: { immersion: 1.3 },
    jinjiang: { character: 1.3, style_naturalness: 1.3, emotional_impact: 1.2 }
  },
  profiles: {
    "plot:v1": {
      drive_type: "plot",
      weights: {
        plot_logic: 0.22,
        character: 0.16,
        immersion: 0.13,
        foreshadowing: 0.11,
        pacing: 0.08,
        style_naturalness: 0.11,
        emotional_impact: 0.06,
        storyline_coherence: 0.07,
        hook_strength: 0.06
      }
    },
    "character:v1": {
      drive_type: "character",
      weights: {
        plot_logic: 0.13,
        character: 0.24,
        immersion: 0.16,
        foreshadowing: 0.09,
        pacing: 0.06,
        style_naturalness: 0.12,
        emotional_impact: 0.1,
        storyline_coherence: 0.05,
        hook_strength: 0.05
      }
    }
  }
};

const hookPolicy = { required: true, min_strength: 3, allowed_types: ["question"], fix_strategy: "hook-fix" };

test("parseGenreWeightProfiles accepts platform_multipliers", () => {
  const config = parseGenreWeightProfiles(baseConfigRaw, "genre-weight-profiles.json");
  assert.equal(config.platform_multipliers?.fanqie?.hook_strength, 1.5);
  assert.equal(config.platform_multipliers?.jinjiang?.emotional_impact, 1.2);
});

test("parseGenreWeightProfiles rejects non-canonical platform_multipliers keys", () => {
  assert.throws(
    () =>
      parseGenreWeightProfiles(
        {
          ...baseConfigRaw,
          platform_multipliers: { ...baseConfigRaw.platform_multipliers, tomato: { pacing: 1.2 } }
        },
        "genre-weight-profiles.json"
      ),
    /unknown platform_multipliers key 'tomato'/i
  );
});

test("computeEffectiveScoringWeights applies platform multipliers and renormalizes", () => {
  const config = parseGenreWeightProfiles(baseConfigRaw, "genre-weight-profiles.json");
  const base = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy
  });
  const fanqie = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy,
    platformId: "fanqie"
  });

  const sum = fanqie.dimensions.reduce((total, dim) => total + (fanqie.weights[dim] ?? 0), 0);
  assert.ok(Math.abs(sum - 1.0) < 0.0001);
  assert.ok((fanqie.weights.hook_strength ?? 0) > (base.weights.hook_strength ?? 0));
  assert.ok((fanqie.weights.pacing ?? 0) > (base.weights.pacing ?? 0));
});

test("computeEffectiveScoringWeights canonicalizes tomato to fanqie", () => {
  const config = parseGenreWeightProfiles(baseConfigRaw, "genre-weight-profiles.json");
  const fanqie = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy,
    platformId: "fanqie"
  });
  const tomato = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy,
    platformId: "tomato"
  });
  assert.deepEqual(tomato.weights, fanqie.weights);
});

test("computeEffectiveScoringWeights leaves weights unchanged when platform multipliers are absent", () => {
  const raw = { ...baseConfigRaw };
  delete (raw as { platform_multipliers?: unknown }).platform_multipliers;
  const config = parseGenreWeightProfiles(raw, "genre-weight-profiles.json");
  const base = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy
  });
  const withPlatform = computeEffectiveScoringWeights({
    config,
    scoring: { genre_drive_type: "plot", weight_profile_id: "plot:v1" },
    hookPolicy,
    platformId: "qidian"
  });
  assert.deepEqual(withPlatform.weights, base.weights);
});
