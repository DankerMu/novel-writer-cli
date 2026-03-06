## ADDED Requirements

### Requirement 1: ai-blacklist.json SHALL support context-aware categories

A new `category_metadata` object SHALL be added to `ai-blacklist.json` at root level, mapping category names to their metadata. The `narration_connector` category SHALL have `context: "narration_only"` metadata, indicating its entries are forbidden in narration paragraphs only and allowed in dialogue.

Entries in `narration_connector` SHALL NOT be added to the flat `words` array (to avoid global enforcement before context-aware lint is implemented in CS-A4). They exist only in `categories.narration_connector`.

#### Scenario: narration_connector category entries forbidden in narration paragraphs only
- **GIVEN** `ai-blacklist.json` has a `narration_connector` category with entries like "然而", "不过", "因此"
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
- **AND** it contains `{ "context": "narration_only", "description": "仅叙述文禁止，对话中允许；本类词条不进入 words 扁平列表" }`
- **AND** categories without special metadata (e.g., `emotion_cliche`) have no entry in `category_metadata` (absence = global enforcement)

---

### Requirement 2: ai-blacklist.json SHALL expand to 190+ flat entries with per-entry metadata

The flat `words` array SHALL contain at least **190** unique entries and SHALL NOT exceed `max_words`, excluding any `narration_connector`-only entries.

All entries in `categories.*` SHALL be objects supporting:
- `word` (string, required)
- `replacement_hint` (string, required)
- `per_chapter_max` (int, optional; positive when present)

The following "anti-ai-polish 10 categories" SHALL be represented in `categories`:
- `summary_word`
- `enumeration_template`
- `academic_tone`
- `narration_connector` (context-aware; excluded from `words`)
- `emotion_cliche`
- `action_cliche`
- `environment_cliche`
- `narrative_filler`
- `abstract_filler` (supports genre override notes)
- `mechanical_opening`

Additional categories MAY be present (e.g., `paragraph_opener`, `smooth_transition`, `expression_cliche`) as long as:
- They follow the same entry schema (`word` + `replacement_hint`, optional `per_chapter_max`).
- Their entries are included in `words` unless category metadata indicates otherwise.

#### Scenario: Total entry count validation
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** the flat `words` array length is counted
- **THEN** the count is at least 190
- **AND** the count does not exceed `max_words`
- **AND** all entries in `words` are unique (no duplicates)

---

### Requirement 3: ai-blacklist.json SHALL include a `max_words` growth cap

A `max_words` integer field SHALL be added at root level, set to `250`. This represents the maximum allowed size of the flat `words` array. Adding entries beyond this limit requires explicit human approval.

#### Scenario: max_words field present and set
- **GIVEN** `ai-blacklist.json` is loaded
- **WHEN** a consumer reads `max_words`
- **THEN** the value is `250`
- **AND** the field is a root-level integer

#### Scenario: Current count is within max_words limit
- **GIVEN** `ai-blacklist.json` has `max_words: 250`
- **AND** the flat `words` array has at least 190 entries
- **WHEN** a maintenance check compares `words.length` against `max_words`
- **THEN** the check passes (count < 250)

#### Scenario: Adding entries beyond max_words requires approval
- **GIVEN** `ai-blacklist.json` has `max_words: 250`
- **AND** the flat `words` array has 250 entries
- **WHEN** an operator attempts to add a new entry
- **THEN** the addition is blocked or flagged for human approval
- **AND** the operator must either increase `max_words` (with justification) or remove existing entries

## References

- `templates/ai-blacklist.json` — target file for modifications
- `skills/novel-writing/references/style-guide.md` — anti-AI strategy documentation
- `agents/style-refiner.md` — StyleRefiner Agent (consumes blacklist)
- `agents/chapter-writer.md` — ChapterWriter Agent (avoids blacklisted words)
