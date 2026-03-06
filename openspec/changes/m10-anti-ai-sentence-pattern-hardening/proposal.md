## Why

实际写作验证发现 anti-AI gate 有三个盲区：

1. **"像xxxx" 比喻泛滥** — 黑名单 `simile_cliche` 仅 3 条词汇级匹配（宛如/恍若/仿佛置身于），无法覆盖 `像一根绷紧的弦` 这类 `像+具体意象` 结构
2. **AI 句式模式逃逸** — 解释型旁白、模板转折、抽象判词、管理腔、重复解释等是**结构级**特征，现有 6 层规则（L1-L6）全部是文本表面特征，无法命中
3. **破折号约束不够硬** — 当前为"限频"（≤1/千字），用户要求**零容忍**

## What Changes

1. **新增 `templates/ai-sentence-patterns.json`**：定义 8 种结构级 AI 句式模式（SP-01 ~ SP-08），每种模式含 id / name / description / examples / replacement_strategy / severity / per_chapter_max
2. **扩充 `templates/ai-blacklist.json`**：`simile_cliche` 类别新增 8-10 个"像"字比喻词条；新增 `category_metadata.simile_cliche.like_simile_rule` 限频规则；版本升级至 `2.1.0`
3. **style-guide 新增 L7**：§2.10 新增第 7 层"句式模式检测"，引用 `ai-sentence-patterns.json`；§2.6 破折号改为零容忍；L6 破折号改为 0/章；§2.9 `thought_interrupt` 去除破折号示例；§2.12 Step 2 追加 L7 检查；§2.1 补充"像"字限频
4. **ChapterWriter 新增 C21/C22**：句式模式禁止 + 通用比喻限频
5. **StyleRefiner 新增 Constraint 11/12**：比喻限频 + 句式模式后处理；破折号改为零容忍
6. **QualityJudge 扩展 anti_ai**：新增 `sentence_pattern_violations[]`；破折号 red 阈值降为 >0
7. **Quality Rubric 补充扣分规则**：`style_naturalness` 纳入句式模式命中扣分

## Capabilities

### New Capabilities

- `sentence-pattern-detection`: 8 种结构级 AI 句式模式定义与检测（L7 层）
- `like-simile-frequency-control`: `像+具体意象` 比喻限频规则（≤1/千字），排除非比喻义

### Modified Capabilities

- `em-dash-policy`: 从限频（≤1/千字）升级为零容忍（0 处/章），包括 thought_interrupt 场景
- `simile-cliche-blacklist`: 从 3 条扩展至 11+ 条，覆盖"像"字比喻高频模式
- `quality-scoring`: style_naturalness 纳入句式模式命中扣分因子

## Impact

- 新增 1 个文件：`templates/ai-sentence-patterns.json`
- 修改 6 个文件：`templates/ai-blacklist.json`、`skills/novel-writing/references/style-guide.md`、`skills/novel-writing/references/quality-rubric.md`、`agents/chapter-writer.md`、`agents/style-refiner.md`、`agents/quality-judge.md`
- 不修改运行时代码或 CLI 逻辑
- 破折号零容忍为**不兼容变更**：已有章节若含破折号将在重评时触发更严格扣分
