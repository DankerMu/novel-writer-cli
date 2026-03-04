## ADDED Requirements

### Requirement: The system SHALL maintain per-character voice profiles for key characters
The system SHALL maintain per-character voice profiles for key characters (at minimum the protagonist and configured core cast).

Voice profiles MAY be stored as:
- a single `character-voice-profiles.json` file, or
- per-character files under `characters/voice/`

Each character voice profile SHOULD include:
- preferred sentence length range
- dialogue length distribution
- signature phrases /口癖
- emotional expression style
- taboo phrases (optional)

#### Scenario: Protagonist voice profile exists
- **WHEN** the system completes the initial calibration phase (e.g., after quick-start chapters)
- **THEN** a protagonist voice profile exists and is loadable

### Requirement: The system SHALL detect per-character voice drift over a window
The system SHALL detect voice drift for each tracked character over a rolling window (default: last 10 chapters), and SHALL flag drift when thresholds exceed configured limits.

Drift output SHALL include:
- `character_id`
- drifted metrics (baseline vs current)
- evidence snippets (dialogue excerpts)
- corrective directives

#### Scenario: Voice drift detected for a key character
- **WHEN** a key character’s dialogue deviates beyond the configured thresholds
- **THEN** the system outputs a drift result containing evidence and directives

### Requirement: The system SHALL generate `character-voice-drift.json` and inject directives until recovery
When drift is detected, the system SHALL write `character-voice-drift.json` containing directives per character.
It SHALL inject these directives into ChapterWriter and StyleRefiner manifests until metrics recover within recovery thresholds.

#### Scenario: Drift directives injected for subsequent chapters
- **WHEN** `character-voice-drift.json` exists and is active
- **THEN** subsequent ChapterWriter/StyleRefiner runs receive the directives as context

#### Scenario: Drift cleared after recovery
- **WHEN** the next drift check shows deviations below the recovery threshold
- **THEN** the system clears or deactivates `character-voice-drift.json`

## References

- `openspec/changes/archive/2026-02-25-m3-style-drift-and-blacklist/specs/style-drift-and-blacklist/spec.md`
- `openspec/changes/m7-narrative-health-ledgers/proposal.md`
