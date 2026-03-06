## Context

Style guide（`skills/novel-writing/references/style-guide.md`）是整个反 AI 体系的方法论基础，供 ChapterWriter、StyleRefiner、QualityJudge 三个 Agent 共同参考。当前 4 层策略在词汇层面有效——Layer 1 风格锚定 + Layer 2 黑名单注入确实降低了 AI 高频用语出现率。

但在统计特征层面仍暴露明显的 AI 痕迹：

- **句长均匀度**：AI 生成文本的句长标准差显著低于人类写作（AI 倾向于产出长度均匀的句子）
- **段落长度单一性**：AI 段落的变异系数远低于人类（段落长度趋同）
- **词汇分布集中**：AI 的词汇多样性指标偏低（重复使用相同高频词）
- **情感平坦度**：AI 文本的章内情感弧线趋于平坦（缺少人类写作中的情感波动）
- **固定配额可检测**：Layer 2 中"每章至少 1 处反直觉细节"本身成为可被检测的模式——检测工具可以统计"每章恰好 1 次"的分布特征

此外，当前缺少系统化的人性化技法体系。§2.3 的反直觉细节只是 12 种可能的人性化手段之一，且以固定配额方式使用。

`docs/anti-ai-polish.md` 提供了一套体系化的 6 层结构规则和 4 步润色执行流程，覆盖了词汇之外的句式模板、密度控制、对话意图、段落节奏、标点频率等维度，且支持按体裁（科幻/悬疑/恐怖/言情）覆写关键参数。这些内容需要整合入 style-guide 方法论。

## Goals / Non-Goals

**Goals:**
- 消除 style-guide 中所有固定配额（零配额原则），将"至少 N 处""每章 N 次"改为"存在即可，频率自然变化"
- 引入 6 维度统计分布目标，每个维度有"人类范围"参考值，优先读取 style-profile 中 CS-A1 新增的统计字段，缺失时使用通用默认范围
- 提供 12 种人性化技法工具箱，覆盖认知/感官/语言/情感/结构 5 个维度，使用随机采样而非固定数量
- 引入 6 层结构规则体系（from `anti-ai-polish.md`）：反模板句式、形容词密度、四字词组密度、对话意图、段落结构、标点节奏，含具体量化阈值
- 引入类型覆写机制：科幻/悬疑/恐怖/言情可覆写段落结构和标点节奏参数（标注 `⚙️ 可覆写` 的规则）
- 定义 4 步标准化润色执行流程（黑名单扫描→结构检查→抽象转具体→节奏测试）+ 5 项快速检查清单
- 将 Layer 4 从 4 指标 5 分制表格扩展为 7 指标三区（green/yellow/red）判定，更直观且与统计范围对齐

**Non-Goals:**
- 不修改 Agent prompt（属 CS-A3 范畴）
- 不修改 quality-rubric.md（属 CS-A4 范畴）
- 不实现自动化检测脚本（属 CS-A4 范畴）
- 不修改 ai-blacklist.json 或 style-profile-template.json（前者不变，后者属 CS-A1）

## Decisions

1) **零配额原则**
   - 所有"至少 N 处""每章 N 次"改为"存在即可，频率自然变化"。理由：固定配额本身是可被检测的模式。人类写手从不会"每章恰好写 1 处反直觉细节"——他们有时写 3 处，有时不写。

2) **12 种技法覆盖 5 个维度**
   - 认知（thought_interrupt, self_correction）、感官（sensory_intrusion, mundane_detail）、语言（dialect_slip, incomplete_sentence, rhetorical_question）、情感（stream_of_consciousness, emotional_non_sequitur, contradiction）、结构（nested_parenthetical, abrupt_topic_shift）。避免单维度过度使用——如果只有"反直觉细节"一种技法，AI 会反复使用同一模式。

3) **6 层结构规则体系（from anti-ai-polish.md）**
   - **为什么需要 6 层**：词汇黑名单（Layer 1-2）只解决"用了什么词"的问题，不解决"如何组织句子和段落"。四字词组连用、段落长度均匀、标点过度使用是 AI 写作最明显的结构性特征，需要独立的规则层来约束。
   - **量化阈值来源**：阈值基于网文平台（番茄为基线）的人类作者统计分布，由 `anti-ai-polish.md` 研究提供。
   - **可覆写原则**：标注 `⚙️ 可覆写` 的规则支持按体裁调整——科幻允许更长段落（到 120 字），恐怖允许更多单句段（到 50%），悬疑允许更多省略号（到 8 个/章）。覆写值优先从 `brief.md` 中显式写出的“类型覆写”说明读取，缺失时回退到题材字段。

4) **对话意图系统**
   - 每句对话必须有至少一种意图标签（试探/回避/施压/诱导/挑衅/敷衍/传达信息/请求/承诺/拒绝等）。这不是机械标注——是写作检查项：如果一句对话找不到意图，说明它是填充对话，应删除或重写。
   - 三条硬性禁令：(a) 对话中使用书面表达（除非角色身份要求），(b) 对话与叙述重复（刚描写完的事件角色又口述一遍），(c) 所有角色语气同质化（去掉对话标签应能区分说话人）。

5) **4 步润色执行流程**
   - 定义 StyleRefiner 的标准化执行顺序：黑名单扫描（按 `ai-blacklist.json` 全量 14 个 categories 对照）→ 结构规则检查（6 层逐项）→ 抽象转具体（情绪直述→身体反应，通用比喻→专属意象）→ 节奏朗读测试（检测连续同节奏、逻辑词堆砌、描写过长）。
   - 快速检查清单（时间有限时的 5 项最小集）：四字词组连用 / 情绪直述 / 微微系列 / 缓缓系列 / 标点过度。

3) **Layer 4 从 5 分制改为三区判定**
   - 5 分制表格存在两个问题：(a) 阈值固定，不同风格的合理范围不同；(b) 整数评分粒度太粗。三区判定（green=人类范围 / yellow=边界 / red=AI 特征）更直观，且每个区间可以是范围而非精确阈值，与统计分布自然对齐。

4) **style-profile 优先，通用默认兜底**
   - 6 维度的目标范围优先从 style-profile.json 已落地的顶层字段读取（CS-A1 当前使用平铺 schema，而非嵌套 `statistical.*` 对象），例如 `sentence_length_std_dev`、`paragraph_length_cv`、`register_mixing`、`emotional_volatility`。
   - `narration_connectors` 当前没有独立统计字段，使用 `writing_directives` + 黑名单类别作为代理锚点；`vocabulary_diversity` 在数值字段缺失时使用 `vocabulary_richness` 作为枚举代理。
   - 当 style-profile 缺失这些字段时（旧项目未跑过 CS-A1 的 StyleAnalyzer），使用基于人类写作语料统计的通用默认范围或枚举目标。

5) **向后兼容：4 指标降级模式**
   - 如果某次检测只能获取旧的 4 个指标（例如检测脚本尚未升级），Layer 4 退回使用旧的 5 分制评分表。新旧表并存于 style-guide 中，明确标注适用条件。

## Risks / Trade-offs

- [Medium] 去配额化可能导致某些章节完全没有人性化技法 → **Mitigation**: QualityJudge 的 `humanize_technique_variety` 指标检测到 0 时给出 yellow 提示（不阻断生成，但提醒 StyleRefiner 注意）；只有与其他红区指标叠加时才升级为 red。这在 CS-A4 中实现，本 changeset 仅在方法论层面定义指标含义。
- [Low] 12 种技法可能不够用 → **Mitigation**: 工具箱设计为可扩展列表，未来可追加新技法。当前 12 种已覆盖文学理论中的主流人性化手段。
- [Low] 三区判定的阈值设定可能需要校准 → **Mitigation**: 初始阈值基于人类写作语料统计（参考文献中的均值 ± 1σ / ± 2σ），后续可通过 `calibrate-quality-judge.sh` 回归运行微调。

## Migration Plan

`style-guide.md` 直接覆盖更新，但旧项目可分阶段升级：没有新统计字段时先使用枚举代理与 Legacy Fallback；无需立即整库重评历史章节；Agent prompt 与 QualityJudge 输出字段仍在后续 CS-A3 / CS-A4 中同步更新（§2.3 语义变化、新增 §2.8 和 §2.9）。

## References

- `skills/novel-writing/references/style-guide.md`（本 changeset 唯一修改目标）
- `docs/anti-ai-polish.md`（6 层结构规则、类型覆写、润色流程、快速清单的内容来源）
- `templates/style-profile-template.json`（CS-A1 扩展的统计字段，本 changeset 只读引用）
- `templates/ai-blacklist.json`（不修改，但 Layer 4 继续引用）
- `agents/style-refiner.md`、`agents/chapter-writer.md`、`agents/quality-judge.md`（消费方，CS-A3 更新）
- `skills/novel-writing/references/quality-rubric.md`（CS-A4 更新）
