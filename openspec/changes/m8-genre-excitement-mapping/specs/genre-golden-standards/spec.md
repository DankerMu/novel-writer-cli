## ADDED Requirements

### Requirement: System SHALL provide a genre-golden-standards.json template defining per-genre review standards for Ch1-3
The system SHALL provide a `templates/genre-golden-standards.json` configuration file defining, for each of 6 canonical genres, differentiated review standards for golden chapters (Ch1-3), including focus dimensions, criteria, and minimum thresholds.

#### Scenario: Template defines 6 canonical genres with review standards
- **GIVEN** the file `templates/genre-golden-standards.json`
- **WHEN** the JSON is parsed
- **THEN** it contains entries keyed by genre ID: `xuanhuan`, `dushi`, `scifi`, `history`, `suspense`, `romance`
- **AND** each genre entry contains `focus_dimensions`, `criteria`, and `minimum_thresholds` fields

#### Scenario: xuanhuan requires immersion >= 3.5
- **GIVEN** the `xuanhuan` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `immersion >= 3.5`
- **AND** `focus_dimensions` prioritizes immersion and world-building presence
- **AND** `criteria` describes system/power-system existence and atmospheric density

#### Scenario: dushi requires pacing >= 3.5
- **GIVEN** the `dushi` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `pacing >= 3.5`
- **AND** `focus_dimensions` prioritizes pacing and reversal impact
- **AND** `criteria` describes identity contrast and social tension establishment

#### Scenario: scifi requires plot_logic >= 3.5 and immersion >= 3.5
- **GIVEN** the `scifi` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `plot_logic >= 3.5` and `immersion >= 3.5`
- **AND** `focus_dimensions` prioritizes logical consistency and setting credibility

#### Scenario: history requires plot_logic >= 3.5
- **GIVEN** the `history` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `plot_logic >= 3.5`
- **AND** `focus_dimensions` prioritizes historical plausibility and era atmosphere

#### Scenario: suspense requires plot_logic >= 4.0
- **GIVEN** the `suspense` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `plot_logic >= 4.0`
- **AND** `focus_dimensions` prioritizes logical rigor and information control
- **AND** `criteria` describes clue planting, misdirection quality, and tension arc

#### Scenario: romance requires character >= 4.0 AND style_naturalness >= 3.5
- **GIVEN** the `romance` entry in genre-golden-standards.json
- **THEN** `minimum_thresholds` includes `character >= 4.0` and `style_naturalness >= 3.5`
- **AND** `focus_dimensions` prioritizes character dimensionality and emotional authenticity
- **AND** `criteria` describes personality expression through behavior, CP chemistry, and emotional hook

### Requirement: QualityJudge Track 3 SHALL apply genre-specific standards when genre_golden_standards exists and chapter <= 3
`agents/quality-judge.md` Track 3 SHALL be extended to check genre-specific `minimum_thresholds` and `criteria` from the genre_golden_standards configuration when the template is provided and chapter number is <= 3.

#### Scenario: Genre is romance, character score below threshold triggers gate failure
- **GIVEN** genre is romance and chapter is 2
- **AND** genre_golden_standards specifies character >= 4.0
- **AND** QualityJudge evaluates character dimension at 3.5
- **WHEN** Track 3 evaluates genre-specific gates
- **THEN** the genre-specific gate fails
- **AND** `recommendation` is set to `"revise"`
- **AND** the failure reason specifies which genre threshold was not met

#### Scenario: Genre is xuanhuan, immersion score above threshold passes
- **GIVEN** genre is xuanhuan and chapter is 1
- **AND** genre_golden_standards specifies immersion >= 3.5
- **AND** QualityJudge evaluates immersion dimension at 3.8
- **WHEN** Track 3 evaluates genre-specific gates
- **THEN** the genre-specific gate passes

#### Scenario: genre_golden_standards template missing, skip genre-specific evaluation
- **GIVEN** `templates/genre-golden-standards.json` does not exist or is not injected
- **WHEN** QualityJudge runs Track 3
- **THEN** genre-specific evaluation is skipped entirely
- **AND** Track 3 only evaluates platform-specific gates (if present)

#### Scenario: Genre not found in genre_golden_standards, skip genre-specific evaluation
- **GIVEN** genre_golden_standards exists but does not contain the current project genre
- **WHEN** QualityJudge runs Track 3
- **THEN** genre-specific evaluation is skipped for the unrecognized genre
- **AND** no error is produced

### Requirement: genre-golden-standards.json SHALL define Genre x Platform invalid/uncommon combination warnings
The genre-golden-standards configuration SHALL contain an `invalid_combinations` section listing genre-platform combinations that are unusual or risky, with associated WARNING messages.

#### Scenario: Genre romance + Platform qidian triggers WARNING
- **GIVEN** `templates/genre-golden-standards.json` `invalid_combinations` section
- **WHEN** genre is `romance` and platform is `qidian`
- **THEN** the combination is flagged with a WARNING message (e.g., "起点以男频为主，言情题材建议选择晋江")

#### Scenario: Genre xuanhuan + Platform jinjiang triggers WARNING
- **GIVEN** `templates/genre-golden-standards.json` `invalid_combinations` section
- **WHEN** genre is `xuanhuan` and platform is `jinjiang`
- **THEN** the combination is flagged with a WARNING message (e.g., "晋江以女频为主，玄幻题材建议选择起点或番茄")

#### Scenario: User selects warned combination, init proceeds
- **GIVEN** user selects a genre-platform combination that triggers a WARNING
- **WHEN** the start skill processes the selection
- **THEN** the WARNING is displayed to the user
- **AND** initialization proceeds normally (not blocked)

### Requirement: Start skill SHALL add romance as 6th genre option and check genre x platform compatibility
`skills/start/SKILL.md` SHALL be updated to include romance (言情) as the 6th genre option in Step A, and SHALL check `invalid_combinations` from genre-golden-standards.json after genre and platform selection.

#### Scenario: Step A presents 6 genre options including romance
- **GIVEN** the user is in the start skill Step A (genre selection)
- **WHEN** genre options are presented
- **THEN** 6 options are listed: 玄幻, 都市, 科幻, 历史, 悬疑, 言情

#### Scenario: After genre+platform selection, system checks invalid_combinations
- **GIVEN** user has selected genre and platform
- **AND** genre-golden-standards.json exists with invalid_combinations
- **WHEN** the start skill validates the selection
- **THEN** it checks if the genre+platform pair appears in invalid_combinations
- **AND** displays WARNING if matched

#### Scenario: genre-golden-standards.json missing, no compatibility check
- **GIVEN** genre-golden-standards.json does not exist
- **WHEN** the start skill processes genre+platform selection
- **THEN** no compatibility check is performed
- **AND** no warning is displayed

### Requirement: Instruction runtime SHALL inject genre_golden_standards for opening QualityJudge packets
`src/instructions.ts` SHALL inject `inline.genre_golden_standards` into QualityJudge instruction packets when the current chapter number is <= 3, `genre-golden-standards.json` exists, and the project genre matches a key in the configuration.

#### Scenario: Genre standards injected for chapter 2 judge
- **GIVEN** chapter number is 2
- **AND** `genre-golden-standards.json` exists
- **AND** project genre is `suspense`
- **WHEN** the instruction runtime builds the `chapter:2:judge` QualityJudge packet
- **THEN** `inline.genre_golden_standards` contains the suspense-specific standards (focus_dimensions, criteria, minimum_thresholds)

#### Scenario: Genre standards injected for quickstart results in chapter 3
- **GIVEN** quickstart is evaluating chapter 3
- **AND** `genre-golden-standards.json` exists
- **AND** project genre is `romance`
- **WHEN** the instruction runtime builds the `quickstart:results` QualityJudge packet
- **THEN** `inline.genre_golden_standards` contains the romance-specific standards

#### Scenario: Genre standards not injected after chapter 3
- **GIVEN** current chapter number is 5
- **WHEN** the instruction runtime builds a QualityJudge packet
- **THEN** `inline.genre_golden_standards` is NOT present

### Requirement: Init SHALL register genre-excitement-map.json and genre-golden-standards.json as default templates
`src/init.ts` DEFAULT_TEMPLATES list SHALL include `genre-excitement-map.json` and `genre-golden-standards.json` so that both are copied to the project root during initialization.

#### Scenario: Both genre templates copied on init
- **GIVEN** the user runs project initialization
- **WHEN** initialization completes
- **THEN** `genre-excitement-map.json` exists in the project root
- **AND** `genre-golden-standards.json` exists in the project root

### Requirement: Instruction runtime SHALL inject genre_excitement_map into opening PlotArchitect packets
`src/instructions.ts` SHALL inject `genre_excitement_map` (matched by `brief.md` genre) into the `volume:outline` PlotArchitect instruction manifest when the selected planning range includes chapters 1-3 and `genre-excitement-map.json` exists.

#### Scenario: Genre excitement map injected during opening outline planning
- **GIVEN** genre-excitement-map.json exists
- **AND** project genre is xuanhuan
- **WHEN** the instruction runtime builds the `volume:outline` PlotArchitect manifest for chapter range 1-3
- **THEN** the manifest includes the xuanhuan Ch1-3 excitement_type mappings

#### Scenario: Genre excitement map missing, no injection
- **GIVEN** genre-excitement-map.json does not exist
- **WHEN** the instruction runtime builds the `volume:outline` PlotArchitect manifest
- **THEN** no genre_excitement_map is injected
- **AND** no warning or error is produced

## References

- `agents/quality-judge.md`
- `agents/plot-architect.md`
- `skills/continue/SKILL.md`
- `src/instructions.ts`
- `skills/start/SKILL.md`
- `src/init.ts`
- `templates/genre-golden-standards.json`
- `templates/genre-excitement-map.json`
- CS3 `templates/golden-chapter-gates.json` (platform-specific gates)
