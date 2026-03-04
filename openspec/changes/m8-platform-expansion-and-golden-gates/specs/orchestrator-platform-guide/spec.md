## ADDED Requirements

### Requirement: Init SHALL copy platform guide to project root as platform-writing-guide.md
During project initialization, `src/init.ts` SHALL copy the selected platform's writing guide from `templates/platforms/{canonical_platform}.md` to the project root as `platform-writing-guide.md`.

#### Scenario: fanqie guide is copied on init
- **GIVEN** the user selects `"fanqie"` during init
- **WHEN** initialization completes
- **THEN** `platform-writing-guide.md` exists in the project root with content identical to `templates/platforms/fanqie.md`

#### Scenario: tomato selection copies fanqie guide
- **GIVEN** the user selects `"tomato"` during init
- **WHEN** the platform is canonicalized to `"fanqie"`
- **THEN** `platform-writing-guide.md` is copied from `templates/platforms/fanqie.md`

#### Scenario: Guide file missing for platform degrades gracefully
- **GIVEN** no guide file exists at `templates/platforms/{platform}.md`
- **WHEN** initialization runs
- **THEN** the system logs a warning and continues without copying a guide (no hard failure)

### Requirement: buildInstructionPacket SHALL include paths.platform_writing_guide
`src/instructions.ts` `buildInstructionPacket` SHALL include `paths.platform_writing_guide` in the manifest, pointing to `platform-writing-guide.md` in the project root, when the file exists.

#### Scenario: Instruction packet includes guide path when file exists
- **GIVEN** `platform-writing-guide.md` exists in the project root
- **WHEN** `buildInstructionPacket` is called for a chapter draft step
- **THEN** the returned packet contains `paths.platform_writing_guide` set to the file path

#### Scenario: Instruction packet omits guide path when file is absent
- **GIVEN** `platform-writing-guide.md` does NOT exist in the project root
- **WHEN** `buildInstructionPacket` is called
- **THEN** the returned packet does NOT contain `paths.platform_writing_guide`

### Requirement: ChapterWriter SHALL accept and follow platform writing guide when present
`agents/chapter-writer.md` Input section SHALL list `paths.platform_writing_guide` as an optional input. The Constraints section SHALL include a rule that the agent must comply with platform-specific conventions defined in the guide.

#### Scenario: ChapterWriter receives guide in manifest
- **GIVEN** the instruction packet includes `paths.platform_writing_guide`
- **WHEN** ChapterWriter processes the manifest
- **THEN** it reads and follows the conventions specified in the guide

#### Scenario: ChapterWriter operates normally without guide
- **GIVEN** the instruction packet does NOT include `paths.platform_writing_guide`
- **WHEN** ChapterWriter processes the manifest
- **THEN** it writes using default conventions without error

### Requirement: Continue skill manifest SHALL conditionally include platform_writing_guide
`skills/continue/SKILL.md` manifest section SHALL include `paths.platform_writing_guide` as a conditional entry, present only when the file exists in the project root.

#### Scenario: Continue skill passes guide to ChapterWriter
- **GIVEN** `platform-writing-guide.md` exists and the continue skill builds a manifest
- **WHEN** the manifest is assembled
- **THEN** `paths.platform_writing_guide` is included

## References

- `src/init.ts`
- `src/instructions.ts`
- `agents/chapter-writer.md`
- `skills/continue/SKILL.md`
