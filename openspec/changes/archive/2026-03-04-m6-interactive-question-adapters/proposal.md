## Why

`novel-cli` 的 `init/*` 与写作流水线是“全自动但可随时打断调整”的交互式流程：如果不把“提问/选项/确认”变成一等公民，就会退化成纯文本对话，导致分歧难以复现、review gate 难以脚本化，也更容易在执行器（Claude Code vs Codex）之间出现不一致。

另外，我们只需要适配 Claude Code 与 Codex，因此允许适配器**有意识地利用**两者的原生交互提问能力（Claude 的 `AskUserQuestion`，Codex 的 `request_user_input`/Plan Mode），以获得更好的用户控制面与更少的反复追问。

## What Changes

- 定义一个工具无关的“问卷/提问”中间表示（IR），暂定名 `NOVEL_ASK`（QuestionSpec），用于表达：
  - 主题/上下文（topic）
  - 多问题问卷（questions）
  - 单选/多选/允许自定义输入（allow_other）
  - 默认值与必填规则（defaults/required）
  - 回答落盘位置与后续 step 依赖（answer_path / unlocks）
- 将 `NOVEL_ASK` 作为 instruction packet 的一等输出：执行器读取 packet 时，先完成“问卷采集”，再进入具体的写作/分析 step。
- 为 Claude Code 与 Codex 分别实现 **adapter-body transform**（“同一份 QuestionSpec → 两套工具原生交互”）：
  - Claude Code：生成 `AskUserQuestion` 形式的交互提问（支持开放题 + “Other”自定义输入）。
  - Codex：优先要求在 **Plan Mode** 中使用 `request_user_input` 完成交互提问；若处于非 Plan/不可用场景，则降级为“明确格式的文本提问 + 强约束回答格式”，并提示用户切换到 Plan Mode 以获得更好 UX。
- 固化“交互 gate”语义：所有需要用户确认的关键节点（例如 `novel init` 的平台绑定、题材定题、世界观/人物图谱确认、窗口一致性校验是否继续）都通过 `NOVEL_ASK` 表达，避免在各个模板里散落自然语言提问。
- （可选）在 Codex 侧补齐 prompt 的参数注入约束（`$ARGUMENTS` 等），避免“用户传了参数但 prompt 看不到”的交互断层（该问题在 OpenSpec 的 Codex 适配里曾出现过类似反馈）。

## Capabilities

### New Capabilities

- `interactive-questions`: `NOVEL_ASK` schema、回答落盘契约、校验规则、以及到 Claude Code/Codex 的编译（transpile）策略

### Modified Capabilities

- `instruction-packets`: 支持在 packet 中携带 `NOVEL_ASK`，并将其纳入 step 依赖与可恢复状态机
- `executor-adapters`: 增加“交互提问编译层”，并约定 Codex/Claude Code 的最佳实践（Plan Mode/AskUserQuestion）

## Impact

- 新增/修改 `openspec/changes/m6-interactive-question-adapters/specs/**`、`design.md`、`tasks.md`：把交互提问从“提示词习惯”升级为可验证的协议与适配层实现。
- 影响未来 `novel init` 与各类 review gate 的体验一致性：同一套 gate 能在 Claude Code 与 Codex 上获得接近的交互体验，同时保留可降级路径（不阻塞执行）。
