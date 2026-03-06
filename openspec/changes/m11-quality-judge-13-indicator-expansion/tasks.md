## 1. style-guide Layer 4 三区判定表扩展

- [x] 1.1 扩展 `style-guide.md` Layer 4 三区判定表从 7 行到 13 行，新增 6 项指标的 green/yellow/red 阈值
- [x] 1.2 更新评分映射建议（全 green → 5 分等）的分母说明从 7 项到 13 项
- [x] 1.3 更新升级提示，说明 13 → 7 → 4 三档回退机制

## 2. quality-rubric 更新

- [x] 2.1 更新 `quality-rubric.md` style_naturalness 维度，列出 13 项指标并注明回退说明

## 3. QualityJudge agent prompt 更新

- [x] 3.1 更新 `indicator_mode` 枚举：新增 `"13-indicator"` 为默认，`"7-indicator"` 为中间回退
- [x] 3.2 在 `style_naturalness` 评审口径中列出全部 13 项指标
- [x] 3.3 新增 6 项指标的评估规则（em_dash_count / sentence_pattern_score / simile_density / dialogue_distinguishability / ellipsis_density / exclamation_density）
- [x] 3.4 更新 `indicator_breakdown` Format JSON 示例，展示 13 项完整输出
- [x] 3.5 更新回退条件：13 → 7 的触发规则
- [x] 3.6 更新 Constraint 3 的描述，从"7 指标"改为"13 指标"
- [x] 3.7 更新 Edge Cases 中的回退说明

## 4. OpenSpec 元数据

- [x] 4.1 更新 `.openspec.yaml` 添加 `depends_on: [m10-anti-ai-sentence-pattern-hardening]`

## 5. 验证

- [x] 5.1 `grep -c "13-indicator" agents/quality-judge.md` → 3 处确认
- [x] 5.2 style-guide Layer 4 表格包含 13 项指标（含表头 14 行）
- [x] 5.3 QJ Format JSON 示例中 indicator_breakdown 有 13 个 `"zone":` 匹配
- [x] 5.4 punctuation_overuse（2 处） / sentence_pattern_violations（4 处）原有字段保留
