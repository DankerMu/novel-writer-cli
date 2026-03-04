# Tasks

## Phase 1: Core Implementation

- [ ] 实现 computeVolumePlanNext()：根据 staging 产物判断 outline/validate/commit (src/volume-planning.ts)
- [ ] 实现 volume commit 事务：staging/vol-{N}/ → volumes/vol-{N}/ 原子搬运 (src/volume-commit.ts)
- [ ] 为 VolumeStep.outline 生成 PlotArchitect instruction packet (src/instructions.ts)
- [ ] 定义卷级 context manifest：前卷摘要、rules.json、storylines.json、角色契约 (src/instructions.ts)

## Phase 2: Integration

- [ ] VOL_PLANNING 分支路由到 computeVolumePlanNext() (src/next-step.ts)
- [ ] 为 VolumeStep 添加产物校验逻辑：outline.md、storylines.json、chapter-contracts/ (src/validate.ts)
- [ ] 为 VolumeStep 添加 advance 逻辑：推进卷规划阶段 (src/advance.ts)
- [ ] commit 完成后更新 orchestrator_state → WRITING (src/advance.ts)
- [ ] 注册 volume 相关命令到 CLI（如需要）(src/cli.ts)

## Phase 3: Testing

- [ ] 验证空项目进入 VOL_PLANNING 后能正确计算 outline 步骤
- [ ] 验证 staging 产物齐全时正确推进到 commit
- [ ] 验证 volume commit 事务的原子性（中断后可恢复）
- [ ] 验证 commit 完成后 orchestrator_state 正确转为 WRITING

## References

- `openspec/changes/m5-volume-pipeline/proposal.md`
- `openspec/changes/m5-volume-pipeline/design.md`
- Dependency: CS-O1 `m5-step-type-infrastructure`
