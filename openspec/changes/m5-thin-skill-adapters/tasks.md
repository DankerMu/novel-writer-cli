# Tasks

## Phase 1: Core Implementation

- [ ] 重写 skills/start/SKILL.md 为 thin adapter：init + adapter loop (skills/start/SKILL.md)
- [ ] 重写 skills/continue/SKILL.md 为 thin adapter：status + adapter loop (skills/continue/SKILL.md)
- [ ] 创建/更新 skills/cli-step/SKILL.md：通用单步执行 adapter (skills/cli-step/SKILL.md)

## Phase 2: Adapter Pattern Standardization

- [ ] 定义标准 adapter loop 模式文档：next → instructions → dispatch → validate → advance (skills/cli-step/SKILL.md)
- [ ] 确保 start adapter 覆盖 QUICK_START → VOL_PLANNING → WRITING 全流程 (skills/start/SKILL.md)
- [ ] 确保 continue adapter 支持从任意 orchestrator_state 恢复 (skills/continue/SKILL.md)
- [ ] 添加用户交互点：validate 失败时暂停、gate decision 为 pause 时提示 (skills/continue/SKILL.md)

## Phase 3: Testing

- [ ] 验证 /novel:start 从空项目到第一章写作的完整流程
- [ ] 验证 /novel:continue 从各 state 恢复的正确性
- [ ] 验证 cli-step 单步执行并返回控制权
- [ ] 验证 skill 层无残留的确定性编排逻辑（全部下沉到 CLI）

## References

- `openspec/changes/m5-thin-skill-adapters/proposal.md`
- `openspec/changes/m5-thin-skill-adapters/design.md`
- Dependencies: CS-O2 `m5-volume-pipeline`, CS-O3 `m5-quickstart-pipeline`, CS-O4 `m5-gate-decision-and-review`
