## MODIFIED Requirements

### Requirement 1: lint-blacklist.sh SHALL support `narration_only` context

The `lint-blacklist.sh` script SHALL support context-aware enforcement based on the `category_metadata` defined in CS-A1. Categories with `context: "narration_only"` SHALL only be flagged when they appear in narration (non-dialogue) text. Dialogue text is identified by Chinese double quotes.

#### Scenario: Category with `context: "narration_only"` only flagged in non-dialogue text
- **GIVEN** a blacklist category has `context: "narration_only"` in `category_metadata`
- **AND** the chapter text contains a word from that category in narration text
- **WHEN** `lint-blacklist.sh` runs
- **THEN** the word is flagged as a hit
- **AND** the hit count includes this occurrence

#### Scenario: Dialogue detection via Chinese double quotes
- **GIVEN** a chapter text contains Chinese double quotes ("\u201c" and "\u201d")
- **WHEN** `lint-blacklist.sh` parses the text
- **THEN** text enclosed within matching top-level "\u201c\u201d" pairs is classified as dialogue
- **AND** text outside those pairs is classified as narration

#### Scenario: Text inside top-level quotes is dialogue and skips narration_only words
- **GIVEN** a `narration_only` category word appears inside top-level Chinese double quotes
- **WHEN** `lint-blacklist.sh` runs
- **THEN** the word is NOT flagged
- **AND** the hit count does NOT include this occurrence
- **AND** the same word appearing outside quotes in the same chapter IS flagged

#### Scenario: Categories without context field flag everywhere (default behavior)
- **GIVEN** a blacklist category does NOT have a `context` field in `category_metadata`
- **AND** a word from that category appears in either dialogue or narration text
- **WHEN** `lint-blacklist.sh` runs
- **THEN** the word is flagged regardless of whether it appears in dialogue or narration
- **AND** behavior is identical to pre-upgrade lint behavior

---

### Requirement 2: lint-blacklist.sh SHALL include Chinese quote parity check

The `lint-blacklist.sh` script SHALL check that Chinese double quotes ("\u201c" and "\u201d") appear in matching pairs. An odd total count indicates a potential unclosed quote, which is reported as a non-blocking warning.

#### Scenario: Odd number of Chinese double quotes triggers warning
- **GIVEN** a chapter text contains an odd total number of Chinese double quote characters ("\u201c" + "\u201d" combined)
- **WHEN** `lint-blacklist.sh` runs
- **THEN** a warning message is emitted indicating quote parity mismatch
- **AND** the warning includes the total count of quote characters found
- **AND** the script exit code is NOT affected (warning is non-blocking)
- **AND** all other lint checks still execute normally

#### Scenario: Even number of Chinese double quotes produces no warning
- **GIVEN** a chapter text contains an even total number of Chinese double quote characters
- **WHEN** `lint-blacklist.sh` runs
- **THEN** no quote parity warning is emitted
- **AND** all other lint checks execute normally

## References

- `scripts/lint-blacklist.sh` — target file for modifications
- `templates/ai-blacklist.json` — `category_metadata` with `context: "narration_only"` (read-only reference)
- CS-A1 (`m9-anti-ai-statistical-templates`) — defines `category_metadata` structure
