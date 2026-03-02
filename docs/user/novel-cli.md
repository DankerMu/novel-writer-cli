# `novel` CLI（确定性编排核心）

`novel` CLI **不调用任何 LLM API**。它只负责：

- 读取 `.checkpoint.json` 和 `staging/**` 计算确定性的下一步（可中断/可恢复）
- 生成 instruction packet（JSON），作为“编排 → 执行器（Claude Code / Codex）”的稳定边界
- 校验 `staging/**` 产物（validate）并推进 checkpoint（advance）
- 将 `staging/**` 事务提交到正式目录（commit），并更新 `state/` 与 `foreshadowing/`

## 本仓库开发态使用

```bash
# 帮助
npm run dev -- --help

# 或构建后运行
npm run build
node dist/cli.js --help
```

> 发布到 npm 后，目标体验是 `npx novel ...` / `novel ...`。

## 最短路径：跑通“一章的确定性编排”

以下示例假设你已在**小说项目根目录**（含 `.checkpoint.json`），或使用 `--project <dir>` 指定根目录。

### 1) 计算下一步

```bash
novel next
# 或：novel next --json
```

输出类似：

```
chapter:003:draft
```

### 2) 获取 instruction packet

```bash
novel instructions "chapter:003:draft" --json
```

可选：落盘到 `staging/manifests/`（便于审计/回放）：

```bash
novel instructions "chapter:003:draft" --json --write-manifest
```

### 3) 用执行器跑这一步（Claude Code / Codex）

执行器读取 instruction packet：

- `packet.agent.name`：要运行的 subagent（如 `chapter-writer`）
- `packet.manifest`：context manifest（以路径为主）
- `packet.expected_outputs[]`：该步必须写入的 `staging/**` 目标文件

可选：若 packet 同时包含 `novel_ask` + `answer_path`，则该 step 在执行 agent 之前存在一个**交互式 gate**：

- 执行器必须先采集答案并写入 AnswerSpec JSON 到 `answer_path`（并通过校验），才允许继续执行 agent
- 若 `answer_path` 已存在且校验通过，则直接跳过提问（可恢复/可审计）

详见 [交互式门控（NOVEL_ASK）](interactive-gates.md)。

执行器跑完后应回到终端断点（不要自动 commit）。

### 4) 校验并推进 checkpoint

```bash
novel validate "chapter:003:draft"
novel advance "chapter:003:draft"
```

然后再次运行：

```bash
novel next
```

它会基于 `.checkpoint.json.pipeline_stage` + `inflight_chapter` + `staging/**` 的存在性，返回确定性的下一步（例如 `chapter:003:summarize`）。

### 5) 提交事务（commit）

当 `novel next` 返回 `chapter:003:commit` 时：

```bash
novel commit --chapter 3
```

可先看计划但不落盘：

```bash
novel commit --chapter 3 --dry-run
```

commit 会执行（见 PRD §10.4）：

- 移动 staging 产物到正式目录：`chapters/`、`summaries/`、`evaluations/`、`storylines/`、`state/`
- 合并 `staging/state/chapter-XXX-delta.json` → `state/current-state.json`（并 append `state/changelog.jsonl`）
- 从 delta 的 `foreshadow` ops 更新 `foreshadowing/global.json`
- 更新 `.checkpoint.json`：`last_completed_chapter`、`pipeline_stage="committed"`、`inflight_chapter=null`

## 角色语气漂移（M7H.3，可选）

角色语气漂移用于：为关键角色建立“台词基线画像”，并在后续章节检测偏移，生成纠偏指令 `character-voice-drift.json`，直到恢复为止（自动清除）。

```bash
# 初始化基线画像（建议在 quick-start 章节后）
novel voice init --protagonist <character_id> --core-cast a,b,c --apply

# 手动检测/更新漂移文件（预览：不写文件；加 --apply 则写/清理）
novel voice check --apply
```

一旦存在 `character-voice-drift.json`，后续 `chapter:*:draft` / `chapter:*:refine` 的 instruction packet 会自动注入纠偏指令（`packet.manifest.inline.character_voice_drift` + `packet.manifest.paths.character_voice_drift`）。

## 中断恢复示例

场景：你在 `chapter:048:draft` 后中断了执行器。

1) 重新进入项目目录后直接运行：
```bash
novel next
```

2) 若 `staging/chapters/chapter-048.md` 不存在，会回到：
```
chapter:048:draft
```

3) 若章节已写到 staging，但 summary/delta/crossref 不完整，会返回：
```
chapter:048:summarize
```

4) 若已 refined 但 eval 缺失，通常会返回：
```
chapter:048:judge
```
（若启用 `platform-profile.json.retention.title_policy.enabled=true`：当 `auto_fix=true` 时可能先返回 `chapter:048:title-fix`；当 `auto_fix=false` 且存在 hard 违规则可能返回 `chapter:048:review`。）

5) 若 eval 已存在，通常会返回：
```
chapter:048:commit
```

但当启用 `platform-profile.json.retention.title_policy.enabled=true` 且 `platform-profile.json.retention.title_policy.auto_fix=true` 且标题缺失/不合规时，可能改为返回：
```
chapter:048:title-fix
```
（自动一次：只允许修改**标题行**，正文必须 byte-identical；若仍不满足则返回 `chapter:048:review` 进入人工处理）。

当启用 `platform-profile.json.hook_policy.required=true` 且章末钩子缺失/偏弱时，可能改为返回：
```
chapter:048:hook-fix
```
（自动一次，且只允许修改最后 1–2 段），若仍不满足 hook 门槛则返回：
```
chapter:048:review
```
（人工处理后再重新 judge/commit）。

> 这使得你可以在任何时刻中断并恢复：只要 `.checkpoint.json` 和 `staging/**` 未被破坏，`novel next` 就能给出确定性的下一步。

## 平台画像与动态评分（M6）

- `platform-profile.json`：平台画像/约束配置（字数/合规/信息负载/钩子策略/评分策略）。`platform` 与 `scoring.genre_drive_type` 一旦写入视为该项目的不可变绑定；若要更换平台/驱动类型，建议新建项目目录重新初始化。
- `genre-weight-profiles.json`：质量评分动态权重库；QualityJudge 的权重以 instruction packet JSON 的 `manifest.inline.scoring_weights` 为准（由 `platform-profile.json.scoring` + `genre-weight-profiles.json` 计算得到；commit 后也会写入 `evaluations/*-eval.json.scoring_weights`）。
- 当 `platform-profile.json.hook_policy.required=true` 时，QualityJudge 会额外输出 `hook_strength`（章末钩子强度），并且 `novel next` 在必要时会插入 `hook-fix` 微步骤来补强章末钩子。
