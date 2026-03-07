## ADDED Requirements

### Requirement 1: Quick Start workflow SHALL include Step F0 between Step E and Step F

Quick Start workflow SHALL insert a Step F0 (mini volume planning) between Step E (style extraction) and Step F (trial writing). The checkpoint resume mapping SHALL route accordingly.

#### Scenario: After Step E completes, system proceeds to Step F0
- **WHEN** Step E (style extraction) completes successfully
- **THEN** the system proceeds to Step F0 (mini volume planning)
- **AND** does NOT proceed directly to Step F

#### Scenario: Step F0 completes, system proceeds to Step F
- **WHEN** Step F0 completes successfully and all outputs are validated
- **THEN** the system proceeds to Step F (trial writing)

#### Scenario: Checkpoint resume with quickstart_phase="style" enters F0
- **WHEN** a project resumes with checkpoint `quickstart_phase="style"`
- **THEN** the system enters Step F0 (not Step F)

#### Scenario: Checkpoint resume with quickstart_phase="f0" enters F
- **WHEN** a project resumes with checkpoint `quickstart_phase="f0"`
- **THEN** the system enters Step F

---

### Requirement 2: Step F0 SHALL dispatch PlotArchitect in mini-planning mode

Step F0 SHALL dispatch PlotArchitect with `volume=1, chapter_range=[1,3]` to generate a compact 3-chapter plan. PlotArchitect SHALL produce a complete set of planning artifacts scoped to 3 chapters.

#### Scenario: PlotArchitect receives mini-planning parameters
- **WHEN** Step F0 dispatches PlotArchitect
- **THEN** PlotArchitect receives `volume=1` and `chapter_range=[1,3]`
- **AND** PlotArchitect operates in mini-planning mode (compact output, 3 chapters only)

#### Scenario: PlotArchitect produces outline.md with 3 chapters
- **WHEN** PlotArchitect completes mini-planning
- **THEN** `staging/volumes/vol-01/outline.md` contains exactly 3 chapter entries
- **AND** each chapter entry follows the standard outline format (including ExcitementType line per CS2)

#### Scenario: PlotArchitect produces 3 L3 chapter contracts
- **WHEN** PlotArchitect completes mini-planning
- **THEN** `staging/volumes/vol-01/chapter-contracts/` contains 3 L3 contracts (chapter-001, chapter-002, chapter-003)
- **AND** each contract follows the full L3 schema (including `excitement_type` field per CS2)

#### Scenario: PlotArchitect produces storyline-schedule.json, foreshadowing.json, and new-characters.json
- **WHEN** PlotArchitect completes mini-planning
- **THEN** `staging/volumes/vol-01/storyline-schedule.json` is generated with schedule entries for chapters 1-3
- **AND** `staging/volumes/vol-01/foreshadowing.json` is generated with 1-3 seed foreshadows
- **AND** `staging/volumes/vol-01/new-characters.json` is generated (empty array allowed)

#### Scenario: genre_excitement_map template exists
- **WHEN** PlotArchitect runs mini-planning
- **AND** a genre_excitement_map template is available in the project
- **THEN** PlotArchitect assigns `excitement_type` per genre mapping recommendations

#### Scenario: genre_excitement_map template missing
- **WHEN** PlotArchitect runs mini-planning
- **AND** no genre_excitement_map template is available
- **THEN** PlotArchitect assigns `excitement_type` freely based on narrative needs
- **AND** mini-planning completes successfully without error

---

### Requirement 3: Step F0 outputs SHALL stage under `staging/volumes/vol-01/` before commit

Step F0 SHALL first write outline, storyline-schedule, foreshadowing, new-characters, and chapter contracts to `staging/volumes/vol-01/`. After validation succeeds, advancing F0 SHALL commit those artifacts into `volumes/vol-01/`.

#### Scenario: staging vol-01 directory created if not exists
- **WHEN** Step F0 begins execution
- **AND** `staging/volumes/vol-01/` does not exist
- **THEN** the staging directory is created along with necessary subdirectories (`chapter-contracts/`)

#### Scenario: validated staging outputs commit into vol-01
- **WHEN** Step F0 completes and passes validation
- **THEN** `staging/volumes/vol-01/chapter-contracts/chapter-001.json`, `chapter-002.json`, `chapter-003.json` are committed into `volumes/vol-01/chapter-contracts/`
- **AND** `staging/volumes/vol-01/new-characters.json` is committed into `volumes/vol-01/new-characters.json`

#### Scenario: Checkpoint updated to quickstart_phase="f0"
- **WHEN** Step F0 completes and all outputs pass validation
- **THEN** the project checkpoint is updated to `quickstart_phase="f0"`
- **AND** the staging commit includes outline, schedule, foreshadowing, new-characters, and chapter contracts for chapters 1-3

---

### Requirement 4: Step F SHALL use vol-01 L3 contracts when available

Step F (trial writing) SHALL read L3 contracts, outline, and foreshadowing from `vol-01/` when they exist. ChapterWriter SHALL follow L3 contracts and QualityJudge SHALL perform full L3 compliance checks.

#### Scenario: L3 contracts exist — ChapterWriter follows them
- **WHEN** Step F begins trial writing
- **AND** L3 contracts exist in `volumes/vol-01/chapter-contracts/`
- **THEN** ChapterWriter receives the L3 contract for each chapter being written
- **AND** ChapterWriter follows contract preconditions, postconditions, and plot_points

#### Scenario: L3 contracts exist — QualityJudge performs full L3 check
- **WHEN** Step F evaluates a trial chapter
- **AND** an L3 contract exists for that chapter
- **THEN** QualityJudge performs full Track 1 L3 compliance check (not just L1/L2 + 8 dimensions)
- **AND** contract violations are reported in the eval output

#### Scenario: L3 contracts missing (legacy) — fallback to free writing mode
- **WHEN** Step F begins trial writing
- **AND** no L3 contracts exist in `volumes/vol-01/chapter-contracts/`
- **THEN** ChapterWriter operates in free writing mode (no contract constraints)
- **AND** QualityJudge skips Track 1 L3 compliance check (existing behavior preserved)

---

### Requirement 5: Formal volume planning SHALL merge with existing F0 outputs

When PlotArchitect performs formal volume planning on vol-01 and Ch1-3 contracts from F0 already exist, the planner SHALL build on existing artifacts rather than overwriting them.

#### Scenario: vol-01 has Ch1-3 contracts from F0 — chapter_range starts from 4
- **WHEN** PlotArchitect performs formal volume planning for vol-01
- **AND** L3 contracts for chapters 1-3 already exist (from Step F0)
- **THEN** PlotArchitect sets `chapter_range` starting from 4
- **AND** generates contracts for Ch4 onward only

#### Scenario: Outline appends to existing 3-chapter outline
- **WHEN** PlotArchitect performs formal volume planning for vol-01
- **AND** `outline.md` already contains 3 chapter entries (from Step F0)
- **THEN** new chapter entries are appended after the existing 3 chapters
- **AND** existing chapter 1-3 entries are NOT modified

#### Scenario: Existing Ch1-3 contracts are NOT overwritten
- **WHEN** PlotArchitect performs formal volume planning for vol-01
- **AND** contracts `chapter-001.json`, `chapter-002.json`, `chapter-003.json` already exist
- **THEN** those contracts are treated as read-only
- **AND** no modifications are made to Ch1-3 contracts

#### Scenario: Formal planning incrementally merges schedule, foreshadowing, and new characters
- **WHEN** formal volume planning for vol-01 commits after F0 seed exists
- **THEN** `storyline-schedule.json` preserves existing seed entries and appends new active lines / events without duplicating identical entries
- **AND** `foreshadowing.json` merges by `id`, preserving existing seed items and extending `history` when the same id reappears
- **AND** `new-characters.json` merges by `name + first_chapter`, preserving seed-side declarations while appending genuinely new characters

#### Scenario: Partial merge can be resumed safely
- **WHEN** formal volume planning commit is interrupted after some non-seed artifacts already landed in `volumes/vol-01/`
- **AND** staging artifacts are still present
- **THEN** rerunning commit resumes the merge instead of overwriting F0 seed artifacts
- **AND** conflicting outline blocks or chapter contracts still fail closed with an explicit error

---

## References

- `openspec/changes/m8-golden-chapter-mini-planning/proposal.md`
- `openspec/changes/m8-golden-chapter-mini-planning/design.md`
- `openspec/changes/m8-excitement-type-annotation/` — CS2: L3 contracts include `excitement_type` field (dependency)
- `skills/start/SKILL.md` — Quick Start workflow definition
- `agents/plot-architect.md` — PlotArchitect agent definition
- `agents/chapter-writer.md` — ChapterWriter agent definition
- `agents/quality-judge.md` — QualityJudge agent definition
- `skills/start/references/vol-planning.md` — Volume planning reference
