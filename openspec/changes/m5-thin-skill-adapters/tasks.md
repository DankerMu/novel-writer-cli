# Tasks

## Phase 1: Core Implementation

- [x] 重写 skills/start/SKILL.md 为 thin adapter：init + adapter loop (skills/start/SKILL.md)
- [x] 重写 skills/continue/SKILL.md 为 thin adapter：status + adapter loop (skills/continue/SKILL.md)
- [x] 创建/更新 skills/cli-step/SKILL.md：通用单步执行 adapter (skills/cli-step/SKILL.md)

## Phase 2: Adapter Pattern Standardization

- [x] 定义标准 adapter loop 模式文档：next → instructions → dispatch → validate → advance (skills/cli-step/SKILL.md)
- [x] 确保 start adapter 覆盖 QUICK_START → VOL_PLANNING → WRITING 全流程 (skills/start/SKILL.md)
- [x] 确保 continue adapter 支持从任意 orchestrator_state 恢复 (skills/continue/SKILL.md)
- [x] 添加用户交互点：validate 失败时暂停、gate decision 为 pause 时提示 (skills/continue/SKILL.md)

## Phase 3: Testing

- [x] 验证 /novel:start 从空项目到第一章写作的完整流程
- [x] 验证 /novel:continue 从各 state 恢复的正确性
- [x] 验证 cli-step 单步执行并返回控制权
- [x] 验证 skill 层无残留的确定性编排逻辑（全部下沉到 CLI）

### 验证记录（简要）

- 通过临时目录 `--project <tmp>` 跑通 `init(minimal) → quickstart → volume:outline/validate/commit → WRITING`，并确认下一步为 `chapter:001:draft`
- 在仓库示例项目 `text-novel/` 下运行 `status/next` 确认可从 `WRITING` 恢复推进

## References

- `openspec/changes/m5-thin-skill-adapters/proposal.md`
- `openspec/changes/m5-thin-skill-adapters/design.md`
- Dependencies: CS-O2 `m5-volume-pipeline`, CS-O3 `m5-quickstart-pipeline`, CS-O4 `m5-gate-decision-and-review`
