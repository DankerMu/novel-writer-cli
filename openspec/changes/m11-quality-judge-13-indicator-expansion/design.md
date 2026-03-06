## Context

QualityJudge 当前 `anti_ai.indicator_breakdown` 输出 7 项指标，每项含 `value/zone/note`，用于 `style_naturalness` 维度的三区判定评分。m10 changeset 新增了句式模式检测（`sentence_pattern_violations[]`）和破折号零容忍（`punctuation_overuse.em_dash_zone`），但这些结果停留在独立输出对象中，未参与统一的三区判定体系。

此外，style-guide 已定义但 QJ 未量化输出的维度包括：`像+具体意象` 比喻限频（§2.1）、对话区分度（§2.10 L4）、省略号/感叹号频率（§2.6）。

## Goals / Non-Goals

**Goals:**
- 将 `indicator_breakdown` 从 7 项扩展到 13 项，所有维度统一 `value/zone/note` 三区输出
- 定义 `indicator_mode: "13-indicator"` 为新默认，`"7-indicator"` 为中间回退
- 保持 `punctuation_overuse` / `sentence_pattern_violations[]` 原有输出结构不变（向后兼容）
- 更新 `style_naturalness` 评分映射：从 7 项三区 → 13 项三区

**Non-Goals:**
- 不改变 `sentence_pattern_violations[]` 的分项输出结构（仍保留 pattern_id/evidence/detail）
- 不新增外部统计工具依赖（13 项均由 QJ 基于正文 LLM 估算或现有 lint 输入）
- 不修改 ChapterWriter / StyleRefiner 的约束（它们已有对应规则，本次只补 QJ 的量化输出）
- 不改变 `overall` 加权公式或门控阈值

## Decisions

### D1: 新增 6 项指标选择

从已有规则/检测结果中提升 4 项，新建 2 项：

| # | 指标 ID | 来源 | 理由 |
|---|---------|------|------|
| 8 | `em_dash_count` | `punctuation_overuse.em_dash_count` | 已有检测，零容忍是最硬约束，应在 indicator 层面直接可见 |
| 9 | `sentence_pattern_score` | `sentence_pattern_violations[]` 聚合 | 已有分项数据，缺汇总 zone；聚合后可直接参与三区判定 |
| 10 | `simile_density` | 正文扫描 `像+具体意象` | style-guide §2.1 有 ≤1/千字规则，但 QJ 无对应输出 |
| 11 | `dialogue_distinguishability` | LLM 估算 | style-guide L4 有"去标签辨识度"自测要求，应量化 |
| 12 | `ellipsis_density` | `punctuation_overuse.ellipsis_count` 换算 | §2.6 有 0-2/千字规则，应进入三区 |
| 13 | `exclamation_density` | 正文扫描感叹号 | §2.6 有 0-3/千字规则，应进入三区 |

**备选方案**：把 `idiom_density`（四字词组密度）也加入。**决定不加**——四字词组规则是结构规则（L3），更偏向 `structural_rule_violations[]` 的检查项而非统计指标，且"每 500 字 ≤3"的窗口检查不适合 per-kchars 的统一口径。

### D2: 三区阈值定义

| 指标 | green | yellow | red | 依据 |
|------|-------|--------|-----|------|
| `em_dash_count` | 0 | — | >0 | 零容忍，无 yellow 区间 |
| `sentence_pattern_score` | 0 high + ≤2 medium | >2 medium + 0 high | ≥1 high | 与 style-guide L7 severity 对齐 |
| `simile_density` | ≤1/千字 | 1-2/千字 | >2/千字 | style-guide §2.1 like_simile_rule |
| `dialogue_distinguishability` | high | medium | low | 对应"去标签后可/勉强可/不可辨识" |
| `ellipsis_density` | 0-2/千字 | 2-3/千字 | >3/千字 | style-guide §2.6 |
| `exclamation_density` | 0-3/千字 | 3-5/千字 | >5/千字 | style-guide §2.6 |

### D3: 回退层级（三档）

```
13-indicator（默认）
  ↓ 当 simile_density / dialogue_distinguishability 无法可靠估算时
7-indicator（中间回退）
  ↓ 当 sentence_length_std_dev / paragraph_length_cv 等基础统计也无法获取时
4-indicator-compat（legacy 回退）
```

回退触发条件：
- 13 → 7：正文过短（<500 字）导致比喻/对话样本不足，或 `ai_sentence_patterns` 未提供
- 7 → 4：正文破损或 style_profile 缺失（既有逻辑不变）

### D4: 评分映射更新

13 项三区判定 → `style_naturalness` 1-5 分映射：

| 条件 | 分数 |
|------|------|
| 全 green | 5 |
| 1-3 个 yellow，余下 green | 4 |
| 4+ 个 yellow，或恰好 1 个 red | 3 |
| 2-3 个 red | 2 |
| 4+ 个 red | 1 |

与现有 7 项映射规则一致（style-guide Layer 4），只是分母从 7 扩到 13。

### D5: 向后兼容

- `punctuation_overuse` 对象保留原有字段（`em_dash_count/em_dash_per_kchars/em_dash_zone/ellipsis_count/ellipsis_per_kchars`）
- `sentence_pattern_violations[]` 保留分项输出
- `statistical_profile` 保留 3 个 legacy 字段
- 新增指标是纯增量，消费者若只读前 7 项仍可正常工作

## Risks / Trade-offs

- **[LLM 估算一致性]** `dialogue_distinguishability` 依赖 LLM 主观判断，不同模型/run 之间可能波动 → 通过明确评估口径（"去掉对话标签后，仅凭语气/用词/句式能否分辨说话人"）和三档枚举（high/medium/low）降低波动
- **[指标膨胀]** 13 项可能让单个 red 的影响被稀释 → 保留 `em_dash_count` 的"无 yellow 直接 red"设计，且 sentence_pattern_score 的 high 命中仍独立触发至少降 1 分的叠加扣分
- **[回退复杂度]** 三档回退增加判断分支 → 触发条件明确且单向递降，实际只多一个 if 分支
