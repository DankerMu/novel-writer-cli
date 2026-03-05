## 3. 入口 Skills

> 说明：本页为入口 skill 文档的快照（便于 Tech Spec 自包含）。canonical 以 `skills/**/SKILL.md` 为准；修改 skill 后需同步更新此处（可用 `node scripts/sync-final-spec-skills.mjs` 生成）。

### 3.1 `/novel:start` — 启动适配层（Thin Adapter）

## 文件路径：`skills/start/SKILL.md`

````markdown
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
- `tomato`
- 暂不设置（后续可手动补齐 `platform-profile.json`）

2) 执行初始化：
- `${NOVEL} init --platform <qidian|tomato>` 或
- `${NOVEL} init`

> `init` 只负责创建 `.checkpoint.json` + `staging/**`（以及可选平台模板）。后续所有流程都由 `next/instructions` 驱动。
>
> 这是 thin adapter 的启动 bootstrap：`novel next` 依赖 `.checkpoint.json`，因此 `init` 不属于 `next/instructions` 循环的一部分。

## Step 1: Adapter loop（持续推进直到断点）

按 `skills/shared/thin-adapter-loop.md` 的“标准 Adapter Loop（每一轮）”重复执行，覆盖 `QUICK_START → VOL_PLANNING → WRITING` 全流程，直到遇到需要用户决策的断点（manual-review / chapter review / commit 确认等）。

## 常见断点策略（建议）

- 遇到 `${NOVEL} commit ...`：执行前用 AskUserQuestion 让用户确认（commit 会移动 staging → final）；commit 后运行 `${NOVEL} next --json` 继续
- 遇到 `review:*`（卷末回顾）：按 packet.next_actions 执行；必要时暂停让用户阅读 `volumes/vol-XX/review.md`
````

---

### 3.2 `/novel:continue` — 续写适配层（Thin Adapter）

## 文件路径：`skills/continue/SKILL.md`

````markdown
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

### 退出条件

当 `committed_chapters >= N` 时停止，并向用户提示下一步可运行：
```bash
${NOVEL} next --json
```

也可以继续运行 `/novel:continue [N]` 续写更多章节。
````

---

### 3.3 `/novel:status` — 只读状态展示

## 文件路径：`skills/status/SKILL.md`

````markdown
# 项目状态查看

你是小说项目状态分析师，向用户展示当前项目的全景状态。

## 运行约束

- **可用工具**：Read, Glob, Grep
<!-- 推荐模型：sonnet（由 orchestrator 决定） -->

## 执行流程

### Step 1: 读取核心文件

#### 前置检查

- 若 `.checkpoint.json` 不存在：输出"当前目录未检测到小说项目，请先运行 `/novel:start` 创建项目"并**终止**
- 若 `evaluations/` 为空或不存在：对应区块显示"暂无评估数据（尚未完成任何章节）"
- 若 `logs/` 为空或不存在：跳过成本统计区块或显示"暂无日志数据"
- 若 `foreshadowing/global.json` 不存在：跳过伏笔追踪区块或显示"暂无伏笔数据"
- 若 `volumes/vol-{V:02d}/storyline-schedule.json` 不存在：跳过故事线节奏区块或显示"暂无故事线调度数据"
- 若 `style-drift.json` 不存在：风格漂移区块显示"未生成纠偏文件（style-drift.json 不存在）"
- 若 `ai-blacklist.json` 不存在：黑名单维护区块显示"未配置 AI 黑名单"

```
1. .checkpoint.json → 当前卷号、章节数、状态
2. brief.md → 项目名称和题材
3. state/current-state.json → 角色位置、情绪、关系
4. foreshadowing/global.json → 伏笔状态
5. volumes/vol-{V:02d}/storyline-schedule.json → 本卷故事线调度（节奏提示用）
6. Glob("summaries/chapter-*-summary.md") → 提取 storyline_id（节奏提示用）
7. Glob("evaluations/chapter-*-eval.json") → 所有评分
8. Glob("chapters/chapter-*.md") → 章节文件列表（统计字数）
9. Glob("logs/chapter-*-log.json") → 流水线日志（成本、耗时、修订次数）
```

### Step 2: 计算统计

#### 数据字段来源

| 指标 | 来源文件 | JSON 路径 |
|------|---------|----------|
| 综合评分 | `evaluations/chapter-*-eval.json` | `.overall_final` |
| 门控决策 | `logs/chapter-*-log.json` | `.gate_decision` |
| 修订次数 | `logs/chapter-*-log.json` | `.revisions` |
| 强制通过 | `logs/chapter-*-log.json` | `.force_passed` |
| 伏笔状态 | `foreshadowing/global.json` | `.foreshadowing[].status` ∈ `{"planted","advanced","resolved"}` |
| Token/成本 | `logs/chapter-*-log.json` | `.stages[].input_tokens` / `.stages[].output_tokens` / `.total_cost_usd` |
| 漂移状态 | `style-drift.json` | `.active` / `.drifts[]` |
| 黑名单版本 | `ai-blacklist.json` | `.version` / `.last_updated` / `.words` / `.whitelist` |

```
- 总章节数
- 总字数（估算：章节文件大小）
- 评分均值（overall 字段平均）
- 评分趋势（最近 10 章 vs 全局均值）
- 各维度均值
- 未回收伏笔数量和列表（planted/advanced）
- 超期 short 伏笔数量与列表（`scope=="short"` 且 `status!="resolved"` 且 `last_completed_chapter > target_resolve_range[1]`）（规则定义见 `skills/continue/references/foreshadowing.md` §4）
- 故事线节奏提示（基于 summaries 的 storyline_id + schedule 的 `secondary_min_appearance`）
- 活跃角色数量
- 累计成本（sum total_cost_usd）、平均每章成本、平均每章耗时
- 修订率（revisions > 0 的章节占比）
```

#### 故事线节奏提示（轻量、只读）

1. 读取并解析 `volumes/vol-{V:02d}/storyline-schedule.json`（如存在）：
   - `active_storylines[]`（storyline_id + volume_role）
   - `interleaving_pattern.secondary_min_appearance`（形如 `"every_8_chapters"`）
2. 从 `secondary_min_appearance` 解析最小出场频率窗口：
   - 若匹配 `^every_(\\d+)_chapters$` → `N = int(...)`
   - 否则 `N = null`（仅展示 last_seen，不做“疑似休眠”判断）
3. 从 `summaries/chapter-*-summary.md` 提取每章 `storyline_id`：
   - 建议只扫描最近 60 章 summaries（从新到旧），用正则 `^- storyline_id:\\s*(.+)$` 抽取
   - 得到 `last_seen_chapter_by_storyline`
4. 对每个 `active_storylines[]`：
   - `chapters_since_last = last_completed_chapter - last_seen_chapter`（未出现过则显示“未出现”）
   - 若 `volume_role=="secondary"` 且 `N!=null` 且 `chapters_since_last > N` → 记为“疑似休眠”（提示用户在后续章节/大纲中安排一次出场或通过回忆重建）

### Step 3: 格式化输出

```
📖 {project_name}
━━━━━━━━━━━━━━━━━━━━━━━━
进度：第 {vol} 卷，第 {ch}/{total_ch} 章
总字数：{word_count} 万字
状态：{state}

质量评分：
  均值：{avg}/5.0（近10章：{recent_avg}/5.0）
  最高：Ch {best_ch} — {best_score}
  最低：Ch {worst_ch} — {worst_score}

伏笔追踪：
  活跃：{active_count} 个
  已回收：{resolved_count} 个
  超期 short（超过 target_resolve_range 上限）：{overdue_short}

故事线节奏：
  本卷活跃线：{active_storylines_brief}
  疑似休眠：{dormant_hints}

活跃角色：{character_count} 个

成本统计：
  累计：${total_cost}（{total_chapters} 章）
  均章成本：${avg_cost}/章
  均章耗时：{avg_duration}s
  修订率：{revision_rate}%
```

## 约束

- 纯只读，不写入任何文件
- 不触发状态转移
- 所有输出使用中文
````

---
