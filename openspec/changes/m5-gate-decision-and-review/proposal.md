## Why

当前章节完成后的 gate decision（通过/润色/修订/暂停）逻辑散落在 skill 层，缺少统一的确定性决策函数。卷回顾（volume review）流程——包括 ConsistencyAuditor 全卷审计、质量汇总、伏笔清理、卷间过渡——完全由 skill 自由文本驱动，无法通过 CLI 恢复和审计。

本 changeset 实现两个核心组件：gate decision 函数（将 QualityJudge 评分映射为确定性动作），以及卷回顾五步流水线（collect→audit→report→cleanup→transition），使写作循环的"评判→决策→卷结"阶段具备与写作阶段相同的确定性保障。

## What Changes

- 新增 `src/gate-decision.ts`：gate decision 函数，输入为 QualityJudge 评分（8 维度加权），输出为 `pass | polish | revise | pause | force_passed` 五种动作，阈值对齐 quality-rubric.md。
- 扩展 `src/next-step.ts`：整合 gate decision 到章节流水线末尾；当 `orchestrator_state === VOL_REVIEW` 时路由到卷回顾流水线。
- 新增 `src/volume-review.ts`：卷回顾流水线入口，包含 collect/audit/report/cleanup/transition 五步。
- 扩展 `src/instructions.ts`：为 ReviewStep 生成 ConsistencyAuditor instruction packet。
- 扩展 `src/validate.ts`：校验卷回顾产物（audit report、quality summary、伏笔状态）。
- 扩展 `src/advance.ts`：推进 checkpoint 的卷回顾阶段，最终转入下一卷的 VOL_PLANNING 或项目完成。

## Impact

- 涉及文件：`src/gate-decision.ts`（新）、`src/volume-review.ts`（新）、`src/next-step.ts`、`src/instructions.ts`、`src/validate.ts`、`src/advance.ts`
- 风险等级：medium — gate decision 阈值需与 quality-rubric.md 严格对齐
- 依赖：CS-O1（ReviewStep type 与 VOL_REVIEW 状态）
