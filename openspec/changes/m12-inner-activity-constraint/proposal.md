# Proposal: Inner Activity Minimum Density (C23)

**Issue**: #176
**Milestone**: M12
**Status**: proposed
**Priority**: medium

## Problem

当前去 AI 化体系防止了"情绪标签句"（SP-07）和"解释型旁白"（SP-01），但没有约束"完全不写内心活动"。AI 在被训练避免情绪直述后，容易彻底跳过情感层，只剩纯动作记录流。这种"情感扁平化"同样是明显的 AI 写作特征。

## Scope

- ChapterWriter: 新增 C23 内心活动锚点约束
- QualityJudge: emotional_impact 扣分口径补充
- StyleRefiner: Step 4 纯动作流检测
- style-guide: §2.9 工具箱或新增 §2.14
- quality-rubric: emotional_impact 标准更新

## Success Criteria

- 关键决策节点前后必须有内心活动（非情绪标签）
- 纯动作记录流不超过连续 5 句
- 与 SP-07 形成互补闭环
