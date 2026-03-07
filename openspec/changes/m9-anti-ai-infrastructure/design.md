## Context

支撑设施是整个反 AI 体系的"最后一公里"。在 CS-A1（数据模板）→ CS-A2（方法论）→ CS-A3（Agent prompt）的升级链条中，支撑设施处于末端但决定了实际执行效果：

- **质量评分表**决定门控行为——QualityJudge 按评分表给分，如果表格仍是 4 指标，新增的 3 个统计维度就无法影响评分
- **上下文契约**决定 Agent 能看到什么数据——CW 不知道统计目标就无法约束生成，QJ 没有统计结果就无法验证，CW 不知道类型覆写参数就无法按体裁调整结构规则
- **lint 脚本**提供确定性检测——Agent 是概率性的，lint 是确定性的，是反 AI 体系的"硬底线"。当前缺少结构规则的确定性检测（形容词密度、四字词组密度、段落结构、标点频次由 `anti-ai-polish.md` 定义了量化阈值但无 lint 脚本执行）
- **维护规则**保证长期可持续——黑名单无上限会失控，技法无追踪会重复
- **风格提取**填充数据源头——style-profile 的统计字段如果永远是 null，整个统计维度就是空转
- **评测 schema**支撑回归测试——没有统计特征字段，回归测试无法衡量反 AI 效果

## Goals / Non-Goals

**Goals:**
- quality-rubric §6 与 style-guide Layer 4 的 7 指标三区判定完全对齐，新增 structural_rule_violations 影响评分
- context-contracts 传递统计目标（style-profile → CW）、统计结果（CW/lint → QJ）和类型覆写参数（style-profile/brief → CW）
- lint-blacklist.sh 支持 narration_only 上下文感知，减少对话段落的误报；支持 replacement_hint 输出和 per_chapter_max 频次检测
- 新增 lint-structural.sh 确定性检测 §2.10 六层结构规则中可量化的 4 层（L2 形容词密度 / L3 四字词组密度 / L5 段落结构 / L6 标点频次），支持类型覆写参数输入
- periodic-maintenance 增加黑名单增长控制和技法跨章追踪
- StyleAnalyzer 提取统计字段填充 style-profile（兼容旧 “StyleAnalyzer statistical extraction” 说法）
- eval schema 可记录统计特征用于回归测试

**Non-Goals:**
- 不重写 lint-blacklist.sh 的核心逻辑（仅增加上下文感知层和引号校验）
- 不修改 lint-cliche.sh 或 lint-readability.sh
- 不修改 StyleRefiner Agent prompt（已在 CS-A3 完成）
- 不实现自动化的技法追踪工具（仅定义规则和存储格式）

## Decisions

1) **quality-rubric 三区判定（green/yellow/red）而非数值阈值**
   - 统计范围天然是区间概念（"人类写作 std_dev 落在 8-18"），三区判定与之一致：green = 在人类范围内，yellow = 边缘，red = 明显偏离。比 5 分制的离散评分更直觉，也更容易与 style-guide Layer 4 的检测逻辑对齐。
   - 区间→分数映射：all green = 5, 1-2 yellow = 4, 3+ yellow or 1 red = 3, 2+ red = 2, 4+ red = 1。

2) **lint-blacklist.sh 的 narration_only 实现：中文双引号检测**
   - 中文小说的对话用全角双引号（\u201c\u201d）包裹。检测顶层引号对，引号内文本视为对话，引号外文本视为叙述。嵌套引号（'\u2018\u2019'）内仍属对话上下文，不另行处理。
   - 边界情况：引号跨段落时，以引号的开闭为准而非段落边界。半开引号（缺少闭合）由引号奇偶校验捕获。

3) **中文引号奇偶校验作为附加 warning**
   - 不影响 exit code，不阻断 CI。原因：(a) 作者可能有意使用未闭合引号的特殊排版；(b) 某些引用格式不遵循配对规则。warning 提供信息但不强制。

4) **技法跨章追踪存储在 logs/anti-ai/technique-history.json**
   - 格式：`{ "chapter_id": "vol-01/chapter-001", "techniques_used": ["register_shift", "rhythm_break", ...] }`。periodic-maintenance 读取最近 N 章记录，检查是否同一技法连续 3+ 章出现。
   - 存储在 logs/ 而非 state/ 或 context/，因为这是辅助分析数据而非核心状态。

5) **StyleAnalyzer step 2.5 的统计字段提取（兼容旧 “StyleAnalyzer statistical extraction” 说法）**
   - 数值字段（std_dev, cv）通过对样本文本的句子/段落长度进行统计计算获得——这是确定性计算，LLM 可执行。
   - 枚举字段（volatility, mixing, richness）通过 LLM 定性评估——阅读样本文本后给出 high/medium/low 判断。
   - 所有值为初始估计，后续可由人工微调。

## Risks / Trade-offs

- [Medium] lint-blacklist.sh 中文引号判断不准确（嵌套引号、引号内叙述文、跨段落引号） → Mitigation: 仅顶层引号内文本视为对话；跨段落引号追踪开闭状态；嵌套仍属对话上下文。对于极端边界情况，narration_only 的误报/漏报可接受（对话中的 AI 词汇本就不是高危信号）。
- [Low] 统计字段提取精度依赖 LLM → Mitigation: style-profile 是初始值，可手动微调。数值字段的计算逻辑简单（均值、标准差），LLM 可靠度高。
- [Low] 技法跨章追踪依赖 logs/ 目录存在 → Mitigation: periodic-maintenance 规则中注明首次运行时自动创建目录和空 JSON。
- [Low] legacy 4 指标 fallback 长期共存增加维护负担 → Mitigation: fallback 仅在旧项目中生效，新项目直接使用 7 指标。可在 M10+ 移除 fallback。

## Migration Plan

所有修改向后兼容：

- **quality-rubric**: 旧评分逻辑作为 fallback——当只有 4 个指标可评估时，使用 legacy 5 分制表格
- **context-contracts**: 新增字段均为可选，orchestrator 在 style-profile 字段为 null 时使用人类写作默认范围
- **lint-blacklist.sh**: narration_only 是新增行为，不影响现有 category 的检测逻辑；引号校验是 warning 不阻断
- **periodic-maintenance**: 新增规则，不修改现有规则
- **style-analyzer**: step 2.5 是新增步骤，不影响现有步骤；`world-builder.md` 仅保留兼容说明
- **eval schema**: 新增字段为 optional，现有 labeled data 无需修改

## References

- `skills/novel-writing/references/quality-rubric.md`（质量评分标准）
- `skills/continue/references/context-contracts.md`（上下文契约）
- `scripts/lint-blacklist.sh`（黑名单 lint 脚本）
- `scripts/lint-structural.sh`（新增 — 结构规则 lint 脚本）
- `skills/novel-writing/references/periodic-maintenance.md`（定期维护规则）
- `agents/style-analyzer.md`（StyleAnalyzer Agent — 风格统计提取）
- `agents/style-analyzer.md`（兼容说明：旧设计中的 Mode 7 已迁移到 StyleAnalyzer）
- `eval/schema/labeled-chapter.schema.json`（标注数据 schema）
- `docs/anti-ai-polish.md`（反 AI 润色指南 — lint-structural.sh 的规则来源）
- `skills/novel-writing/references/style-guide.md`（去 AI 化方法论 — Layer 4 七指标 + §2.10 六层规则）
- `templates/style-profile-template.json`（风格指纹模板 — 统计字段定义）
- `templates/ai-blacklist.json`（黑名单 — category_metadata 定义）
