## 1. Templates & Config Files

- [x] 1.1 Add `templates/platform-profile.json` with schema_version + qidian/tomato defaults
- [x] 1.2 Add `templates/web-novel-cliche-lint.json` with severity + whitelist/exemptions structure
- [x] 1.3 Add `templates/genre-weight-profiles.json` with drive_type profiles and normalization rules
- [x] 1.4 Update `templates/brief-template.md` to include `genre_drive_type` and platform-profile linkage/constraints summary

## 2. Init & Immutability

- [x] 2.1 Extend init flow to collect `platform` and `genre_drive_type` via an explicit review gate (NOVEL_ASK-compatible)
- [x] 2.2 Write `platform-profile.json` to project root on init and refuse any later platform changes
- [x] 2.3 Persist user-confirmed threshold overrides (word_count/hook_policy/info_load) into `platform-profile.json`

## 3. Platform Constraints Engine

- [x] 3.1 Implement word-count validation (hard vs soft) driven by `platform-profile.json.word_count`
- [x] 3.2 Implement compliance checks (banned words / duplicate names / simplified-traditional consistency) and produce a structured report
- [x] 3.3 Implement information-load metrics (unknown entities / new entities / new terms per 1k) and threshold validation
- [x] 3.4 Ensure constraint outcomes are recorded in chapter evaluation and/or chapter log output (auditable)

## 4. Cliché Lint

- [x] 4.1 Implement cliché lint loader for `web-novel-cliche-lint.json` (severity + whitelist/exemptions)
- [x] 4.2 Add deterministic linter path (script hook if present) with safe fallback when missing/failing
- [x] 4.3 Wire cliché metrics into scoring/gating according to `platform-profile.json` policy (warn/soft/hard)

## 5. Chapter Hook System

- [x] 5.1 Update ChapterWriter contract/prompt to enforce chapter-end hook when `hook_policy.required=true`
- [x] 5.2 Update QualityJudge contract to classify hook type and score `hook_strength` with evidence
- [x] 5.3 Implement `hook-fix` micro-step (edit last 1–2 paragraphs only) with bounded retry and escalation

## 6. Dynamic Weight Profiles

- [x] 6.1 Implement weight profile loading from `genre-weight-profiles.json` + `platform-profile.json.scoring`
- [x] 6.2 Normalize/validate weights and surface config errors without hanging the pipeline
- [x] 6.3 Record effective weight profile and per-dimension weights in `evaluations/chapter-*-eval.json`

## 7. ConsistencyAuditor (Sliding Window)

- [x] 7.1 Add `ConsistencyAuditor` agent contract and instruction packet/manifest schema
- [x] 7.2 Trigger audits every 5 chapters over the last 10 chapters; generate `logs/continuity/latest.json` + history file
- [x] 7.3 Add volume-end full audit trigger and output conventions
- [x] 7.4 Inject compact high/medium continuity summary into QualityJudge inputs (preserve LS-001 semantics)
- [x] 7.5 Reuse existing M3 NER/continuity outputs when available (`scripts/run-ner.sh`, existing `logs/continuity/**`) and define non-blocking degradation when missing/failing
- [x] 7.6 Sync runtime registries/docs: add `agents/consistency-auditor.md` and update `plugin.json` / `CLAUDE.md` if the agent is exposed via the plugin entrypoints

## 8. Foreshadow Visibility

- [ ] 8.1 Compute foreshadow dormancy (`chapters_since_last_update`) from `foreshadowing/global.json`
- [ ] 8.2 Generate `logs/foreshadowing/latest.json` with dormant items + non-spoiler light-touch suggestions
- [ ] 8.3 Inject light-touch tasks into planning/writing steps when dormancy exceeds thresholds

## 9. Documentation

- [x] 9.1 Update user docs to describe new config files and platform binding immutability
- [x] 9.2 Update quality rubric documentation to include `hook_strength` and dynamic weights
