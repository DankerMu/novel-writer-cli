## Context

当前反 AI 策略以词汇黑名单和标点限频为核心。`templates/ai-blacklist.json` 包含 7 个分类共约 40 个词条，`templates/style-profile-template.json` 提供句长均值、句长范围、对话占比等结构化风格指纹。

朱雀等 AI 检测工具使用的统计特征维度（句长方差、段落长度一致性、词汇分布、情感一致性）在系统中无对应数据结构。黑名单的分类虽支持 severity 分级概念，但缺少"按上下文区分"的能力——`narration_connector` 类词汇（"然而""不过""因此"）在叙述中是 AI 信号但在对话中属于自然用语。此外，AI 定型段首和过度打磨的过渡短语两个维度完全未覆盖。

## Goals / Non-Goals

**Goals:**
- 为 style-profile 增加可量化的统计特征字段，覆盖句长方差、段落变异系数、情感波动性、语域混合度、词汇丰富度五个维度
- 扩展黑名单覆盖范围和分类维度，从 7 类约 40 条增至 10 类 200+ 条（对齐 `docs/anti-ai-polish.md` 的 10 类词表）
- 引入黑名单增长上限（`max_words: 250`），防止无节制膨胀
- 每条词汇附 `replacement_hint` 替换方向，供 StyleRefiner 参考
- 部分词汇支持 `per_chapter_max` 频次限制（如"深吸一口气"≤1 次/章）
- 所有新增均向后兼容，旧项目零迁移成本

**Non-Goals:**
- 不修改 Agent prompt 或方法论（由后续 CS-A2/A3 负责）
- 不改变 lint 脚本逻辑（由后续 CS-A4 负责）
- 不实现统计特征的自动提取算法（由 StyleAnalyzer Agent 在运行时负责）
- 不实现 `narration_connector` 的上下文感知 lint 逻辑（由后续 CS-A4 负责）

## Decisions

1) **5 个统计字段全部 nullable**
   - 旧项目无需迁移。新项目由 StyleAnalyzer 在分析样本文本时填充。下游 Agent 遇 null 值时使用人类写作的默认统计范围。

2) **数值型字段 vs 枚举型字段的划分**
   - `sentence_length_std_dev`（句长标准差）和 `paragraph_length_cv`（段落长度变异系数）为精确数值，StyleAnalyzer 可从样本文本直接计算。
   - `emotional_volatility`（情感波动性）、`register_mixing`（语域混合度）、`vocabulary_richness`（词汇丰富度）为定性评估，使用 `high | medium | low` 枚举。这三个维度的精确量化需要 NLP 工具链支持，当前阶段用枚举降低实现门槛，后续可扩展为数值型。

3) **`narration_connector` 分类引入上下文元数据**
   - 在 `categories` 中新增 `narration_connector` 分类，同时在 `category_metadata` 中标注 `context: "narration_only"`。相同词汇在叙述段落 vs 对话段落有不同处理。lint 脚本的上下文感知逻辑由 CS-A4 实现，本 changeset 仅定义数据结构。

4) **分类体系（对齐 anti-ai-polish.md 的 10 类 + 额外细分类）**
   - v1 模板原有 7 类：`emotion_cliche`、`expression_cliche`、`action_cliche`、`transition_cliche`、`simile_cliche`、`time_cliche`、`thought_cliche`
   - v2 保证 `docs/anti-ai-polish.md` 的 10 类全部在 `categories` 中可用：`summary_word`、`enumeration_template`、`academic_tone`、`narration_connector`、`emotion_cliche`、`action_cliche`、`environment_cliche`、`narrative_filler`、`abstract_filler`、`mechanical_opening`
   - 同时新增更细粒度的补充分类（如 `paragraph_opener`、`smooth_transition`、`expression_cliche`），便于 lint/提示和后续扩展。

5) **`replacement_hint` 字段**
   - 每条词汇新增必填 `replacement_hint` 字符串，从 `anti-ai-polish.md` 的"替换方向"列提取。供 StyleRefiner 在润色时参考具体替换策略。
   - 示例：`{ "word": "感到震惊", "replacement_hint": "用身体反应代替：握拳、瞳孔收缩" }`

6) **`per_chapter_max` 频次限制**
   - 部分词汇不是绝对禁止，而是限频使用。新增可选 `per_chapter_max` 字段：
   - `"深吸一口气": { "per_chapter_max": 1 }`
   - `"只见/但见": { "per_chapter_max": 2 }`
   - `"眉头微皱/眉头紧锁": { "per_chapter_max": 1 }`
   - `"脚步一顿/身形一滞": { "per_chapter_max": 1 }`

7) **`max_words: 250` 增长上限**
   - 当前约 40 条，扩展后 200+ 条，250 上限留有约 25% 余量。超出 250 需人工审批。

## Risks / Trade-offs

- [Low] 统计字段初始值为 null，下游 Agent 可能未正确处理 → Mitigation: spec 明确要求 null 时使用人类写作默认范围；Agent prompt 更新在 CS-A2/A3 中处理。
- [Low] `narration_connector` 在 lint 未实现上下文感知前，全局禁止可能误伤对话 → Mitigation: 这些词仅在 `categories` 中标记，`words` 扁平列表中不包含 `narration_connector` 独有的词（对话中合理使用的词不放入全局 `words`）。CS-A4 实现上下文感知后再合并。
- [Medium] 200+ 条黑名单可能过度约束创作自由 → Mitigation: `whitelist` 机制已存在；`per_chapter_max` 支持限频而非绝对禁止；`replacement_hint` 提供替换方向而非空白禁令；`max_words` 上限防止无节制膨胀。

## Migration Plan

无需迁移。`style-profile-template.json` 新增字段全部 nullable，旧项目不受影响。`ai-blacklist.json` 的 `max_words`、`category_metadata`、`replacement_hint`、`per_chapter_max` 为新增字段；对只消费 `words[]` 的逻辑保持兼容。

## References

- `templates/style-profile-template.json`（风格指纹模板）
- `templates/ai-blacklist.json`（AI 高频用语黑名单）
- `docs/anti-ai-polish.md`（反 AI 润色指南 — 10 类 200+ 词表来源）
- `skills/novel-writing/references/style-guide.md`（去 AI 化四层策略）
- `agents/style-analyzer.md`（StyleAnalyzer Agent — 统计特征提取）
- `agents/style-refiner.md`（StyleRefiner Agent — 去 AI 化润色）
