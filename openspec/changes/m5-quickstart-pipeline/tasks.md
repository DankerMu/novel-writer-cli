# Tasks

## Phase 1: Core Implementation

- [x] 实现 computeQuickStartNext()：按顺序检查 staging 产物决定 next phase (src/next-step.ts)
- [x] 为 QuickStartStep.world 生成 WorldBuilder instruction packet (src/instructions.ts)
- [x] 为 QuickStartStep.characters 生成 CharacterWeaver instruction packet (src/instructions.ts)
- [x] 为 QuickStartStep.style 生成 StyleAnalyzer instruction packet (src/instructions.ts)
- [x] 为 QuickStartStep.trial 生成 ChapterWriter instruction packet（试写章）(src/instructions.ts)
- [x] 为 QuickStartStep.results 生成 QualityJudge instruction packet (src/instructions.ts)

## Phase 2: Integration

- [x] QUICK_START 分支路由到 computeQuickStartNext() (src/next-step.ts)
- [x] 为 QuickStartStep 各 phase 添加产物校验：rules.json、contracts/、style-profile.json、trial-chapter.md、evaluation.json (src/validate.ts)
- [x] 为 QuickStartStep 添加 advance 逻辑：推进冷启动阶段 (src/advance.ts)
- [x] results 完成后提交产物到正式目录并转 VOL_PLANNING (src/advance.ts)

## Phase 3: Testing

- [x] 验证新项目（INIT→QUICK_START）正确路由到 world 步骤
- [x] 验证各步骤中断后基于 staging 产物正确恢复
- [x] 验证冷启动全部完成后正确转入 VOL_PLANNING
- [x] 验证已完成冷启动的项目不会重新进入 QUICK_START

## References

- `openspec/changes/m5-quickstart-pipeline/proposal.md`
- `openspec/changes/m5-quickstart-pipeline/design.md`
- Dependency: CS-O1 `m5-step-type-infrastructure`
