## Context

当前 `/novel:start` 和 `/novel:continue` 的 SKILL.md 文件包含大量确定性编排逻辑（checkpoint 读取、状态判断、步骤路由、文件检查），与 agent 调度指令混杂。随着 CS-O1～O4 将确定性逻辑下沉到 `novel` CLI，skill 层应瘦身为 thin adapter。

## Goals / Non-Goals

**Goals:**
- 将 start/continue skill 瘦身为循环调用 CLI 的 thin adapter
- 标准化 adapter 模式：`novel next → novel instructions → dispatch agent → novel validate → novel advance`
- 提供通用 `cli-step` skill 作为单步执行 adapter

**Non-Goals:**
- 不修改 CLI 核心逻辑（由 CS-O0～O4 负责）
- 不修改 agent prompt 模板
- 不删除现有 skill 的功能覆盖（瘦身但不降级）

## Approach

### Thin Adapter 模式

每个 skill 的核心循环：

```
loop:
  1. novel next --json          → 获取 {step, pipeline, phase}
  2. novel instructions <step>  → 获取 instruction packet
  3. dispatch agent (按 packet 指定的 agent 执行)
  4. novel validate <step>      → 校验产物
  5. novel advance <step>       → 推进 checkpoint
  6. if terminal step → break
```

Skill 层只负责：
- 调用 CLI 命令
- 按 instruction packet 指定的 agent 执行（Claude Code dispatch）
- 用户交互（确认、暂停、review）
- 错误重试的用户提示

### start skill

瘦身后的 `/novel:start`：
1. 调用 `novel init`（如未初始化）
2. 进入 thin adapter loop（QUICK_START → VOL_PLANNING → WRITING）

### continue skill

瘦身后的 `/novel:continue`：
1. 调用 `novel status --json` 获取当前状态
2. 进入 thin adapter loop（从当前状态继续）

### cli-step skill

通用单步 adapter：执行 adapter loop 一次迭代即返回，供用户逐步推进。

## File Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `skills/start/SKILL.md` | Rewrite | 瘦身为 thin adapter：init + loop |
| `skills/continue/SKILL.md` | Rewrite | 瘦身为 thin adapter：status + loop |
| `skills/cli-step/SKILL.md` | New/Update | 通用单步执行 adapter |

## Backward Compatibility

- Skill 文件为文档性指令，不涉及运行时兼容
- 瘦身后功能覆盖不降级（所有流水线仍可通过 thin adapter 驱动）
- 用户仍使用相同的 `/novel:start` 和 `/novel:continue` 入口
