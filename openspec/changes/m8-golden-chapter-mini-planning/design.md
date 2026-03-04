## Context

Quick Start 工作流 A→G 中，Step E 提取风格指纹，Step F 试写 3 章并评估。但 F 缺乏 L3 契约支撑，QualityJudge 只能做通用评估（L1/L2 + 8 维度），无法验证情节契约合规。试写产物与后续正式卷规划之间也没有衔接——PlotArchitect 做正式规划时不知道前 3 章的情节走向，可能产生冲突或重复。

## Goals / Non-Goals

**Goals:**
- 为黄金三章提供完整的 L3 契约支撑，使 QualityJudge 可执行 Track 1 合规检查
- 产物放入 vol-01 以便正式规划时无缝衔接（Ch1-3 已有契约，正式规划从 Ch4 续规）
- 保持 Quick Start 的轻量感——迷你规划只生成 3 章，不做完整 30 章规划

**Non-Goals:**
- 不替代正式卷规划（Step F0 是精简版，正式规划仍在 continue 工作流中触发）
- 不要求用户手动审核 L3 契约（自动生成，Quick Start 阶段优先速度）
- 不修改正式卷规划的完整流程（只新增 merge 逻辑处理已有 Ch1-3）

## Decisions

1) **vol-01 而非 vol-00**
   - 黄金三章就是正式第一卷的前 3 章，不需要单独的"试写卷"
   - 避免后续迁移成本（vol-00 的内容最终还是要搬进 vol-01）
   - PlotArchitect 正式规划时直接在 vol-01 基础上续规，无需跨卷合并

2) **mini-planning 模式**
   - PlotArchitect 收窄 chapter_range=[1,3]，输出精简但完整
   - 产出物：outline.md（3 章）、storyline-schedule.json、foreshadowing.json、3 个 L3 章节契约
   - 使用与正式规划相同的 L3 schema（含 excitement_type，依赖 CS2），只是范围小

3) **Merge 策略——正式规划从 Ch4 开始**
   - 正式规划检测到 vol-01 已有 Ch1-3 契约时，chapter_range 从 4 开始
   - outline.md 追加到已有 3 章大纲之后
   - 已有 Ch1-3 契约只读不写，避免覆盖 F0 产出
   - storyline-schedule.json 和 foreshadowing.json 做增量合并（追加新条目）

4) **1-3 个种子伏笔**
   - 迷你模式不需要完整伏笔网络，但提供种子让 Ch1-3 有铺垫素材
   - 种子伏笔在正式规划时被纳入完整伏笔网络，不会丢失

5) **genre_excitement_map 可选注入**
   - 如果 CS4 的 genre→excitement 映射模板存在，PlotArchitect 按题材分配 excitement_type
   - 不存在则由 PlotArchitect 根据情节需要自由分配
   - 这保证 CS5 不硬依赖 CS4，但能从中受益

## Risks / Trade-offs

- [Medium] F0 生成的 L3 契约质量可能不如正式规划（3 章信息量有限）→ Mitigation: 迷你模式仍使用完整的 L3 schema，只是范围收窄；正式规划时可在 Ch1-3 基础上调整后续章节，不需要修改 Ch1-3 契约
- [Low] Merge 冲突（F0 产物与正式规划不一致）→ Mitigation: 正式规划明确从 Ch4 开始，Ch1-3 只读不写；storyline-schedule 和 foreshadowing 做增量追加而非覆盖
- [Low] Quick Start 流程变长（多一步）→ Mitigation: F0 只生成 3 章的规划，单次 PlotArchitect 调用，成本可控

## Migration Plan

现有项目 checkpoint `quick_start_step="E"` 进入 F0（新行为，无需手动迁移）。已通过 F 的项目不受影响（checkpoint 在 F 之后，不会回退到 F0）。无需修改已有 vol-01 目录结构——如果 vol-01 已存在但无 L3 契约，F0 正常生成；如果已有契约（不太可能），F0 跳过。
