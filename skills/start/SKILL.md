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

2) 再询问用户的**预期题材**（仅用于兼容性提醒与后续 `brief.md` 对齐，不阻断 init）：
- `玄幻 (xuanhuan)`
- `都市 (dushi)`
- `科幻 (scifi)`
- `历史 (history)`
- `悬疑 (suspense)`
- `言情 (romance)`

> 选择后提醒用户：后续填写 `brief.md` 时，`- **题材**：` 字段应与这里保持一致，否则 CLI 无法稳定匹配 `genre_excitement_map` / `genre_golden_standards`。

3) 若可读取到当前项目根目录中的 `genre-golden-standards.json`，或可读取到 CLI 自带的同名模板，且用户选择的 genre + platform 命中 `invalid_combinations`，显示 WARNING，但继续初始化（不阻断）；若两处都不可读（例如全新空目录尚未 init），则跳过检查且不提示。

4) 执行初始化：
- `${NOVEL} init --platform <qidian|fanqie|jinjiang>` 或
- `${NOVEL} init`

> `init` 只负责创建 `.checkpoint.json` + `staging/**`（以及可选平台模板）。后续所有流程都由 `next/instructions` 驱动。
>
> 这是 thin adapter 的启动 bootstrap：`novel next` 依赖 `.checkpoint.json`，因此 `init` 不属于 `next/instructions` 循环的一部分。

## Step 1: Adapter loop（持续推进直到断点）

按 `skills/shared/thin-adapter-loop.md` 的“标准 Adapter Loop（每一轮）”重复执行，覆盖 `QUICK_START → VOL_PLANNING → WRITING` 全流程，直到遇到需要用户决策的断点（manual-review / chapter review / commit 确认等）。

## 常见断点策略（建议）

- 遇到 `${NOVEL} commit ...`：执行前用 AskUserQuestion 让用户确认（commit 会移动 staging → final）；commit 后运行 `${NOVEL} next --json` 继续
- QUICK_START 顺序固定为 `world → characters → style → f0 → trial → results`；不要跳步，也不要凭经验跳过 `novel validate` / `novel advance`
- 遇到 `quickstart:f0` / PlotArchitect packet 时，把它当成 `vol-01` 的迷你规划：生成 chapters `1..3` 的 `outline.md`、3 个 L3 契约、`storyline-schedule.json`、`foreshadowing.json`（以及 `new-characters.json`），先写到 `staging/volumes/vol-01/`，经 `novel validate quickstart:f0` 校验后，再由 `novel advance quickstart:f0` 提交到 `volumes/vol-01/`
- Quick Start resume 语义：`quickstart_phase=style` 的下一步是 `f0`；`quickstart_phase=f0` 且 `volumes/vol-01/` 种子已提交时，下一步是 `trial`
- 遇到 `quickstart:trial` / `quickstart:results` 且 packet manifest 中存在 `paths.chapter_contract` / `paths.volume_outline` / `paths.volume_foreshadowing` 时，原样透传给 ChapterWriter / QualityJudge；这些都是来自 `volumes/vol-01/` 的黄金三章规划产物。若缺失，则保持 legacy free-writing fallback
- 遇到 `volume:outline` / PlotArchitect packet 时，若 `packet.manifest.inline.genre_excitement_map` 存在，原样透传给 `plot-architect`；这是 CLI 按 `brief.md` 题材匹配后的 Ch1-3 默认爽点映射，skill 层不要重算或改写
- 遇到 `review:*`（卷末回顾）：按 packet.next_actions 执行；必要时暂停让用户阅读 `volumes/vol-XX/review.md`
