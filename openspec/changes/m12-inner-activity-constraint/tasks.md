# Tasks: Inner Activity Minimum Density (C23)

**Issue**: #176
**Milestone**: M12

## Task Groups

### Group 1: ChapterWriter 约束新增

- [x] **T1.1** 在 `agents/chapter-writer.md` Constraints 区域新增 C23（内心活动锚点）
  - 关键决策节点规则
  - 连续动作流 ≤5 句上限
  - 合法内心活动类型列表
  - 与 SP-07 的互补关系说明

- [x] **T1.2** 在 `agents/chapter-writer.md` Process Step 6（Phase 2 自检）中新增 6.8 检查项：
  - 扫描关键决策节点是否有内心活动
  - 扫描连续纯动作流是否超限

### Group 2: style-guide 方法论更新

- [x] **T2.1** 在 `skills/novel-writing/references/style-guide.md` §2.9 工具箱后新增 §2.14（或扩展 §2.9 说明）
  - 明确"纯动作记录流"的定义
  - 说明 C23 与 SP-07 的互补关系图
  - 给出合法内心活动 vs 非法情绪标签的对比示例

### Group 3: QualityJudge 评分更新

- [x] **T3.1** 在 `agents/quality-judge.md` Track 2 `emotional_impact` 部分补充扣分口径
  - 关键节点缺失：扣 0.5 分
  - 全章 ≥3 处纯动作流：额外扣 1 分
  - reason 中标注缺失位置

- [x] **T3.2** 在 `skills/novel-writing/references/quality-rubric.md` §7 emotional_impact 标准中补充说明

### Group 4: StyleRefiner 后处理更新

- [x] **T4.1** 在 `agents/style-refiner.md` Process Step 4 中新增纯动作流检测
  - 检测连续 5+ 句纯动作流
  - 插入最小必要感知片段
  - 受修改量 ≤15% 约束

### Group 5: 验证

- [x] **T5.1** 审核 C23 与 C12（反直觉细节）、C18（人性化技法抽样）的交互关系，确认不冲突
- [x] **T5.2** 审核 C23 与 SP-07 的边界——确认"生理反应"不会被 SP-07 误判为情绪标签
- [x] **T5.3** 检查 style-guide、quality-rubric、agent prompts 三方交叉引用一致性
