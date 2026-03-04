## MODIFIED Requirements

### Requirement 1: Style guide SHALL NOT contain any fixed quotas for anti-AI techniques

All fixed-count mandates ("至少 N 处", "每章 N 次", "每 N 次对话出现 1 次") in Layer 2 of `style-guide.md` SHALL be replaced with statistical-range or naturally-varying language. The zero-quota principle applies: no technique usage count SHALL be mandated as an exact number or minimum per chapter.

#### Scenario: Zero matches for quota patterns
- **GIVEN** the updated `style-guide.md`
- **WHEN** searching for regex patterns `至少.*处`, `每章.*次`, `每.*次.*出现.*次`
- **THEN** zero matches are found
- **AND** no sentence in Layer 2 prescribes a fixed count for any technique

#### Scenario: Anti-intuitive details use naturally-varying language
- **GIVEN** §2.3 (反直觉细节) in the updated style guide
- **WHEN** reading the frequency guidance
- **THEN** the text says "naturally varying, presence encouraged but count not mandated" (or equivalent)
- **AND** the text does NOT say "每章至少 1 处"

#### Scenario: Character speech pattern frequency is non-fixed
- **GIVEN** §2.2 (角色语癖) in the updated style guide
- **WHEN** reading the frequency guidance
- **THEN** the text describes recurring but irregular appearance
- **AND** the text does NOT prescribe "每 2-3 次对话出现 1 次"

#### Scenario: Punctuation constraints use rate ranges instead of fixed limits
- **GIVEN** §2.6 (标点符号约束) in the updated style guide
- **WHEN** reading em-dash, ellipsis, and exclamation mark constraints
- **THEN** each constraint uses a rate range (e.g., "≤ N/千字") rather than a fixed per-chapter count
- **AND** the guidance acknowledges natural variance across chapters

---

### Requirement 2: Style guide SHALL define 6-dimension statistical distribution targets in §2.8

A new section §2.8 SHALL define statistical distribution targets across 6 dimensions. Each dimension SHALL reference a style-profile field (from CS-A1) as primary target and provide a fallback range for when the field is null.

#### Scenario: All 6 dimensions are defined
- **GIVEN** §2.8 in the updated style guide
- **WHEN** reading the dimension list
- **THEN** exactly 6 dimensions are defined:
  1. `sentence_length_variance` — 句长方差
  2. `paragraph_length_cv` — 段落长度变异系数
  3. `vocabulary_diversity` — 词汇多样性
  4. `narration_connectors` — 叙述连接词
  5. `register_mixing` — 语域混合
  6. `emotional_arc` — 情感弧线

#### Scenario: Each dimension references a style-profile field
- **GIVEN** any dimension in §2.8
- **WHEN** reading its target specification
- **THEN** it references a specific field name in `style-profile.json` (e.g., `statistical.sentence_length_std_dev`)
- **AND** the field name aligns with CS-A1's statistical field definitions

#### Scenario: Each dimension has a fallback range for null style-profile
- **GIVEN** any dimension in §2.8
- **WHEN** the referenced style-profile field is null or absent
- **THEN** a fallback range is specified based on human writing corpus statistics
- **AND** the fallback range is expressed as a numeric interval (e.g., "8–18" for sentence length std_dev)

#### Scenario: Dimensions distinguish human vs AI zones
- **GIVEN** any dimension in §2.8
- **WHEN** reading its range specification
- **THEN** the text describes what constitutes a human-like range vs an AI-characteristic range
- **AND** the distinction is expressed as a comparison (e.g., "AI 文本 std_dev 通常 < 5，人类文本 8–18")

---

### Requirement 3: Style guide SHALL provide a 12-technique humanization toolbox in §2.9

A new section §2.9 SHALL define a humanization technique toolbox containing exactly 12 techniques, categorized across 5 dimensions, with explicit random-sampling instructions.

#### Scenario: All 12 techniques are listed
- **GIVEN** §2.9 in the updated style guide
- **WHEN** reading the technique list
- **THEN** exactly 12 techniques are defined:
  1. `thought_interrupt` — 思维中断
  2. `sensory_intrusion` — 感官侵入
  3. `self_correction` — 自我纠正
  4. `dialect_slip` — 方言滑落
  5. `incomplete_sentence` — 不完整句
  6. `rhetorical_question` — 反问
  7. `stream_of_consciousness` — 意识流片段
  8. `mundane_detail` — 琐碎细节
  9. `contradiction` — 矛盾
  10. `emotional_non_sequitur` — 情感跳跃
  11. `nested_parenthetical` — 嵌套补充
  12. `abrupt_topic_shift` — 突然转题

#### Scenario: Each technique has Chinese name, description, and usage example
- **GIVEN** any technique in §2.9
- **WHEN** reading its definition
- **THEN** it includes a Chinese name (中文名)
- **AND** it includes a brief description of the technique
- **AND** it includes at least one concrete usage example in Chinese fiction context

#### Scenario: Techniques are categorized across 5 dimensions
- **GIVEN** the technique list in §2.9
- **WHEN** examining the categorization
- **THEN** techniques are grouped into 5 categories:
  - 认知 (cognitive): `thought_interrupt`, `self_correction`
  - 感官 (sensory): `sensory_intrusion`, `mundane_detail`
  - 语言 (linguistic): `dialect_slip`, `incomplete_sentence`, `rhetorical_question`
  - 情感 (emotional): `stream_of_consciousness`, `emotional_non_sequitur`, `contradiction`
  - 结构 (structural): `nested_parenthetical`, `abrupt_topic_shift`

#### Scenario: Random sampling instruction is explicit
- **GIVEN** §2.9 in the updated style guide
- **WHEN** reading the usage instructions
- **THEN** the text explicitly states that techniques are randomly sampled per chapter
- **AND** the text explicitly states "NOT fixed count per chapter" (or equivalent)
- **AND** no minimum or maximum count per chapter is prescribed

---

## MODIFIED Requirements (continued)

### Requirement 4: Layer 4 SHALL use 7-indicator range-based assessment

The Layer 4 detection metrics table in `style-guide.md` SHALL be rewritten from a 4-indicator 5-point scoring table to a 7-indicator 3-zone (green/yellow/red) range-based assessment.

#### Scenario: 7 indicators are defined
- **GIVEN** the Layer 4 assessment table in the updated style guide
- **WHEN** reading the indicator list
- **THEN** exactly 7 indicators are defined:
  1. `blacklist_hit_rate` — AI 黑名单命中率 (per 1000 chars)
  2. `sentence_repetition_rate` — 句式重复率
  3. `sentence_length_std_dev` — 句长标准差 (new)
  4. `paragraph_length_cv` — 段落长度变异系数 (new)
  5. `vocabulary_diversity_score` — 词汇多样性评分 (new)
  6. `narration_connector_count` — 叙述连接词计数 (new)
  7. `humanize_technique_variety` — 人性化技法多样性 (new)

#### Scenario: Each indicator has green/yellow/red zones
- **GIVEN** any indicator in the Layer 4 table
- **WHEN** reading its assessment criteria
- **THEN** 3 zones are defined:
  - **green** (人类范围): value range typical of human writing
  - **yellow** (边界): borderline, warrants attention
  - **red** (AI 特征): value range characteristic of AI-generated text
- **AND** each zone boundary is expressed as a numeric range or threshold

#### Scenario: narration_connector_count green zone is zero
- **GIVEN** the `narration_connector_count` indicator
- **WHEN** reading its green zone definition
- **THEN** the green zone value is 0 (zero tolerance for narration connectors)
- **AND** any count > 0 falls into yellow or red zone

#### Scenario: Backward compatibility with 4-indicator mode
- **GIVEN** a detection context where only the original 4 indicators are available
- **WHEN** Layer 4 assessment is performed
- **THEN** the old 5-point scoring table is used as a fallback
- **AND** the style guide explicitly documents this backward-compatible mode
- **AND** the old table is preserved (marked as legacy) alongside the new 7-indicator table

#### Scenario: New indicators reference CS-A1 statistical fields
- **GIVEN** the 3 new statistical indicators (`sentence_length_std_dev`, `paragraph_length_cv`, `vocabulary_diversity_score`)
- **WHEN** reading their zone boundary definitions
- **THEN** green zone ranges reference the corresponding style-profile statistical fields from CS-A1
- **AND** fallback ranges are provided for when style-profile fields are absent

## References

- `skills/novel-writing/references/style-guide.md` — sole modification target
- `templates/style-profile-template.json` — CS-A1 statistical fields (read-only reference)
- `templates/ai-blacklist.json` — blacklist (unchanged, continued reference)
- CS-A1 (`m9-anti-ai-statistical-templates`) — dependency for statistical field names
- CS-A3 / CS-A4 — downstream consumers of this methodology upgrade
