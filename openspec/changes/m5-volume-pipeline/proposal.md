## Why

当前 CLI 只覆盖章节写作流水线，卷规划（volume planning）仍完全依赖 skill 层的自由文本指令。PlotArchitect agent 的调用缺少结构化的 instruction packet，卷大纲的产出也没有经过 validate→advance→commit 的事务流程，导致卷规划结果难以审计和恢复。

本 changeset 将卷规划拆分为三步确定性流水线（outline→validate→commit），为 PlotArchitect 生成标准 instruction packet，并实现卷提交事务（volume commit），使卷规划具备与章节写作相同的可恢复、可审计特性。

## What Changes

- 新增 `src/volume-planning.ts`：卷规划流水线入口，包含 outline/validate/commit 三步的状态转换逻辑。
- 扩展 `src/next-step.ts`：当 `orchestrator_state === VOL_PLANNING` 时路由到卷规划流水线。
- 扩展 `src/instructions.ts`：为 VolumeStep 生成 PlotArchitect instruction packet（含卷级 context manifest）。
- 扩展 `src/validate.ts`：校验卷大纲产物（storylines.json、chapter-contracts/、volume outline）。
- 扩展 `src/advance.ts`：推进 checkpoint 的卷规划阶段。
- 新增 `src/volume-commit.ts`：staging→正式目录的卷级原子提交事务。
- 更新 `src/cli.ts`：注册卷相关子命令。

## Impact

- 涉及文件：`src/volume-planning.ts`（新）、`src/volume-commit.ts`（新）、`src/next-step.ts`、`src/instructions.ts`、`src/validate.ts`、`src/advance.ts`、`src/cli.ts`
- 风险等级：medium — 新增流水线，需与现有 checkpoint 状态机协调
- 依赖：CS-O1（Step union type 与 orchestrator_state 枚举）
