## Why

CS-A2 升级了去 AI 化方法论：零配额原则取代固定次数约束、6 维度统计目标取代模糊感觉、12 技法人性化工具箱取代散列技巧、7 指标评审取代旧 4 指标表。但 Agent prompt 尚未同步——ChapterWriter 仍然写着"每章 2-3 次口头禅""≥1 个反直觉细节"这类硬编码配额，QualityJudge 仍然用 4 个指标给 `style_naturalness` 打分。Agent 是方法论的直接执行层，方法论升级了而 prompt 不同步，等于升级无效。

## What Changes

1. **ChapterWriter**：
   - C11/C12 去配额化——移除固定数量要求，改为自然分布描述
   - 新增 C16（句长方差约束）：引用 style-profile 的 `sentence_length_std_dev`，禁止连续 3+ 句在 ±5 字符内
   - 新增 C17（叙述连接词零容忍）：`narration_connector` 类词汇在叙述段落中完全禁用（对话中允许）
   - 新增 C18（人性化技法随机采样）：每章从 §2.9 工具箱抽样，跨章变化，不设固定数量
   - 新增 C19（对话意图约束，from anti-ai-polish.md §2.10 L4）：每句对话必须有意图标签（试探/回避/施压/诱导/挑衅/敷衍等），禁止书面语对话、叙述重复、角色语气同质化
   - 新增 C20（结构密度约束，from anti-ai-polish.md §2.10 L2-L3）：形容词每 300 字≤6、四字词组每 500 字≤3 且同段≤2 且禁止连续两个以上
   - Phase 2 新增步骤 6.5（连接词清除扫描）和步骤 6.6（修饰词去重）和步骤 6.7（四字词组密度检查）

2. **StyleRefiner**（新增升级）：
   - 执行流程对齐 §2.12 四步润色流程（黑名单扫描→结构规则检查→抽象→具体转换→节奏朗读测试）
   - 引用 §2.10 六层结构规则作为检查清单
   - 新增快速检查模式：时间受限时执行 §2.13 五项最小清单
   - 引用 `replacement_hint`（CS-A1 新增）作为替换方向参考

3. **QualityJudge**：
   - `anti_ai` 输出新增 `statistical_profile` 子对象（sentence_length_std_dev / paragraph_length_cv / vocabulary_richness_estimate）
   - `anti_ai` 输出新增 `detected_humanize_techniques[]` 数组
   - `anti_ai` 输出新增 `structural_rule_violations[]` 数组（from §2.10 六层规则的违规项）
   - Constraint 3 从 4 指标重写为 7 指标，引用 style-guide Layer 4 三区判定

## Capabilities

### Modified Capabilities

- `chapter-writer-anti-ai-constraints`: C11/C12 去配额化 + 新增 C16/C17/C18/C19/C20 + Phase 2 步骤 6.5/6.6/6.7
- `style-refiner-polish-flow`: 执行流程对齐 §2.12 四步润色 + §2.13 快速检查清单 + replacement_hint 引用
- `quality-judge-anti-ai-evaluation`: anti_ai 输出扩展（statistical_profile + detected_humanize_techniques + structural_rule_violations）+ Constraint 3 从 4 指标升级为 7 指标

## Impact

- 修改 3 个 Agent prompt（`agents/chapter-writer.md`、`agents/quality-judge.md`、`agents/style-refiner.md`）
- 核心行为变更：写作约束逻辑 + 润色执行流程 + 评审评分逻辑
- 不新增运行时文件或依赖
- 不修改 Summarizer、context-contracts
