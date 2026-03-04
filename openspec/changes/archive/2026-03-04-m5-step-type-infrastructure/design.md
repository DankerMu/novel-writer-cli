## Context

M5 CLI 编排核心（CS-O0 `m5-novel-cli-orchestrator`）已建立基础框架，但 Step 类型仅覆盖章节写作五步（draft/summarize/refine/judge/commit）。要支持卷规划、冷启动、卷回顾三条新流水线，需要先扩展类型系统和状态机基础设施。

当前 `orchestrator_state` 为可选 string，`computeNextStep()` 通过条件堆叠推断下一步，扩展性差。旧 checkpoint 不含 `orchestrator_state` 字段，需要兼容。

## Goals / Non-Goals

**Goals:**
- 扩展 Step union type 覆盖全部四条流水线
- 将 `orchestrator_state` 升级为 required 7-value enum
- 旧 checkpoint 向后兼容（legacy inference）
- `computeNextStep()` 按 state 路由，为后续流水线预留扩展点

**Non-Goals:**
- 不实现具体流水线逻辑（由 CS-O2/O3/O4 负责）
- 不修改 instruction packet schema（本 changeset 只扩展类型）

## Approach

### Step Union Type 扩展

```typescript
type Step = ChapterStep | VolumeStep | QuickStartStep | ReviewStep;

type VolumeStep = { kind: 'volume'; phase: 'outline' | 'validate' | 'commit' };
type QuickStartStep = { kind: 'quickstart'; phase: 'world' | 'characters' | 'style' | 'trial' | 'results' };
type ReviewStep = { kind: 'review'; phase: 'collect' | 'audit' | 'report' | 'cleanup' | 'transition' };
```

### OrchestratorState Enum

```typescript
enum OrchestratorState {
  INIT = 'INIT',
  QUICK_START = 'QUICK_START',
  VOL_PLANNING = 'VOL_PLANNING',
  WRITING = 'WRITING',
  CHAPTER_REWRITE = 'CHAPTER_REWRITE',
  VOL_REVIEW = 'VOL_REVIEW',
  ERROR_RETRY = 'ERROR_RETRY',
}
```

### Legacy Inference

对缺少 `orchestrator_state` 的旧 checkpoint，实现采用保守推断策略：
- `(stage=null|committed) && inflight !== null` → `ERROR_RETRY`（不一致：空闲态不应有 inflight）
- `(stage=活跃) && inflight === null` → `ERROR_RETRY`（不一致：活跃态缺少 inflight 指针）
- `stage === 'revising'` → `CHAPTER_REWRITE`
- 其他（包括 `stage=null && inflight=null`）→ `WRITING`

> **设计偏差说明**：原始设计提案中 `idle + current_chapter=0 → INIT` 和 `idle + current_chapter>0 → VOL_PLANNING` 两条规则**未实现**，因为 INIT/VOL_PLANNING 对应的 quickstart/volume 管道尚未实现（CS-O2/O3），推断到这些状态会导致 `computeNextStep` 立即抛出 NotImplemented。保守策略选择全部 fallback 到 WRITING，确保旧项目在升级后仍能正常工作。

### computeNextStep() Routing

```typescript
function computeNextStep(checkpoint: Checkpoint): Step {
  switch (checkpoint.orchestrator_state) {
    case 'WRITING':
    case 'CHAPTER_REWRITE':
      return computeChapterNextStep(checkpoint);          // existing
    case 'ERROR_RETRY':
      return healAndDelegate(checkpoint);                 // auto-heal + delegate to chapter
    case 'INIT':
    case 'QUICK_START':
    case 'VOL_PLANNING':
    case 'VOL_REVIEW':
      throw NotImplemented(checkpoint.orchestrator_state); // CS-O2/O3/O4
  }
}
```

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/steps.ts` | Modify | 扩展 Step union type，新增 VolumeStep/QuickStartStep/ReviewStep |
| `src/checkpoint.ts` | Modify | orchestrator_state 改为 required OrchestratorState enum，添加 `inferLegacyState()` |
| `src/next-step.ts` | Modify | `computeNextStep()` 改为 switch-on-state routing，placeholder 分支抛 NotImplemented |
| `src/cli.ts` | Modify | 适配新类型（如有需要的命令参数变更） |

## Backward Compatibility

- 旧 checkpoint（无 `orchestrator_state`）通过 `inferLegacyState()` 兼容，不会 break
- 现有章节流水线路径（WRITING 分支）行为保持不变
- 新流水线分支暂时抛 NotImplemented，由后续 changeset 填充
