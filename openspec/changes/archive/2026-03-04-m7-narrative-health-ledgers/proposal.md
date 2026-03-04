## Why

长篇网文的“掉线”往往不是单章质量问题，而是 **跨章累积的叙事健康度问题**：

- **卖点/谜团/机制承诺被遗忘**：读者最敏感的是“承诺是否持续推进”。只有伏笔台账还不够，卖点承诺（爽点机制/核心谜团/关系弧）需要更显式的可见性维护。
- **爽点/信息密度曲线失控**：连续多章“推进弱/奖励少/冲突平”，就会出现“温水煮青蛙”式流失；这类问题需要可度量的窗口化检测与规划建议。
- **角色声音漂移（按人）**：现有 style-profile/风格漂移是全局级别，无法防止“主角语气变脸、配角口癖消失”等读者高敏问题。

因此需要把“承诺台账 + 密度曲线 + 角色声音漂移”落成可回归、可审计的项目工件，并把结果注入规划/写作（而不是靠临场口头提醒）。

## What Changes

新增 3 类“跨章健康度工件”，并按固定节奏产出窗口报告（默认每 10 章一次 + 卷末一次；不默认硬门控，以提示/建议为主）：

1. **Promise Ledger（承诺台账）**：记录卖点承诺/核心谜团/机制承诺/关系弧的状态（promised/advanced/delivered），维护“沉默章数”与建议的下一次轻触/兑现。
2. **Engagement Density（爽点/信息密度曲线）**：从 summaries/evals 中提取可量化指标（推进/冲突/奖励/信息引入），检测连续低密度区间并给出可执行的规划建议（偏 PlotArchitect/ChapterWriter）。
3. **Character Voice Drift（按角色声音漂移）**：为主角与关键配角维护轻量“声音指纹”（口癖/句式/情绪表达方式/对话节奏），窗口化检测漂移并生成纠偏指令（注入 ChapterWriter/StyleRefiner）。

## Capabilities

### New Capabilities

- `promise-ledger`: 承诺台账（卖点/谜团/机制/关系弧）+ 状态流转 + 窗口报告
- `engagement-density-auditor`: 爽点/信息密度指标抽取 + 曲线/窗口检测 + 规划建议
- `character-voice-drift`: 按角色声音指纹维护 + 漂移检测 + 纠偏指令注入

### Modified Capabilities

- （无强制修改；以新增工件/报告与轻量注入为主，避免破坏既有流水线。必要的契约字段扩展在设计中明确为“向后兼容的可选字段”。）

## Impact

- 新增项目级工件与报告目录（可回归、可审计）：
  - `promise-ledger.json`（或等价载体）
  - `engagement-metrics.jsonl` + `logs/engagement/*`
  - `character-voice-profiles.json` + `character-voice-drift.json`（或按角色分文件）
- 写作/规划将获得更稳定的“长期一致性控制面”：
  - PlotArchitect：可基于台账与密度曲线做卷内调度与“奖励/推进”安排
  - ChapterWriter/StyleRefiner：可接收按角色的声音纠偏指令，减少“角色变脸”
