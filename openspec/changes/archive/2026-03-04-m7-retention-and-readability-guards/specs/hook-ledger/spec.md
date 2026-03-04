## ADDED Requirements

### Requirement: The system SHALL maintain a persistent hook ledger
The system SHALL maintain a persistent hook ledger at the project root (default: `hook-ledger.json`) as the source of truth for chapter-end hook “promises”.

Each ledger entry SHALL include at minimum:
- `id` (stable identifier)
- `chapter` (integer)
- `hook_type` (string, bounded set)
- `hook_strength` (1-5)
- `promise_text` (short, non-spoiler)
- `status` in {`open`, `fulfilled`, `lapsed`}
- `fulfillment_window` (chapter range, inclusive)
- `fulfilled_chapter` (integer | null)
- `created_at` (ISO-8601)
- `updated_at` (ISO-8601)

#### Scenario: Ledger entry created on commit
- **WHEN** a chapter is committed under a hook-enabled platform profile
- **THEN** the system appends or updates an entry in `hook-ledger.json` for that chapter’s hook

### Requirement: Hook ledger scope MUST be limited to chapter-end retention hooks
The hook ledger MUST track **chapter-end** retention hooks only (page-turner promises meant to pull the reader into the next chapter(s)).

The hook ledger MUST NOT be used as the source of truth for:
- long-horizon narrative promises (use `promise-ledger.json`)
- clue-level foreshadowing items and their touch history (use `foreshadowing/global.json`)

Hook ledger entries MAY optionally include cross-references to broader narrative tracking, such as:
- `links.promise_ids[]` (promise ledger ids) when a chapter-end hook is an instance of a broader promise
- `links.foreshadowing_ids[]` (foreshadowing item ids) when the hook uses a specific existing clue

#### Scenario: Hook hook links to a long-horizon promise
- **WHEN** a chapter-end hook is “Will the heroine discover the real identity?”
- **THEN** the hook ledger can include `links.promise_ids=["core_mystery_identity"]`
- **AND** the hook ledger still remains the authoritative record for the chapter-end hook’s fulfillment window

### Requirement: Hook ledger entries MUST be derived from chapter-end evidence
The system MUST derive hook ledger fields from chapter-end evidence and evaluation signals, including at minimum:
- a short evidence snippet from the last section of the chapter
- the evaluated `hook_type` and `hook_strength`

#### Scenario: Ledger entry includes end-of-chapter evidence
- **WHEN** the system records a hook ledger entry for chapter C
- **THEN** it can provide (directly or via referenced evaluation/log output) a short end-of-chapter evidence snippet supporting the hook classification

### Requirement: The system SHALL enforce a fulfillment window and detect hook debt
When `platform-profile.json.retention.hook_ledger` is enabled, the system SHALL:
- assign a `fulfillment_window` for each `open` hook promise (e.g., C+1..C+N)
- detect “hook debt” when an `open` promise exceeds its window without fulfillment

Hook debt SHOULD produce at least a warning, and MAY produce a hard violation if configured by platform profile.

#### Scenario: Hook debt flagged when overdue
- **WHEN** a hook promise from chapter 20 has `fulfillment_window=[21,24]`
- **AND** chapter 25 is committed without fulfilling the promise
- **THEN** the system marks the promise as `lapsed` (or flags it as overdue)
- **AND** emits a retention warning (or violation per profile)

### Requirement: The system SHALL enforce hook type diversity within a rolling window
When enabled by `platform-profile.json.retention.hook_ledger`, the system SHALL compute hook type diversity over a rolling window (e.g., last 5 chapters) and flag:
- repeated same-type streaks beyond `max_same_type_streak`
- low diversity below `min_distinct_types_in_window`

#### Scenario: Repeated hook type streak flagged
- **WHEN** three consecutive chapters end with the same `hook_type`
- **AND** profile sets `max_same_type_streak=2`
- **THEN** the system emits a diversity warning (or violation per profile)

### Requirement: The system SHALL produce periodic retention reports
The system SHALL generate retention reports under `logs/retention/` including:
- open promises
- overdue/lapsed promises
- diversity statistics over the recent window

It SHALL update `logs/retention/latest.json` and write a history report for traceability.

#### Scenario: Retention report written every 10 chapters
- **WHEN** the user commits chapter C where `C % 10 == 0`
- **THEN** the system writes `logs/retention/latest.json` and a history report summarizing hook ledger status for the last window

## References

- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
- `openspec/changes/m6-platform-optimization/specs/chapter-hook-system/spec.md`
- `openspec/changes/m7-narrative-health-ledgers/specs/promise-ledger/spec.md`
- `openspec/changes/m6-platform-optimization/specs/foreshadow-visibility/spec.md`
