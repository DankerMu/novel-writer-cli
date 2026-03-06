## ADDED Requirements

### Requirement: genre-weight-profiles.json SHALL support optional platform_multipliers
`templates/genre-weight-profiles.json` SHALL include an optional `platform_multipliers` section, keyed by canonical platform ID. Each platform entry maps scoring dimension names to a numeric multiplier.

#### Scenario: platform_multipliers section exists
- **GIVEN** the file `templates/genre-weight-profiles.json`
- **WHEN** the JSON is parsed
- **THEN** it contains an optional top-level key `"platform_multipliers"`

#### Scenario: fanqie multipliers emphasize hook and pacing
- **GIVEN** the `platform_multipliers.fanqie` entry
- **THEN** it defines `hook_strength: 1.5` and `pacing: 1.3` (other dimensions default to 1.0)

#### Scenario: qidian multipliers emphasize immersion
- **GIVEN** the `platform_multipliers.qidian` entry
- **THEN** it defines `immersion: 1.3` (other dimensions default to 1.0)

#### Scenario: jinjiang multipliers emphasize character, style, and emotion
- **GIVEN** the `platform_multipliers.jinjiang` entry
- **THEN** it defines `character: 1.3`, `style_naturalness: 1.3`, and `emotional_impact: 1.2` (other dimensions default to 1.0)

### Requirement: GenreWeightProfilesConfig SHALL declare optional platform_multipliers field
The `GenreWeightProfilesConfig` type in `src/scoring-weights.ts` SHALL include an optional `platform_multipliers` field typed as a record of platform ID to dimension-multiplier records.

#### Scenario: Type accepts config with platform_multipliers
- **GIVEN** a JSON object with both `profiles` and `platform_multipliers` fields
- **WHEN** parsed as `GenreWeightProfilesConfig`
- **THEN** it compiles and validates without error

#### Scenario: Type accepts config without platform_multipliers
- **GIVEN** a JSON object with `profiles` but no `platform_multipliers` field
- **WHEN** parsed as `GenreWeightProfilesConfig`
- **THEN** it compiles and validates without error (field is optional)

### Requirement: computeEffectiveScoringWeights SHALL accept platformId and apply multipliers
`computeEffectiveScoringWeights` in `src/scoring-weights.ts` SHALL accept an optional `platformId` parameter. When provided, it SHALL:
1. Load the base weights from the genre_drive_type profile (existing behavior)
2. Look up platform multipliers for the canonical platform ID
3. Multiply each dimension's weight by its platform multiplier (default 1.0 for unlisted dimensions)
4. Renormalize all weights so they sum to 1.0

#### Scenario: fanqie multiplier increases hook_strength weight share
- **GIVEN** base weights from `plot` drive type and `platformId = "fanqie"`
- **WHEN** `computeEffectiveScoringWeights("plot", "fanqie")` is called
- **THEN** the returned `hook_strength` weight is higher than in the base profile
- **AND** all weights sum to 1.0

#### Scenario: No platformId means no multiplier applied
- **GIVEN** base weights from `plot` drive type and no platformId
- **WHEN** `computeEffectiveScoringWeights("plot")` is called
- **THEN** the returned weights are identical to the base profile weights

### Requirement: tomato SHALL use fanqie multipliers
When `platformId` is `"tomato"`, the system SHALL canonicalize it to `"fanqie"` before looking up platform multipliers.

#### Scenario: tomato gets fanqie multipliers
- **WHEN** `computeEffectiveScoringWeights("plot", "tomato")` is called
- **THEN** the returned weights are identical to calling with `"fanqie"`

### Requirement: Missing platform_multipliers SHALL default to 1.0 for all dimensions
When the `platform_multipliers` section is absent from the config, or when a specific platform has no entry, all dimension multipliers SHALL default to 1.0 (equivalent to no modification).

#### Scenario: Config without platform_multipliers
- **GIVEN** `genre-weight-profiles.json` has no `platform_multipliers` key
- **WHEN** `computeEffectiveScoringWeights("plot", "fanqie")` is called
- **THEN** the returned weights are identical to calling without platformId

#### Scenario: Platform not listed in multipliers
- **GIVEN** `platform_multipliers` exists but has no entry for `"qidian"`
- **WHEN** `computeEffectiveScoringWeights("plot", "qidian")` is called
- **THEN** all multipliers default to 1.0 and weights are unchanged from base

### Requirement: Judge phase SHALL pass platformId to computeEffectiveScoringWeights
`src/instructions.ts` SHALL pass the project's `platformId` (from platform profile) to `computeEffectiveScoringWeights` when building the instruction packet for the judge phase.

#### Scenario: Judge instruction packet uses platform-aware weights
- **GIVEN** a project with `platform: "jinjiang"` and `genre_drive_type: "character"`
- **WHEN** `buildInstructionPacket` is called for a judge step
- **THEN** the effective weights in the packet reflect both the character drive type base weights and the jinjiang platform multipliers

## References

- `templates/genre-weight-profiles.json`
- `src/scoring-weights.ts`
- `src/instructions.ts`
- `src/platform-profile.ts`
