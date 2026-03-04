## Context

`novel init` 已实现项目目录初始化（生成 `.checkpoint.json`、目录骨架、brief），但后续的冷启动五步——世界观构建（WorldBuilder）、角色网络（CharacterWeaver）、风格提取（StyleAnalyzer）、试写、结果评估——仍由 `/novel:start` skill 以自由文本编排，中断后无法自动恢复。

CS-O1 已添加 `QuickStartStep` type 和 `QUICK_START` 状态，本 changeset 实现冷启动流水线的确定性编排。

## Goals / Non-Goals

**Goals:**
- 冷启动五步流水线：world → characters → style → trial → results
- 各步骤的 instruction packet 生成（WorldBuilder/CharacterWeaver/StyleAnalyzer/ChapterWriter/QualityJudge）
- 中断恢复：基于 staging 产物存在性判断应恢复到哪一步
- 冷启动完成后自动转入 VOL_PLANNING

**Non-Goals:**
- 不修改 `novel init` 命令（初始化已完成）
- 不处理交互式用户输入（brief 编辑仍由 skill/执行器层负责）
- 不实现 agent 本身

## Approach

### 冷启动流水线状态转换

```
QUICK_START → world → characters → style → trial → results → VOL_PLANNING
```

- `world`：instruction packet → WorldBuilder，产物 `staging/quickstart/rules.json`
- `characters`：instruction packet → CharacterWeaver，产物 `staging/quickstart/contracts/`
- `style`：instruction packet → StyleAnalyzer，产物 `staging/quickstart/style-profile.json`
- `trial`：instruction packet → ChapterWriter，产物 `staging/quickstart/trial-chapter.md`
- `results`：instruction packet → QualityJudge，产物 `staging/quickstart/evaluation.json`；评估通过后提交产物到正式目录并转 VOL_PLANNING

### 中断恢复逻辑

`computeQuickStartNext()` 按顺序检查 staging 产物：
- `rules.json` 不存在 → `world`
- `contracts/` 不存在 → `characters`
- `style-profile.json` 不存在 → `style`
- `trial-chapter.md` 不存在 → `trial`
- `evaluation.json` 不存在 → `results`
- 全部存在 → 提交并转 VOL_PLANNING

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/next-step.ts` | Modify | QUICK_START 分支路由到 `computeQuickStartNext()` |
| `src/instructions.ts` | Modify | 为 QuickStartStep 各 phase 生成 agent instruction packet |
| `src/validate.ts` | Modify | 为 QuickStartStep 校验各阶段产物 |
| `src/advance.ts` | Modify | 推进冷启动阶段，最终转 VOL_PLANNING |

## Backward Compatibility

- 仅扩展 QUICK_START 分支，不修改现有 WRITING/VOL_PLANNING 路径
- 已完成冷启动的项目（状态非 QUICK_START）不受影响
