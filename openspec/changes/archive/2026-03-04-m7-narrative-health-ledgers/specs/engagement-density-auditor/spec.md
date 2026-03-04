## ADDED Requirements

### Requirement: The system SHALL compute engagement density metrics per chapter
The system SHALL compute engagement density metrics per committed chapter and store them as an append-only JSONL stream (default: `engagement-metrics.jsonl` at project root).

Each JSONL record SHALL include at minimum:
- `chapter` (integer)
- `word_count` (integer)
- `plot_progression_beats` (integer; coarse count)
- `conflict_intensity` (1-5)
- `payoff_score` (1-5)
- `new_info_load_score` (1-5)
- `notes` (short, non-spoiler)

### Requirement: Engagement density scoring MUST follow stable, auditable rubrics
To reduce cross-run / cross-model variance, the system MUST compute the 1–5 scores using either:
- deterministic signals from existing structured artifacts when available, OR
- the rubrics below (with brief evidence recorded in `notes`)

At minimum:
- `word_count` MUST use the same counting method as platform word-count constraints (so the numbers are comparable)
- `plot_progression_beats` SHOULD be derived from the chapter summary’s “key events / beats” list when available (count bullet items; if missing, fall back to a best-effort estimate)

#### Rubric: `conflict_intensity` (1–5)
- **1**: no meaningful opposition; mostly exposition / setup; stakes not engaged
- **2**: mild tension; obstacles exist but low urgency; conflict not escalating
- **3**: active conflict; clear goal vs obstacle; stakes or consequences are explicit
- **4**: high tension; confrontation/escalation dominates; meaningful risk or loss
- **5**: peak-level conflict; decisive turning point or major confrontation (climax/near-climax)

#### Rubric: `payoff_score` (1–5)
- **1**: no payoff; no reveal/reward; mostly deferral
- **2**: small payoff (minor win, small reveal, small emotional beat)
- **3**: clear payoff (meaningful progress, noticeable reveal, or satisfying beat)
- **4**: strong payoff (major reveal, significant victory/defeat, major emotional catharsis)
- **5**: exceptional payoff (chapter-defining twist, resolution of a major thread, high “爽点” density)

#### Rubric: `new_info_load_score` (1–5)
`new_info_load_score` measures **how much** new information is introduced (not whether it is good/bad):
- **1**: almost no new entities/terms/rules; mostly recap or idle progression
- **2**: light new info; incremental additions
- **3**: moderate new info; steady additions without overload
- **4**: heavy new info; many new entities/terms/rules introduced
- **5**: extreme new info; likely overload (reader may struggle without extra grounding)

#### Scenario: Metrics record appended after commit
- **WHEN** chapter C is committed
- **THEN** the system appends one metrics record for chapter C to `engagement-metrics.jsonl`

### Requirement: The system SHALL analyze engagement density over a sliding window and flag low-density stretches
The system SHALL analyze engagement density over a sliding window (default: last 10 chapters) and flag “low-density stretches”, such as:
- consecutive chapters with low `plot_progression_beats`
- low payoff trend (few rewards/reveals)
- conflict plateau (conflict_intensity remains low)

The analysis SHALL produce a structured report under `logs/engagement/`.

#### Scenario: Low-density stretch flagged
- **WHEN** the last 5 chapters have consistently low payoff scores
- **THEN** the report flags a low-density stretch and suggests concrete planning adjustments

### Requirement: Engagement density outputs SHOULD be advisory by default
Engagement density flags SHOULD be warnings/suggestions by default and MUST NOT hard-block commit unless explicitly enabled by configuration.

#### Scenario: Advisory-only by default
- **WHEN** a low-density stretch is detected
- **THEN** the system surfaces it as a warning with suggestions
- **AND** does not require chapter rewrite solely based on this flag

### Requirement: Engagement reports SHALL be regression-friendly and auditable
Reports SHALL:
- include the chapter window analyzed
- include the computed metrics
- provide stable issue identifiers when applicable
- write `logs/engagement/latest.json` and a history report

#### Scenario: latest.json updated and history preserved
- **WHEN** a new engagement analysis completes
- **THEN** `logs/engagement/latest.json` is updated and a history file is written

## References

- `openspec/changes/m7-narrative-health-ledgers/proposal.md`
