## Context

`novel` 的初始化（init）与部分 review gate（平台绑定、叙事驱动类型选择、阈值微调、是否继续推进等）需要稳定、可回放的交互提问能力。

如果这些提问散落在自然语言 prompt 中：
- 执行器（Claude Code / Codex）之间的交互体验与回答结构会不一致
- 难以落盘审计（无法复现“当时问了什么 / 选了什么”）
- 无法在确定性编排边界上表达“blocked until answered”

因此需要一个工具无关的问卷 IR，并为不同执行器做适配编译。

## Goals / Non-Goals

**Goals**
- 定义工具无关的问卷 IR：`NOVEL_ASK`（QuestionSpec）
- 规定回答落盘契约（路径、schema、校验）
- 定义从 `NOVEL_ASK` 到 Claude Code / Codex 交互工具的编译策略
- 提供降级路径：当原生提问工具不可用时，仍可通过严格格式的文本提问完成采集

**Non-Goals**
- 不在本 change 内实现完整 `novel init`（只提供 IR + 适配协议）
- 不强依赖某一个执行器的 UI（保持 IR 工具无关）

## Design

### 1) `NOVEL_ASK`（QuestionSpec）结构

核心字段：
- `version`：IR 版本号（整数）
- `topic`：提问主题（用于日志/审计）
- `questions[]`：问题列表（顺序即提问顺序）

每个 question 至少包含：
- `id`：稳定 ID（snake_case），用于答案映射与落盘
- `header`：短标题（展示用）
- `question`：完整提问句
- `kind`：`single_choice | multi_choice | free_text`
- `options[]`：可选项（choice 类型必填；每项含 `label` + `description`）
- `required`：是否必答
- `default`：默认值（可选）
- `allow_other`：是否允许自由输入（choice 类型可选）

### 2) 回答落盘（AnswerSpec）

`NOVEL_ASK` 的回答必须可审计、可校验、可恢复：
- 以 JSON 写入 `answer_path`（由编排器在 instruction packet 中给出）
- 结构为单对象 `{version, topic, answers, answered_at}`：
  - `answers` 是 `{[question_id]: value}` 映射
  - `value` 类型随 question.kind 决定（string / string[] / object）

编排器在继续执行后续 step 前，必须校验答案是否满足 required 与枚举合法性。

### 3) 执行器适配编译

**Claude Code**
- 将 `NOVEL_ASK` 编译为一次或多次 `AskUserQuestion`（支持 choice + allow_other）
- 收到答案后，按 AnswerSpec 落盘

**Codex**
- 优先在 Plan Mode 中使用 `request_user_input`（多问题一次性收集，选项互斥）
- 若处于非 Plan Mode / 工具不可用：降级为“严格格式文本提问”，要求用户按 JSON 回答，并在写入前校验 schema

### 4) 与 instruction packet 的关系

`NOVEL_ASK` 作为 instruction packet 的可选字段出现，用于表达：
- 某个 step 在执行前需要回答（blocked）
- 回答的落盘位置与后续解锁的 step/配置（unlocks）

该机制为 M6 的 init gate（平台绑定、genre_drive_type、阈值微调）提供统一交互边界。

## References

- `openspec/changes/m6-platform-optimization/proposal.md`
