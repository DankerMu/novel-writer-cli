## ADDED Requirements

### Requirement: StyleRefiner SHALL follow the standard four-step polish flow

StyleRefiner SHALL execute the style-guide §2.12 four-step polish flow after it reads the draft, style profile, blacklist, and methodology references.

#### Scenario: Step 1 through Step 4 appear in order
- **GIVEN** the full text of `agents/style-refiner.md`
- **WHEN** the process section is read
- **THEN** it explicitly contains `Step 1: 黑名单扫描`, `Step 2: 结构规则检查`, `Step 3: 抽象→具体转换`, and `Step 4: 节奏朗读测试`
- **AND** these steps appear in that order

#### Scenario: Preparation stage exists before the four steps
- **GIVEN** the process section in `agents/style-refiner.md`
- **WHEN** the instructions are read
- **THEN** they require reading `chapter_draft`, `style_profile`, `ai_blacklist`, and `style_guide` before executing the four-step flow
- **AND** they establish the target style from `style_exemplars` or statistical fallbacks

---

### Requirement: StyleRefiner SHALL use the six-layer structural checklist in Step 2

StyleRefiner Step 2 SHALL reference the style-guide §2.10 six-layer structural rules as a checklist.

#### Scenario: Six-layer checklist names are present
- **GIVEN** Step 2 in `agents/style-refiner.md`
- **WHEN** the checklist is read
- **THEN** it explicitly covers `template_sentence`, `adjective_density`, `idiom_density`, `dialogue_intent`, `paragraph_structure`, and `punctuation_rhythm`

#### Scenario: Structural issues are fixed before word-level polish
- **GIVEN** StyleRefiner constraints in `agents/style-refiner.md`
- **WHEN** priority is described
- **THEN** structural-rule fixes are stated to take priority over purely lexical substitutions

---

### Requirement: StyleRefiner SHALL support quick-check mode

StyleRefiner SHALL define a quick-check mode for time-constrained passes, aligned with style-guide §2.13.

#### Scenario: Quick-check mode lists the minimum five checks
- **GIVEN** the quick-check mode section in `agents/style-refiner.md`
- **WHEN** it is read
- **THEN** it explicitly lists all 5 minimum checks: `四字词组连用`, `情绪直述`, `微微系列`, `缓缓系列`, and `标点过度`

#### Scenario: Quick-check mode is opt-in, not the default
- **GIVEN** `agents/style-refiner.md`
- **WHEN** quick-check mode behavior is described
- **THEN** it is only allowed when time-constrained or explicitly requested by the caller
- **AND** the standard four-step flow remains the default

---

### Requirement: StyleRefiner SHALL use replacement_hint for blacklist substitutions

StyleRefiner SHALL treat `replacement_hint` from `ai-blacklist.json` as the first guidance for how to rewrite a blacklisted expression.

#### Scenario: replacement_hint is explicitly referenced
- **GIVEN** StyleRefiner is replacing a blacklisted phrase
- **WHEN** the relevant instruction is read in `agents/style-refiner.md`
- **THEN** it directs the model to consult the matched entry's `replacement_hint`
- **AND** to adapt that hint to context and character voice rather than performing blind literal replacement

---

### Requirement: StyleRefiner SHALL apply genre-aware overrides from brief

StyleRefiner SHALL resolve genre-aware L5/L6 thresholds using the project brief, aligned with style-guide §2.11.

#### Scenario: Explicit type override in brief takes precedence
- **GIVEN** `paths.project_brief` includes an explicit "类型覆写" section
- **WHEN** StyleRefiner determines paragraph / punctuation thresholds
- **THEN** the explicit override in brief is used before any generic defaults

#### Scenario: Brief genre fallback is used when no explicit override exists
- **GIVEN** `paths.project_brief` has no explicit "类型覆写" section
- **WHEN** StyleRefiner determines paragraph / punctuation thresholds
- **THEN** it falls back to the brief's genre field
- **AND** only if brief is unavailable may `paths.platform_profile` be used as a secondary auxiliary signal

## References

- `agents/style-refiner.md` — StyleRefiner Agent prompt
- `skills/novel-writing/references/style-guide.md` — style-guide (§2.10 structural rules, §2.11 genre overrides, §2.12 flow, §2.13 quick-check)
- `templates/ai-blacklist.json` — blacklist entries with `replacement_hint`
- `templates/brief-template.md` — brief shape with optional genre override section
