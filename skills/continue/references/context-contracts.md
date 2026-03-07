# Agent Context Manifest 字段契约

## 概述

入口 Skill 为每个 Agent 组装一份 **context manifest**，包含两类字段：

- **inline**（内联）：由编排器确定性计算，直接写入 Task prompt——适用于需要预处理/裁剪/跨文件聚合的数据
- **paths**（文件路径）：指向项目目录下的文件，由 subagent 用 Read 工具自行读取——适用于大段原文内容

设计原则：
- 同一输入 + 同一项目文件 = 同一 manifest（确定性）
- paths 中的文件均为项目目录下的相对路径
- 可选字段缺失时不出现在 manifest 中（非 null）
- subagent 读取的文件内容不再需要 `<DATA>` 标签包裹（由 agent frontmatter 中的安全约束处理）

---

## ChapterWriter manifest

```
chapter_writer_manifest = {
  # ── inline（编排器计算） ──
  chapter: int,
  volume: int,
  storyline_id: str,
  chapter_outline_block: str,           # 从 outline.md 提取的本章区块文本
  storyline_context: {                  # 从 chapter_contract/schedule 解析
    last_chapter_summary: str,
    chapters_since_last: int,
    line_arc_progress: str,
  },
  concurrent_state: {str: str},         # 其他活跃线一句话状态
  transition_hint: obj | null,          # 切线过渡
  hard_rules_list: [str],              # L1 禁止项列表（仅 established / 缺失 canon_status 的 hard 规则；即使为空也显式提供）
  world_rules_context_degraded?: bool, # 可选：world/rules.json 存在但 CLI 读取/解析降级；此时 hard_rules_list 可能不完整，应直接读取 paths.world_rules 复核
  planned_rules_info?: [obj],          # 可选：planned L1 规则（hard/soft 都保留原 constraint_type，仅供伏笔/铺垫参考，不绑定）
  foreshadowing_tasks: [obj],          # 本章伏笔任务子集
  foreshadow_light_touch_tasks?: [     # 可选：伏笔沉默超阈值时的“轻触提醒”（非剧透、不兑现）；为空则省略该字段
    {id: str, scope: str, status: str, chapters_since_last_update: int, instruction: str}
  ],
  foreshadow_light_touch_degraded?: bool, # 可选：若为 true 表示“轻触提醒”注入降级（如伏笔数据不可读），不等同于“没有需要提醒的条目”
  ai_blacklist_top10: [str],           # 有效黑名单前 10 词
  statistical_targets?: {              # 可选：6 维统计目标（style-profile → CW 的软约束）
    sentence_length_std_dev: {target: number | null, fallback_range: [number, number], fallback_applied: bool},
    paragraph_length_cv: {target: number | null, fallback_range: [number, number], fallback_applied: bool},
    vocabulary_diversity: {target: "high|medium|low", source_field: "vocabulary_richness", fallback_applied: bool},
    narration_connectors: {target: 0, source_field: "ai-blacklist.category_metadata.narration_connector", fallback_applied: false, note: str},
    register_mixing: {target: "high|medium|low", fallback_applied: bool},
    emotional_arc: {target: "high|medium|low", source_field: "emotional_volatility", fallback_applied: bool},
  },
  genre_overrides?: {                  # 可选：按 brief 显式覆写说明 / 题材字段派生的结构阈值
    genre: str,
    source: {brief: "brief.md", mode: "brief_override_notes" | "brief_genre_fallback"},
    explicit_notes: str | null,
    paragraph_structure: {single_sentence_ratio: {min: number, max: number}, max_paragraph_chars: number},
    punctuation_rhythm: {ellipsis_max_per_chapter: number, exclamation_max_per_chapter: number, em_dash_max_per_chapter: 0},
    notes: [str],
  },
  style_drift_directives: [str] | null, # 漂移纠偏指令（active 时注入）
  statistical_targets: {              # 6 维统计目标（来自 style-profile；null 已按默认人类范围补齐）
    sentence_length_std_dev: number | [number, number],
    paragraph_length_cv: number | [number, number],
    vocabulary_diversity: "high" | "medium" | "low",
    narration_connectors: 0,
    register_mixing: "high" | "medium" | "low",
    emotional_arc: "high" | "medium" | "low",
    fallback_applied?: [str],
  },
  genre_overrides?: {                 # 可选：类型覆写参数（优先 brief 显式覆写，再回退 brief.genre）
    genre: str,
    paragraph_structure?: {single_sentence_ratio: [number, number], paragraph_char_max: int},
    punctuation_rhythm?: {ellipsis_per_chapter_max?: int, exclamation_per_chapter_max?: int, em_dash_per_chapter_max: 0},
    blacklist_overrides?: {per_chapter_max?: {str: int}},
    notes?: [str],
  },
  engagement_report_summary?: obj,     # 可选：爽点/信息密度窗口报告摘要（logs/engagement/latest.json 裁剪）
  promise_ledger_report_summary?: obj, # 可选：承诺台账窗口报告摘要（logs/promises/latest.json 裁剪）
  engagement_report_summary_degraded?: bool,     # 可选：为 true 表示 latest.json 存在但摘要裁剪失败
  promise_ledger_report_summary_degraded?: bool, # 可选：为 true 表示 latest.json 存在但摘要裁剪失败

  # ── paths（subagent 自读） ──
  paths: {
    style_profile: "style-profile.json",                              # 必读（含 style_exemplars + writing_directives）
    platform_profile: "platform-profile.json",                        # 可选（平台字数/钩子策略/信息负载等）
    platform_writing_guide: "platform-writing-guide.md",              # 可选（平台节奏/对话比例/钩子/情绪回报/文风要求）
    style_drift: "style-drift.json",                                  # 可选
    chapter_contract: "volumes/vol-{V:02d}/chapter-contracts/chapter-{C:03d}.json",
    volume_outline: "volumes/vol-{V:02d}/outline.md",
    current_state: "state/current-state.json",
    world_rules: "world/rules.json",                                  # 可选
    recent_summaries: ["summaries/chapter-{C-1:03d}-summary.md", ...], # 近 3 章
    storyline_memory: "storylines/{storyline_id}/memory.md",           # 可选
    adjacent_memories: ["storylines/{adj_id}/memory.md", ...],         # 可选
    character_profiles?: ["characters/active/{slug}.md", ...],         # 可选：裁剪后选取（仅 established / 缺失 canon_status）
    character_contracts?: ["characters/active/{slug}.json", ...],      # 可选：裁剪后选取（仅 established / 缺失 canon_status；当前章需遵守的 L2 约束）
    planned_character_profiles?: ["characters/active/{slug}.md", ...],  # 可选：planned 角色档案（仅供铺垫/预告参考）
    planned_character_contracts?: ["characters/active/{slug}.json", ...], # 可选：planned 角色契约（仅供铺垫/预告参考，不绑定）
    # 若 chapter_contract 显式命中角色，则走 preferred 路径，不受 fallback 的 15 角色上限约束；
    # 15 角色上限仅适用于未命中时的回退裁剪（draft 共享 active/planned 配额）。
    project_brief: "brief.md",
    style_guide: "skills/novel-writing/references/style-guide.md",           # 可选
    engagement_report_latest: "logs/engagement/latest.json",                # 可选（如存在；用于读取完整报告）
    promise_ledger_report_latest: "logs/promises/latest.json",              # 可选（如存在；用于读取完整报告）
  }
}
```

**`statistical_targets` 默认值约定：**
- `sentence_length_std_dev` 缺失 / `null` → `[8, 18]`
- `paragraph_length_cv` 缺失 / `null` → `[0.4, 1.2]`
- `vocabulary_diversity` / `register_mixing` / `emotional_arc` 缺失 / `null` → `"medium"`
- `narration_connectors` 始终为 `0`（叙述连接词目标值）

**`genre_overrides` 来源优先级：**
1. `brief.md` 中显式写出的类型覆写
2. `brief.md` 的题材字段（命中 style-guide §2.11 的默认覆写）
3. 未命中时省略该字段，ChapterWriter 回退到通用阈值

### 修订模式追加字段

```
chapter_writer_revision_manifest = chapter_writer_manifest + {
  # ── inline 追加 ──
  required_fixes: [{target: str, instruction: str}],  # QualityJudge 最小修订指令（与 eval 输出格式一致）
  high_confidence_violations: [obj],    # confidence="high" 的违约条目

  # ── paths 追加 ──
  paths += {
    chapter_draft: "staging/chapters/chapter-{C:03d}.md",  # 待修订的现有正文
    chapter_eval: "staging/evaluations/chapter-{C:03d}-eval.json",  # 可选（hook-fix/修订时提供的评估上下文）
  }
}
```

---

## Summarizer manifest

```
summarizer_manifest = {
  # ── inline ──
  chapter: int,
  volume: int,
  storyline_id: str,
  foreshadowing_tasks: [obj],
  entity_id_map: {slug_id: display_name},
  hints: [str] | null,                 # ChapterWriter 输出的 hints JSON（编排器从 ChapterWriter 输出末尾的 ```json{"chapter":N,"hints":[...]}``` 块解析；解析失败则为 null）

  # ── paths ──
  paths: {
    chapter_draft: "staging/chapters/chapter-{C:03d}.md",
    current_state: "state/current-state.json",
  }
}
```

---

## StyleRefiner manifest

```
style_refiner_manifest = {
  # ── inline ──
  chapter: int,
  style_drift_directives: [str] | null,
  engagement_report_summary?: obj,     # 可选：爽点/信息密度窗口报告摘要（logs/engagement/latest.json 裁剪）
  promise_ledger_report_summary?: obj, # 可选：承诺台账窗口报告摘要（logs/promises/latest.json 裁剪）
  engagement_report_summary_degraded?: bool,
  promise_ledger_report_summary_degraded?: bool,

  # ── paths ──
  paths: {
    chapter_draft: "staging/chapters/chapter-{C:03d}.md",
    style_profile: "style-profile.json",         # 必读（含 style_exemplars）
    style_drift: "style-drift.json",             # 可选
    ai_blacklist: "ai-blacklist.json",
    style_guide: "skills/novel-writing/references/style-guide.md",
    previous_change_log: "staging/logs/style-refiner-chapter-{C:03d}-changes.json",  # 仅二次润色时出现；首次润色不含此字段
    engagement_report_latest: "logs/engagement/latest.json",                         # 可选
    promise_ledger_report_latest: "logs/promises/latest.json",                       # 可选
  }
}
```

---

## QualityJudge manifest

```
quality_judge_manifest = {
  # ── inline ──
  chapter: int,
  volume: int,
  chapter_outline_block: str,
  hard_rules_list: [str],              # 仅 established / 缺失 canon_status 的 hard 规则（即使为空也显式提供）
  world_rules_context_degraded?: bool, # 可选：world/rules.json 存在但 CLI 读取/解析降级；此时需直接读取 paths.world_rules 复核
  blacklist_lint: obj | null,                    # scripts/lint-blacklist.sh 输出
  ner_entities: obj | null,                      # scripts/run-ner.sh 输出
  continuity_report_summary: obj | null,         # logs/continuity/latest.json 裁剪
  statistical_profile?: {                 # 可选：deterministic lint + heuristic 聚合的 7 指标 profile
    source: "deterministic_lint+heuristic",
    chapter_path: str,
    blacklist_hit_rate: number | null,
    sentence_repetition_rate: number,
    sentence_length_std_dev: number,
    paragraph_length_cv: number,
    vocabulary_diversity_score: number,
    vocabulary_richness_estimate: "high" | "medium" | "low",
    narration_connector_count: number | null,
    humanize_technique_variety: number,
  },
  structural_rule_violations?: [          # 可选：lint-structural 输出的结构违规
    {rule_id: str, severity: "warning" | "error", location?: obj, description: str, suggestion?: str}
  ],
  blacklist_lint_degraded?: bool,         # 可选：ai-blacklist 存在但 deterministic lint 运行失败
  structural_rule_violations_degraded?: bool, # 可选：structural lint 脚本存在但运行失败
  golden_chapter_gates?: obj,                    # 可选：chapter <= 3 时注入的当前平台黄金三章硬门控
  genre_golden_standards?: obj,                  # 可选：chapter <= 3 且 brief.genre 命中时注入的题材特定 minimum_thresholds/focus_dimensions/criteria

  # ── paths ──
  paths: {
    chapter_draft: "staging/chapters/chapter-{C:03d}.md",
    style_profile: "style-profile.json",
    ai_blacklist: "ai-blacklist.json",
    chapter_contract: "volumes/vol-{V:02d}/chapter-contracts/chapter-{C:03d}.json",
    world_rules: "world/rules.json",                                  # 可选
    prev_summary: "summaries/chapter-{C-1:03d}-summary.md",           # 可选（首章无）
    character_profiles?: ["characters/active/{slug}.md", ...],         # 可选：裁剪后选取（叙述档案；仅 established / 缺失 canon_status）
    character_contracts?: ["characters/active/{slug}.json", ...],      # 可选：裁剪后选取（L2 结构化契约；仅 established / 缺失 canon_status；planned / deprecated 不进入 judge packet）
    # 若 chapter_contract 显式命中角色，则走 preferred 路径，不受 fallback 的 15 角色上限约束；
    # judge 只有在未命中时才回退到最多 15 个 established 角色。
    storyline_spec: "storylines/storyline-spec.json",                  # 可选
    storyline_schedule: "volumes/vol-{V:02d}/storyline-schedule.json", # 可选
    cross_references: "staging/state/chapter-{C:03d}-crossref.json",
    quality_rubric: "skills/novel-writing/references/quality-rubric.md",
  }
}
```

### fallback 约定

- `style-profile.json.sentence_length_std_dev == null` → 使用 fallback range `8-18`
- `style-profile.json.paragraph_length_cv == null` → 使用 fallback range `0.4-1.2`
- `style-profile.json.vocabulary_richness / register_mixing / emotional_volatility == null` → 统一回退到 `"medium"`
- `narration_connectors` 当前没有独立 style-profile 字段，固定按 `0` 命中约束，并由 `ai-blacklist.category_metadata.narration_connector` + `writing_directives` 辅助解释
- `genre_overrides` 优先读取 `brief.md` 的“覆写说明”；未填写时回退到 `brief.md` 的题材字段默认预设

---

另见：`continuity-checks.md`（NER schema + 一致性报告 schema + LS-001 结构化输入约定）。
