## ADDED Requirements

### Requirement: The system SHALL maintain a name registry for conflict detection
The system SHALL maintain or derive a name registry of known characters and their aliases from project sources, including at minimum:
- `characters/active/*.json.display_name`
- optional `aliases[]` fields when present

The registry MAY be persisted (e.g., `name-registry.json`) for auditability and performance.

#### Scenario: Registry derived from character profiles
- **WHEN** the system runs name conflict checks
- **THEN** it derives the canonical name list and aliases from existing character profiles

### Requirement: The system SHALL detect duplicate and near-duplicate character names
The system SHALL detect:
- exact duplicates (same display name)
- near-duplicates (configurable similarity threshold; e.g., edit distance, pinyin similarity)
- alias collisions (an alias matching another character’s name or alias)

The system SHALL output a structured report under `logs/naming/` including evidence and suggested remediation.

#### Scenario: Alias collision flagged
- **WHEN** a new alias matches an existing character’s canonical name
- **THEN** the report includes a collision issue and suggests renaming or disambiguation strategies

### Requirement: The system SHOULD check new, unknown character-like entities for confusion risk
When NER/unknown-entity signals are available (e.g., `logs/unknown-entities.jsonl`), the system SHOULD check newly introduced character-like entities for confusion risk against the registry and emit warnings.

#### Scenario: New entity similar to existing name triggers a warning
- **WHEN** a chapter introduces an unknown entity name that is highly similar to an existing character name
- **THEN** the system emits a naming warning and suggests adding disambiguation in text or choosing a different name

### Requirement: Name conflict severity SHALL be configurable per platform profile
The system SHALL allow platform profile to configure:
- which conflict types are blocking (`hard`)
- which are warn-only
- whitelist/exemptions for intentional overlaps (e.g., shared surname conventions)

#### Scenario: Duplicate name blocks commit when configured
- **WHEN** a chapter introduces a duplicate canonical name
- **AND** profile configures duplicates as blocking
- **THEN** the system produces a high-confidence violation and requires revision

## References

- `docs/dr-workflow/novel-writer-tool/final/prd/09-data.md`
- `skills/continue/references/continuity-checks.md`
- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
