## Why

当前 Quick Start 的试写（Step F）是"自由发挥"模式——没有 L3 章节契约、没有故事线调度、没有伏笔计划。这导致：

1. QualityJudge 无法执行 L3 合规检查（跳过 Track 1 的契约验证）；
2. 试写章与后续正式卷规划之间没有衔接——PlotArchitect 正式规划时不知道前 3 章写了什么，可能产生冲突；
3. 试写质量评估不完整，影响 gate decision 的可靠性。

## What Changes

在 Step E（风格提取）和 Step F（试写）之间插入 Step F0——派发 PlotArchitect 迷你规划模式，为黄金三章生成完整的 L3 契约、故事线调度和伏笔计划。产物放入 `vol-01/`（合并到正式卷），后续 PlotArchitect 正式规划时在已有 Ch1-3 基础上续规 Ch4-30。

## Capabilities

### New Capabilities

- `step-f0-mini-planning`: Quick Start 新增 Step F0，在试写前派发 PlotArchitect 迷你规划生成 3 章 L3 契约 + 故事线调度 + 伏笔计划
- `plot-architect-mini-mode`: PlotArchitect 迷你规划模式（volume=1, chapter_range=[1,3]），输出精简但完整

### Modified Capabilities

- `quick-start-workflow`: 工作流从 A→B→C→D→E→F→G 变为 A→B→C→D→E→F0→F→G；checkpoint resume 映射更新
- `chapter-writer-trial-mode`: 试写章现在有 L3 契约可依循，缺失时回退到自由写作模式
- `quality-judge-trial-mode`: 试写章有 L3 契约时执行完整 L3 合规检查
- `vol-planning-merge`: 正式卷规划新增 merge 逻辑——当 vol-01 有 Ch1-3 契约时，chapter_range 从 4 开始，已有契约只读不覆盖

## Impact

- 修改 5 个文件，无新增运行时文件，无新增依赖：

| File | Change |
|------|--------|
| `skills/start/SKILL.md` | Insert Step F0 between E and F; modify Step F to use vol-01 L3 contracts; update checkpoint resume mapping |
| `agents/plot-architect.md` | Edge Cases: mini-planning mode (chapter_range=[1,3]), compact 3-chapter outline + full L3 contracts + 1-3 seed foreshadows; genre_excitement_map optional injection |
| `agents/chapter-writer.md` | Edge Cases: trial chapters with L3 contracts follow them; missing = fallback to free writing |
| `agents/quality-judge.md` | Edge Cases: trial chapters with L3 contracts trigger full L3 check |
| `skills/start/references/vol-planning.md` | Formal vol planning merge logic: Ch1-3 from F0 preserved, chapter_range starts from 4 |
