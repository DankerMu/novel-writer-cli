## Context

Agent prompt 是方法论的直接执行层。ChapterWriter 根据约束列表生成文本——每一条 C-编号约束都会影响输出；QualityJudge 根据评审准则对生成文本评分——每一个指标都会影响门控判定。CS-A2 将去 AI 化方法论从"经验规则集"升级为"零配额 + 统计目标 + 技法工具箱 + 多指标评审"体系，但 Agent prompt 中仍然保留着旧范式的痕迹：

- ChapterWriter C11 写着"2-3 次口头禅频率"——这是固定配额，违反零配额原则
- ChapterWriter C12 写着"≥1 个反直觉细节"——同上
- QualityJudge Constraint 3 用 4 个指标评审 `style_naturalness`——CS-A2 已定义 7 指标体系
- 没有统计特征输出——CS-A2 要求 6 维度统计目标，但 QJ 不输出统计数据
- StyleRefiner 的润色流程缺少系统化步骤——`anti-ai-polish.md` 定义了标准化 4 步润色流程和 6 层结构检查，但 StyleRefiner prompt 仍是自由发挥

不同步则方法论升级等于空转。

## Goals

1. ChapterWriter 执行零配额约束 + 统计目标 + 人性化采样 + 对话意图 + 结构密度：去除 C11/C12 中的固定数量，新增 C16（句长方差）/ C17（叙述连接词零容忍）/ C18（技法随机采样）/ C19（对话意图约束）/ C20（结构密度约束），Phase 2 新增步骤 6.5（连接词清除）/ 6.6（修饰词去重）/ 6.7（四字词组密度检查）
2. StyleRefiner 对齐标准化润色流程：执行 §2.12 四步流程（黑名单扫描→结构规则检查→抽象→具体→节奏测试），引用 §2.10 六层结构规则，支持 §2.13 快速检查模式，引用 CS-A1 的 `replacement_hint` 作为替换方向
3. QualityJudge 输出统计特征数据 + 结构违规 + 7 指标评分：`anti_ai` 输出新增 `statistical_profile`、`detected_humanize_techniques`、`structural_rule_violations`，Constraint 3 从 4 指标重写为 7 指标
3. 保持 Agent prompt 的简洁性——引用 style-guide section 编号而非内联完整规则内容

## Non-Goals

- 不修改 StyleRefiner（后处理 Agent 暂不升级，属于后续 changeset）
- 不修改 Summarizer（摘要 Agent 不涉及去 AI 化评审）
- 不修改 context-contracts（CS-A4 范畴）
- 不实现 lint 脚本的统计计算（lint 脚本属于 CS-A1 范畴，QJ 此处做的是自行估算）

## Decisions

1) **ChapterWriter 新约束编号接续现有（C16/C17/C18/C19/C20），不重编号**
   - 现有约束 C1-C15（或 C10-C15 为 anti-AI 相关）已被其他文档引用。重编号会造成级联更新，收益为零。

2) **Phase 2 新步骤插入 6.5/6.6/6.7（在现有步骤 6 "自检" 之后，步骤 7 之前）**
   - 连接词清除、修饰词去重和四字词组密度检查属于微观文本优化，逻辑上在宏观自检之后、最终输出之前执行。

3) **QualityJudge `statistical_profile` 三个字段是 Agent 自行从文本估算的，不依赖外部 lint**
   - QJ 在评审时需要这些数据来做三区判定。如果 lint 脚本已经计算过（通过 instruction packet 传入），则 lint 值覆盖 QJ 估算值。这保证了有无 lint 脚本都能工作。

4) **`detected_humanize_techniques` 是 QJ 识别出的技法 ID 列表**
   - 用于跨章追踪技法分布。如果连续多章使用相同技法子集，说明 C18 的随机采样失效，可在后续审计中发现。

5) **7 指标向后兼容：如果旧评审结果只有 4 指标，仍可使用旧评分表**
   - QJ prompt 中明确写入向后兼容规则。这保护了历史评审数据的可读性。

## Risks

- [Medium] ChapterWriter 新约束增加 prompt 复杂度（C16/C17/C18/C19/C20 + 步骤 6.5/6.6/6.7 = 8 项新增）→ Mitigation: 每项约束/步骤均保持 2-3 行，引用 style-guide section 而非内联规则全文。总 prompt 长度增加约 25-30 行，可接受。
- [Medium] StyleRefiner 四步流程增加执行时间 → Mitigation: 支持快速检查模式（§2.13 五项最小集），时间受限时降级使用。
- [Low] QJ 统计估算不准确（sentence_length_std_dev 等依赖 Agent 对文本的理解）→ Mitigation: lint 脚本结果可覆盖；三区判定本身有容错区间（黄区）。
- [Low] 7 指标与旧 4 指标评分不连续 → Mitigation: 向后兼容模式保留旧表；新项目直接使用 7 指标。

## Migration Plan

Agent prompt 直接更新，无运行时数据迁移。旧评审结果 JSON 中无 `statistical_profile` 和 `detected_humanize_techniques` 字段，不影响历史数据的可读性和可比性。新字段仅出现在使用升级后 QJ 产生的评审结果中。

## References

- `agents/chapter-writer.md` — ChapterWriter Agent prompt（约束 C10-C15 + Phase 2 流程）
- `agents/quality-judge.md` — QualityJudge Agent prompt（Constraint 3 + anti_ai 输出格式）
- `agents/style-refiner.md` — StyleRefiner Agent prompt（润色流程 + 结构检查）
- `docs/anti-ai-polish.md` — 反 AI 润色指南（对话意图 / 结构密度 / 润色流程 / 快速清单的内容源）
- CS-A2 `m9-anti-ai-methodology-upgrade` — 升级后的 style-guide 方法论（零配额 / 6 维度 / 12 技法 / 6 层结构 / 7 指标）
