## Context

M6 的平台优化把“platform_profile 驱动的约束/门控”确立为主轴，并引入 hook 强度与 `hook-fix` 微步骤。但对真实网文留存而言，还缺少 4 个可工程化、可回归的关键面：

- **标题**：曝光入口，必须可校验、可微修复。
- **钩子台账**：钩子不仅要强，还要“承诺可兑现、类型不透支”。
- **移动端可读性**：格式问题是最稳定的留存杀手，应脚本化。
- **命名冲突**：同名/近似名/外号冲突需要项目级一致性防线。

本 change 把这些“读者体验与留存”问题从提示词习惯升级为：可配置策略（platform-profile）、可回归 lint、可审计台账与微步骤。

## Goals / Non-Goals

**Goals:**
- 在 `platform-profile.json` 中新增 `retention/readability/naming` 策略段，并为 qidian/tomato 提供默认值。
- 把标题/可读性/命名冲突纳入“合规前置检查”产出结构化报告，并支持 warn/soft/hard 分级。
- 用 `hook-ledger.json` 维护钩子承诺点与兑现窗口，输出“透支/逾期/重复类型”提示。
- 提供 `title-fix` 微步骤：只修改章节标题行（或 frontmatter），不触碰正文。
- 输出均需可回归：同一章节集合重复运行得到稳定 issue id 与统计。

**Non-Goals:**
- 不引入平台 API 对接、数据回灌调参闭环（明确排除）。
- 不保证提升推荐权重/点击率，只提供可执行的工程化约束与提示。
- 不在本 change 内重构整套 QualityJudge 评分体系（需要时仅作为附加信号/报告）。

## Decisions

1) **配置集中：平台画像扩展而非新增碎片化配置**
   - `platform-profile.json` 继续作为平台相关规则的单一入口。
   - 新增：
     - `retention.hook_ledger`（兑现窗口/多样性窗口/最大连用）
     - `retention.title_policy`（长度/风格/禁用模式/是否可自动修复）
     - `readability.mobile`（段落/对话/标点 lint 阈值）
     - `naming`（同名/近似名阈值、别名策略）

2) **确定性优先：lint 与台账优先脚本/规则引擎**
   - 可读性与命名冲突以脚本/规则为主（便于回归与可解释）。
   - 缺失脚本时允许 LLM 兜底，但不得阻断流水线（只输出 warn/soft）。

3) **标题/钩子采用“微步骤修复”而非整章返工**
   - `title-fix` 只改标题行（或 metadata），限制 1 次自动修复，失败则升级到用户 review。
   - 钩子仍沿用 M6 的 `hook-fix`（只改尾段），hook-ledger 本身不改正文。

4) **命名冲突以“注册表 + 相似度策略”实现**
   - 基础事实来自 `characters/active/*.json.display_name` 与可选 `aliases[]`（若存在）。
   - 检测层提供：
     - exact duplicate（同名）
     - near-duplicate（编辑距离/拼音近似/同音近似，阈值可配置）
     - nickname collision（外号与他人本名/外号冲突）

5) **输出形态**
   - `hook-ledger.json`：源数据台账（类似 `foreshadowing/global.json` 的“可见性维护”风格）。
   - `logs/readability/*`、`logs/naming/*`、`logs/retention/*`：周期/每章报告；`latest.json` + history。
   - 章节级摘要（供 QualityJudge/用户查看）保持小体积：只注入 top-N issue 与关键证据。

## Risks / Trade-offs

- [Risk] lint 误报导致用户疲劳 → Mitigation：分级 severity + whitelist/exemptions；默认不 hard gate。
- [Risk] 规则过强伤害题材风格（例如故意长段落） → Mitigation：平台画像可关闭单项 lint；用户可覆盖阈值。
- [Risk] 名字相似度算法带来复杂度 → Mitigation：先落地 exact + 简单编辑距离；拼音/同音作为可选增强。
- [Risk] 引入多个报告文件导致项目噪声 → Mitigation：统一 `latest.json` + 历史归档；CLI/status 只展示简报。

## Migration Plan

1) 对已有项目：
   - 若存在 `platform-profile.json`：补齐新增字段并用默认值填充（不改变平台绑定）。
   - 生成初版 `hook-ledger.json`（从最近 N 章 eval/文本推导，或从空开始）。
   - 命名注册表从现有角色档案构建（无需用户手填）。
2) 上线策略：
   - 第一期全部以 warn/soft 运行并产出报告。
   - 用户确认后，按平台画像将部分项升级为 hard（例如同名冲突、标题缺失）。

## Open Questions

- 标题的“硬约束”边界：哪些情况应 hard gate（空标题/超长/明显剧透）？
- 钩子“兑现窗口”的默认值：按平台固定还是按题材/drive_type 变化？
- 命名相似度：拼音/同音检测是否作为默认开启？
