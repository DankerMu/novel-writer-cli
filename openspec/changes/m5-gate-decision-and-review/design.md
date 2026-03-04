## Context

章节写作流水线的最后一步是 QualityJudge 评分，但评分后的决策（通过/润色/修订/暂停）逻辑在 skill 层以自由文本实现，阈值与 quality-rubric.md 的对齐靠人工保证。卷末的回顾流程（ConsistencyAuditor 全卷审计、质量汇总、伏笔清理、卷间过渡）完全无 CLI 支持。

CS-O1 已添加 `ReviewStep` type 和 `VOL_REVIEW` 状态，本 changeset 实现 gate decision 函数和卷回顾流水线。

## Goals / Non-Goals

**Goals:**
- Gate decision 函数：确定性地将 8 维度加权评分映射为 5 种动作
- 卷回顾五步流水线：collect → audit → report → cleanup → transition
- 阈值严格对齐 `quality-rubric.md`（>=4.0 pass, 3.5-3.9 polish, 3.0-3.4 revise, <3.0 强制重写/pause）
- `force_passed` 动作支持用户手动覆盖

**Non-Goals:**
- 不修改 QualityJudge agent 的评分逻辑
- 不实现 ConsistencyAuditor agent
- 不处理跨卷的全书审计（留给后续里程碑）

## Approach

### Gate Decision 函数

```typescript
function gateDecision(score: number, flags: GateFlags): GateAction {
  if (flags.force_pass) return 'force_passed';
  if (score >= 4.0) return 'pass';
  if (score >= 3.5) return 'polish';
  if (score >= 3.0) return 'revise';
  if (score >= 2.0) return 'pause';    // 人工介入
  return 'pause';                       // <2.0 强制重写也需要 pause
}
```

集成点：`computeNextStep()` 在 WRITING 状态、judge 步骤完成后调用 `gateDecision()` 决定下一步是 refine（polish）、回退 draft（revise）、还是推进 commit。

### 卷回顾流水线状态转换

```
VOL_REVIEW → collect → audit → report → cleanup → transition → VOL_PLANNING (next vol) | COMPLETED
```

- `collect`：收集本卷所有章节质量数据，生成 `staging/vol-review/quality-summary.json`
- `audit`：instruction packet → ConsistencyAuditor（stride=5, window=10 滑动窗口 + 全卷），产物 `staging/vol-review/audit-report.json`
- `report`：汇总生成可读的卷回顾报告
- `cleanup`：处理伏笔状态（已解开/悬挂/跨卷延续）
- `transition`：更新 checkpoint（current_volume++），转入下一卷 VOL_PLANNING 或标记 COMPLETED

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/gate-decision.ts` | New | Gate decision 函数，评分→动作映射 |
| `src/volume-review.ts` | New | 卷回顾五步流水线：`computeReviewNext()` |
| `src/next-step.ts` | Modify | 集成 gate decision 到章节末尾；VOL_REVIEW 分支路由 |
| `src/instructions.ts` | Modify | 为 ReviewStep 生成 ConsistencyAuditor instruction packet |
| `src/validate.ts` | Modify | 校验卷回顾产物 |
| `src/advance.ts` | Modify | 推进卷回顾阶段，转入下一卷或 COMPLETED |

## Backward Compatibility

- Gate decision 仅在 judge 步骤完成后触发，不影响 draft/summarize/refine 路径
- VOL_REVIEW 为新状态，旧 checkpoint 不会进入此分支
- 阈值来自 quality-rubric.md，可通过配置文件覆盖（预留扩展点）
