# Spec: Inner Activity Minimum Density (C23)

**Issue**: #176
**Milestone**: M12

## Requirements

### R1: ChapterWriter C23 — 内心活动锚点

**Given** ChapterWriter 正在创作章节
**When** 出现以下场景之一：
- 角色面临关键决策（生死、重大取舍、信任/背叛选择）
- 角色获知重大信息（真相揭露、身份暴露、规则变更）
- 角色经历高压事件（战斗转折、SP 大量扣除、同伴伤亡）

**Then** 必须在该节点前后 2-3 句内出现至少一处内心活动，使用以下任一形式：
- 感官侵入（气味、温度、触感、疼痛）
- 碎片思绪（非线性念头片段）
- 生理反应（手心出汗、喉咙发紧、肌肉僵硬）
- 思维中断（想到一半被外界打断）
- 自我纠正（先想/说一个版本再修正）

**And** 禁止使用情绪标签（SP-07 仍然生效）

### R2: 连续动作流上限

**Given** ChapterWriter 正在输出叙事段落
**When** 连续 5 句均为纯动作记录（无内心活动、无感官描写、无碎片思绪、无角色感知）
**Then** 第 6 句必须穿插一处角色感知或内心碎片

**Note**: "纯动作记录"定义为：只描述角色的外在可观察行为（走、跑、打、说），不包含角色主观感受或认知过程

### R3: QualityJudge emotional_impact 扣分

**Given** QualityJudge 评估 `emotional_impact` 维度
**When** 检测到以下情况：
- 关键决策节点前后 3 句无内心活动
- 全章出现 ≥3 处连续 5 句纯动作流

**Then**:
- 单处关键节点缺失 → 扣 0.5 分
- ≥3 处纯动作流 → 额外扣 1 分
- 在 `scores.emotional_impact.reason` 中明确标注缺失位置

### R4: StyleRefiner Step 4 补充

**Given** StyleRefiner 执行 Step 4 节奏朗读测试
**When** 检测到连续 5+ 句纯动作流
**Then**:
- 在动作流中间插入最小必要的感知片段（1-2 句）
- 插入内容不得改变情节语义（Constraint 6 语义不变仍生效）
- 插入量计入修改量控制（≤15%）

## References

- `agents/chapter-writer.md` — C10-C22 现有约束
- `agents/quality-judge.md` — emotional_impact 评分标准
- `agents/style-refiner.md` — Step 4 节奏朗读测试
- `skills/novel-writing/references/style-guide.md` — §2.9 人性化技法工具箱
- `templates/ai-sentence-patterns.json` — SP-07 情绪标签句定义
