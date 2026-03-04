## ADDED Requirements

### Requirement: System SHALL define per-platform hard quality gates for chapters 1-3
The system SHALL provide a `templates/golden-chapter-gates.json` configuration file defining hard quality gates specific to each canonical platform (fanqie, qidian, jinjiang) for chapters 1 through 3 (inclusive).

#### Scenario: Golden gates template exists with per-platform rules
- **GIVEN** the file `templates/golden-chapter-gates.json`
- **WHEN** the JSON is parsed
- **THEN** it contains gate definitions keyed by canonical platform ID (fanqie, qidian, jinjiang)
- **AND** each platform entry defines gates applicable to chapters 1-3

#### Scenario: fanqie gates enforce protagonist and conflict
- **GIVEN** the fanqie gate definitions
- **THEN** they require: protagonist appears within first 200 words, at least one conflict per chapter, chapter-end hook present, and `excitement_type` is one of `{reversal, face_slap, power_up}`

#### Scenario: qidian gates enforce system/world presence and immersion
- **GIVEN** the qidian gate definitions
- **THEN** they require: system or world-building presence established, and `immersion >= 3.5`

#### Scenario: jinjiang gates enforce character expression and CP appearance
- **GIVEN** the jinjiang gate definitions
- **THEN** they require: personality expressed through behavior (not narration), CP (couple pairing) appears, emotional tone established, and `style_naturalness >= 3.5`

### Requirement: Golden gates SHALL include invalid_combinations warnings
The golden chapter gates configuration SHALL contain an `invalid_combinations` section listing genre-platform combinations that are unusual or risky, with associated WARNING messages.

#### Scenario: invalid_combinations section exists
- **GIVEN** `templates/golden-chapter-gates.json`
- **WHEN** the JSON is parsed
- **THEN** it contains a top-level `invalid_combinations` array
- **AND** each entry specifies a `genre`, `platform`, and `warning` message

### Requirement: QualityJudge SHALL implement Track 3 for golden chapter gate evaluation
`agents/quality-judge.md` SHALL define a new Track 3: Golden Chapter Gates that is activated only when `chapter_number <= 3`. Track 3 evaluates the chapter against the platform-specific gate conditions from the golden gates configuration.

#### Scenario: Track 3 activates for chapter 1
- **GIVEN** the current chapter is chapter 1
- **AND** golden chapter gates are provided in the evaluation context
- **WHEN** QualityJudge runs
- **THEN** Track 3 is executed and gate conditions are evaluated

#### Scenario: Track 3 does not activate for chapter 4
- **GIVEN** the current chapter is chapter 4
- **WHEN** QualityJudge runs
- **THEN** Track 3 is skipped entirely

### Requirement: Gate failure SHALL force recommendation=revise
When any golden chapter gate condition fails, the QualityJudge output SHALL set `recommendation` to `"revise"` regardless of the aggregate score.

#### Scenario: Gate failure overrides passing score
- **GIVEN** chapter 2 scores 4.5 overall (above passing threshold)
- **BUT** the fanqie gate "protagonist appears within 200 words" fails
- **WHEN** QualityJudge produces the evaluation
- **THEN** `recommendation` is `"revise"`
- **AND** the gate failure reason is included in the evaluation output

#### Scenario: All gates pass, score determines recommendation
- **GIVEN** chapter 1 passes all golden chapter gates
- **WHEN** QualityJudge produces the evaluation
- **THEN** `recommendation` is determined by the aggregate score (normal gating logic)

### Requirement: Continue skill SHALL inject golden gates for chapters 1-3
`skills/continue/SKILL.md` Step 2.6 SHALL inject `inline.golden_chapter_gates` into the instruction packet when the current chapter number is <= 3 and the golden gates configuration file exists.

#### Scenario: Golden gates injected for chapter 2
- **GIVEN** chapter number is 2 and `golden-chapter-gates.json` exists
- **WHEN** the continue skill builds the instruction packet
- **THEN** `inline.golden_chapter_gates` contains the platform-specific gates for the current platform

#### Scenario: Golden gates not injected for chapter 5
- **GIVEN** chapter number is 5
- **WHEN** the continue skill builds the instruction packet
- **THEN** `inline.golden_chapter_gates` is NOT present

### Requirement: Continue skill gate decision SHALL include hard gate failure forced revision
`skills/continue/SKILL.md` Step 5 gate decision logic SHALL treat golden chapter gate failures as forced revision triggers, in addition to existing score-based revision logic.

#### Scenario: Hard gate failure triggers revision loop
- **GIVEN** QualityJudge evaluation for chapter 1 contains a golden gate failure
- **WHEN** the continue skill processes the evaluation in Step 5
- **THEN** it enters the revision loop (same as score < 3.0 behavior)

### Requirement: Init SHALL register golden-chapter-gates.json as a default template
`src/init.ts` DEFAULT_TEMPLATES list SHALL include `golden-chapter-gates.json` so that it is copied to the project root during initialization.

#### Scenario: Golden gates template copied on init
- **GIVEN** the user runs project initialization
- **WHEN** initialization completes
- **THEN** `golden-chapter-gates.json` exists in the project root

## References

- `agents/quality-judge.md`
- `skills/continue/SKILL.md`
- `src/init.ts`
- `skills/novel-writing/references/quality-rubric.md`
