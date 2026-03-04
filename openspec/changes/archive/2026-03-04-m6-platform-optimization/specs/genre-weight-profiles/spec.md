## ADDED Requirements

### Requirement: The system SHALL support drive-type weight profiles for quality scoring
The system SHALL support a bounded set of narrative drive types, at minimum:
- `plot` (plot-driven)
- `character` (character-driven)
- `suspense` (suspense / page-turner driven; often realized via hooks)
- `slice_of_life` (daily-life / atmosphere-driven)

Each drive type SHALL map to a weight profile that controls per-dimension weights in QualityJudge scoring.

#### Scenario: Project selects a drive type
- **WHEN** the user selects `genre_drive_type="suspense"` during initialization
- **THEN** the system selects a corresponding weight profile for QualityJudge scoring

### Requirement: The system SHALL define weight profiles in a project-visible config
The system SHALL support a config file (e.g., `genre-weight-profiles.json`) that defines:
- available drive types
- weight profile IDs
- per-dimension weights for the full rubric (including `hook_strength` when enabled)
- validation rules (e.g., weights normalize to 1.0)

#### Scenario: Weight config is validated
- **WHEN** the system loads `genre-weight-profiles.json`
- **THEN** it validates that weights are well-formed and normalizable

### Requirement: The system SHALL allow user micro-tuning of weights with auditability
The system SHALL allow the user to override selected weights (micro-tuning) and persist overrides in project configuration.

The system SHALL record, in evaluation metadata, the effective profile and any overrides used for a chapter.

#### Scenario: Evaluation records weights used
- **WHEN** QualityJudge produces `evaluations/chapter-{C:03d}-eval.json`
- **THEN** it includes the effective `weight_profile_id` and the final per-dimension weights used for scoring

## References

- `skills/novel-writing/references/quality-rubric.md`
- `openspec/changes/m6-platform-optimization/specs/quality-rubric/spec.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
