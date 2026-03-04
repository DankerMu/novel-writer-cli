## Why

当前 `/novel:start`、`/novel:continue` 等 skill 文件包含大量确定性编排逻辑（状态判断、文件检查、步骤路由），与 LLM 执行指令混杂在一起，导致 skill 层臃肿、难以维护，且与 CLI 核心存在重复逻辑。

随着 CS-O1～O4 将全部确定性编排下沉到 `novel` CLI，skill 层应瘦身为 thin adapter：仅负责循环调用 `novel next → instructions → dispatch agent → validate → advance`，不再包含状态机逻辑。这使 skill 层可替换（Claude Code / Codex / 纯脚本），CLI 成为唯一的编排真源。

## What Changes

- 重写 `skills/start/SKILL.md`：移除内嵌的状态判断与步骤路由，改为调用 CLI 的 `novel next` / `novel instructions` 获取下一步与指令包，执行 agent 后调用 `novel validate` / `novel advance`。
- 重写 `skills/continue/SKILL.md`：同上，瘦身为 thin adapter loop。
- 新增或更新 `skills/cli-step/SKILL.md`：通用的单步执行 adapter，供其他 skill 或用户直接调用。

## Impact

- 涉及文件：`skills/start/SKILL.md`、`skills/continue/SKILL.md`、`skills/cli-step/SKILL.md`
- 风险等级：low — skill 层为文档性文件，不涉及编译或运行时
- 依赖：CS-O2、CS-O3、CS-O4（三条流水线就绪后才能完整瘦身）
