## Why

当前 `novel` CLI 的 Step 类型系统仅覆盖章节写作流水线（draft→summarize→refine→judge→commit），无法表达卷规划（volume planning）、冷启动（quick-start）、卷回顾（volume review）等非章节步骤。`orchestrator_state` 字段在 checkpoint 中为可选且语义模糊，导致 `computeNextStep()` 依赖大量隐式推断，难以扩展新流水线。

本 changeset 是后续三条流水线（CS-O2/O3/O4）的共同基础：扩展 Step union type，将 `orchestrator_state` 升级为必选的 7 值枚举，并为旧 checkpoint 提供 legacy inference 兼容层，使 `computeNextStep()` 可按 state 分发路由而非条件堆叠。

## What Changes

- 扩展 `Step` union type：新增 `VolumeStep`（outline/validate/commit）、`QuickStartStep`（world/characters/style/trial/results）、`ReviewStep`（collect/audit/report/cleanup/transition），保持现有 `ChapterStep` 不变。
- 将 `orchestrator_state` 从可选 string 升级为必选 7 值枚举：`INIT | QUICK_START | VOL_PLANNING | WRITING | CHAPTER_REWRITE | VOL_REVIEW | ERROR_RETRY`。
- 添加 legacy inference 函数：对缺少 `orchestrator_state` 的旧 checkpoint，根据现有字段推断状态值。
- 重构 `computeNextStep()` 为 state-based routing：按 `orchestrator_state` 分发到对应流水线的 next-step 逻辑。

## Impact

- 涉及文件：`src/steps.ts`、`src/checkpoint.ts`、`src/next-step.ts`、`src/cli.ts`
- 风险等级：medium — 修改核心类型定义，需确保现有章节流水线行为不变
- 依赖：无（基础设施层，被 CS-O2/O3/O4 依赖）
