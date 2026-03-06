## 1. ChapterWriter De-quota

- [x] 1.1 Rewrite C11 (speech patterns) to remove fixed frequency
- [x] 1.2 Rewrite C12 (anti-intuitive details) to remove fixed count
- [x] 1.3 Verify zero fixed-count patterns remain in chapter-writer.md

## 2. ChapterWriter New Constraints

- [x] 2.1 Add C16: sentence length variance (reference style-profile field, forbid 3+ consecutive sentences within ±5 chars)
- [x] 2.2 Add C17: narration connector zero tolerance (narration_connector words banned in narration paragraphs, allowed in dialogue)
- [x] 2.3 Add C18: humanization technique random sampling (reference §2.9 toolbox, cross-chapter variation, no fixed count)
- [x] 2.4 Add C19: dialogue intent constraint (from anti-ai-polish.md §2.10 L4) — every dialogue line must have intent tag (试探/回避/施压/诱导/挑衅/敷衍 etc.); prohibit 书面语对话, 叙述重复, 角色语气同质化; include "去掉标签能否分辨说话人" test
- [x] 2.5 Add C20: structural density constraint (from anti-ai-polish.md §2.10 L2-L3) — adjectives ≤6 per 300 chars, four-char idioms ≤3 per 500 chars and ≤2 per paragraph and no consecutive pairs

## 3. ChapterWriter Phase 2 Steps

- [x] 3.1 Add step 6.5: narration connector sweep
- [x] 3.2 Add step 6.6: modifier deduplication (500-char window)
- [x] 3.3 Add step 6.7: four-character idiom density check (flag consecutive pairs and per-500-char excess)

## 4. StyleRefiner Polish Flow Alignment

- [x] 4.1 Restructure StyleRefiner prompt to follow §2.12 four-step polish flow (blacklist scan → structural rules check → abstract→concrete → rhythm test)
- [x] 4.2 Reference §2.10 six-layer structural rules as checklist in step 2
- [x] 4.3 Add quick check mode: when time-constrained, execute §2.13 five-item minimum checklist (四字词组连用 / 情绪直述 / 微微系列 / 缓缓系列 / 标点过度)
- [x] 4.4 Reference `replacement_hint` from ai-blacklist.json entries (CS-A1) for replacement direction guidance
- [x] 4.5 Add genre-aware parameter loading: read type override from `brief.md` / `paths.project_brief` first, then fall back to brief genre (platform profile only as auxiliary signal), and apply §2.11 overrides to structural thresholds

## 5. QualityJudge Output Extension

- [x] 5.1 Add statistical_profile sub-object to anti_ai output (sentence_length_std_dev / paragraph_length_cv / vocabulary_richness_estimate)
- [x] 5.2 Add detected_humanize_techniques array to anti_ai output
- [x] 5.3 Add structural_rule_violations array to anti_ai output (from §2.10 six-layer rules: template_sentence / adjective_density / idiom_density / dialogue_intent / paragraph_structure / punctuation_rhythm)

## 6. QualityJudge Constraint 3 Rewrite

- [x] 6.1 Rewrite Constraint 3 from 4-indicator to 7-indicator system
- [x] 6.2 Reference style-guide Layer 4 for zone definitions
- [x] 6.3 Add backward compatibility for 4-indicator mode

## 7. Validation

- [x] 7.1 Verify ChapterWriter prompt has zero fixed quotas
- [x] 7.2 Verify ChapterWriter has C16-C20 constraints and steps 6.5-6.7
- [x] 7.3 Verify StyleRefiner prompt follows §2.12 four-step flow
- [x] 7.4 Verify StyleRefiner references §2.13 quick checklist
- [x] 7.5 Verify QualityJudge outputs new fields (statistical_profile, detected_humanize_techniques, structural_rule_violations)
- [x] 7.6 Verify 7-indicator scoring aligns with style-guide Layer 4
- [x] 7.7 Cross-reference with docs/anti-ai-polish.md — verify dialogue intent system and structural density rules are represented
