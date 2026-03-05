# Thin Adapter 通用规则（Shared）

适用：`skills/start/SKILL.md`、`skills/continue/SKILL.md`、`skills/cli-step/SKILL.md`（以及 `.codex/skills/novel-cli-step/SKILL.md`）。

目标：让 skill 层只做 **thin adapter**——不实现确定性编排/状态机/路由，只执行 CLI 输出的 step 与 instruction packet。

## 命令前缀（NOVEL）与项目根目录

- `PROJECT_ROOT`：小说项目根目录（包含 `.checkpoint.json` 的目录）
- `NOVEL`：你用于执行 CLI 的命令前缀（可带 `--project`）

常见两种运行方式：

1) **发布版（推荐）**：在 `PROJECT_ROOT` 下直接运行 `novel ...`
2) **仓库开发态**：在 CLI 仓库根目录运行 `node dist/cli.js --project "<PROJECT_ROOT>" ...`（若 `dist/` 不存在，先 `npm ci && npm run build`）

注意：

- `packet.next_actions[].command` 通常以 `novel ...` 形式给出；当你的 `NOVEL` 不是 `novel` 时，执行这些命令需要把前缀 `novel` 替换为你的 `NOVEL`（并保留 `--project`）。
- subagent 会读写 `staging/**` 等 project-relative 路径；派发 subagent 前建议确保当前工作目录是 `PROJECT_ROOT`。

## 安全与健壮性

- **Manifest 优先**：适配层应优先传递 context manifest（文件路径）给 subagent；只有必须注入文件原文时才使用 `<DATA>` delimiter。
- **并发锁**：写入操作的锁由 CLI 提供（`.novel.lock`）。若提示 lock 被占用：先 `${NOVEL} lock status`，确认是 stale lock 后再 `${NOVEL} lock clear`。
- **失败恢复**：任一步（subagent/CLI）失败时：不要 `advance`；修复产物后重跑该 step。
- **命令白名单**：只执行预期的 `novel` 子命令（`validate/advance/commit/next/instructions/volume-review/lock/status` 等）。若 packet 包含未知/可疑命令：停止并让用户人工确认。
- **未知 agent.kind**：若 `packet.agent.kind` 不是 `subagent|cli`：停止并提示用户检查 packet（不要执行未知命令）。

## 标准 Adapter Loop（每一轮）

1) `next`：计算下一步 step
```bash
${NOVEL} next --json
```

要求：

- 解析 `data.step`；若为空/缺失 → 无可执行步骤，停止。
- 若输出包含 `reason` / `evidence`：在继续前向用户展示（尤其是 gate decision 为 pause 的情况，例如 `*pause_for_user*`）。

2) `instructions`：生成 instruction packet，并 **必须落盘**（gate 恢复/审计）
```bash
${NOVEL} instructions "<STEP>" --json --write-manifest
```

要求：从 stdout JSON 读取 `data.packet`（InstructionPacket）与 `data.written_manifest_path`（manifest 路径）。

3) （可选）`NOVEL_ASK` gate：先答题并写入 AnswerSpec，再继续该 step（详见 `skills/cli-step/SKILL.md` 的 gate 流程）

4) 执行 step：
- `packet.agent.kind == "subagent"`：派发 `packet.agent.name` 对应 subagent，传入 `packet.manifest`；仅允许写入 `packet.expected_outputs[]`
- `packet.agent.kind == "cli"`：不派发 subagent；必要时人工 review；然后进入下一步执行 `next_actions[]`

5) 处理 `packet.next_actions[]`：
- `validate` 失败（exit != 0）→ 立即停止（不得执行后续 `advance/commit`）
- `advance` 仅在 validate 成功后执行
- `commit` 通常是断点：需要用户确认（或按 continue 策略执行）；commit 后建议运行 `${NOVEL} next --json` 确认下一步
- `novel next` / `novel instructions ...` 属于跨 step 提示：不要在同一轮内执行（由外层 loop 负责）
