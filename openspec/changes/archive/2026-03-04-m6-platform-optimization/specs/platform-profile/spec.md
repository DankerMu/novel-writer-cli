## ADDED Requirements

### Requirement: The system SHALL persist an immutable platform binding per novel project
The system SHALL persist a platform binding chosen at initialization in `platform-profile.json` at the project root.
The platform binding SHALL be one of:
- `qidian`
- `tomato`

Once `platform-profile.json` is created, the platform binding (`platform`) and the narrative drive type (`scoring.genre_drive_type`) MUST NOT change for the lifetime of the project. Rationale: changing `genre_drive_type` invalidates all historical weight profiles and makes cross-chapter score comparisons meaningless.

#### Scenario: Platform profile created during init
- **WHEN** the user initializes a novel project and selects platform `qidian`
- **THEN** the system writes `platform-profile.json` with `"platform":"qidian"`
- **AND** the system treats the platform as immutable for subsequent operations

#### Scenario: Attempt to change platform is rejected
- **WHEN** `platform-profile.json` already exists with `"platform":"tomato"`
- **AND** the user attempts to switch the platform to `qidian`
- **THEN** the system rejects the operation
- **AND** leaves `platform-profile.json` unchanged

### Requirement: `platform-profile.json` SHALL define platform-tuned constraints and scoring parameters
`platform-profile.json` SHALL contain a stable schema with enough information to drive:
- Chapter word count targets and hard limits
- Chapter-end hook requirements (including minimum strength thresholds)
- Information-load thresholds (new entities / unknown entities / new terms)
- Pre-judge compliance checks (banned words, naming checks, simplified/traditional consistency)
- Scoring weights selection (via `genre_drive_type` + profile mapping)

At minimum, it SHALL include:
- `schema_version` (integer)
- `platform` (string)
- `created_at` (ISO-8601 string)
- `word_count` object:
  - `target_min` / `target_max` (integers, words)
  - `hard_min` / `hard_max` (integers, words)
- `hook_policy` object:
  - `required` (boolean)
  - `min_strength` (integer 1-5)
  - `allowed_types` (string array)
  - `fix_strategy` (string enum; allowed: `"hook-fix"`; unknown values MUST fail validation; see `chapter-hook-system`)
- `info_load` object:
  - `max_new_entities_per_chapter` (integer)
  - `max_unknown_entities_per_chapter` (integer)
  - `max_new_terms_per_1k_words` (integer)
- `compliance` object:
  - `banned_words` (string array)
  - `duplicate_name_policy` (string enum)
  - `script_paths` (optional object for deterministic linters)
- `scoring` object:
  - `genre_drive_type` (string enum; see `genre-weight-profiles`)
  - `weight_profile_id` (string)
  - `weight_overrides` (optional object)

The canonical machine-readable JSON Schema for `platform-profile.json` is `schemas/platform-profile.schema.json` (SSOT).

#### Scenario: Platform profile includes constraints used by validators
- **WHEN** the system loads `platform-profile.json` for platform `qidian`
- **THEN** it can derive word count constraints, hook requirements, info-load thresholds, and compliance rules from the file

### Requirement: The system SHALL support built-in defaults with user-confirmed overrides
The system SHALL ship with built-in default profiles for `qidian` and `tomato`.
During initialization, the system SHALL allow the user to override key thresholds (e.g., word count targets) and persist those overrides in `platform-profile.json`.

#### Scenario: User adjusts defaults during init
- **WHEN** the user selects platform `tomato`
- **AND** the system proposes default `word_count.target_min/target_max`
- **AND** the user overrides the target range
- **THEN** the system writes the overridden values into `platform-profile.json`

## References

- `docs/dr-workflow/novel-writer-tool/final/prd/09-data.md`
- `schemas/platform-profile.schema.json`
- `openspec/changes/m6-platform-optimization/proposal.md`
- `openspec/changes/m6-platform-optimization/specs/chapter-hook-system/spec.md`
