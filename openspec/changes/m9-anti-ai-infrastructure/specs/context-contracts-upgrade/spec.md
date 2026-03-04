## MODIFIED Requirements

### Requirement 1: CW manifest SHALL include `inline.statistical_targets`

The ChapterWriter (CW) context-contract manifest SHALL be extended with an `inline.statistical_targets` section containing 6-dimension statistical targets extracted from the project's style-profile. This provides CW with concrete numeric/qualitative targets for generating human-like text.

#### Scenario: Orchestrator extracts 6-dimension targets from style-profile
- **GIVEN** a project has a populated `style-profile.json` with statistical fields
- **WHEN** the orchestrator assembles the CW manifest
- **THEN** `inline.statistical_targets` contains 6 dimensions:
  1. `sentence_length_std_dev` — target standard deviation for sentence lengths
  2. `paragraph_length_cv` — target coefficient of variation for paragraph lengths
  3. `vocabulary_diversity` — target vocabulary richness level
  4. `narration_connectors` — target count (always 0)
  5. `register_mixing` — target register mixing level
  6. `emotional_arc` — target emotional volatility level
- **AND** numeric fields contain the values from `style-profile.json`
- **AND** enum fields contain the qualitative values from `style-profile.json`

#### Scenario: Null style-profile fields use default human ranges
- **GIVEN** a project's `style-profile.json` has null values for one or more statistical fields
- **WHEN** the orchestrator assembles the CW manifest
- **THEN** null numeric fields are replaced with human-writing default ranges:
  - `sentence_length_std_dev`: fallback range 8-18
  - `paragraph_length_cv`: fallback range 0.4-1.2
- **AND** null enum fields are replaced with default value `"medium"`
- **AND** the manifest is valid and CW can consume it without error

#### Scenario: CW reads targets and applies as generation constraints
- **GIVEN** the CW manifest includes `inline.statistical_targets`
- **WHEN** ChapterWriter generates chapter text
- **THEN** CW uses the targets as soft constraints during generation
- **AND** generated text aims to match the statistical profile within the specified ranges

---

### Requirement 2: QJ manifest SHALL include `inline.statistical_profile`

The QualityJudge (QJ) context-contract manifest SHALL be extended with an `inline.statistical_profile` section containing the measured statistical characteristics of the chapter text being evaluated. This enables QJ to perform the 7-indicator 3-zone assessment.

#### Scenario: CW self-reports statistical profile in output metadata
- **GIVEN** ChapterWriter generates a chapter
- **WHEN** CW produces output metadata
- **THEN** the metadata includes a `statistical_profile` object with self-reported values for:
  - `sentence_length_std_dev` (number)
  - `paragraph_length_cv` (number)
  - `vocabulary_diversity_score` (number)
  - `narration_connector_count` (integer)
  - `humanize_technique_variety` (integer)
- **AND** these values represent CW's estimate of the generated text's statistical properties

#### Scenario: lint produces statistical profile and overrides CW self-report
- **GIVEN** `lint-blacklist.sh` runs on the generated chapter text
- **AND** the lint script produces a deterministic `statistical_profile`
- **WHEN** the orchestrator assembles the QJ manifest
- **THEN** `inline.statistical_profile` uses the lint-produced values
- **AND** lint-produced values override CW's self-reported values where both exist
- **AND** the source field indicates `"lint"` (not `"cw_self_report"`)

#### Scenario: QJ uses statistical_profile for 7-indicator assessment
- **GIVEN** the QJ manifest includes `inline.statistical_profile` with all 7 indicator values
- **WHEN** QualityJudge evaluates the chapter
- **THEN** QJ maps each indicator value to a green/yellow/red zone per style-guide Layer 4
- **AND** QJ applies the zone-to-score mapping from quality-rubric section 6
- **AND** the resulting `style_naturalness` score is based on the 7-indicator assessment

## References

- `skills/continue/references/context-contracts.md` — target file for modifications
- `agents/chapter-writer.md` — CW Agent (consumes statistical_targets)
- `agents/quality-judge.md` — QJ Agent (consumes statistical_profile)
- `templates/style-profile-template.json` — source of statistical field values
- `skills/novel-writing/references/style-guide.md` — Layer 4 zone definitions (read-only reference)
- CS-A1 (`m9-anti-ai-statistical-templates`) — defines statistical field names in style-profile
- CS-A3 (`m9-anti-ai-agent-prompts`) — CW and QJ prompts consume these manifest fields
