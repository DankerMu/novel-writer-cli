## MODIFIED Requirements

### Requirement 1: Quality rubric section 6 style_naturalness SHALL use 7-indicator 3-zone scoring

The `style_naturalness` dimension (section 6) in `quality-rubric.md` SHALL be rewritten from a 4-indicator 5-point scoring table to a 7-indicator 3-zone (green/yellow/red) scoring system. The 7 indicators are:

| # | Indicator | Description |
|---|-----------|-------------|
| 1 | `blacklist_hit_rate` | AI blacklist hits per 1000 characters |
| 2 | `sentence_repetition_rate` | Ratio of repeated sentence patterns |
| 3 | `sentence_length_std_dev` | Standard deviation of sentence lengths (chars) |
| 4 | `paragraph_length_cv` | Coefficient of variation of paragraph lengths |
| 5 | `vocabulary_diversity_score` | Vocabulary diversity (type-token ratio or equivalent) |
| 6 | `narration_connector_count` | Count of narration connectors in non-dialogue text |
| 7 | `humanize_technique_variety` | Count of distinct humanization techniques used |

Each indicator is evaluated into one of three zones: **green** (human range), **yellow** (borderline), **red** (AI characteristic). The zone results are then mapped to a 1-5 score.

#### Scenario: 7 indicators evaluated with green/yellow/red zones
- **GIVEN** a chapter text is assessed for style_naturalness
- **WHEN** the QualityJudge evaluates the chapter
- **THEN** each of the 7 indicators is classified into exactly one zone: green, yellow, or red
- **AND** the zone boundaries align with style-guide Layer 4 definitions

#### Scenario: All green leads to score 5
- **GIVEN** all 7 indicators are classified as green
- **WHEN** the zone-to-score mapping is applied
- **THEN** the style_naturalness score is 5

#### Scenario: 1-2 yellow with rest green leads to score 4
- **GIVEN** 1 or 2 indicators are classified as yellow
- **AND** all remaining indicators are classified as green
- **WHEN** the zone-to-score mapping is applied
- **THEN** the style_naturalness score is 4

#### Scenario: 3+ yellow or 1 red leads to score 3
- **GIVEN** 3 or more indicators are classified as yellow, OR exactly 1 indicator is classified as red
- **AND** no more than 1 indicator is red
- **WHEN** the zone-to-score mapping is applied
- **THEN** the style_naturalness score is 3

#### Scenario: 2+ red leads to score 2
- **GIVEN** 2 or 3 indicators are classified as red
- **WHEN** the zone-to-score mapping is applied
- **THEN** the style_naturalness score is 2

#### Scenario: 4+ red leads to score 1
- **GIVEN** 4 or more indicators are classified as red
- **WHEN** the zone-to-score mapping is applied
- **THEN** the style_naturalness score is 1

#### Scenario: Legacy 4-indicator fallback for backward compatibility
- **GIVEN** only the original 4 indicators are available (blacklist_hit_rate, sentence_repetition_rate, and the 2 legacy indicators)
- **AND** the 3 new statistical indicators cannot be evaluated
- **WHEN** style_naturalness scoring is performed
- **THEN** the legacy 5-point scoring table is used as fallback
- **AND** the result is a valid 1-5 score consistent with pre-upgrade behavior
- **AND** no error is raised due to missing indicators

## References

- `skills/novel-writing/references/quality-rubric.md` — target file for modifications (section 6)
- `skills/novel-writing/references/style-guide.md` — Layer 4 indicator zone definitions (read-only reference)
- CS-A2 (`m9-anti-ai-methodology-upgrade`) — defines the 7-indicator 3-zone system in style-guide
- CS-A3 (`m9-anti-ai-agent-prompts`) — QualityJudge prompt consumes this scoring table
