## ADDED Requirements

### Requirement: PlatformId SHALL include qidian, tomato, fanqie, and jinjiang
The system SHALL define `PlatformId` as a union type accepting exactly four values: `"qidian" | "tomato" | "fanqie" | "jinjiang"`.

#### Scenario: TypeScript type accepts all four platform IDs
- **GIVEN** the `PlatformId` type is defined in `src/platform-profile.ts`
- **WHEN** a variable is assigned any of `"qidian"`, `"tomato"`, `"fanqie"`, or `"jinjiang"`
- **THEN** the assignment compiles without type errors

#### Scenario: Schema enum includes all four values
- **GIVEN** `schemas/platform-profile.schema.json` defines a `platform` enum
- **WHEN** the schema is loaded
- **THEN** the enum contains exactly `["qidian", "tomato", "fanqie", "jinjiang"]`

### Requirement: canonicalPlatformId SHALL map tomato to fanqie
The system SHALL provide a `canonicalPlatformId(id: PlatformId): CanonicalPlatformId` function that maps `"tomato"` to `"fanqie"` and returns all other IDs unchanged.

#### Scenario: tomato is normalized to fanqie
- **WHEN** `canonicalPlatformId("tomato")` is called
- **THEN** the return value is `"fanqie"`

#### Scenario: Other IDs pass through unchanged
- **WHEN** `canonicalPlatformId("qidian")` is called
- **THEN** the return value is `"qidian"`

#### Scenario: fanqie passes through unchanged
- **WHEN** `canonicalPlatformId("fanqie")` is called
- **THEN** the return value is `"fanqie"`

### Requirement: Init SHALL accept all four platform IDs
`src/init.ts` SHALL accept all four `PlatformId` values as valid platform input during project initialization.

#### Scenario: Initializing a project with jinjiang
- **WHEN** the user selects `"jinjiang"` during init
- **THEN** the system creates `platform-profile.json` with `platform: "jinjiang"`

#### Scenario: Initializing a project with tomato
- **WHEN** the user selects `"tomato"` during init
- **THEN** the system creates `platform-profile.json` with `platform: "tomato"` (original ID preserved in file)

### Requirement: Start skill SHALL display three visible options with tomato hidden
The Start skill (Step B.4.1) SHALL present three platform choices to the user: `qidian`, `fanqie (番茄)`, `jinjiang (晋江)`. The `tomato` ID SHALL NOT appear in the user-facing selection but SHALL remain valid if entered manually or loaded from an existing project.

#### Scenario: User sees three platform options
- **WHEN** the Start skill presents platform selection
- **THEN** the displayed options are `qidian`, `fanqie (番茄)`, `jinjiang (晋江)`
- **AND** `tomato` is NOT shown

#### Scenario: tomato entered manually is accepted
- **WHEN** a user manually enters `"tomato"` as platform
- **THEN** the system accepts it without error

### Requirement: Platform profile template SHALL include fanqie and jinjiang defaults
`templates/platform-profile.json` SHALL include default configurations for `fanqie` and `jinjiang` in addition to the existing `qidian` and `tomato` defaults.

#### Scenario: jinjiang defaults reflect platform conventions
- **GIVEN** `templates/platform-profile.json` contains jinjiang defaults
- **THEN** jinjiang defaults include `word_count` target range of 2000-3000 and `genre_drive_type` of `"character"`

#### Scenario: fanqie defaults are present
- **GIVEN** `templates/platform-profile.json` contains fanqie defaults
- **THEN** fanqie defaults are consistent with existing tomato defaults (same platform, rebranded)

## References

- `src/platform-profile.ts`
- `schemas/platform-profile.schema.json`
- `src/init.ts`
- `skills/start/SKILL.md`
- `templates/platform-profile.json`
