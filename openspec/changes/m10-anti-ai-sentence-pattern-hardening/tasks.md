## 1. 新增 AI 句式模式定义文件

- [x] 1.1 创建 `templates/ai-sentence-patterns.json`，定义 8 种结构级模式（SP-01 ~ SP-08）
- [x] 1.2 每种模式包含 id / name / severity / description / examples.bad[] / examples.good[] / replacement_strategy / per_chapter_max
- [x] 1.3 severity=high 的模式 per_chapter_max=0；severity=medium 的模式 per_chapter_max=2

## 2. 扩充 AI 黑名单

- [x] 2.1 `simile_cliche` 类别新增 8-10 个"像"字比喻词条（像一把刀/像一根弦/像被什么击中 等）
- [x] 2.2 新增 `category_metadata.simile_cliche.like_simile_rule` 限频规则
- [x] 2.3 版本升级至 `2.1.0`，更新 update_log
- [x] 2.4 验证新增词条不与现有 `emotion_cliche` / `action_cliche` 类别重复

## 3. 更新 Style Guide

- [x] 3.1 §2.1 补充"像"字限频说明
- [x] 3.2 §2.6 破折号从 `0-1 处/千字` 改为 `0 处/千字`；更新示例
- [x] 3.3 §2.9 `thought_interrupt` 示例去除破折号，改用省略号
- [x] 3.4 §2.10 L6 标点节奏：破折号从 `≤5/章` 改为 `0/章`
- [x] 3.5 §2.10 新增 L7 句式模式检测层，引用 `ai-sentence-patterns.json`
- [x] 3.6 §2.12 Step 2 追加 L7 检查项

## 4. 更新 ChapterWriter Agent

- [x] 4.1 C14 破折号改为"完全禁止"
- [x] 4.2 新增 C21 句式模式禁止（severity=high 零容忍，medium ≤2/章）
- [x] 4.3 新增 C22 通用比喻限频（`像+具体意象` ≤1/千字）
- [x] 4.4 输入 paths 新增 `ai_sentence_patterns`

## 5. 更新 StyleRefiner Agent

- [x] 5.1 Constraint 4 破折号改为"0 处，命中即替换"
- [x] 5.2 Step 2 追加 L7 句式模式检测
- [x] 5.3 新增 Constraint 11 比喻限频
- [x] 5.4 新增 Constraint 12 句式模式后处理
- [x] 5.5 输入 paths 新增 `ai_sentence_patterns`

## 6. 更新 QualityJudge Agent

- [x] 6.1 `anti_ai` 输出新增 `sentence_pattern_violations[]`
- [x] 6.2 `punctuation_overuse`：`em_dash_count > 0` 为 red
- [x] 6.3 `style_naturalness` 纳入句式模式命中作为扣分因子
- [x] 6.4 输入 paths 新增 `ai_sentence_patterns`

## 7. 更新 Quality Rubric

- [x] 7.1 style_naturalness 维度补充句式模式扣分规则

## 8. Verification

- [x] 8.1 `grep -r "破折号" agents/ skills/` 确认无残留限频措辞（"每千字 ≤ 1 处"/"≤5/章"）
- [x] 8.2 `ai-sentence-patterns.json` 的 8 种模式均有正反例
- [x] 8.3 `ai-blacklist.json` 新增词条不与现有 emotion_cliche 类别重复
- [x] 8.4 3 个 Agent 均引用 `paths.ai_sentence_patterns`
