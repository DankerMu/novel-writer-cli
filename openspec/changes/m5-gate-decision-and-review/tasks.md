# Tasks

## Phase 1: Gate Decision

- [ ] 实现 gateDecision() 函数：8 维度加权评分 → pass/polish/revise/pause/force_passed (src/gate-decision.ts)
- [ ] 阈值对齐 quality-rubric.md：>=4.0 pass, 3.5-3.9 polish, 3.0-3.4 revise, <3.0 pause (src/gate-decision.ts)
- [ ] 支持 force_pass flag 用于用户手动覆盖 (src/gate-decision.ts)
- [ ] 集成 gate decision 到章节流水线 judge 步骤之后 (src/next-step.ts)

## Phase 2: Volume Review Pipeline

- [ ] 实现 computeReviewNext()：按 staging 产物判断 collect/audit/report/cleanup/transition (src/volume-review.ts)
- [ ] 为 ReviewStep.audit 生成 ConsistencyAuditor instruction packet（stride=5, window=10）(src/instructions.ts)
- [ ] 为 ReviewStep 各 phase 添加产物校验：quality-summary.json、audit-report.json、review-report.md、伏笔状态 (src/validate.ts)
- [ ] 为 ReviewStep 添加 advance 逻辑：推进卷回顾阶段 (src/advance.ts)

## Phase 3: Integration

- [ ] VOL_REVIEW 分支路由到 computeReviewNext() (src/next-step.ts)
- [ ] transition 完成后更新 checkpoint：current_volume++、转 VOL_PLANNING 或 COMPLETED (src/advance.ts)
- [ ] 在章节 commit 后检测是否为卷末章节，若是则转 VOL_REVIEW (src/next-step.ts)

## Phase 4: Testing

- [ ] 验证 gate decision 各阈值区间返回正确动作
- [ ] 验证 force_pass 覆盖行为
- [ ] 验证卷回顾流水线各步骤的中断恢复
- [ ] 验证卷回顾完成后正确转入下一卷 VOL_PLANNING
- [ ] 验证阈值与 quality-rubric.md 一致

## References

- `openspec/changes/m5-gate-decision-and-review/proposal.md`
- `openspec/changes/m5-gate-decision-and-review/design.md`
- `skills/novel-writing/references/quality-rubric.md`
- Dependency: CS-O1 `m5-step-type-infrastructure`
