## ADDED Requirements

### Requirement: System SHALL provide a genre-excitement-map.json template defining per-genre Ch1-3 excitement_type assignments
The system SHALL provide a `templates/genre-excitement-map.json` configuration file defining, for each of 6 canonical genres, the default `excitement_type` assignment for chapters 1, 2, and 3.

#### Scenario: Template defines 6 canonical genres
- **GIVEN** the file `templates/genre-excitement-map.json`
- **WHEN** the JSON is parsed
- **THEN** it contains entries keyed by genre ID: `xuanhuan`, `dushi`, `scifi`, `history`, `suspense`, `romance`
- **AND** each genre entry maps chapter numbers 1, 2, 3 to specific `excitement_type` values from the CS2 enum

#### Scenario: xuanhuan maps to setup, power_up, face_slap
- **GIVEN** the `xuanhuan` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `setup`
- **AND** chapter 2 maps to `power_up`
- **AND** chapter 3 maps to `face_slap`

#### Scenario: dushi maps to setup, reversal, face_slap
- **GIVEN** the `dushi` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `setup`
- **AND** chapter 2 maps to `reversal`
- **AND** chapter 3 maps to `face_slap`

#### Scenario: scifi maps to reveal, setup, cliffhanger
- **GIVEN** the `scifi` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `reveal`
- **AND** chapter 2 maps to `setup`
- **AND** chapter 3 maps to `cliffhanger`

#### Scenario: history maps to setup, reveal, reversal
- **GIVEN** the `history` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `setup`
- **AND** chapter 2 maps to `reveal`
- **AND** chapter 3 maps to `reversal`

#### Scenario: suspense maps to reveal, setup, cliffhanger
- **GIVEN** the `suspense` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `reveal`
- **AND** chapter 2 maps to `setup`
- **AND** chapter 3 maps to `cliffhanger`

#### Scenario: romance maps to setup, reveal, reversal
- **GIVEN** the `romance` entry in genre-excitement-map.json
- **THEN** chapter 1 maps to `setup`
- **AND** chapter 2 maps to `reveal`
- **AND** chapter 3 maps to `reversal`

### Requirement: PlotArchitect SHALL reference genre_excitement_map when planning Ch1-3
`agents/plot-architect.md` SHALL instruct PlotArchitect to consult the genre_excitement_map template when planning chapters 1-3, using the mapped excitement_type as the default assignment for each chapter.

#### Scenario: Genre is xuanhuan, Ch1 defaults to setup
- **GIVEN** the project genre is xuanhuan
- **AND** PlotArchitect is planning chapter 1
- **AND** genre_excitement_map template is available
- **WHEN** PlotArchitect assigns excitement_type
- **THEN** the default assignment is `setup` per the genre mapping

#### Scenario: PlotArchitect MAY override default assignment with justification
- **GIVEN** the genre mapping suggests `power_up` for xuanhuan Ch2
- **WHEN** PlotArchitect determines a different excitement_type is more appropriate
- **THEN** PlotArchitect MAY override the default
- **AND** SHALL record the override justification in the outline

#### Scenario: genre_excitement_map template missing, PlotArchitect assigns freely
- **GIVEN** `templates/genre-excitement-map.json` does not exist
- **WHEN** PlotArchitect plans Ch1-3
- **THEN** PlotArchitect assigns excitement_type freely without genre constraints
- **AND** no warning or error is produced

## References

- `agents/plot-architect.md`
- `templates/genre-excitement-map.json`
- CS2 `excitement_type` enum: reversal | face_slap | power_up | reveal | cliffhanger | setup | null
