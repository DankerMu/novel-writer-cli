## ADDED Requirements

### Requirement: 13-indicator indicator_breakdown

QualityJudge 的 `anti_ai.indicator_breakdown` SHALL 输出 13 项指标，每项包含 `value`、`zone`（green | yellow | red）、`note`。前 7 项保持现有定义不变，新增以下 6 项：

| # | 指标 ID | value 类型 | green | yellow | red |
|---|---------|-----------|-------|--------|-----|
| 8 | `em_dash_count` | number | 0 | （无 yellow） | >0 |
| 9 | `sentence_pattern_score` | string 摘要 | 0 high + ≤2 medium | >2 medium + 0 high | ≥1 high |
| 10 | `simile_density` | number（/千字） | ≤1 | >1 且 ≤2 | >2 |
| 11 | `dialogue_distinguishability` | enum: high/medium/low | high | medium | low |
| 12 | `ellipsis_density` | number（/千字） | ≤2 | >2 且 ≤3 | >3 |
| 13 | `exclamation_density` | number（/千字） | ≤3 | >3 且 ≤5 | >5 |

#### Scenario: 全部 13 项正常输出

- **WHEN** QualityJudge 以 `indicator_mode: "13-indicator"` 评审一个标准章节（≥500 字，`ai_sentence_patterns` 存在）
- **THEN** `indicator_breakdown` MUST 包含 13 个 key，每个 key 含 `value`/`zone`/`note`

#### Scenario: em_dash_count 零容忍

- **WHEN** 章节正文包含 1 个或以上破折号（——）
- **THEN** `indicator_breakdown.em_dash_count.zone` MUST 为 `"red"`，且 `value` 为实际计数

#### Scenario: em_dash_count 无 yellow 区间

- **WHEN** 章节正文包含 0 个破折号
- **THEN** `indicator_breakdown.em_dash_count.zone` MUST 为 `"green"`（不存在 yellow 判定）

#### Scenario: sentence_pattern_score 聚合

- **WHEN** `sentence_pattern_violations[]` 包含 1 处 severity=high 命中
- **THEN** `indicator_breakdown.sentence_pattern_score.zone` MUST 为 `"red"`

#### Scenario: simile_density 计算

- **WHEN** 3000 字章节中出现 4 处 `像+具体意象` 比喻（排除非比喻义 `好像`/`像是`）
- **THEN** `indicator_breakdown.simile_density.value` ≈ 1.33，`zone` 为 `"yellow"`

#### Scenario: dialogue_distinguishability 评估

- **WHEN** 章节含多角色对话，去掉对话标签后读者仅能勉强分辨说话人
- **THEN** `indicator_breakdown.dialogue_distinguishability.value` 为 `"medium"`，`zone` 为 `"yellow"`

#### Scenario: ellipsis_density 与 exclamation_density

- **WHEN** 3000 字章节包含 10 个省略号和 18 个感叹号
- **THEN** `ellipsis_density.value` ≈ 3.33，`zone` 为 `"red"`；`exclamation_density.value` = 6.0，`zone` 为 `"red"`

### Requirement: indicator_mode 三档回退

`anti_ai.indicator_mode` SHALL 支持三档：`"13-indicator"`（默认）、`"7-indicator"`（中间回退）、`"4-indicator-compat"`（legacy）。

#### Scenario: 默认 13-indicator 模式

- **WHEN** 正文 ≥500 字、`ai_sentence_patterns` 存在、对话内容足以评估区分度
- **THEN** `indicator_mode` MUST 为 `"13-indicator"`

#### Scenario: 回退到 7-indicator

- **WHEN** 正文过短（<500 字）导致比喻/对话样本不足，或 `ai_sentence_patterns` 未提供
- **THEN** `indicator_mode` MUST 为 `"7-indicator"`，`indicator_breakdown` 仅包含前 7 项

#### Scenario: 回退到 4-indicator-compat

- **WHEN** 正文破损或 style_profile 缺失导致基础统计无法估算
- **THEN** `indicator_mode` MUST 为 `"4-indicator-compat"`（既有行为不变）

### Requirement: style_naturalness 评分映射更新

`style_naturalness` 维度在 `indicator_mode: "13-indicator"` 时 SHALL 按 13 项三区判定进行 1-5 分映射。

#### Scenario: 全 green → 5 分

- **WHEN** 13 项指标全部为 green
- **THEN** `style_naturalness` 基础分为 5（句式模式叠加扣分另计）

#### Scenario: 1-3 yellow → 4 分

- **WHEN** 13 项中 1-3 个 yellow，余下 green，无 red
- **THEN** `style_naturalness` 基础分为 4

#### Scenario: 4+ yellow 或 1 red → 3 分

- **WHEN** 13 项中 ≥4 个 yellow 或恰好 1 个 red
- **THEN** `style_naturalness` 基础分为 3

#### Scenario: 2-3 red → 2 分

- **WHEN** 13 项中 2-3 个 red
- **THEN** `style_naturalness` 基础分为 2

#### Scenario: 4+ red → 1 分

- **WHEN** 13 项中 ≥4 个 red
- **THEN** `style_naturalness` 基础分为 1

### Requirement: 向后兼容

新增指标 SHALL 为纯增量，不修改或删除 `punctuation_overuse`、`sentence_pattern_violations[]`、`statistical_profile` 的既有字段。

#### Scenario: punctuation_overuse 保留

- **WHEN** 消费者读取 `anti_ai.punctuation_overuse`
- **THEN** 所有既有字段（`em_dash_count/em_dash_per_kchars/em_dash_zone/ellipsis_count/ellipsis_per_kchars`）MUST 仍然存在且语义不变

#### Scenario: sentence_pattern_violations 保留

- **WHEN** 消费者读取 `anti_ai.sentence_pattern_violations[]`
- **THEN** 分项输出（`pattern_id/pattern_name/severity/count/evidence/detail`）MUST 仍然存在

### Requirement: style-guide Layer 4 三区判定表扩展

style-guide Layer 4 的三区判定表 SHALL 从 7 行扩展到 13 行，覆盖全部新增指标的 green/yellow/red 阈值定义和升级提示。

#### Scenario: 文档一致性

- **WHEN** 开发者查阅 style-guide Layer 4
- **THEN** 表中 MUST 包含 13 项指标的完整三区定义，与 QJ agent prompt 中的阈值一致

### Requirement: quality-rubric 参考更新

quality-rubric 的 `style_naturalness` 维度 SHALL 注明 13 项指标参考和回退说明。

#### Scenario: rubric 文档更新

- **WHEN** 开发者查阅 quality-rubric `style_naturalness` 维度
- **THEN** MUST 能看到 13 项指标的简要列表和"13 → 7 → 4 回退"的说明
