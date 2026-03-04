## Why

当前系统在通用网文质量控制上成熟（8 维度评分、去 AI 化四层策略、多线叙事防串线），但对起点中文网/番茄小说网的**平台商业规则**适配几乎为零：

- 章末无强制“钩子/悬念”机制，影响读者留存与下章点击率（目标：可量化提升，需要后续数据验证）
- 黑名单仅覆盖 AI 高频词（38 个），完全遗漏“网文套路词/说教腔/模板化过渡”等平台常见劣化信号
- 系统未约束章节字数，而平台分发与读者体验对字数区间有明确偏好
- 8 维度评分权重固定，玄幻和言情用同一套标准不合理
- 无违禁词/重名/繁简混用检测，上架前需人工全文筛查
- 无跨章一致性回顾，30-50 章后容易出现"温水煮青蛙"式逻辑漂移
- 长期伏笔缺乏可见性维护，读者误以为作者遗忘

## What Changes

新增”平台画像（platform_profile）+ 叙事驱动类型（genre_drive_type）”作为写作流水线的一等输入，并将其固化为可落盘、可审计、可复用的配置（一本书只绑定一个平台，初始化后不可变）。后续所有约束（字数区间、信息负载阈值、钩子权重、合规词库）均从 `platform_profile(qidian|tomato)` 读取。

7 个优化方向（以 platform_profile 进行参数化）：

1. **章末钩子机制** — ChapterWriter 强制章末“钩子”+ QualityJudge 评分钩子强度；提供明确失败处理策略（优先 `hook-fix` 微步骤：只改最后 1–2 段→复检，而不是整章推倒）。
2. **网文套路词/模板腔检测** — 新增独立的 `web-novel-cliche-lint`（多级 severity：warn/soft/hard），与 `ai-blacklist`（硬禁/强信号）分离；允许按平台/题材/驱动类型开关与豁免。
3. **章节字数约束** — brief 模板 + ChapterWriter/QualityJudge 约束：目标区间（soft）+ 硬下限/硬上限（hard），均由 platform_profile 驱动。
4. **伏笔可见性维护** — 追踪“沉默章数”，在不剧透前提下定期“轻触”提醒读者；伏笔状态对作者可见、可审计。
5. **题材差异化评分** — 4 类驱动模型（情节/角色/悬念/日常流）映射到评分权重；允许用户微调，权重与阈值写入配置，避免“玄幻/言情一把尺”。
6. **平台合规检测** — QualityJudge 前置：违禁词/重名/繁简混用/字数硬限等（尽量可脚本化）；输出可追溯报告，并可选择阻断 commit。
7. **滑动窗口一致性检查** — 新增 ConsistencyAuditor Agent：每 5 章回顾最近 10 章 + 卷末全卷审计；覆盖 NER 一致性矛盾与“逻辑/动机漂移”提示；报告写入 `logs/continuity/`，摘要注入到 QualityJudge（复用现有连续性报告通道）。

### Integration Notes（与现有 8-agent + M3 连续性能力的关系）

- **对 8-agent 架构的影响**：ConsistencyAuditor 是一个 *analysis-only* 的周期性审计 Agent（不参与每章四段流水线的“写→摘要→润色→门控”链路），默认不阻断 commit。它可以被视为第 9 个 Agent，但只在“每 5 章/卷末”触发，不增加日更成本。
- **与 M3 NER/连续性检查的关系**：
  - M3 已有每章 NER 提取与一致性报告产物（`scripts/run-ner.sh`、`logs/continuity/latest.json` 等）。ConsistencyAuditor 不替代这些产物，而是**复用**它们作为输入信号，做“滑动窗口”的跨章归纳与建议（例如：同一实体属性在 10 章内反复漂移、时间线矛盾趋势、疑似温水漂移等）。
  - 当 NER 脚本缺失/失败时，ConsistencyAuditor 必须降级为非阻断的启发式审计（仅建议/警告）。
- **仓库同步点（实现阶段）**：引入新 Agent 需要在实现 PR 中同步更新 `agents/`（新增 contract）、以及（若要暴露为插件内能力）更新 `plugin.json` / 文档入口。此 OpenSpec PR 只定义能力与契约，不直接修改运行时目录。

交互与落盘策略：
- `novel init` 阶段通过交互式问卷收集 `platform`、`genre_drive_type`、关键阈值的“用户微调”（依赖/复用 `m6-interactive-question-adapters` 的 `NOVEL_ASK` 思路），并写入项目配置与锁文件，确保可恢复与可 review。

## Capabilities

### New Capabilities

- `chapter-hook-system`: 章末钩子强制规则、钩子类型记录、钩子强度评分
- `web-novel-cliche-lint`: 网文套路词/模板腔分类检测（多级 severity + 可配置豁免）
- `platform-profile`: 平台画像（qidian|tomato）及其约束集（字数区间/信息负载/钩子权重/合规词库）
- `platform-constraints`: 章节字数目标区间、平台合规前置检查（由 platform_profile 驱动）
- `genre-weight-profiles`: 4 类叙事驱动模型 + 题材→驱动类型映射 + 用户微调
- `consistency-auditor`: 独立 Agent，滑动窗口跨章审计（NER 矛盾 + 逻辑漂移提示）+ 卷末全卷审计 + 伏笔可见性
- `foreshadow-visibility`: 伏笔沉默章数追踪 + PlotArchitect 轻触点自动插入

### Modified Capabilities

- `quality-rubric`: 新增钩子强度子维度；权重从固定改为“驱动类型预设 + 用户微调”
- `ai-blacklist`: 继续扩充 AI 高频词（硬信号）；与 `web-novel-cliche-lint` 分离（软/多级信号）
- `brief-template`: 新增 `platform_profile`/`platform_constraints` 与 `genre_drive_type` 字段

## Impact

- 新增 1 个 Agent（ConsistencyAuditor）
- 修改 5 个现有 Agent 的 prompt/契约（ChapterWriter, QualityJudge, PlotArchitect, Summarizer, StyleRefiner）
- 新增/修改 3 个模板/配置文件（web-novel-cliche-lint, brief-template, genre-weight-profiles）
- 新增 1 个评分参考文件（genre-weight-profiles.json）
- 修改 quality-rubric.md（新增钩子维度 + 驱动类型权重说明）
- 修改 style-guide.md（新增章末钩子 Layer 2 规则）
