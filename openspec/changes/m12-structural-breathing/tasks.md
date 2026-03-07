# Tasks: Structural Breathing / Functional Redundancy (C24)

**Issue**: #177
**Milestone**: M12

## Task Groups

### Group 1: ChapterWriter 约束新增

- [x] **T1.1** 在 `agents/chapter-writer.md` Constraints 区域新增 C24（结构呼吸感）
  - 功能性停留类型列表
  - 建议频率（每 1000-1500 字至少一处）
  - 总量上限（≤10% 章节字数）
  - 上下文敏感说明（高潮章可减少）

- [x] **T1.2** 在 `agents/chapter-writer.md` Constraints 区域扩展 C19 说明
  - 明确"废话"（打趣/抱怨/跑题）归入合法意图类型
  - 补充 R2 的对话冗余度规则

- [x] **T1.3** 在 `agents/chapter-writer.md` Process Step 6（Phase 2 自检）中新增检查项
  - 6.9 结构呼吸感检查：是否按“每 1000-1500 字至少一处”的建议频率留出足够功能性停留、高压场景后是否有过渡

### Group 2: style-guide 方法论更新

- [x] **T2.1** 在 `skills/novel-writing/references/style-guide.md` 新增 §2.14 结构呼吸感
  - 功能性停留的定义与类型（表格）
  - 与 C12/C13/C18/C19 的交互关系说明
  - 好/坏示例对比
  - "信息效率过高"作为章节级 AI 特征的说明

### Group 3: QualityJudge 评分更新

- [x] **T3.1** 在 `agents/quality-judge.md` Track 2 `pacing` 部分补充评估口径
  - "结构过密，缺乏呼吸感"标注规则
  - 建议性扣 0.5 分（不自动触发修订）

- [x] **T3.2** 在 `agents/quality-judge.md` Track 2 `immersion` 部分补充评估口径
  - "高压场景间缺乏过渡"标注规则

- [x] **T3.3** 在 `skills/novel-writing/references/quality-rubric.md` §5 pacing 和 §4 immersion 中补充标准说明

### Group 4: 验证

- [x] **T4.1** 审核 C24 与 C12（反直觉细节）的交互：确认 C24 提供结构位置、C12 提供具体手段，不重叠
- [x] **T4.2** 审核 C24 与 C13（场景描写精简 ≤2 句）的交互：确认功能性停留中的环境闲描仍受 C13 限制
- [x] **T4.3** 审核 C24 与 C19（对话意图）的交互：确认废话归入合法意图类型不导致 C19 失效
- [x] **T4.4** 检查 style-guide、quality-rubric、agent prompts 三方交叉引用一致性
