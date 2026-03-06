# Spec: Structural Breathing / Functional Redundancy (C24)

**Issue**: #177
**Milestone**: M12

## Requirements

### R1: ChapterWriter C24 — 结构呼吸感

**Given** ChapterWriter 正在创作章节
**When** 章节字数达到 1000 字以上

**Then** 每 1000-1500 字建议出现至少一处"功能性停留"——不直接服务于主线推进的叙事片段，类型包括：
- 环境闲描（氛围/声音/光线/气味，非套话式）
- 角色闲聊（不推进冲突的对话：打趣、抱怨、跑题）
- 感官片段（角色主观的物理感知）
- 回忆碎片（与当前场景有情感关联的短回忆）
- 生活细节（无情节功能但增加人味的小动作）

**And** 功能性停留的总量不超过章节字数的 10%，避免拖沓

**Note**: 此为建议性约束，高潮战斗章可减少，过渡/日常章可增加

### R2: 对话冗余度

**Given** ChapterWriter 正在写角色对话
**When** 一段对话超过 5 个来回

**Then** 允许出现 1-2 句不直接服务于冲突推进的"废话"
- 打趣、抱怨、跑题、自言自语均为合法意图
- 与 C19（对话意图约束）兼容：废话的意图归类为"敷衍""缓冲""转移"

### R3: QualityJudge pacing 维度补充

**Given** QualityJudge 评估 `pacing` 维度
**When** 全章每个段落都直接推进情节，无任何功能性停留

**Then**:
- 在 `scores.pacing.reason` 中标注"结构过密，缺乏呼吸感"
- 视情况扣 0.5 分（suggestion 级别，非硬扣分）
- 不自动触发修订

### R4: QualityJudge immersion 维度补充

**Given** QualityJudge 评估 `immersion` 维度
**When** 高压场景（战斗/决策/冲突）后立即切入下一个高压场景，无过渡或消化空间

**Then**:
- 在 `scores.immersion.reason` 中标注"高压场景间缺乏过渡，沉浸感断裂"
- 视情况扣 0.5 分

### R5: Phase 2 自检

**Given** ChapterWriter 执行 Phase 2 交稿前自检
**When** 全章回顾

**Then** 新增检查项：
- 是否存在至少一处功能性停留
- 高压场景后是否有节奏放缓的过渡
- 对话是否全部"任务执行"式无闲笔

## Interaction with Existing Constraints

| 约束 | 关系 | 说明 |
|------|------|------|
| C12 反直觉细节 | 互补 | C12 提供"打破完美感"的具体手段，C24 提供"在哪里放"的结构指引 |
| C13 场景描写精简 | 兼容 | 功能性停留中的环境闲描仍受 C13 的 2 句限制，只是允许它出现在非必要位置 |
| C18 人性化技法 | 互补 | C18 的技法是微观手段，C24 是宏观结构指引 |
| C19 对话意图 | 兼容 | "废话"归入敷衍/缓冲/转移等合法意图 |

## References

- `agents/chapter-writer.md` — C12, C13, C18, C19 现有约束
- `agents/quality-judge.md` — pacing + immersion 评分标准
- `skills/novel-writing/references/style-guide.md` — §2.9 人性化技法工具箱
- `skills/novel-writing/references/quality-rubric.md` — §5 pacing, §4 immersion
