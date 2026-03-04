## ADDED Requirements

### Requirement: The system SHALL require a chapter title when enabled by platform profile
When `platform-profile.json.retention.title_policy.enabled=true`, the system SHALL require every committed chapter file to have a title.

The default title location SHALL be:
- the first Markdown H1 line (`# ...`) in `chapters/chapter-{C:03d}.md`

#### Scenario: Missing title is detected
- **WHEN** a committed chapter file does not start with an H1 title
- **THEN** the system flags a title-policy violation (severity per profile)

### Requirement: The system SHALL validate chapter titles against platform policy
The system SHALL validate chapter titles using constraints from `platform-profile.json.retention.title_policy`, including at minimum:
- max/min length (characters)
- forbidden patterns (e.g., spoiler markers, banned words)
- required patterns (optional; e.g., allow “第XX章 …”)

The validator SHALL produce a structured, auditable report.

#### Scenario: Title exceeds max length
- **WHEN** a title exceeds `max_chars`
- **THEN** the report includes an issue with an evidence snippet and suggested fix

### Requirement: The system SHALL support a bounded `title-fix` micro-step
If title validation fails and `platform-profile.json.retention.title_policy.auto_fix=true`, the system SHALL run a `title-fix` micro-step that:
- only modifies the title line (H1)
- preserves the rest of the chapter content exactly
- performs at most 1 automated fix attempt before escalating to user review

#### Scenario: Title-fix edits only the title line
- **WHEN** `title-fix` is executed for chapter C
- **THEN** only the H1 title line changes
- **AND** the chapter body remains byte-identical

### Requirement: Title checks SHOULD consider title-hook coherence without spoilers
When hook ledger is enabled, the system SHOULD check for basic coherence between:
- chapter title “promise”
- chapter main delivered content
- chapter-end hook “promise”

This check MUST avoid spoilers and SHOULD produce only warnings by default.

#### Scenario: Title-hook mismatch produces a warning
- **WHEN** the title promises a reveal that does not occur in the chapter
- **THEN** the system emits a warning suggesting a title adjustment or content alignment

## References

- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
- `openspec/changes/m7-retention-and-readability-guards/specs/hook-ledger/spec.md`
