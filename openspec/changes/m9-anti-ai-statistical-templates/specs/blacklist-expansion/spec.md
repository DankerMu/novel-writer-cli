## ADDED Requirements

### Requirement 1: ai-blacklist.json SHALL support context-aware categories

A new `category_metadata` object SHALL be added to `ai-blacklist.json` at root level, mapping category names to their metadata. The `narration_connector` category SHALL have `context: "narration_only"` metadata, indicating its entries are forbidden in narration paragraphs only and allowed in dialogue.

Entries in `narration_connector` SHALL NOT be added to the flat `words` array (to avoid global enforcement before context-aware lint is implemented in CS-A4). They exist only in `categories.narration_connector`.

#### Scenario: narration_connector category entries forbidden in narration paragraphs only
- **GIVEN** `ai-blacklist.json` has a `narration_connector` category with entries like "然而", "不过", "显然"
- **AND** `category_metadata.narration_connector.context` is `"narration_only"`
- **WHEN** a lint tool processes a narration paragraph containing "然而"
- **THEN** the word is flagged as a blacklist violation

#### Scenario: narration_connector words in dialogue paragraphs are NOT flagged
- **GIVEN** `ai-blacklist.json` has a `narration_connector` category with `context: "narration_only"`
- **WHEN** a lint tool processes a dialogue paragraph containing "然而"
- **THEN** the word is NOT flagged
- **AND** no penalty is applied

#### Scenario: category_metadata structure
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** a consumer reads `category_metadata`
- **THEN** `category_metadata.narration_connector` exists
- **AND** it contains `{ "context": "narration_only", "description": "仅叙述文禁止，对话中允许" }`
- **AND** categories without special metadata (e.g., `emotion_cliche`) have no entry in `category_metadata` (absence = global enforcement)

---

### Requirement 2: ai-blacklist.json SHALL expand to approximately 80 entries across 10 categories

3 new categories SHALL be added:

| Category | Description | Approximate Count |
|----------|-------------|------------------|
| `narration_connector` | Connectors forbidden in narration only (allowed in dialogue) | ~9 |
| `paragraph_opener` | AI stereotypical paragraph opening phrases | ~6 |
| `smooth_transition` | Overly polished transition phrases | ~5 |

Existing categories SHALL be expanded:

| Category | Current Count | Added | New Count |
|----------|--------------|-------|-----------|
| `emotion_cliche` | 10 | +6 | 16 |
| `expression_cliche` | 8 | +4 | 12 |
| `action_cliche` | 5 | +3 | 8 |

Total entry count (in the flat `words` array, excluding `narration_connector`-only entries) SHALL be between 75-85.

#### Scenario: 3 new categories added
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** a consumer reads `categories`
- **THEN** `categories.narration_connector` exists with approximately 9 entries
- **AND** `categories.paragraph_opener` exists with approximately 6 entries
- **AND** `categories.smooth_transition` exists with approximately 5 entries

#### Scenario: Existing categories expanded
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** a consumer reads `categories.emotion_cliche`
- **THEN** the category contains 16 entries (original 10 + 6 new)
- **AND** `categories.expression_cliche` contains 12 entries (original 8 + 4 new)
- **AND** `categories.action_cliche` contains 8 entries (original 5 + 3 new)

#### Scenario: Total entry count validation
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** the flat `words` array length is counted
- **THEN** the count is between 75 and 85
- **AND** all entries in `words` are unique (no duplicates)

---

### Requirement 3: ai-blacklist.json SHALL include a `max_words` growth cap

A `max_words` integer field SHALL be added at root level, set to `120`. This represents the maximum allowed size of the flat `words` array. Adding entries beyond this limit requires explicit human approval.

#### Scenario: max_words field present and set
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** a consumer reads `max_words`
- **THEN** the value is `120`
- **AND** the field is a root-level integer

#### Scenario: Current count is within max_words limit
- **GIVEN** `ai-blacklist.json` has `max_words: 120`
- **AND** the flat `words` array has approximately 80 entries
- **WHEN** a maintenance check compares `words.length` against `max_words`
- **THEN** the check passes (80 < 120)

#### Scenario: Adding entries beyond max_words requires approval
- **GIVEN** `ai-blacklist.json` has `max_words: 120`
- **AND** the flat `words` array has 120 entries
- **WHEN** an operator attempts to add a new entry
- **THEN** the addition is blocked or flagged for human approval
- **AND** the operator must either increase `max_words` (with justification) or remove existing entries

## References

- `templates/ai-blacklist.json` — target file for modifications
- `skills/novel-writing/references/style-guide.md` — anti-AI strategy documentation
- `agents/style-refiner.md` — StyleRefiner Agent (consumes blacklist)
- `agents/chapter-writer.md` — ChapterWriter Agent (avoids blacklisted words)
