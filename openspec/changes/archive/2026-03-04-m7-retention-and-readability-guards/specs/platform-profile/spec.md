## MODIFIED Requirements

### Baseline: M6 defines the platform profile schema
All requirements in `m6-platform-optimization/specs/platform-profile/spec.md` remain the baseline for `platform-profile.json`.
This change extends that schema with retention/readability/naming policies without redefining or duplicating the M6 baseline.

### Requirement: `platform-profile.json` SHALL extend the schema with retention, readability, and naming policies
When present, `platform-profile.json` SHALL support the following additional top-level sections:

- `retention.title_policy` (chapter title presence/pattern policy)
- `retention.hook_ledger` (hook ledger policy: fulfillment window + diversity)
- `readability.mobile` (mobile readability lint policy)
- `naming` (duplicate/near-duplicate/alias collision policy)

All new fields MUST be:
- **backward-compatible** (older profiles that lack these sections MUST still load)
- **null-safe** (missing subsections are treated as disabled/default behavior)

At minimum, these new sections SHALL include:

- `retention.title_policy`:
  - `enabled` (boolean)
  - `min_chars` / `max_chars` (integers)
  - `forbidden_patterns` (string array)
  - `required_patterns` (optional string array)
  - `auto_fix` (boolean)
- `retention.hook_ledger`:
  - `enabled` (boolean)
  - `fulfillment_window_chapters` (integer; N means C+1..C+N)
  - `diversity_window_chapters` (integer)
  - `max_same_type_streak` (integer)
  - `min_distinct_types_in_window` (integer)
  - `overdue_policy` (enum: `warn|soft|hard`)
- `readability.mobile`:
  - `enabled` (boolean)
  - `max_paragraph_chars` (integer)
  - `max_consecutive_exposition_paragraphs` (integer)
  - `blocking_severity` (enum: `hard_only|soft_and_hard`)
- `naming`:
  - `enabled` (boolean)
  - `near_duplicate_threshold` (number)
  - `blocking_conflict_types` (string array; e.g. `duplicate`, `near_duplicate`, `alias_collision`)
  - `exemptions` (optional)

#### Scenario: Extended profile loads on new projects
- **WHEN** the system loads `platform-profile.json` that includes `retention`, `readability.mobile`, and `naming`
- **THEN** it can derive retention/readability/naming policies from those sections
- **AND** it still derives word_count/info_load/compliance/scoring from the M6 baseline fields

#### Scenario: Older profile remains valid
- **WHEN** the system loads an older `platform-profile.json` that lacks `retention`/`readability`/`naming`
- **THEN** the system treats these guardrails as disabled (default non-blocking behavior)
- **AND** does not fail validation solely due to missing new fields

## References

- `openspec/changes/m6-platform-optimization/specs/platform-profile/spec.md`
- `schemas/platform-profile.schema.json`
- `openspec/changes/m7-retention-and-readability-guards/proposal.md`
