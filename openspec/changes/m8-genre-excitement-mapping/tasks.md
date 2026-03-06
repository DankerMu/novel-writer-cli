## 1. Genre Excitement Map Template

- [x] 1.1 Create `templates/genre-excitement-map.json` with 6 genre entries (xuanhuan, dushi, scifi, history, suspense, romance), each mapping chapters 1, 2, 3 to excitement_type values:
  - xuanhuan: setup → power_up → face_slap
  - dushi: setup → reversal → face_slap
  - scifi: reveal → setup → cliffhanger
  - history: setup → reveal → reversal
  - suspense: reveal → setup → cliffhanger
  - romance: setup → reveal → reversal
- [x] 1.2 Update `src/init.ts` DEFAULT_TEMPLATES to include `genre-excitement-map.json`

## 2. Genre Golden Standards Template

- [x] 2.1 Create `templates/genre-golden-standards.json` with 6 genre entries, each containing `focus_dimensions`, `criteria`, and `minimum_thresholds`:
  - xuanhuan: immersion ≥ 3.5; focus on world-building presence, power-system establishment
  - dushi: pacing ≥ 3.5; focus on identity contrast, social tension
  - scifi: plot_logic ≥ 3.5, immersion ≥ 3.5; focus on setting credibility, logical consistency
  - history: plot_logic ≥ 3.5; focus on era atmosphere, historical plausibility
  - suspense: plot_logic ≥ 4.0; focus on clue planting, misdirection, tension arc
  - romance: character ≥ 4.0, style_naturalness ≥ 3.5; focus on personality expression, CP chemistry, emotional hook
- [x] 2.2 Add `invalid_combinations` section to `genre-golden-standards.json`: romance+qidian WARNING, xuanhuan+jinjiang WARNING (at minimum)
- [x] 2.3 Update `src/init.ts` DEFAULT_TEMPLATES to include `genre-golden-standards.json`

## 3. PlotArchitect — Genre-Aware Ch1-3 Planning

- [x] 3.1 Update `agents/plot-architect.md` planning process: when planning Ch1-3 and genre_excitement_map is available, reference the genre's mapped excitement_type as default assignment
- [x] 3.2 Add override clause: PlotArchitect MAY override default assignment with recorded justification
- [x] 3.3 Add fallback clause: genre_excitement_map missing → assign freely, no warning

## 4. QualityJudge — Track 3 Genre-Specific Gate Extension

- [x] 4.1 Extend Track 3 in `agents/quality-judge.md`: when chapter ≤ 3 AND `genre_golden_standards` is present in evaluation context, check genre-specific `minimum_thresholds`
- [x] 4.2 Add gate failure behavior: any genre-specific threshold unmet → gate failure → recommendation=revise; failure reason specifies which genre threshold was not met
- [x] 4.3 Add fallback behavior: genre_golden_standards missing OR genre not found in config → skip genre-specific evaluation entirely, no error
- [x] 4.4 Ensure genre-specific gates layer on top of existing platform-specific gates (both can independently cause gate failure)

## 5. Start Skill — Genre Selection + Compatibility Check

- [x] 5.1 Update `skills/start/SKILL.md` Step A: add 言情 (romance) as 6th genre option
- [x] 5.2 Add post-selection genre×platform compatibility check: after genre + platform selection, look up `invalid_combinations` in genre-golden-standards.json; display WARNING if matched
- [x] 5.3 Add fallback: genre-golden-standards.json missing → skip compatibility check, no warning
- [x] 5.4 Update Step F: inject `genre_excitement_map` (matched by brief.genre) into PlotArchitect manifest when genre-excitement-map.json exists

## 6. Continue Skill — Genre Standards Injection

- [x] 6.1 Update `skills/continue/SKILL.md` Step 2.6: when chapter ≤ 3 and genre-golden-standards.json exists, inject `inline.genre_golden_standards` with the matched genre entry into QualityJudge manifest
- [x] 6.2 Add fallback: genre-golden-standards.json missing or genre not found → do not inject, no error

## 7. Validation

- [x] 7.1 Verify backward compatibility: missing genre-excitement-map.json → PlotArchitect assigns freely, no change in behavior
- [x] 7.2 Verify backward compatibility: missing genre-golden-standards.json → QualityJudge Track 3 skips genre-specific evaluation, no change in behavior
- [x] 7.3 Verify genre-specific gate failure correctly sets recommendation=revise (e.g., romance with character=3.5 < 4.0 threshold)
- [x] 7.4 Verify genre-specific gate pass does not interfere with platform-specific gate evaluation
- [x] 7.5 Verify invalid_combinations WARNING is displayed but does not block init
- [x] 7.6 Verify unrecognized genre in genre-golden-standards.json triggers no error, silently skips genre-specific evaluation

## References

- `openspec/changes/m8-genre-excitement-mapping/proposal.md`
- `openspec/changes/m8-genre-excitement-mapping/design.md`
- `openspec/changes/m8-genre-excitement-mapping/specs/genre-excitement-map/spec.md`
- `openspec/changes/m8-genre-excitement-mapping/specs/genre-golden-standards/spec.md`
