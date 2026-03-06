# /novel:continue（Thin Adapter）

你是小说项目的续写适配层：**不做确定性编排/状态机判断/Agent 路由**，只循环调用 `novel` CLI 的 `next/instructions/validate/advance/commit`，并按 instruction packet 指定的 agent 执行。

目标：在不“猜下一步”的前提下，驱动项目从**任意 orchestrator_state** 恢复并继续推进；当处于写作阶段时，可连续提交 N 章。

## 运行约束

- **可用工具**：Read, Write, Edit, Glob, Grep, Bash, Task, AskUserQuestion
- **推荐模型**：sonnet
- **参数**：`[N]` — 目标提交章数，默认 1（建议 ≤ 5）

## 通用规则（先读）

先阅读 `skills/shared/thin-adapter-loop.md`（命令前缀/NOVEL、项目根目录、锁与恢复、命令白名单、标准 Adapter Loop、`next_actions` 语义等通用规则）。

## Step 0: 前置检查 + 状态展示

1) 必须在小说项目目录内（存在 `.checkpoint.json`）
- 若不存在：提示用户先执行 `/novel:start` 初始化项目，然后再回来 `/novel:continue`

2) 展示当前状态（便于用户理解恢复点）：
```bash
${NOVEL} status --json
${NOVEL} next --json
```
> 若 `status` 显示 lock 存在且非 stale：停止执行，避免并发写入冲突。

3) 选择 commit 执行策略（一次性确认）：
- 自动执行 commit (Recommended)
- 每次 commit 前确认
- 不执行 commit（遇到 commit step 就停下）

## Step 1: Adapter loop（重复直到达成 N 章或遇到断点）

维护计数：`committed_chapters = 0`；当你成功执行 `commit --chapter <N>` 时计数 +1。其余 commit（如 `--volume`）不计入章节数。

按 `skills/shared/thin-adapter-loop.md` 的“标准 Adapter Loop（每一轮）”重复执行。

continue 特有规则：

- 遇到 `commit --chapter X` 且执行成功：`committed_chapters += 1`
- commit 完成后可运行 `${NOVEL} next --json` 确认下一步（或直接进入下一轮 loop）
- 对写作类 packet（尤其 `chapter:*:draft` / `quickstart:trial`），若 `packet.manifest.paths.platform_writing_guide` 存在，按原样传给 `chapter-writer`
- 对评分类 packet（尤其 `chapter:*:judge` / `quickstart:results`），若 `chapter <= 3` 且项目存在 `golden-chapter-gates.json`，CLI 生成的 packet 可能包含 `packet.manifest.inline.golden_chapter_gates`；不要在 skill 层重算或改写
- 对评分类 packet（尤其 `chapter:*:judge` / `quickstart:results`），若 `chapter <= 3` 且 `brief.md` 的题材能在 `genre-golden-standards.json` 中匹配，CLI 还可能注入 `packet.manifest.inline.genre_golden_standards`；这是题材特定的 `focus_dimensions / criteria / minimum_thresholds`，需与 `golden_chapter_gates` 叠加评估；skill 层只透传，不要自行补造或改写
- 对 `chapter:*:draft` / `chapter:*:judge` packet，CLI 会按 `canon_status` 过滤上下文：仅 `established`（或缺失字段）规则进入 `hard_rules_list`，`planned` 规则进入 `planned_rules_info`（仅 draft）；draft packet 中已生效角色放入 `character_contracts` / `character_profiles`，planned 角色单独放入 `planned_character_contracts` / `planned_character_profiles`，judge packet 仅保留已生效角色；skill 层只透传，不要自行重算或改写
- 对 `chapter:*:judge` packet，CLI 会优先读取 `chapter_contract.excitement_type`，缺失时回退 `outline.md` 中可选的 `- **ExcitementType**:` 行，并把结果注入 `packet.manifest.inline.excitement_type`（缺失 = `null`）；skill 层只透传给 `quality-judge`，不要自行重算或改写
- 若 QualityJudge 因黄金三章硬门失败而返回相关字段，后续 `novel next --json` 会把它当成强制修订/人工复核信号处理；skill 只按 CLI 给出的下一步继续

### 退出条件

当 `committed_chapters >= N` 时停止，并向用户提示下一步可运行：
```bash
${NOVEL} next --json
```

也可以继续运行 `/novel:continue [N]` 续写更多章节。
