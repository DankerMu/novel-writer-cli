## Context

当前 L1/L2 规范体系采用二元存在模型：WorldBuilder 创建规则后写入 `rules.json`，ChapterWriter 和 QualityJudge 对所有存在的条目一视同仁地执行硬约束检查。角色契约同理——一旦 `characters/active/*.json` 存在，其 L2 契约即被视为不可违反的行为边界。

这在"从零开始写完一卷"的场景下没有问题，但随着世界观增量扩展（M2 引入的增量更新模式）和多卷长篇推进，出现了真实的生命周期缺口：

- 作者想提前规划一条力量体系规则（计划在第 3 卷揭示），但写入 `rules.json` 后第 1 卷的 ChapterWriter 就会被迫遵守它
- 某条规则因剧情转折不再适用（如"禁飞区"被剧情打破），只能从 JSON 中删除，无法保留"曾经存在"的审计痕迹
- 退场角色（`characters/retired/`）已有目录级隔离，但仍活跃的角色如果需要"计划中"状态（如尚未登场的角色提前建档），缺少表达手段

## Goals / Non-Goals

**Goals:**
- 在 L1 `rules.json` 条目和 L2 角色 `.json` 条目中引入 `canon_status` 三态枚举，支持增量世界构建中的"暂存→生效→废弃"生命周期
- 在 novel CLI 的 instruction packet 组装阶段（生成 `hard_rules_list` / `planned_rules_info` / 角色路径列表）以及 QualityJudge 的消费语义中按 `canon_status` 过滤，确保只有 `established` 条目被当作硬约束
- 保持完全向后兼容：字段缺失等同于 `established`，现有项目无需任何迁移

**Non-Goals:**
- 不提供 UI/CLI 命令来管理状态转换（手动编辑 JSON 或由 WorldBuilder/CharacterWeaver 在增量模式下设置）
- 不实现自动状态转换（如"到了第 3 卷自动从 planned 升级为 established"）
- 不影响 LS 故事线规范和 L3 章节契约（这些工件没有 canon_status 需求）

## Decisions

1) **三态枚举而非布尔 `active`**
   - 布尔只能区分"生效/不生效"，丢失了 `planned`（可见但不强制）这个对伏笔铺垫有价值的中间态。三态枚举语义清晰，扩展成本低。

2) **字段缺失 = `established`（零迁移）**
   - 现有 `rules.json` 和角色 JSON 均无 `canon_status` 字段。将缺失视为 `established` 意味着所有现存条目的行为完全不变，无需跑迁移脚本或批量更新文件。

3) **过滤在 instruction packet 组装/消费端，而非存储端**
   - `rules.json` 和角色 JSON 始终存储所有条目（包括 `planned` 和 `deprecated`），不做物理隔离。novel CLI 在组装 `chapter:*:draft` / `chapter:*:judge` instruction packet 时统一生成 `hard_rules_list`、`planned_rules_info` 并裁剪角色路径列表；QualityJudge 再按同一语义消费这些输入。这样既保证审计完整性，也避免把过滤逻辑散落在 thin adapter 中。

4) **`planned` 条目对写作者"可见但不强制"**
   - ChapterWriter 收到 `planned` 规则时，将其放入独立的"信息参考"区块（而非 `hard_rules_list`）。这允许作者在文中做伏笔铺垫（"隐约感觉到某种力量在酝酿"），但不会因为"违反了一条尚未生效的规则"而被 QualityJudge 扣分。

5) **`deprecated` 角色与 `retired` 目录的关系**
   - `characters/retired/` 是物理移动（角色彻底退场）。`canon_status: deprecated` 是逻辑标记（角色仍在 `characters/active/` 目录中，但其 L2 契约不再被强制执行）。两者互补：retired 用于叙事退场，deprecated 用于契约淘汰（例如角色仍然存在但其某些能力约束已过时）。

## Risks / Trade-offs

- [Low] 作者忘记将 `planned` 提升为 `established` → Mitigation: PlotArchitect 在卷规划时可检查长期停留在 `planned` 状态的条目并提醒（本 change 不实现自动提醒，但预留了数据基础）。
- [Low] `deprecated` 条目长期积累 → Mitigation: 属于运维层面的手动清理，可接受；条目保留不影响运行时性能（JSON 过滤成本可忽略）。
- [Low] `canon_status` 过滤/注入语义需要跨 runtime 与 prompts 保持一致 → Mitigation: 由 novel CLI packet 组装层集中生成 `hard_rules_list` / `planned_rules_info` / 角色路径列表，并在 prompts/spec 中明确消费者语义。

## Migration Plan

无需迁移。现有项目的 `rules.json` 和角色 JSON 不含 `canon_status` 字段，所有消费端将缺失值视为 `established`，行为与变更前完全一致。新项目由 WorldBuilder 在创建规则时显式写入 `canon_status`（默认 `established`）。

## References

- `agents/world-builder.md`（L1 规则 schema）
- `agents/character-weaver.md`（L2 角色契约 schema）
- `agents/chapter-writer.md`（约束消费）
- `agents/quality-judge.md`（Track 1 合规检查）
- `src/instructions.ts`（`chapter:*:draft/judge` instruction packet 组装）
- `skills/continue/SKILL.md`（thin adapter；透传 CLI 生成的 packet）
