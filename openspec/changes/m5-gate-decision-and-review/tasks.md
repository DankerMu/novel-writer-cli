# Tasks

## Phase 1: Gate Decision

- [x] 实现 gateDecision() 函数：8 维度加权评分 → pass/polish/revise/pause/force_passed (src/gate-decision.ts)
- [x] 阈值对齐 quality-rubric.md：>=4.0 pass, 3.5-3.9 polish, 3.0-3.4 revise, <3.0 pause (src/gate-decision.ts)
- [x] 支持 force_pass flag 用于用户手动覆盖 (src/gate-decision.ts)
- [x] 集成 gate decision 到章节流水线 judge 步骤之后 (src/next-step.ts)

## Phase 2: Volume Review Pipeline

- [x] 实现 computeReviewNext()：按 staging 产物判断 collect/audit/report/cleanup/transition (src/volume-review.ts)
- [x] 为 ReviewStep.audit 生成 ConsistencyAuditor instruction packet（stride=5, window=10）(src/instructions.ts)
- [x] 为 ReviewStep 各 phase 添加产物校验：quality-summary.json、audit-report.json、review-report.md、伏笔状态 (src/validate.ts)
- [x] 为 ReviewStep 添加 advance 逻辑：推进卷回顾阶段 (src/advance.ts)

## Phase 3: Integration

- [x] VOL_REVIEW 分支路由到 computeReviewNext() (src/next-step.ts)
- [x] transition 完成后更新 checkpoint：current_volume++、转 VOL_PLANNING 或 COMPLETED (src/advance.ts)
- [x] 在章节 commit 后检测是否为卷末章节，若是则转 VOL_REVIEW (src/next-step.ts)

## Phase 4: Testing

- [x] 验证 gate decision 各阈值区间返回正确动作
- [x] 验证 force_pass 覆盖行为
- [x] 验证卷回顾流水线各步骤的中断恢复
- [x] 验证卷回顾完成后正确转入下一卷 VOL_PLANNING
- [x] 验证阈值与 quality-rubric.md 一致

## References

- `openspec/changes/m5-gate-decision-and-review/proposal.md`
- `openspec/changes/m5-gate-decision-and-review/design.md`
- `skills/novel-writing/references/quality-rubric.md`
- Dependency: CS-O1 `m5-step-type-infrastructure`
