## ADDED Requirements

### Requirement: The system SHALL maintain a configurable web-novel cliché lint list
The system SHALL ship a baseline template file `templates/web-novel-cliche-lint.json`.

The system SHALL support a project-level configuration file `web-novel-cliche-lint.json` at the project root as the runtime, user-editable configuration.
On project initialization, if `web-novel-cliche-lint.json` does not exist, the system SHOULD copy the template into the project root (similar to `ai-blacklist`).

The file SHALL support:
- `words[]` (flat list)
- `categories{}` mapping category → word list
- per-category or per-word `severity` classification in `{warn, soft, hard}`
- `whitelist[]` and/or structured exemptions to reduce false positives

#### Scenario: Project includes cliché lint configuration
- **WHEN** a project is initialized with platform optimization enabled
- **THEN** `web-novel-cliche-lint.json` exists and is loadable by validators/judges

### Requirement: The system SHALL compute cliché hit metrics deterministically when possible
The system SHALL compute, at minimum:
- total hits
- hits per 1000 words
- hits by severity and category

If a deterministic lint script exists (e.g., `scripts/lint-cliche.sh`), the system SHALL prefer it; otherwise it SHALL fall back to a non-blocking estimation path.

#### Scenario: Deterministic lint preferred
- **WHEN** `scripts/lint-cliche.sh` exists and outputs valid JSON
- **THEN** the system uses its output to compute cliché metrics

### Requirement: Cliché lint SHALL be a separate signal from AI blacklist
The system MUST treat `web-novel-cliche-lint` as a separate signal from `ai-blacklist`:
- `ai-blacklist` remains a high-confidence “AI-ness” signal
- cliché lint is a platform/style signal with multi-level severity and opt-outs

The system MUST NOT automatically promote cliché words into `ai-blacklist` without explicit user intent.

#### Scenario: Cliché word does not become AI blacklist entry
- **WHEN** a phrase is flagged as a cliché by `web-novel-cliche-lint`
- **THEN** it is not added to `ai-blacklist.json` automatically

### Requirement: Cliché lint outcomes SHALL influence scoring and/or gating via platform profile
When enabled by `platform-profile.json`, cliché lint outcomes SHALL:
- contribute to scoring signals (e.g., reduce `style_naturalness` or apply platform-specific penalties)
- optionally trigger warnings or hard violations for `hard` severity terms if configured

#### Scenario: Hard severity term triggers a violation
- **WHEN** `platform-profile.json` configures `hard` severity cliché terms as blocking
- **AND** a chapter contains a `hard` severity cliché term
- **THEN** the system marks a high-confidence violation and requires revision

## References

- `templates/ai-blacklist.json`
- `templates/web-novel-cliche-lint.json`
- `scripts/lint-blacklist.sh`
- `openspec/changes/m6-platform-optimization/specs/platform-profile/spec.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
