## Why

当前反 AI 策略以词汇黑名单（40 词 7 类）和标点限频为核心。朱雀等 AI 检测工具通过统计特征（困惑度、句长方差、词汇分布、语义熵）识别 AI 文本，而 `style-profile-template.json` 缺少统计特征字段，无法为后续的生成约束和质量评估提供数据基础。

黑名单同样存在覆盖盲区：

- 缺少"按上下文区分"的分类——"然而""不过"等词在叙述段落中是 AI 信号，但在对话中属于自然用语
- 遗漏了 AI 定型段首（"此刻""就在这时"）和过度打磨的过渡短语（"随着时间的推移""正当...之际"）
- 无增长上限，黑名单可能无节制膨胀

核心设计原则：绝不使用固定配额（"每章至少 N 次"）——配额本身就是可检测的模式。使用**统计范围**（人类写作落在 X-Y 区间）和**随机采样**。

## What Changes

1. **style-profile-template.json** 新增 5 个 nullable 统计字段（句长标准差、段落长度变异系数、情感波动性、语域混合度、词汇丰富度），插入在 `sentence_length_range` 之后。所有字段 nullable，旧项目无需迁移。

2. **ai-blacklist.json** 从约 40 条扩展到 10 类 200+ 条（对齐 `docs/anti-ai-polish.md` 的 10 类词表）：
   - 新增 7 个分类：`narration_connector`（仅叙述文禁止，对话中允许）、`paragraph_opener`（AI 定型段首）、`smooth_transition`（过度打磨的过渡）、`summary_word`（总结概括词）、`enumeration_template`（枚举模板词）、`academic_tone`（学术腔/书面腔）、`abstract_filler`（抽象空词）
   - 扩展现有分类：`emotion_cliche` +8（含百感交集/心如刀割等）、`expression_cliche` +4、`action_cliche` +6（含微微一笑/缓缓开口/深吸一口气等）、`environment_cliche`（新增环境套话：月光如水/微风拂面等）、`narrative_filler`（叙事填充词：就这样/于是乎/只见/但见等）
   - 新增 `max_words: 250` 增长上限字段（200+ 条 + ~25% 余量）
   - 新增 `category_metadata` 支持 `narration_only` 上下文和 `per_chapter_max` 频次限制
   - 每条词汇附 `replacement_hint` 替换方向（从 `anti-ai-polish.md` 的替换方向列提取）
   - 更新 `schema_version` 和 `update_log`

## Capabilities

### New Capabilities

- `statistical-style-profiling`: style-profile 中的 5 个统计特征字段（句长标准差、段落变异系数、情感波动性、语域混合度、词汇丰富度），为下游 Agent 提供统计维度的风格锚定数据
- `narration-context-blacklist`: 按上下文区分的黑名单分类（`narration_connector` 仅在叙述段落中触发，对话段落不标记）
- `replacement-hints`: 每条黑名单词汇附带替换方向提示，供 StyleRefiner 参考
- `frequency-caps`: 部分词汇支持 `per_chapter_max` 频次限制（如"深吸一口气"每章最多 1 次）

### Modified Capabilities

- `style-profile`: 新增 5 个 nullable 统计字段，StyleAnalyzer 提取填充，ChapterWriter/StyleRefiner 读取
- `ai-blacklist`: 从 7 类约 40 条扩展到 10 类 200+ 条（对齐 anti-ai-polish.md），新增增长上限 `max_words: 250`、`replacement_hint`、`per_chapter_max`

## Impact

- 修改 2 个模板文件（`templates/style-profile-template.json`、`templates/ai-blacklist.json`）
- 不修改 Agent prompt（Agent 层面的消费逻辑由后续 CS-A2/A3 处理）
- 不修改 lint 脚本逻辑（由后续 CS-A4 处理）
- 不新增运行时文件或依赖
- 不破坏现有项目（所有新增字段 nullable，缺失时下游使用默认范围）
