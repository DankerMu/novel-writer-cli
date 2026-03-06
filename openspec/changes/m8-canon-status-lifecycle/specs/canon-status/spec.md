## ADDED Requirements

### Requirement: L1 world rules SHALL support a `canon_status` lifecycle enum

Each entry in `world/rules.json` SHALL support an optional `canon_status` field with the following enum values:
- `established` — active hard constraint (default when field is missing)
- `planned` — visible but not enforced as a hard constraint
- `deprecated` — ignored by all consumers

WorldBuilder SHALL set `canon_status` explicitly when creating or updating rules. When the field is absent, all consumers MUST treat the entry as `established`.

#### Scenario: New rule created with default status
- **GIVEN** WorldBuilder creates a new rule in `rules.json`
- **WHEN** `canon_status` is not explicitly set
- **THEN** the rule defaults to `established`
- **AND** ChapterWriter treats it as a hard constraint
- **AND** QualityJudge verifies compliance against it

#### Scenario: Rule marked as planned
- **GIVEN** a rule exists in `rules.json` with `canon_status: "planned"`
- **WHEN** ChapterWriter assembles the writing context
- **THEN** the rule does NOT appear in `hard_rules_list`
- **AND** the rule appears in a separate informational reference section
- **AND** QualityJudge does NOT penalize violations of this rule

#### Scenario: Rule marked as deprecated
- **GIVEN** a rule exists in `rules.json` with `canon_status: "deprecated"`
- **WHEN** ChapterWriter assembles the writing context
- **THEN** the rule does NOT appear in `hard_rules_list`
- **AND** the rule does NOT appear in any informational section
- **AND** QualityJudge does NOT verify compliance against it

#### Scenario: Rule has no canon_status field (backward compatibility)
- **GIVEN** a rule exists in `rules.json` without a `canon_status` field
- **WHEN** any consumer reads the rule
- **THEN** the rule is treated identically to `canon_status: "established"`
- **AND** no migration or file modification is required

---

### Requirement: L2 character contracts SHALL support the same `canon_status` lifecycle enum

Each character entry in `characters/active/*.json` SHALL support an optional `canon_status` field with the same enum and default behavior as Requirement 1.

CharacterWeaver SHALL set `canon_status` explicitly when creating or updating characters.

#### Scenario: Character with status planned
- **GIVEN** a character JSON has `canon_status: "planned"`
- **WHEN** the continue Skill assembles context (Step 2.4)
- **THEN** the character's contract is visible in context but NOT enforced as an L2 constraint
- **AND** QualityJudge does NOT verify L2 compliance for this character

#### Scenario: Character with status deprecated
- **GIVEN** a character JSON has `canon_status: "deprecated"`
- **WHEN** the continue Skill assembles context (Step 2.4)
- **THEN** the character is skipped entirely in context assembly
- **AND** the character does NOT appear in `character_contracts` or `character_profiles` path lists

#### Scenario: Character has no canon_status field (backward compatibility)
- **GIVEN** a character JSON does not contain a `canon_status` field
- **WHEN** any consumer reads the character
- **THEN** the character is treated identically to `canon_status: "established"`

---

### Requirement: ChapterWriter SHALL filter constraints by `canon_status`

ChapterWriter SHALL distinguish between constraint enforcement levels based on `canon_status`:
- `established` (or missing): hard constraint — appears in `hard_rules_list` and character contracts
- `planned`: informational — visible as reference but explicitly marked as non-binding
- `deprecated`: invisible — excluded from all writing context

#### Scenario: Only established rules appear in hard_rules_list
- **GIVEN** `rules.json` contains 5 rules: 3 `established`, 1 `planned`, 1 `deprecated`
- **WHEN** the continue Skill assembles `hard_rules_list` (Step 2.2)
- **THEN** `hard_rules_list` contains exactly the 3 `established` rules
- **AND** rules with `constraint_type: "hard"` but `canon_status: "planned"` are excluded from `hard_rules_list`

#### Scenario: Planned rules appear in a separate informational section
- **GIVEN** `rules.json` contains rules with `canon_status: "planned"`
- **WHEN** the continue Skill assembles the ChapterWriter manifest
- **THEN** planned rules are provided in a distinct `planned_rules_info` field (or equivalent)
- **AND** ChapterWriter's prompt clearly labels these as "not yet in effect — for foreshadowing reference only"

#### Scenario: Planned characters visible but not enforced
- **GIVEN** a character has `canon_status: "planned"` and is relevant to the current chapter
- **WHEN** ChapterWriter writes the chapter
- **THEN** the character may be referenced or foreshadowed
- **BUT** ChapterWriter is NOT required to enforce L2 behavioral constraints for this character

---

### Requirement: QualityJudge Track 1 SHALL only verify `established` items

QualityJudge Track 1 (Contract Verification) SHALL skip L1/L2 compliance checks for any item whose `canon_status` is `planned` or `deprecated`. Items with missing `canon_status` SHALL be verified (treated as `established`).

#### Scenario: Violation of a planned rule produces no penalty
- **GIVEN** a rule has `canon_status: "planned"` and `constraint_type: "hard"`
- **WHEN** the chapter text contradicts this rule
- **THEN** QualityJudge does NOT flag a violation
- **AND** no score penalty is applied

#### Scenario: Violation of an established rule produces standard penalty
- **GIVEN** a rule has `canon_status: "established"` (or field is missing) and `constraint_type: "hard"`
- **WHEN** the chapter text contradicts this rule
- **THEN** QualityJudge flags a violation with standard severity
- **AND** the gate decision follows existing high-confidence violation handling

#### Scenario: Deprecated character contract is not checked
- **GIVEN** a character has `canon_status: "deprecated"`
- **WHEN** QualityJudge runs Track 1 L2 checks
- **THEN** the character's behavioral constraints are not evaluated
- **AND** any apparent "violation" of deprecated constraints is ignored

## References

- `agents/world-builder.md` — L1 rules.json schema definition
- `agents/character-weaver.md` — L2 character contract schema
- `agents/chapter-writer.md` — constraint consumption and writing context
- `agents/quality-judge.md` — Track 1 contract verification
- `skills/continue/SKILL.md` — Step 2.2 (hard_rules_list) and Step 2.4 (character contract trimming)
