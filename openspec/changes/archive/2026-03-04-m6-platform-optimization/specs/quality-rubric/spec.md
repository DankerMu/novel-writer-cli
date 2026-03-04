## ADDED Requirements

### Requirement: Quality scoring SHALL support a `hook_strength` dimension when hooks are enabled
When `platform-profile.json.hook_policy.required=true`, the system SHALL include a `hook_strength` scoring dimension in chapter evaluation.

The dimension SHALL:
- produce a 1-5 score
- include an evidence snippet from the chapter end
- be eligible for weighting via drive-type/platform profiles

#### Scenario: Hook strength dimension appears in evaluation
- **WHEN** a project uses a hook-enabled platform profile
- **THEN** `evaluations/chapter-{C:03d}-eval.json.scores` includes `hook_strength` with `{score, weight, reason, evidence}`

### Requirement: Quality scoring weights MUST be configurable by drive-type and platform profile
The system MUST support dynamic weights derived from:
- `platform-profile.json.scoring.weight_profile_id`
- `platform-profile.json.scoring.weight_overrides` (optional)
- `genre-weight-profiles` defaults for the selected `genre_drive_type`

The effective weights SHALL be recorded in evaluation metadata for auditability.

#### Scenario: Different drive types apply different weights
- **WHEN** two projects use different `genre_drive_type` values
- **THEN** identical chapter content can yield different weighted overall scores due to different weight profiles

### Requirement: Weight application SHALL be explicit in evaluation outputs
For every dimension included in `evaluations/chapter-{C:03d}-eval.json`, the system SHALL record the effective `weight` used for that dimension.

#### Scenario: Evaluation includes explicit weights
- **WHEN** a chapter evaluation is produced
- **THEN** each score dimension contains an explicit `weight` field reflecting the effective profile

## References

- `skills/novel-writing/references/quality-rubric.md`
- `openspec/changes/m6-platform-optimization/specs/genre-weight-profiles/spec.md`
- `openspec/changes/m6-platform-optimization/specs/chapter-hook-system/spec.md`
