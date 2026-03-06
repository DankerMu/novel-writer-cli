# /novel:start（Thin Adapter）

你是小说项目的启动适配层：**不做确定性编排/状态机判断/Agent 路由**，只调用 `novel` CLI 获取下一步 step 与 instruction packet，并按 packet 指定的 agent 执行，直到遇到需要用户决策的断点。

## 运行约束

- **可用工具**：Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion
- **推荐模型**：sonnet
- **原则**：不要猜测 step/state；一切以 CLI JSON 输出为准

## 通用规则（先读）

先阅读 `skills/shared/thin-adapter-loop.md`（命令前缀/NOVEL、项目根目录、锁与恢复、命令白名单、标准 Adapter Loop、`next_actions` 语义等通用规则）。

## Step 0: 初始化项目（仅第一次）

本 skill 默认以**当前目录**作为 `PROJECT_ROOT`。若你当前在 CLI 仓库根目录且不希望在此创建项目：先 `cd` 到目标项目目录再继续，或在仓库开发态用 `--project "<PROJECT_ROOT>"` 显式指定目标目录（避免污染仓库）。

若当前目录不存在 `.checkpoint.json`：

1) 用 AskUserQuestion 询问是否写入平台画像（可选）：
- `qidian` (Recommended)
- `fanqie (番茄)`
- `jinjiang (晋江)`
- 暂不设置（后续可手动补齐 `platform-profile.json`）

> 兼容说明：若用户在 free-form 输入里手动填 `tomato`，仍应接受；但不要把它作为可见选项展示。

2) 执行初始化：
- `${NOVEL} init --platform <qidian|fanqie|jinjiang>` 或
- `${NOVEL} init`

> `init` 只负责创建 `.checkpoint.json` + `staging/**`（以及可选平台模板）。后续所有流程都由 `next/instructions` 驱动。
>
> 这是 thin adapter 的启动 bootstrap：`novel next` 依赖 `.checkpoint.json`，因此 `init` 不属于 `next/instructions` 循环的一部分。

## Step 1: Adapter loop（持续推进直到断点）

按 `skills/shared/thin-adapter-loop.md` 的“标准 Adapter Loop（每一轮）”重复执行，覆盖 `QUICK_START → VOL_PLANNING → WRITING` 全流程，直到遇到需要用户决策的断点（manual-review / chapter review / commit 确认等）。

## 常见断点策略（建议）

- 遇到 `${NOVEL} commit ...`：执行前用 AskUserQuestion 让用户确认（commit 会移动 staging → final）；commit 后运行 `${NOVEL} next --json` 继续
- 遇到 `review:*`（卷末回顾）：按 packet.next_actions 执行；必要时暂停让用户阅读 `volumes/vol-XX/review.md`
