# Proposal: Structural Breathing / Functional Redundancy (C24)

**Issue**: #177
**Milestone**: M12
**Status**: proposed
**Priority**: medium

## Problem

当前去 AI 化体系覆盖词级/句级痕迹（黑名单、句式模式、标点频率），但对章节级结构模板几乎无约束。AI 生成文本"信息效率过高"——每个段落精准推进情节，零偏题、零闲笔。真人写作有自然的"呼吸感"，偶尔停留和闲笔是人味的重要来源。

## Scope

- ChapterWriter: 新增 C24 结构呼吸感约束
- style-guide: 新增 §2.14 结构呼吸感（功能性停留类型定义）
- QualityJudge: pacing/immersion 评估口径补充
- quality-rubric: pacing 标准更新

## Success Criteria

- 每 1000-1500 字至少一处功能性停留
- 对话允许 1-2 句非推进性闲笔
- 打破"每个 beat 精准服务"的线性结构
