## 1. Platform ID Expansion (3a)

- [x] 1.1 Extend `PlatformId` type in `src/platform-profile.ts` to `"qidian" | "tomato" | "fanqie" | "jinjiang"`
- [x] 1.2 Add `canonicalPlatformId(id: PlatformId): CanonicalPlatformId` function that maps tomato → fanqie, others pass through
- [x] 1.3 Update `schemas/platform-profile.schema.json` enum to include all four values
- [x] 1.4 Update `src/init.ts` to accept all four platform IDs during initialization
- [x] 1.5 Add fanqie + jinjiang default configurations to `templates/platform-profile.json` (jinjiang: word_count 2000-3000, genre_drive_type=character)
- [x] 1.6 Update Start skill (`skills/start/SKILL.md`) Step B.4.1: display 3 visible options (qidian / fanqie(番茄) / jinjiang(晋江)); tomato hidden but valid internally

## 2. Platform Writing Guides (3b)

- [x] 2.1 Create `templates/platforms/fanqie.md` — high pace density, strong hooks, dialogue 40-50%, settings woven into action, 2-3 chapter emotional payoff
- [x] 2.2 Create `templates/platforms/qidian.md` — medium pace, system-building allowed, immersion priority, dialogue 30-40%
- [x] 2.3 Create `templates/platforms/jinjiang.md` — character-driven, emotional hooks, CP early appearance, personality through behavior, high style_naturalness requirement

## 3. Style Profile Platform Field (3c)

- [x] 3.1 Add `"platform": null` to `templates/style-profile-template.json`
- [x] 3.2 Update `src/init.ts` to populate the `platform` field in project `style-profile.json` from selected platform ID

## 4. Orchestrator Platform Guide Loading (3d)

- [x] 4.1 Update `src/init.ts` to copy `templates/platforms/{canonical_platform}.md` to project root as `platform-writing-guide.md`; log warning and continue if guide file missing
- [x] 4.2 Update `src/instructions.ts` `buildInstructionPacket` to include `paths.platform_writing_guide` when the file exists (omit when absent)
- [x] 4.3 Update `skills/continue/SKILL.md` manifest to conditionally include `paths.platform_writing_guide`
- [x] 4.4 Update `agents/chapter-writer.md` Input section to add optional `paths.platform_writing_guide`; update Constraints to require platform convention compliance when guide is present

## 5. Golden Chapter Gates (3e)

- [x] 5.1 Create `templates/golden-chapter-gates.json` with per-platform gate definitions for Ch001-003:
  - fanqie: protagonist within 200 words + conflict per chapter + chapter-end hook + excitement_type ∈ {reversal, face_slap, power_up}
  - qidian: system/world presence + immersion ≥ 3.5
  - jinjiang: personality through behavior + CP appears + emotional tone + style_naturalness ≥ 3.5
  - Include `invalid_combinations` genre×platform WARNING table
- [x] 5.2 Update `src/init.ts` platform initialization path to copy `golden-chapter-gates.json` when `--platform` is selected
- [x] 5.3 Update `agents/quality-judge.md` to add Track 3: Golden Chapter Gates (active when chapter ≤ 3); gate fail → recommendation=revise
- [x] 5.4 Update `skills/continue/SKILL.md` Step 2.6: when chapter ≤ 3, inject `inline.golden_chapter_gates` with platform-specific gates
- [x] 5.5 Update `skills/continue/SKILL.md` Step 5 gate decision: add hard gate failure as forced revision trigger

## 6. Platform Weighted Scoring (3f)

- [x] 6.1 Add `platform_multipliers` section to `templates/genre-weight-profiles.json`: fanqie (hook_strength 1.5x, pacing 1.3x), qidian (immersion 1.3x), jinjiang (character 1.3x, style_naturalness 1.3x, emotional_impact 1.2x)
- [x] 6.2 Extend `GenreWeightProfilesConfig` type in `src/scoring-weights.ts` with optional `platform_multipliers` field
- [x] 6.3 Update `computeEffectiveScoringWeights` to accept optional `platformId` param; canonicalize via `canonicalPlatformId`; apply multiplier per dimension then renormalize to sum=1.0; missing platform → all 1.0
- [x] 6.4 Update `src/instructions.ts` judge phase to pass `platformId` to `computeEffectiveScoringWeights`

## References

- `openspec/changes/m8-platform-expansion-and-golden-gates/proposal.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/design.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/platform-id-expansion/spec.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/platform-writing-guides/spec.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/style-profile-platform/spec.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/orchestrator-platform-guide/spec.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/golden-chapter-gates/spec.md`
- `openspec/changes/m8-platform-expansion-and-golden-gates/specs/platform-weighted-scoring/spec.md`
