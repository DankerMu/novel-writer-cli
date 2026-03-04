## 1. Quality Rubric Upgrade

- [ ] 1.1 Rewrite §6 scoring table from 4-indicator 5-point to 7-indicator 3-zone
- [ ] 1.2 Define green/yellow/red zones for each of 7 indicators
- [ ] 1.3 Add zone-to-score mapping (all green=5, 1-2 yellow=4, 3+ yellow or 1 red=3, 2+ red=2, 4+ red=1)
- [ ] 1.4 Add structural_rule_violations sub-score: N violations → penalty mapping (0=no penalty, 1-2=yellow, 3+=red)
- [ ] 1.5 Add backward compatibility note for legacy 4-indicator mode

## 2. Context Contracts

- [ ] 2.1 Add `inline.statistical_targets` to CW manifest section (6-dimension targets from style-profile)
- [ ] 2.2 Add `inline.statistical_profile` to QJ manifest section (CW self-reported or lint output)
- [ ] 2.3 Add `inline.genre_overrides` to CW manifest section (genre-specific parameter overrides from platform-profile.json)
- [ ] 2.4 Document fallback values when style-profile fields are null

## 3. Lint Blacklist Upgrade

- [ ] 3.1 Implement narration_only context detection in lint-blacklist.sh (Chinese double-quote boundary detection)
- [ ] 3.2 Add Chinese quote parity warning (non-blocking)
- [ ] 3.3 Add replacement_hint output in lint report (read from ai-blacklist.json entries, include in JSON output)
- [ ] 3.4 Add per_chapter_max frequency detection (read per_chapter_max from ai-blacklist.json, report warnings for exceeded limits)
- [ ] 3.5 Add test cases for dialogue vs narration context
- [ ] 3.6 Add test cases for per_chapter_max enforcement (e.g., "深吸一口气" appearing 2+ times)

## 4. Structural Rules Lint (NEW — lint-structural.sh)

- [ ] 4.1 Create `scripts/lint-structural.sh` scaffold with input/output contract (input: chapter .md file + optional genre override JSON; output: JSON report)
- [ ] 4.2 L2 adjective/adverb density check: count emphasis words (极其/非常/十分/无比) per 300-char window, flag if >2; count total adjectives per 300-char window, flag if >6
- [ ] 4.3 L3 four-character idiom density check: count four-char idioms per 500-char window (flag >3), detect consecutive pairs (flag any), count per paragraph (flag >2)
- [ ] 4.4 L5 paragraph structure check: compute single-sentence paragraph ratio (flag outside 25-45% default), detect 3+ consecutive paragraphs of similar length (±10 chars)
- [ ] 4.5 L6 punctuation rhythm check: count 省略号/感叹号/破折号 per chapter (flag over limits), detect consecutive punctuation (？？, ！！, ……+！)
- [ ] 4.6 Genre override support: accept optional --genre parameter or JSON config, apply genre-specific thresholds from §2.11 (科幻: paragraph up to 120 chars, 感叹号≤5; 恐怖: single-sentence ratio up to 50%, 省略号≤8; etc.)
- [ ] 4.7 Output format: JSON array of violations with rule_id, severity (warning/error), location (line/char range), description, suggestion
- [ ] 4.8 Add test fixtures for each rule (clean chapter with no violations + chapters with specific violations)

## 5. Periodic Maintenance

- [ ] 5.1 Add max_words=250 cap enforcement rule (updated from 120 to align with expanded blacklist)
- [ ] 5.2 Add humanization technique cross-chapter tracking rule
- [ ] 5.3 Define tracking storage location (logs/anti-ai/technique-history.json)

## 6. World Builder Style Extraction

- [ ] 6.1 Add Mode 7 step 2.5: extract sentence_length_std_dev from sample text
- [ ] 6.2 Add Mode 7 step 2.5: extract paragraph_length_cv from sample text
- [ ] 6.3 Add Mode 7 step 2.5: assess emotional_volatility/register_mixing/vocabulary_richness

## 7. Eval Schema

- [ ] 7.1 Add optional anti_ai_statistical_profile object definition to labeled-chapter.schema.json
- [ ] 7.2 Add optional structural_rule_violations array to labeled-chapter.schema.json
- [ ] 7.3 Verify backward compatibility with existing labeled data

## 8. Validation

- [ ] 8.1 Verify quality-rubric 7 indicators match style-guide Layer 4
- [ ] 8.2 Verify context-contracts fields match Agent input/output specs (including genre_overrides)
- [ ] 8.3 Run lint-blacklist.sh on sample with narration_only words in dialogue → no hits
- [ ] 8.4 Run lint-blacklist.sh on sample with per_chapter_max exceeded → warning reported
- [ ] 8.5 Run lint-structural.sh on clean sample → zero violations
- [ ] 8.6 Run lint-structural.sh on sample with known violations → all flagged correctly
- [ ] 8.7 Run lint-structural.sh with --genre 科幻 → adjusted thresholds applied
- [ ] 8.8 Validate eval schema against existing labeled-chapter samples
- [ ] 8.9 Cross-reference lint-structural.sh rules with docs/anti-ai-polish.md §二 — verify all quantifiable rules are covered
