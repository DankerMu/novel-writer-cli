## Why

CS-A1 升级了数据模板（统计字段、黑名单扩展），CS-A2 升级了方法论（7 指标、12 技法、零配额），CS-A3 升级了 Agent prompt（消费统计字段、三区判定、技法追踪）。但支撑设施尚未同步——这些设施决定了数据如何流动、质量如何门控、检测如何执行：

- **质量评分表**仍用 4 指标 5 分制，与 style-guide Layer 4 的 7 指标三区判定不一致
- **上下文契约**不传递统计目标（CW 不知道目标值）和统计结果（QJ 无法验证）
- **lint 脚本**不支持 `narration_only` 上下文区分（CS-A1 定义了 `category_metadata` 但 lint 未消费），且缺少中文引号配对校验
- **维护规则**没有黑名单增长上限的执行规范，也没有人性化技法的跨章追踪机制
- **风格提取**（当前仓库由 StyleAnalyzer 承担；旧设计文档曾称 “StyleAnalyzer statistical extraction”）不提取统计字段，style-profile 的统计维度永远是 null
- **评测 schema** 无法记录统计特征，回归测试缺少反 AI 维度的数据基础

核心设计原则不变：零配额、统计范围、随机采样。

## What Changes

1. **quality-rubric §6 style_naturalness**：从 4 指标 5 分制表格改为 7 指标三区（green/yellow/red）评分，附区间→分数映射。保留 legacy 4 指标 fallback。新增 `structural_rule_violations` 子分数（对齐 §2.10 六层规则违规数量对评分的影响）。

2. **context-contracts**：CW manifest 新增 `inline.statistical_targets`（6 维统计目标，从 style-profile 提取）；QJ manifest 新增 `inline.statistical_profile`（CW 自报或 lint 产出的统计结果）；CW manifest 新增 `inline.genre_overrides`（从 brief.md 的显式覆写说明 / 题材字段提取的类型覆写参数）。

3. **lint-blacklist.sh**：支持 `narration_only` 上下文感知（检测中文双引号判断对话段落，跳过引号内文本的 narration_only 类词汇）；新增中文引号奇偶校验（warning，不阻断）；新增 `replacement_hint` 输出（lint 报告中附带替换方向）；新增 `per_chapter_max` 频次检测（超出限频的词汇报告为 warning）。

4. **lint-structural.sh（新增）**：确定性结构规则 lint 脚本（from `anti-ai-polish.md` §2.10），检测：
   - L2 形容词/副词密度（每 300 字窗口）
   - L3 四字词组密度（每 500 字窗口 + 连续检测 + 段内检测）
   - L5 段落结构（单句段占比 / 段长分布 / 连续同长度检测）
   - L6 标点频次（省略号/感叹号/破折号计数 + 连用检测）
   - 支持类型覆写参数输入（从 brief.md 的“覆写说明” / “题材”字段读取阈值）

5. **periodic-maintenance**：新增 max_words=250 上限执行规则（超出需人工审批）；新增人性化技法跨章追踪（同一技法连续 3 章以上触发告警）。

6. **StyleAnalyzer step 2.5**：从样本文本提取 5 个统计字段填充 style-profile（sentence_length_std_dev、paragraph_length_cv、emotional_volatility、register_mixing、vocabulary_richness）。

7. **eval schema**：labeled-chapter.schema.json 新增可选 `anti_ai_statistical_profile` 子对象（sentence_length_std_dev、paragraph_length_cv、vocabulary_richness_estimate），新增可选 `structural_rule_violations` 数组，支撑回归测试的反 AI 维度。

## Capabilities

### Modified Capabilities

- `quality-rubric`: §6 style_naturalness 从 4 指标 5 分制升级为 7 指标三区评分 + structural_rule_violations 子分数
- `context-contracts`: CW manifest 新增 statistical_targets + genre_overrides、QJ manifest 新增 statistical_profile
- `lint-blacklist`: 支持 narration_only 上下文感知 + 中文引号校验 + replacement_hint 输出 + per_chapter_max 频次检测
- `lint-structural`（新增）: 确定性结构规则 lint（形容词密度/四字词组密度/段落结构/标点频次 + 类型覆写支持）
- `periodic-maintenance`: max_words 上限执行 + 技法跨章追踪
- `style-analyzer-style-extraction`: step 2.5 提取统计字段（兼容旧 “StyleAnalyzer statistical extraction” 说法）
- `eval-schema`: 新增可选 anti_ai_statistical_profile + structural_rule_violations

## Impact

- 修改 7 个文件（quality-rubric.md、context-contracts.md、lint-blacklist.sh、periodic-maintenance.md、style-analyzer.md、world-builder.md、labeled-chapter.schema.json）
- 新增 1 个文件（`scripts/lint-structural.sh` — 结构规则确定性 lint 脚本）
- 不新增 Agent
- 不新增运行时依赖
- 所有修改向后兼容（新字段可选、legacy fallback 保留、warning 不阻断）
