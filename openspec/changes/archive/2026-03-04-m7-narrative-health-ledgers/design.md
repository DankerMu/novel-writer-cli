## Context

现有系统已经能把“单章质量”做得较稳定（门控、双裁判、合规/一致性信号、伏笔/故事线分析），但长篇网文更关键的是“跨章健康度”：

- 读者对“承诺持续推进”的敏感度远高于单章文采：卖点机制、核心谜团、关系弧如果长时间沉默，会被判定为作者遗忘。
- “爽点/信息密度”是可度量的：连续多章推进弱、奖励少、冲突平，往往必然导致掉线。
- 角色声音漂移（按人）是典型致命伤：主角的语气、口癖、对话节奏一旦变，读者会立刻出戏；全局风格漂移无法覆盖这一层。

本 change 以“台账 + 曲线 + 漂移指令”三件套，把这些跨章问题落到可落盘、可回归的工程工件中，并通过周期性审计将结果注入规划与写作。

## Goals / Non-Goals

**Goals:**
- 引入 3 份项目级工件（source-of-truth）：
  - `promise-ledger.json`：承诺台账
  - `engagement-metrics.jsonl`：密度指标序列（每章一行）
  - `character-voice-profiles.json`：角色声音指纹（可按角色分文件）
- 引入周期性审计与报告（默认每 10 章 + 卷末），产出 `logs/engagement/*` 等报告，并提供可执行建议。
- 角色声音漂移产生 `character-voice-drift.json` 指令，并可注入 ChapterWriter/StyleRefiner（向后兼容，可选字段）。
- 默认不 hard gate（避免过度打断日更节奏），但允许在未来按 profile 升级某些项为 hard（例如承诺逾期过多）。

**Non-Goals:**
- 不做平台数据回灌调参闭环（明确排除）。
- 不引入平台 API、评论抓取等外部系统。
- 不追求“完美量化”文本质量；指标只需稳定、可解释、可用于趋势提示与规划建议。

## Decisions

1) **台账的状态机要简单、可审计**
   - Promise item 状态：`promised` → `advanced` (可多次) → `delivered`
   - 每次触碰记录 `history[]`（chapter + action + note），并计算 `chapters_since_last_touch`。

2) **密度指标优先从 summaries/evals 派生**
   - 降低读取正文的成本；必要时才回溯正文抽取证据片段。
   - 指标不追求绝对正确，而追求“窗口趋势稳定 + 可比较”。

3) **角色声音指纹为“轻量 profile”，漂移为“纠偏指令”**
   - profile 包含：常用语气词/口癖、句式偏好、对话长度分布、情绪表达方式等。
   - drift 输出为可注入指令（类似 `style-drift.json`），并有“恢复阈值”机制。

4) **周期触发**
   - 默认 cadence：每 10 章一次审计；卷末进行全卷审计。
   - 审计输出始终写入 `logs/*/latest.json` + history 文件（回归友好）。

5) **注入策略（不破坏既有流水线）**
   - ChapterWriter/StyleRefiner/PlotArchitect 接收这些工件的“裁剪摘要”，作为可选 context，不改变硬契约的既有字段。
   - 只有当配置显式开启 hard gate 时，才把某些问题提升为阻断信号。

## Risks / Trade-offs

- [Risk] 指标噪声大导致误导 → Mitigation：只做趋势与窗口提示；输出 evidence；允许用户关闭单项指标。
- [Risk] 台账维护成本上升 → Mitigation：由审计器自动更新；用户只在关键决策点确认（交互 gate 可复用 NOVEL_ASK）。
- [Risk] 角色声音过度约束导致角色成长受限 → Mitigation：profile 中允许“成长段落”例外；漂移更多是提示而非硬修正。

## Migration Plan

1) 对已有项目：
   - 从 `brief.md`、卷大纲与最近章节 summaries/evals 生成初版 `promise-ledger.json`（并请求用户确认/删改）。
   - 从最近 N 章对话片段生成初版角色声音 profiles（主角+核心配角优先）。
   - 从历史 summaries 生成一段 `engagement-metrics.jsonl`（可从当前卷开始，不必补齐全书）。
2) 上线策略：
   - 首期全部以“报告 + 建议”方式运行，不阻断 commit。
   - 用户认可后再逐项提高阈值或开启阻断（未来 change）。

## Open Questions

- engagement 指标的最小集合：推进/冲突/奖励/信息引入各自如何定义到可回归字段？
- promise ledger 与 foreshadowing 的边界：哪些算“承诺”而不是“伏笔”？
- 角色声音 profile 的数据来源：是否允许用户提供“角色台词样本”作为基线？
