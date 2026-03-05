# Thin Skill Adapters（Spec）

本 spec 描述 `skills/start`、`skills/continue`、`skills/cli-step`（以及 `.codex/skills/novel-cli-step`）应遵循的 **thin adapter** 执行规范：skill 层只负责循环调用 `novel` CLI 并派发 subagent，不实现确定性编排/状态机逻辑。

## Scope

- 适用：`skills/start/SKILL.md`、`skills/continue/SKILL.md`、`skills/cli-step/SKILL.md`
- 可选适配：`.codex/skills/novel-cli-step/SKILL.md`
- 共享规则（用于减少重复）：`skills/shared/thin-adapter-loop.md`（内容需与本 spec 对齐）

## Adapter Loop（规范）

每一轮 loop 必须按以下顺序进行：

1) `novel next --json`：由 CLI 决定下一步 step（skill 不得猜测/推断）
2) `novel instructions "<STEP>" --json --write-manifest`：生成 instruction packet，并 **必须落盘**（用于 gate 恢复/审计）
3) 处理 gates（如 `NOVEL_ASK`）：先采集/校验 AnswerSpec 并写入 `answer_path`，再继续该 step
4) 按 `packet.agent.kind/name` 执行：
   - `subagent`：派发对应 subagent，传入 `packet.manifest`（context manifest），仅允许写入 `packet.expected_outputs[]`
   - `cli`：不派发 subagent，进入 next_actions 执行
   - 其他/未知：必须停止并提示人工检查（禁止执行未知命令）
5) 按顺序处理 `packet.next_actions[]`：
   - `validate` 失败（exit != 0）→ 立即停止（不得执行后续 `advance/commit`）
   - `advance` 仅在对应 `validate` 成功后执行
   - `commit` 为断点：必须显式用户确认（或按 continue 的策略执行）；commit 后建议运行 `novel next --json` 确认下一步
   - `novel next` / `novel instructions ...` 属于跨 step 提示：不要在同一轮 loop 内执行（由外层 loop 负责）

## Safety / Robustness（规范）

- **Manifest 优先**：适配层应优先传递 context manifest（文件路径）给 subagent；只有必须注入文件原文时才使用 `<DATA>` delimiter。
- **命令白名单**：仅执行预期的 `novel` 子命令（如 `validate/advance/commit/next/instructions/volume-review/lock/status` 等）；若 packet 含未知/可疑命令，必须停下人工确认。
- **并发锁**：写入操作的锁由 CLI 提供（`.novel.lock`）；出现锁冲突时，使用 `novel lock status/clear` 排查/清理 stale lock。
- **恢复模式**：当 `next --json` 的 `reason` 以 `error_retry:` 开头，表示处于恢复模式；适配层按 CLI 指引继续推进，不做自定义恢复策略。
