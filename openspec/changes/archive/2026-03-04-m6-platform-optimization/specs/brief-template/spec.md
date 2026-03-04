## ADDED Requirements

### Requirement: The brief SHALL record platform and platform-profile linkage
The project brief (`brief.md`) SHALL record:
- the selected `platform` (qidian or tomato)
- a reference to the immutable `platform-profile.json` (either via an explicit path or an embedded summary)

#### Scenario: Brief captures platform binding
- **WHEN** a project is initialized and a platform is selected
- **THEN** `brief.md` includes the selected platform and references `platform-profile.json`

### Requirement: The brief SHALL include `genre_drive_type` used for dynamic scoring
The brief SHALL include a `genre_drive_type` field (see `genre-weight-profiles`) that drives default scoring weights.

#### Scenario: Drive type recorded in brief
- **WHEN** the user selects a drive type during initialization
- **THEN** `brief.md` includes `genre_drive_type` and the system can load the corresponding weight profile

### Requirement: Brief fields MUST be collected with an explicit user confirmation gate
During initialization, the system MUST collect and confirm platform-related fields (platform, drive type, key thresholds) via an explicit review gate before writing `brief.md` and `platform-profile.json`.

#### Scenario: User confirms platform-related fields
- **WHEN** initialization reaches the platform configuration step
- **THEN** the system presents the platform + drive type + key thresholds for confirmation
- **AND** only persists them after the user confirms

## References

- `templates/brief-template.md`
- `openspec/changes/m6-platform-optimization/specs/platform-profile/spec.md`
- `openspec/changes/m6-platform-optimization/specs/genre-weight-profiles/spec.md`
