## Why

M6 已把平台适配的“硬约束框架”搭起来（platform_profile、字数区间、合规前置、钩子强度、滑动窗口一致性等），但仍缺少几个对起点/番茄“读者留存 + 移动端可读性”影响最大的工程化抓手：

- **钩子缺少台账与兑现窗口**：只做“强度评分”不够，容易出现“钩子透支/承诺不兑现”，导致读者疲劳与弃书。
- **章节标题未被当作点击入口优化**：标题是平台内最重要的曝光面之一，需要与章末钩子形成闭环（标题承诺 ≈ 正文交付 ≈ 章末续航）。
- **移动端可读性未做确定性 lint**：段落过长、对话排版混乱、标点/引号不统一等会显著拉低阅读体验与留存，但这些问题不应依赖 LLM 口头建议，必须可脚本化、可回归。
- **人名/外号冲突缺少防线**：同名/近似名/同音外号在网文里是典型“读者掉线点”，需要在上架前就可检测、可阻断（或至少强提示）。

## What Changes

围绕“留存（retention）+ 可读性（readability）”新增一组可配置的 guardrails，并统一挂到平台画像（`platform-profile.json`）：

1. **钩子台账（Hook Ledger）**：记录每章钩子的类型、承诺点与“兑现窗口”，并做类型多样性约束（避免同一种悬念连用）。
2. **章节标题系统（Title System）**：对标题做规则校验 + 可选 LLM 评审；必要时提供 `title-fix` 微步骤（只改标题行）。
3. **移动端可读性 lint**：段落/对话/标点等确定性检查（优先脚本），输出可追溯报告；支持 warn/soft/hard 分级。
4. **近似人名/外号冲突检测**：建立角色名/别名注册表与相似度检测策略，避免新引入的名字与既有角色混淆。
5. **平台画像扩展**：在 `platform-profile.json` 增加 `retention` / `readability` / `naming` 等策略段，驱动上述 guardrails 的阈值与门控行为。

## Capabilities

### New Capabilities

- `hook-ledger`: 钩子台账（承诺点/兑现窗口/类型多样性/透支提示）
- `chapter-title-system`: 标题生成/校验/微修复（title-fix）
- `mobile-readability-lint`: 移动端可读性确定性 lint（段落/对话/标点/引号）
- `name-conflict-lint`: 近似人名/外号冲突检测（注册表 + 相似度策略）

### Modified Capabilities

- `platform-profile`: 增加 retention/readability/naming 策略段并纳入项目级配置与审计
- `platform-constraints`: 合规前置检查扩展为“格式/可读性/命名冲突”可配置门控

## Impact

- 新增/修改项目级配置与报告：
  - 扩展 `platform-profile.json`（新增 retention/readability/naming）
  - 新增 `hook-ledger.json`（或等价持久化载体）与 `logs/retention/*` 报告
  - 新增 `logs/readability/*` 与 `logs/naming/*` 报告（可回归）
- 章节流水线将新增两个“微步骤”类型（可选、可配置、可中断）：
  - `title-fix`（只改标题）
  - `hook-ledger-check`（不改正文，仅提示/门控）
- 需要对 ChapterWriter / Summarizer / QualityJudge 的输入输出做轻量扩展（记录标题、钩子类型/承诺点、lint 结果摘要），以便审计与回归。
