## 1. PlotArchitect Mini-Planning Mode

- [x] 1.1 Add mini-planning mode to `agents/plot-architect.md` Edge Cases section: when `chapter_range=[1,3]`, produce compact 3-chapter outline + full L3 contracts + storyline-schedule + foreshadowing + new-characters
- [x] 1.2 Define mini-mode output schema: `outline.md` (3 chapters, standard format with ExcitementType line), 3 L3 contracts (full schema), `storyline-schedule.json` (3 entries), `foreshadowing.json` (1-3 seed foreshadows)
- [x] 1.3 Add genre_excitement_map optional injection: if template exists, assign `excitement_type` per genre mapping; if missing, PlotArchitect assigns freely

## 2. Step F0 Implementation

- [x] 2.1 Insert Step F0 section in `skills/start/SKILL.md` between Step E and Step F, with sub-steps: dispatch PlotArchitect mini-planning to staging/vol-01, validate outputs, commit staging into volumes/vol-01
- [x] 2.2 Define Step F0 dispatch parameters: `volume=1`, `chapter_range=[1,3]`, inject L1 rules + L2 contracts + style-profile + brief context
- [x] 2.3 Define Step F0 validation: check presence of outline.md, 3 L3 contracts, storyline-schedule.json, foreshadowing.json, new-characters.json; validate L3 contract schema
- [x] 2.4 Use checkpoint `quickstart_phase` for resume mapping: `style`→`f0`, `f0`→`trial`

## 3. Step F Modification

- [x] 3.1 Modify Step F in `skills/start/SKILL.md` to read L3 contracts, outline, and foreshadowing from `volumes/vol-01/` when available
- [x] 3.2 Update `agents/chapter-writer.md` Edge Cases: trial chapters with L3 contracts SHALL follow contract preconditions/postconditions/plot_points; missing contracts = fallback to free writing mode
- [x] 3.3 Update `agents/quality-judge.md` Edge Cases: trial chapters with L3 contracts trigger full Track 1 L3 compliance check; missing contracts = skip L3 check (existing behavior)

## 4. Formal Volume Planning Merge

- [x] 4.1 Add merge logic to `skills/start/references/vol-planning.md`: when vol-01 has existing Ch1-3 contracts (from F0), `chapter_range` starts from 4, outline appends after existing 3 chapters
- [x] 4.2 Specify Ch1-3 contracts as read-only during formal planning: PlotArchitect SHALL NOT overwrite chapter-001/002/003.json
- [x] 4.3 Specify storyline-schedule.json and foreshadowing.json incremental merge: formal planning appends new entries, preserves existing seed entries from F0

## 5. Validation

- [x] 5.1 Verify Quick Start E→F0→F flow: Step E completion triggers F0, F0 completion triggers F, checkpoint states correct at each stage
- [x] 5.2 Verify checkpoint resume: `quickstart_phase="style"` enters F0; `quickstart_phase="f0"` enters trial
- [x] 5.3 Verify PlotArchitect mini-mode produces valid L3 contracts with full schema (including excitement_type)
- [x] 5.4 Verify formal planning merge: Ch1-3 contracts preserved, chapter_range starts from 4, outline appended correctly
- [x] 5.5 Verify backward compatibility: projects without F0 outputs (legacy) have unchanged Step F behavior (free writing mode, no L3 check)
