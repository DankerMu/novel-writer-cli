## MODIFIED Requirements

### Requirement 1: ChapterWriter SHALL NOT use fixed quotas for anti-AI constraints

All anti-AI constraints in ChapterWriter (C10–C18) SHALL express behavioral expectations without fixed numeric quotas. Phrases like "2-3 times", "≥1 per chapter", or any specific count requirement SHALL be replaced with natural-distribution language.

#### Scenario: C11 speech patterns de-quota
- **GIVEN** ChapterWriter constraint C11 (character speech patterns)
- **WHEN** the constraint is read by the model
- **THEN** C11 uses language like "recurring but irregular" or "naturally varying frequency"
- **AND** C11 does NOT contain any fixed numeric frequency (e.g., no "2-3", no "每章N次")

#### Scenario: C12 anti-intuitive details de-quota
- **GIVEN** ChapterWriter constraint C12 (anti-intuitive details)
- **WHEN** the constraint is read by the model
- **THEN** C12 uses language like "naturally occurring when context permits"
- **AND** C12 does NOT contain any minimum count requirement (e.g., no "≥1", no "至少")

#### Scenario: Zero fixed-count patterns in entire anti-AI constraint block
- **GIVEN** the full text of `agents/chapter-writer.md`
- **WHEN** searched for fixed-count patterns in anti-AI constraints (C10–C18)
- **THEN** zero matches for patterns like `≥\d`, `\d-\d 次`, `每章.*\d`, `至少.*\d`

---

### Requirement 2: ChapterWriter SHALL enforce sentence length variance from style-profile

ChapterWriter SHALL include a new constraint C16 that enforces sentence length variance. The constraint references the `sentence_length_std_dev` field from the project's style-profile.

#### Scenario: style-profile provides sentence_length_std_dev
- **GIVEN** the project style-profile contains `sentence_length_std_dev` (e.g., 12)
- **WHEN** ChapterWriter generates text
- **THEN** ChapterWriter aims for sentence length standard deviation ≥ the style-profile value (with reasonable tolerance)
- **AND** the constraint is documented as C16 in `agents/chapter-writer.md`

#### Scenario: style-profile field is null or absent
- **GIVEN** the project style-profile does NOT contain `sentence_length_std_dev`
- **WHEN** ChapterWriter generates text
- **THEN** ChapterWriter uses a default human-prose range (std_dev 8–18) as the target

#### Scenario: 3+ consecutive sentences within ±5 chars of each other
- **GIVEN** ChapterWriter is generating or self-checking text
- **WHEN** 3 or more consecutive sentences have lengths within ±5 characters of each other
- **THEN** ChapterWriter breaks the pattern by varying at least one sentence's length
- **AND** this check is explicit in C16

---

### Requirement 3: ChapterWriter SHALL enforce zero narration_connector words in narration

ChapterWriter SHALL include a new constraint C17 that completely forbids `narration_connector` category words in narration paragraphs. These words are allowed in dialogue (within Chinese quotation marks).

#### Scenario: narration_connector word in narration paragraph
- **GIVEN** a narration paragraph (non-dialogue text)
- **WHEN** the paragraph contains a word from the `narration_connector` category (e.g., "然而", "此外", "与此同时")
- **THEN** the word is flagged as a violation of C17
- **AND** ChapterWriter must replace or remove it

#### Scenario: narration_connector word in dialogue
- **GIVEN** a dialogue segment (text within Chinese quotation marks 「」 or "")
- **WHEN** the dialogue contains a word from the `narration_connector` category
- **THEN** the word is allowed (characters may speak with connectors)
- **AND** C17 does NOT flag it as a violation

#### Scenario: Phase 2 step 6.5 narration connector sweep
- **GIVEN** ChapterWriter is in Phase 2 self-check
- **WHEN** step 6.5 executes
- **THEN** all narration paragraphs are scanned for `narration_connector` words
- **AND** every detected instance in non-dialogue text is replaced with a context-appropriate alternative or removed

---

### Requirement 4: ChapterWriter SHALL randomly sample humanization techniques

ChapterWriter SHALL include a new constraint C18 that requires drawing from the humanization technique toolbox (style-guide §2.9) each chapter. The selection must vary across chapters with no fixed count.

#### Scenario: Techniques drawn from 12-technique toolbox
- **GIVEN** ChapterWriter is generating a new chapter
- **WHEN** C18 is applied
- **THEN** ChapterWriter selects a subset of techniques from the §2.9 toolbox
- **AND** applies them naturally throughout the chapter

#### Scenario: Technique selection varies between chapters
- **GIVEN** two consecutive chapters are generated
- **WHEN** C18 is applied to each
- **THEN** the technique subsets are NOT identical (no fixed pattern)
- **AND** variation occurs naturally based on chapter content and context

#### Scenario: No minimum or maximum count per chapter
- **GIVEN** C18 in `agents/chapter-writer.md`
- **WHEN** the constraint text is read
- **THEN** it does NOT specify a minimum or maximum number of techniques per chapter
- **AND** it uses language like "vary naturally" or "context-driven selection"

---

### Requirement 5: ChapterWriter Phase 2 SHALL include modifier deduplication step

ChapterWriter Phase 2 SHALL include step 6.6 that detects and diversifies repeated modifiers (synonymous adjectives/adverbs) within a 500-character sliding window.

#### Scenario: Repeated modifier detected within 500-char window
- **GIVEN** ChapterWriter is in Phase 2 step 6.6
- **WHEN** the same modifier or a close synonym appears 2+ times within a 500-character window
- **THEN** the repeated instance is replaced with a diverse alternative

#### Scenario: Step 6.6 placement in Phase 2
- **GIVEN** ChapterWriter Phase 2 step sequence
- **WHEN** step 6.6 is positioned
- **THEN** it appears after step 6.5 (narration connector sweep) and before step 7

## References

- `agents/chapter-writer.md` — ChapterWriter Agent prompt (constraints C10–C15 + Phase 2 workflow)
- CS-A2 `m9-anti-ai-methodology-upgrade` — style-guide methodology (zero-quota principle, §2.9 toolbox)
- `templates/style-profile-template.json` — style-profile schema (sentence_length_std_dev field)
- `templates/ai-blacklist.json` — narration_connector category definition
