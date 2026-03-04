## ADDED Requirements

### Requirement: style-profile-template.json SHALL include a platform field
`templates/style-profile-template.json` SHALL include a `"platform"` field with a default value of `null`.

#### Scenario: Template contains platform field
- **GIVEN** the file `templates/style-profile-template.json`
- **WHEN** the JSON is parsed
- **THEN** it contains a top-level key `"platform"` with value `null`

### Requirement: Init SHALL populate the platform field from selected platform
During project initialization, the orchestrator SHALL set the `platform` field in the project's `style-profile.json` to the selected platform ID.

#### Scenario: Platform field is populated on init
- **GIVEN** the user selects `"fanqie"` during init
- **WHEN** `style-profile.json` is generated in the project root
- **THEN** the `"platform"` field is set to `"fanqie"`

#### Scenario: Platform field reflects tomato when selected
- **GIVEN** the user enters `"tomato"` during init
- **WHEN** `style-profile.json` is generated
- **THEN** the `"platform"` field is set to `"tomato"` (original ID preserved)

## References

- `templates/style-profile-template.json`
- `src/init.ts`
