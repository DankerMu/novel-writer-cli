## 1. PlotArchitect Mini-Planning Mode

- [ ] 1.1 Add mini-planning mode to `agents/plot-architect.md` Edge Cases section: when `chapter_range=[1,3]`, produce compact 3-chapter outline + full L3 contracts + storyline-schedule + foreshadowing
- [ ] 1.2 Define mini-mode output schema: `outline.md` (3 chapters, standard format with ExcitementType line), 3 L3 contracts (full schema), `storyline-schedule.json` (3 entries), `foreshadowing.json` (1-3 seed foreshadows)
- [ ] 1.3 Add genre_excitement_map optional injection: if template exists, assign `excitement_type` per genre mapping; if missing, PlotArchitect assigns freely

## 2. Step F0 Implementation

- [ ] 2.1 Insert Step F0 section in `skills/start/SKILL.md` between Step E and Step F, with sub-steps: create vol-01 dir, dispatch PlotArchitect mini-planning, validate outputs, commit staging
- [ ] 2.2 Define Step F0 dispatch parameters: `volume=1`, `chapter_range=[1,3]`, inject L1 rules + L2 contracts + style-profile + brief context
- [ ] 2.3 Define Step F0 validation: check presence of outline.md, 3 L3 contracts, storyline-schedule.json, foreshadowing.json; validate L3 contract schema
- [ ] 2.4 Add checkpoint `quick_start_step="F0"` and update resume mapping: E→F0, F0→F (replacing previous E→F)

## 3. Step F Modification

- [ ] 3.1 Modify Step F in `skills/start/SKILL.md` to read L3 contracts, outline, and foreshadowing from `volumes/vol-01/` when available
- [ ] 3.2 Update `agents/chapter-writer.md` Edge Cases: trial chapters with L3 contracts SHALL follow contract preconditions/postconditions/plot_points; missing contracts = fallback to free writing mode
- [ ] 3.3 Update `agents/quality-judge.md` Edge Cases: trial chapters with L3 contracts trigger full Track 1 L3 compliance check; missing contracts = skip L3 check (existing behavior)

## 4. Formal Volume Planning Merge

- [ ] 4.1 Add merge logic to `skills/start/references/vol-planning.md`: when vol-01 has existing Ch1-3 contracts (from F0), `chapter_range` starts from 4, outline appends after existing 3 chapters
- [ ] 4.2 Specify Ch1-3 contracts as read-only during formal planning: PlotArchitect SHALL NOT overwrite chapter-001/002/003.json
- [ ] 4.3 Specify storyline-schedule.json and foreshadowing.json incremental merge: formal planning appends new entries, preserves existing seed entries from F0

## 5. Validation

- [ ] 5.1 Verify Quick Start E→F0→F flow: Step E completion triggers F0, F0 completion triggers F, checkpoint states correct at each stage
- [ ] 5.2 Verify checkpoint resume: `quick_start_step="E"` enters F0; `quick_start_step="F0"` enters F
- [ ] 5.3 Verify PlotArchitect mini-mode produces valid L3 contracts with full schema (including excitement_type)
- [ ] 5.4 Verify formal planning merge: Ch1-3 contracts preserved, chapter_range starts from 4, outline appended correctly
- [ ] 5.5 Verify backward compatibility: projects without F0 outputs (legacy) have unchanged Step F behavior (free writing mode, no L3 check)
