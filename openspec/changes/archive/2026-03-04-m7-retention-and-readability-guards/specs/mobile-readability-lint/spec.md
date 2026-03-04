## ADDED Requirements

### Requirement: The system SHALL lint chapters for mobile readability
When enabled by `platform-profile.json.readability.mobile.enabled=true`, the system SHALL lint chapter Markdown for mobile readability and output a structured report.

At minimum, the lint SHALL detect:
- overlong paragraphs (character threshold)
- dialogue formatting issues (speaker separation, excessive inline dialogue blocks)
- inconsistent punctuation/quotes (simplified/traditional variants, fullwidth consistency)
- excessive consecutive exposition blocks (configurable)

#### Scenario: Overlong paragraph flagged
- **WHEN** a paragraph exceeds `max_paragraph_chars`
- **THEN** the report includes an issue with evidence and a suggested split strategy

### Requirement: Readability lint SHOULD prefer deterministic scripts when available
If a deterministic script exists (e.g., `scripts/lint-readability.sh`), the system SHOULD prefer it and treat its JSON stdout as authoritative.
If the script is missing or fails, the system MUST fall back to a non-blocking path (warn-only) and MUST NOT hang the pipeline.

#### Scenario: Script output used for lint results
- **WHEN** `scripts/lint-readability.sh` exists and returns valid JSON
- **THEN** the system uses its results to build the readability report

### Requirement: Readability lint results SHALL support severity-based gating
The readability report SHALL include per-issue `severity` in `{warn, soft, hard}`.
When configured by platform profile, `hard` issues MUST block commit (high-confidence violation); otherwise they SHOULD be surfaced as warnings.

#### Scenario: Hard readability issue blocks commit
- **WHEN** a chapter contains a `hard` readability issue
- **AND** platform profile configures hard readability issues as blocking
- **THEN** the system requires revision before commit

## References

- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
- `openspec/changes/m6-platform-optimization/specs/platform-constraints/spec.md`
