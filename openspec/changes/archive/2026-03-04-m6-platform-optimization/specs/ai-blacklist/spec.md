## ADDED Requirements

### Requirement: The system SHALL treat `ai-blacklist.json` as a high-confidence style-naturalness signal
The system SHALL use `ai-blacklist.json` hits as a primary, high-confidence signal for the `style_naturalness` dimension (or equivalent) in quality scoring.

The blacklist hit rate SHOULD be expressed as hits per 1000 words and SHOULD be computed deterministically when tooling is available.

#### Scenario: Blacklist hit metrics inform style scoring
- **WHEN** a chapter contains blacklist phrases
- **THEN** the evaluation output records blacklist hit metrics and uses them to inform `style_naturalness` scoring

### Requirement: AI blacklist updates MUST preserve false-positive protection
The system SHALL support `whitelist` / exemptions such that phrases intentionally present in the user’s style are not treated as negative signals.

#### Scenario: Whitelisted phrase is exempt
- **WHEN** a phrase is present in `ai-blacklist.json.whitelist`
- **THEN** occurrences of that phrase are not counted as blacklist hits

### Requirement: AI blacklist MUST remain separate from web-novel cliché lint
The system MUST keep `ai-blacklist` (AI-ness signal) separate from `web-novel-cliche-lint` (platform/style signal).

#### Scenario: Cliché lint does not contaminate AI blacklist
- **WHEN** a phrase is flagged only by cliché lint
- **THEN** it does not affect AI blacklist hit metrics unless explicitly added by the user

## References

- `templates/ai-blacklist.json`
- `scripts/lint-blacklist.sh`
- `openspec/changes/m6-platform-optimization/specs/web-novel-cliche-lint/spec.md`
