## MODIFIED Requirements

### Requirement 1: labeled-chapter.schema.json SHALL support optional `anti_ai_statistical_profile`

The `labeled-chapter.schema.json` SHALL be extended with an optional `anti_ai_statistical_profile` object. This object captures statistical characteristics of labeled chapter text, enabling regression tests to measure anti-AI effectiveness across iterations.

The object definition:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `sentence_length_std_dev` | `number` | Yes (within object) | Sentence length standard deviation in characters |
| `paragraph_length_cv` | `number` | Yes (within object) | Paragraph length coefficient of variation |
| `vocabulary_richness_estimate` | `enum: "high" \| "medium" \| "low"` | Yes (within object) | Qualitative vocabulary richness assessment |

The `anti_ai_statistical_profile` object itself is optional at the top level of the labeled chapter record.

#### Scenario: Schema defines optional object with required inner fields
- **GIVEN** the updated `labeled-chapter.schema.json`
- **WHEN** a validator reads the schema definition
- **THEN** `anti_ai_statistical_profile` is defined as an optional property (not in `required` array)
- **AND** when present, the object requires all 3 inner fields:
  - `sentence_length_std_dev` (type: number)
  - `paragraph_length_cv` (type: number)
  - `vocabulary_richness_estimate` (type: string, enum: `["high", "medium", "low"]`)
- **AND** `additionalProperties` is false within the sub-object

#### Scenario: Existing labeled data without the field remains valid (backward compat)
- **GIVEN** an existing labeled chapter JSONL record created before this change
- **AND** the record does not contain an `anti_ai_statistical_profile` field
- **WHEN** the record is validated against the updated schema
- **THEN** validation passes
- **AND** no migration or data modification is required

#### Scenario: New labeled data can include the field for regression comparison
- **GIVEN** a new labeled chapter record includes `anti_ai_statistical_profile`
- **AND** the object contains `sentence_length_std_dev: 14.2`, `paragraph_length_cv: 0.8`, `vocabulary_richness_estimate: "high"`
- **WHEN** the record is validated against the updated schema
- **THEN** validation passes
- **AND** regression test scripts can read and compare the statistical profile across runs

## References

- `eval/schema/labeled-chapter.schema.json` — target file for modifications
- `eval/datasets/` — existing labeled data (must remain valid after schema change)
- CS-A1 (`m9-anti-ai-statistical-templates`) — defines the statistical field names and types
