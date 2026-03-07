# 规划本卷 / 规划新卷

> 仅当 `orchestrator_state == "VOL_PLANNING"`（或完成卷末回顾后进入 VOL_PLANNING）时执行。

0. 计算本卷规划章节范围（确定性）：
   - `V = current_volume`
   - 默认 `plan_start = last_completed_chapter + 1`
   - `plan_end = V * 30`（每卷 30 章约定；如 `plan_start > plan_end` 视为数据异常，提示用户先修复 `.checkpoint.json`）
   - 若 `V == 1` 且 `volumes/vol-01/chapter-contracts/chapter-001.json`、`chapter-002.json`、`chapter-003.json` 已存在（来自 Quick Start F0），则把它们视为只读 seed：`plan_start = 4`，并记录 `seed_range = [1,3]`
   - 创建目录（幂等）：`mkdir -p staging/volumes/vol-{V:02d}/chapter-contracts`
1. 若 `.checkpoint.json.pending_actions` 存在与本卷有关的 `type == "spec_propagation"` 待办（例如世界规则/角色契约变更影响到 `plan_start..plan_end`）：
   - 展示待办摘要（变更项 + 受影响角色/章节契约）
   - AskUserQuestion 让用户选择：
     1) 先处理待办并重新生成受影响契约 (Recommended)
     2) 继续规划（保留待办，后续人工处理）
     3) 取消
2. 组装 PlotArchitect context（确定性，按 `docs/dr-workflow/novel-writer-tool/final/prd/08-orchestrator.md` §8.3）：
   - `volume_plan`: `{ "volume": V, "chapter_range": [plan_start, plan_end] }`
   - `prev_volume_review`：读取 `volumes/vol-{V-1:02d}/review.md`（如存在，以 `<DATA type="summary" ...>` 注入）
   - `global_foreshadowing`：读取 `foreshadowing/global.json`
   - 可选：`promise_ledger_report_summary`：读取 `logs/promises/latest.json`（如存在）并裁剪为小体积摘要（建议仅保留 scope/stats/issues/dormant_promises 的前 5 条），作为“承诺推进/沉默提醒”的规划上下文（非剧透、不兑现）
   - 可选：`engagement_report_summary`：读取 `logs/engagement/latest.json`（如存在）并裁剪为小体积摘要（建议仅保留 scope/stats/issues 的前 5 条），作为“爽点/推进密度”窗口提示（非剧透）
   - 可选：`foreshadow_light_touch_tasks`：读取 `logs/foreshadowing/latest.json`（如存在）并从其中 `dormant_items[]` 提取（按沉默章数降序，建议取前 10）。字段建议：
     - `{id, scope, status, chapters_since_last_update, instruction}`，其中 `instruction` 使用报告中的 `planning_task`（非剧透，不兑现）
   - `storylines`：读取 `storylines/storylines.json`
   - `world_docs`：读取 `world/*.md`（以 `<DATA type="world_doc" ...>` 注入）+ `world/rules.json`（结构化 JSON）
   - `characters`：读取 `characters/active/*.md`（以 `<DATA type="character_profile" ...>` 注入）+ `characters/active/*.json`（L2 contracts 结构化 JSON）
   - `user_direction`：用户额外方向指示（如有）
   - `prev_chapter_summaries`（首卷替代 `prev_volume_review`）：若 `prev_volume_review` 不存在且 `last_completed_chapter > 0`，读取最近 3 章 `summaries/chapter-*-summary.md` 作为上下文（黄金三章是 QUICK_START 多轮交互的核心产出，PlotArchitect 必须基于其已建立的人物关系和情节基调规划后续章节），以 `<DATA type="summary" ...>` 注入
   - 当 `plan_start > 1`（首卷已有 F0 种子）时，额外提供 `existing_volume_outline` / `existing_storyline_schedule` / `existing_foreshadowing` / `existing_chapter_contracts_dir`，并在 inline 中标注 `volume_plan_seed_range=[1,3]`
3. 使用 Task 派发 PlotArchitect Agent 生成本卷规划产物（写入 staging 目录，step 6 commit 到正式路径）：
   - `staging/volumes/vol-{V:02d}/outline.md`（严格格式：每章 `###` 区块 + 固定 `- **Key**:` 行）
   - `staging/volumes/vol-{V:02d}/storyline-schedule.json`
   - `staging/volumes/vol-{V:02d}/foreshadowing.json`
   - `staging/volumes/vol-{V:02d}/new-characters.json`（可为空数组）
   - `staging/volumes/vol-{V:02d}/chapter-contracts/chapter-{C:03d}.json`（`C ∈ [plan_start, plan_end]`）
   - 若已有 `seed_range=[1,3]`：只生成新章节（从 4 开始），不得重写 `chapter-001/002/003.json`
   - commit 合并策略：`storyline-schedule.json` 的 `active_storylines` 去重合并；`foreshadowing.json` 按 `id` 合并并保留既有 `history`；`new-characters.json` 按 `name|first_chapter` 去重
   - （注意：`foreshadowing/global.json` 为事实索引，由 `/novel:continue` 在每章 commit 阶段从 `foreshadow` ops 更新；卷规划阶段不生成/覆盖 global.json）
4. 规划产物校验（对 `staging/` 下的产物执行；失败则停止并给出修复建议，禁止“缺文件继续写”导致断链）：
   - `outline.md` 可解析：可用 `/^### 第 (\\d+) 章/` 找到章节区块，且连续覆盖 `plan_start..plan_end`（不允许跳章，否则下游契约缺失会导致流水线崩溃）
   - 每个章节区块包含固定 key 行：`Storyline/POV/Location/Conflict/Arc/Foreshadowing/StateChanges/TransitionHint`
     - 兼容旧大纲时，`ExcitementType` 可作为可选第 9 行；新生成的大纲应显式输出该行（无显式爽点写 `null`）
     - 若存在 `ExcitementType`，其值必须是 `reversal | face_slap | power_up | reveal | cliffhanger | setup | null`；未知值仅警告并按 `null` 处理，不阻断流水线
     - 允许 `TransitionHint` 值为空；但 key 行必须存在（便于机器解析）
   - `storyline-schedule.json` 可解析（JSON），`active_storylines` ≤ 4，且本卷 `outline.md` 中出现的 `storyline_id` 均属于 `active_storylines`
   - `chapter-contracts/` 全量存在且可解析（JSON），并满足最小一致性检查：
     - `chapter == C`
     - `storyline_id` 与 outline 中 `- **Storyline**:` 一致
     - `excitement_type` 缺失仅警告并按 `null` 处理；若存在未知值同样仅警告，不阻断流水线
     - `objectives` 至少 1 条 `required: true`
     - 若已有 `seed_range=[1,3]`，则校验范围只覆盖新增章节；`chapter-001/002/003.json` 视为既有只读输入，不应出现在 staging 重写结果中
   - 链式传递检查（最小实现）：若 `chapter-{C-1}.json.postconditions.state_changes` 中出现角色 X，则 `chapter-{C}.json.preconditions.character_states` 必须包含 X（值可不同，代表显式覆盖）。对 `plan_start` 章：若 `chapter-{plan_start-1}.json` 不存在（如首卷试写章无契约），跳过该章的链式传递检查，其 preconditions 由 PlotArchitect 从试写摘要派生
   - `foreshadowing.json` 与 `new-characters.json` 均存在且为合法 JSON
5. 审核点交互（AskUserQuestion）：
   - 展示摘要：
     - `storyline-schedule.json` 的活跃线与交汇事件概览
     - 每章 1 行清单：`Ch C | Storyline | Conflict | required objectives 简写`
   - 让用户选择：
     1) 确认并进入写作 (Recommended)
     2) 我想调整方向并重新生成（清空 `staging/volumes/` 和 `staging/foreshadowing/` 后重新派发 PlotArchitect）
     3) 暂不进入写作（保持 VOL_PLANNING，规划产物保留在 staging 中）
6. 若确认进入写作：
   - commit 规划产物（staging → 正式目录）：
     - 常规情况：`mv staging/volumes/vol-{V:02d}/* → volumes/vol-{V:02d}/`
     - 首卷已有 F0 seed 时：`outline.md` 只追加新章节到已有 1-3 章之后；`storyline-schedule.json` / `foreshadowing.json` 做增量合并，保留 F0 的 seed 条目；`chapter-001/002/003.json` 保持只读不覆盖，只复制新章节契约（从 4 开始）
     - 清空 `staging/volumes/` 和 `staging/foreshadowing/`
   - 读取 `volumes/vol-{V:02d}/new-characters.json`：
     - 若非空：批量调用 CharacterWeaver 创建角色档案 + L2 契约（按 `first_chapter` 升序派发 Task，便于先创建早出场角色）
   - 更新 `.checkpoint.json`（`orchestrator_state = "WRITING"`, `pipeline_stage = null`, `inflight_chapter = null`, `revision_count = 0`）
