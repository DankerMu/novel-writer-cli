## ADDED Requirements

### Requirement 1: QualityJudge anti_ai output SHALL include statistical_profile

QualityJudge `anti_ai` output object SHALL contain a `statistical_profile` sub-object with three fields: `sentence_length_std_dev`, `paragraph_length_cv`, and `vocabulary_richness_estimate`. These values are estimated by QualityJudge from the chapter text. If lint-computed values are available (passed via instruction packet), lint values override QJ estimates.

#### Scenario: Output contains sentence_length_std_dev
- **GIVEN** QualityJudge is evaluating a chapter's anti-AI characteristics
- **WHEN** the `anti_ai` output is generated
- **THEN** `statistical_profile.sentence_length_std_dev` is present
- **AND** its value is a numeric measurement derived from the chapter text's sentence length distribution

#### Scenario: Output contains paragraph_length_cv
- **GIVEN** QualityJudge is evaluating a chapter's anti-AI characteristics
- **WHEN** the `anti_ai` output is generated
- **THEN** `statistical_profile.paragraph_length_cv` is present
- **AND** its value is a numeric coefficient of variation derived from the chapter text's paragraph lengths

#### Scenario: Output contains vocabulary_richness_estimate
- **GIVEN** QualityJudge is evaluating a chapter's anti-AI characteristics
- **WHEN** the `anti_ai` output is generated
- **THEN** `statistical_profile.vocabulary_richness_estimate` is present
- **AND** its value is one of `"high"`, `"medium"`, or `"low"`

#### Scenario: Lint values override QJ estimates
- **GIVEN** QualityJudge receives lint-computed statistical values via instruction packet
- **WHEN** the lint data includes `sentence_length_std_dev`, `paragraph_length_cv`, or `vocabulary_richness_estimate`
- **THEN** the lint-provided values are used in `statistical_profile` instead of QJ's own estimates
- **AND** QJ does NOT recalculate the overridden fields

---

### Requirement 2: QualityJudge anti_ai output SHALL include detected_humanize_techniques

QualityJudge `anti_ai` output object SHALL contain a `detected_humanize_techniques` array listing the technique IDs (from style-guide SS2.9 toolbox) that QualityJudge identifies as present in the chapter text.

#### Scenario: Output lists technique IDs found in chapter
- **GIVEN** QualityJudge is evaluating a chapter that employs humanization techniques
- **WHEN** the `anti_ai` output is generated
- **THEN** `detected_humanize_techniques` is an array of string IDs (e.g., `["thought_interrupt", "mundane_detail"]`)
- **AND** each ID corresponds to a technique from the SS2.9 toolbox

#### Scenario: Empty array if no techniques detected
- **GIVEN** QualityJudge is evaluating a chapter with no identifiable humanization techniques
- **WHEN** the `anti_ai` output is generated
- **THEN** `detected_humanize_techniques` is an empty array `[]`
- **AND** the field is still present (not omitted)

---

### Requirement 3: QualityJudge style_naturalness SHALL use 7-indicator assessment

QualityJudge Constraint 3 (`style_naturalness` scoring) SHALL be rewritten from a 4-indicator system to a 7-indicator system. The 7 indicators are:

1. `blacklist_hit_rate`
2. `sentence_repetition_rate`
3. `sentence_length_std_dev`
4. `paragraph_length_cv`
5. `vocabulary_diversity_score`
6. `narration_connector_count`
7. `humanize_technique_variety`

Each indicator uses green/yellow/red zone thresholds as defined in style-guide Layer 4.

#### Scenario: All 7 indicators evaluated per chapter
- **GIVEN** QualityJudge is scoring `style_naturalness` for a chapter
- **WHEN** Constraint 3 is applied
- **THEN** all 7 indicators are evaluated and reported
- **AND** each indicator has a zone assignment (green, yellow, or red)

#### Scenario: Each indicator uses green/yellow/red zone from style-guide Layer 4
- **GIVEN** QualityJudge is determining the zone for an indicator
- **WHEN** the indicator value is computed
- **THEN** the zone thresholds are taken from style-guide Layer 4 definitions
- **AND** green = healthy, yellow = warning, red = failing

#### Scenario: Backward compatibility with 4-indicator mode
- **GIVEN** QualityJudge is evaluating a chapter but only 4 old indicators are available (e.g., historical eval data or legacy context)
- **WHEN** Constraint 3 is applied
- **THEN** QualityJudge falls back to the old 4-indicator scoring table
- **AND** the output explicitly notes `"indicator_mode": "4-indicator-compat"`

#### Scenario: narration_connector_count > 0 triggers automatic red zone
- **GIVEN** QualityJudge is evaluating the `narration_connector_count` indicator
- **WHEN** the count is greater than 0 (any narration connector detected in non-dialogue text)
- **THEN** the `narration_connector_count` indicator is automatically assigned red zone
- **AND** this overrides any other zone calculation for this indicator

## References

- `agents/quality-judge.md` -- QualityJudge Agent prompt (Constraint 3 + anti_ai output format)
- CS-A2 `m9-anti-ai-methodology-upgrade` -- style-guide Layer 4 (7-indicator zone definitions)
- `skills/novel-writing/references/style-guide.md` -- style-guide (SS2.9 toolbox, Layer 4 thresholds)
- `templates/style-profile-template.json` -- style-profile schema (statistical fields)
