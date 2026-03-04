## MODIFIED Requirements

### Baseline: M6 defines platform constraints and compliance checks
All requirements in `m6-platform-optimization/specs/platform-constraints/spec.md` remain the baseline for word-count, info-load, and core compliance checks.
This change extends the *pre-judge guardrail set* with title/readability/naming checks driven by the extended platform profile schema.

### Requirement: The system SHALL run retention/readability/naming guardrails before QualityJudge scoring
Before invoking QualityJudge (or before final gate decision), the system SHALL additionally run guardrails derived from the M7-extended sections of `platform-profile.json`, including:

- title policy checks (`platform-profile.json.retention.title_policy`)
- mobile readability lint (`platform-profile.json.readability.mobile`)
- naming conflict checks (`platform-profile.json.naming`: duplicate + near-duplicate + alias collision)

The system SHOULD prefer deterministic tooling when available, but MUST provide a safe fallback that does not hang the pipeline.

#### Scenario: Guardrail report produced and provided to QualityJudge
- **WHEN** the system is about to run QualityJudge for chapter C
- **THEN** it runs guardrail checks and produces a structured report object
- **AND** provides the report (or a compact summary) as an input signal to QualityJudge and/or the gate engine

#### Scenario: Title policy failure triggers title-fix
- **WHEN** title checks fail and `platform-profile.json.retention.title_policy.auto_fix=true`
- **THEN** the system runs `title-fix` (title-only micro-step) and re-runs title checks

#### Scenario: Naming conflicts are detected and recorded
- **WHEN** naming checks detect a configured blocking conflict type (e.g. `duplicate` or `alias_collision`)
- **THEN** the system records the conflict (with evidence) in an auditable report under `logs/naming/`

## References

- `openspec/changes/m6-platform-optimization/specs/platform-constraints/spec.md`
- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
