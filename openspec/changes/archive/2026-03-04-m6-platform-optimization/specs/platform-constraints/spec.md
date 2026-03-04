## ADDED Requirements

### Requirement: The system SHALL enforce word-count constraints from `platform-profile.json`
For each chapter draft/refined output, the system SHALL compute word count and validate it against `platform-profile.json.word_count`.

Validation MUST distinguish:
- **hard** violations: outside `hard_min..hard_max` (must gate)
- **soft** deviations: outside `target_min..target_max` but within hard bounds (warn / score signal)

#### Scenario: Hard word-count violation blocks progression
- **WHEN** a refined chapter has word count below `word_count.hard_min`
- **THEN** the system marks a high-confidence violation
- **AND** the gate decision MUST require revision (regardless of overall score)

#### Scenario: Soft deviation produces a warning
- **WHEN** a refined chapter has word count outside `target_min..target_max`
- **AND** still within `hard_min..hard_max`
- **THEN** the system records a warning in the chapter evaluation/log output

### Requirement: The system SHALL run platform compliance checks before QualityJudge scoring
Before invoking QualityJudge (or before final gate decision), the system SHALL run compliance checks derived from `platform-profile.json.compliance`, including at minimum:
- banned words detection (project-level list)
- duplicate-name checks (project scope)
- simplified/traditional consistency checks (project scope)
- hard word-count limit validation

The system SHOULD prefer deterministic tooling when available, but MUST provide a safe fallback that does not hang the pipeline.

#### Scenario: Compliance report produced and provided to QualityJudge
- **WHEN** the system is about to run QualityJudge for chapter C
- **THEN** it runs compliance checks and produces a structured compliance report object
- **AND** provides the report (or a summary) as an input signal to QualityJudge and/or the gate engine

### Requirement: The system SHALL enforce information-load thresholds when configured
When `platform-profile.json.info_load` is present, the system SHALL compute information-load metrics for each chapter, including at minimum:
- `unknown_entities_count` (entities not registered in project state/registries)
- `new_entities_count` (entities first introduced within a configured window)
- `new_terms_per_1k_words` (new domain terms or proper nouns per 1000 words)

The system SHALL validate these metrics against the configured thresholds and produce:
- warnings for soft exceedances
- high-confidence violations when a configured hard threshold is exceeded

#### Scenario: Excessive unknown entities triggers a warning
- **WHEN** a chapter introduces more unknown entities than `max_unknown_entities_per_chapter`
- **THEN** the system records an information-load warning
- **AND** surfaces it in the chapter evaluation/log output

### Requirement: Platform constraint results SHALL be auditable
The system SHALL record platform constraint results in an auditable form, including:
- the constraint inputs used (platform id, thresholds version)
- computed metrics (word count, info-load metrics)
- any violations/warnings (with short evidence when applicable)

This record SHALL be attached to the chapter’s evaluation and/or log output.

#### Scenario: Chapter evaluation includes constraint metadata
- **WHEN** the system produces `evaluations/chapter-{C:03d}-eval.json`
- **THEN** it includes the platform id and the relevant constraint checks and outcomes for chapter C

## References

- `docs/dr-workflow/novel-writer-tool/final/prd/09-data.md`
- `skills/continue/references/continuity-checks.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
