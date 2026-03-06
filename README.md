# novel-writer-cli

执行器无关（executor-agnostic）的**确定性小说编排 CLI**：`novel` 负责计算下一步、生成 instruction packet、校验/推进 checkpoint、提交 staging 事务，并产出可审计的日志与报告。

`novel` **不调用任何 LLM API**。写作/润色/评审等 LLM 执行由 Claude Code、Codex 等外部执行器（executor）根据 instruction packet 来完成。

- 用户手册索引：[`docs/user/README.md`](docs/user/README.md)
- CLI 手册（最重要）：[`docs/user/novel-cli.md`](docs/user/novel-cli.md)

> Claude Code Plugin 版本见 [novel-writer-plugin](https://github.com/DankerMu/novel-writer-plugin)。

## 安装（npm）

```bash
npm i -g novel-writer-cli
novel --help
```

或一次性运行：

```bash
npx novel-writer-cli --help
```

## 快速开始（开发态）

前置条件：

- Node.js 18+

```bash
npm install
npm run build
node dist/cli.js --help
```

> 发布到 npm 后，推荐用 `npx novel-writer-cli ...`（一次性运行）或 `npm i -g novel-writer-cli` 后直接 `novel ...`。

## 主要特性

- **确定性流水线**：基于 `.checkpoint.json` + `staging/**` 计算下一步（可中断/可恢复）
- **instruction packet 合约**：将“编排 → 执行器（LLM）”的边界固化为 JSON（可审计/可回放）
- **写入事务**：`commit` 将 staging 产物提交到正式目录，并维护 `state/`、`foreshadowing/` 等工件
- **Guardrails（可选）**：留存/可读性/命名等确定性检查，可触发 `...:title-fix` / `...:review` 等步骤
- **叙事健康（可选）**：承诺台账、参与度密度、角色语气漂移等窗口化信号（默认 advisory-only）

## 最小工作流：跑通一章

如果你是从零开始，在空目录先执行初始化（会创建 `.checkpoint.json` + `staging/**`，并写入若干可选模板文件）：

```bash
mkdir my-novel && cd my-novel
novel init                      # --platform qidian|fanqie|jinjiang（兼容 tomato 旧别名；会额外写平台约束文件）
novel status
```

之后在**小说项目根目录**（含 `.checkpoint.json`）运行：

```bash
# 1) 计算下一步
novel next

# 2) 生成 instruction packet（给执行器用）
novel instructions "chapter:003:draft" --json --write-manifest

# 3) 执行器运行 packet.agent 指定的 subagent，写入 staging/**（此 repo 不负责跑 LLM）

# 4) 校验与推进
novel validate "chapter:003:draft"
novel advance "chapter:003:draft"

# 5) 当 next 返回 ...:commit 时提交事务
novel commit --chapter 3
```

完整说明见：`docs/user/novel-cli.md`。

## 两层入口（CLI vs Skill）

本仓库文档里会出现两类命令：

- **CLI 命令**：`novel ...`（确定性编排）
- **Skill 入口**：`/novel:start`、`/novel:continue`、`/novel:status`（在 Claude Code 中使用；底层会调用 CLI 并运行 subagent）

如果你只关心 CLI，请直接看 `docs/user/novel-cli.md`。

## 主要命令

运行 `novel --help` 可查看完整命令列表。核心命令包括：

- `status` / `next` / `instructions` / `validate` / `advance` / `commit`
- `lock status/clear`：写入锁管理（`.novel.lock/`）
- `promises` / `engagement` / `voice`：叙事健康台账与指标（可选）

## 仓库内容概览

- `src/`：CLI 实现（TypeScript）
- `agents/`：subagent 提示词（由执行器运行）
- `skills/`：Claude Code Skill 参考与编排素材
- `schemas/`：项目 JSON/JSONL 文件的 SSOT schema
- `docs/user/`：用户手册

## 开发

```bash
npm test
```

## 许可

MIT License，见 `LICENSE`。
