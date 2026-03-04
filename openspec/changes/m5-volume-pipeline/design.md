## Context

章节写作已有完整的 next→instructions→validate→advance→commit 流水线，但卷规划（PlotArchitect 生成卷大纲、storylines、chapter-contracts）仍为 skill 层自由文本驱动，无 checkpoint 追踪、无事务提交。

CS-O1 扩展了 Step union type 和 `orchestrator_state`，本 changeset 在此基础上实现卷规划的确定性三步流水线。

## Goals / Non-Goals

**Goals:**
- 卷规划三步流水线：outline（PlotArchitect 生成大纲）→ validate（校验产物）→ commit（原子提交）
- PlotArchitect instruction packet 生成（含卷级 context manifest：前卷摘要、rules.json、storylines.json）
- Volume commit 事务：staging 卷产物→正式目录的原子搬运

**Non-Goals:**
- 不实现 PlotArchitect agent 本身（agent 已存在于 `agents/`）
- 不修改章节写作流水线
- 不处理卷回顾（由 CS-O4 负责）

## Approach

### 卷规划流水线状态转换

```
VOL_PLANNING → outline → validate → commit → WRITING
```

- `outline`：生成 instruction packet 指向 PlotArchitect，预期产物为 `staging/vol-{N}/outline.md`、`staging/vol-{N}/storylines.json`、`staging/vol-{N}/chapter-contracts/`
- `validate`：校验以上产物存在性 + JSON schema
- `commit`：`staging/vol-{N}/` → `volumes/vol-{N}/`，更新 checkpoint `orchestrator_state → WRITING`

### Volume Commit 事务

与章节 commit 类似的原子提交模式：
1. 获取锁
2. 校验 staging 产物完整性
3. 移动文件到正式目录
4. 更新 checkpoint
5. 清理 staging
6. 释放锁

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `src/volume-planning.ts` | New | 卷规划流水线入口：`computeVolumePlanNext()` |
| `src/volume-commit.ts` | New | 卷级 staging→正式目录的原子提交事务 |
| `src/next-step.ts` | Modify | VOL_PLANNING 分支路由到 `computeVolumePlanNext()` |
| `src/instructions.ts` | Modify | 为 VolumeStep 生成 PlotArchitect instruction packet |
| `src/validate.ts` | Modify | 为 VolumeStep 校验卷大纲产物 |
| `src/advance.ts` | Modify | 推进卷规划阶段，commit 后转 WRITING |
| `src/cli.ts` | Modify | 注册 volume 相关命令（如需要） |

## Backward Compatibility

- 新增文件和新增分支，不修改现有章节流水线路径
- 旧 checkpoint 无 VOL_PLANNING 状态时不会进入卷规划分支
