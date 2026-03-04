## ADDED Requirements

### Requirement 1: `style-profile-template.json` SHALL include 5 new nullable statistical fields

The following fields SHALL be added to `style-profile-template.json` after `sentence_length_range`, each with a corresponding `_*_comment` annotation:

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `sentence_length_std_dev` | `number \| null` | `null` | Sentence length standard deviation (in characters) |
| `paragraph_length_cv` | `number \| null` | `null` | Paragraph length coefficient of variation |
| `emotional_volatility` | `"high" \| "medium" \| "low" \| null` | `null` | Emotional volatility across paragraphs |
| `register_mixing` | `"high" \| "medium" \| "low" \| null` | `null` | Degree of register mixing (formal/informal/dialect) |
| `vocabulary_richness` | `"high" \| "medium" \| "low" \| null` | `null` | Vocabulary diversity and hapax legomena ratio |

All fields nullable. StyleAnalyzer populates them; ChapterWriter and StyleRefiner consume them.

#### Scenario: New project initializes with null statistical fields
- **GIVEN** a new project is created using `style-profile-template.json`
- **WHEN** the template is loaded
- **THEN** all 5 statistical fields are present with `null` values
- **AND** the template is valid JSON and parseable without error

#### Scenario: StyleAnalyzer extracts statistics from sample text
- **GIVEN** StyleAnalyzer analyzes a sample text
- **WHEN** it populates the style profile
- **THEN** `sentence_length_std_dev` is set to a numeric value (e.g., 12.5)
- **AND** `paragraph_length_cv` is set to a numeric value (e.g., 0.7)
- **AND** `emotional_volatility` is set to one of `"high"`, `"medium"`, or `"low"`
- **AND** `register_mixing` is set to one of `"high"`, `"medium"`, or `"low"`
- **AND** `vocabulary_richness` is set to one of `"high"`, `"medium"`, or `"low"`

#### Scenario: Old project loads template without new fields (backward compatibility)
- **GIVEN** an existing project's `style-profile.json` was created before this change
- **WHEN** any consumer reads the profile and encounters missing statistical fields
- **THEN** the missing fields are treated as `null`
- **AND** no migration or file modification is required
- **AND** downstream behavior is identical to pre-change behavior

#### Scenario: Downstream agent receives populated statistical fields
- **GIVEN** `sentence_length_std_dev` is populated with value 14.2
- **WHEN** ChapterWriter assembles writing constraints
- **THEN** ChapterWriter uses 14.2 as the target standard deviation for sentence length variation
- **AND** generated text aims for sentence length variance consistent with the profiled value

#### Scenario: Downstream agent receives null statistical fields
- **GIVEN** `sentence_length_std_dev` is `null`
- **WHEN** ChapterWriter assembles writing constraints
- **THEN** ChapterWriter uses human-writing default range (std dev 8-18) as fallback
- **AND** no error is raised

---

### Requirement 2: Statistical fields SHALL have documented human vs AI ranges

Each numeric statistical field SHALL include a `_*_comment` annotation documenting the human writing range and AI signature threshold:

| Field | Human Range | AI Signature |
|-------|------------|-------------|
| `sentence_length_std_dev` | 8-18 | < 6 (overly uniform) |
| `paragraph_length_cv` | 0.4-1.2 | < 0.3 (overly uniform) |

Enumerated fields (`emotional_volatility`, `register_mixing`, `vocabulary_richness`) use `high | medium | low` qualitative assessment. AI-generated text typically scores `low` on all three.

#### Scenario: Comment annotation for sentence_length_std_dev
- **GIVEN** `sentence_length_std_dev` field exists in the template
- **WHEN** a developer reads the template
- **THEN** the `_sentence_length_std_dev_comment` documents: human range 8-18, AI signature < 6

#### Scenario: Comment annotation for paragraph_length_cv
- **GIVEN** `paragraph_length_cv` field exists in the template
- **WHEN** a developer reads the template
- **THEN** the `_paragraph_length_cv_comment` documents: human range 0.4-1.2, AI signature < 0.3

#### Scenario: Comment annotation for enumerated fields
- **GIVEN** `emotional_volatility`, `register_mixing`, and `vocabulary_richness` exist in the template
- **WHEN** a developer reads the template
- **THEN** each `_*_comment` documents the enum values (`high | medium | low`) and their semantic meaning
- **AND** notes that AI-generated text typically scores `low` on these dimensions

## References

- `templates/style-profile-template.json` — target file for modifications
- `agents/style-analyzer.md` — StyleAnalyzer Agent (populates statistical fields)
- `agents/chapter-writer.md` — ChapterWriter Agent (consumes statistical fields)
- `agents/style-refiner.md` — StyleRefiner Agent (consumes statistical fields)
