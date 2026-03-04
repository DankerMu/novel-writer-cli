## Why

`novel init` 命令已实现项目初始化，但冷启动阶段（世界观构建、角色网络、风格提取、试写、结果评估）仍由 `/novel:start` skill 以自由文本驱动，缺少确定性编排。用户在冷启动中断后无法自动恢复到正确步骤。

本 changeset 将冷启动拆分为五步确定性流水线（world→characters→style→trial→results），CLI 在 `QUICK_START` 状态下接管编排，为 WorldBuilder、CharacterWeaver、StyleAnalyzer 生成 instruction packet，使冷启动具备可中断恢复能力。

## What Changes

- 扩展 `src/next-step.ts`：当 `orchestrator_state === QUICK_START` 时路由到冷启动流水线的 next-step 逻辑。
- 扩展 `src/instructions.ts`：为 QuickStartStep 的各阶段生成对应 agent 的 instruction packet。
- 扩展 `src/validate.ts`：校验冷启动各阶段产物（rules.json、contracts/、style-profile.json、trial chapter、evaluation）。
- 扩展 `src/advance.ts`：推进 checkpoint 的冷启动阶段，最终转入 VOL_PLANNING 或 WRITING。

## Impact

- 涉及文件：`src/next-step.ts`、`src/instructions.ts`、`src/validate.ts`、`src/advance.ts`
- 风险等级：low — 新增路径，不修改现有章节流水线
- 依赖：CS-O1（QuickStartStep type 与 QUICK_START 状态）
