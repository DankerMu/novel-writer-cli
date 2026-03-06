## Why

当前 L1 世界规则（`rules.json`）和 L2 角色契约（`characters/active/*.json`）只有"存在/不存在"两种状态——规则被创建后立即生效，退役时只能删除。这导致两个实际问题：

- **增量构建受阻**：WorldBuilder 在初始化后扩展世界观时，新规则一旦写入 `rules.json` 就会被 ChapterWriter 当作硬约束执行，即使该规则计划在后续卷才正式生效（例如新力量体系尚未在故事中揭示）。作者只能手动"先不写进去"，丧失了提前规划和伏笔铺垫的能力。
- **退役丢失历史**：淘汰一条规则或退场一个角色时，必须从 JSON 中删除条目。这意味着规则/角色的历史记录消失，无法在回归测试和审计中追溯"这条规则曾经存在过"。

## What Changes

为 L1 规则条目和 L2 角色契约条目新增 `canon_status` 枚举字段，三种状态：

- **`established`**（默认）：正式生效的硬约束。ChapterWriter 写作时必须遵守，QualityJudge 逐条验收。
- **`planned`**：已规划但尚未在故事中正式生效。对写作者可见（可用于伏笔铺垫），但不作为硬约束执行，不纳入质量门控的合规检查。
- **`deprecated`**：已废弃。ChapterWriter 和 QualityJudge 均忽略。条目保留在 JSON 中供审计追溯。

向后兼容：字段缺失时视为 `established`，现有项目零迁移成本。

## Capabilities

### New Capabilities

- `canon-status-lifecycle`: L1/L2 条目的 `canon_status` 枚举（`established` | `planned` | `deprecated`），支持规则/角色的生命周期管理

### Modified Capabilities

- `world-rules`（L1）: `rules.json` schema 新增 `canon_status` 可选字段，默认 `established`
- `character-contracts`（L2）: 角色结构化 JSON schema 新增 `canon_status` 可选字段，默认 `established`
- `chapter-writing-constraints`: ChapterWriter 仅将 `established` 规则/角色视为硬约束；`planned` 作为信息参考；`deprecated` 忽略
- `quality-gating`: QualityJudge Track 1 的 L1/L2 检查仅验收 `established`（或字段缺失）条目
- `volume-planning`: PlotArchitect 仅将已生效（`established` / 缺失字段）规则与角色契约写入章节契约硬约束；`planned` 只用于规划/铺垫参考

## Impact

- 修改 5 个 Agent prompt（`agents/world-builder.md`、`agents/character-weaver.md`、`agents/chapter-writer.md`、`agents/quality-judge.md`、`agents/plot-architect.md`）
- 修改 1 个运行时文件（`src/instructions.ts`）与 1 个测试文件（`src/__tests__/canon-status-lifecycle.test.ts`）
- 修改 1 个 Skill 与 1 个参考契约文档（`skills/continue/SKILL.md`、`skills/continue/references/context-contracts.md`）
- 不新增依赖
- 不破坏现有项目（缺失字段 = `established`）
