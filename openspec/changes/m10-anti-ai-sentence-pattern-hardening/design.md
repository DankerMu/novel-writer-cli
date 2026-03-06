## Architecture

### 句式模式定义层

引入独立的 `templates/ai-sentence-patterns.json`，与 `ai-blacklist.json` 平级但职责不同：

- **ai-blacklist.json**：词汇/短语级匹配，可被 lint 脚本精确统计
- **ai-sentence-patterns.json**：结构/语义级模式，依赖 LLM 在 prompt 中理解定义来识别，无法正则匹配

### 7 层规则体系（L1-L7）

在 style-guide §2.10 现有 6 层之上新增 L7：

| 层 | 类型 | 检测方式 |
|----|------|----------|
| L1-L6 | 文本表面特征 | 正则/统计/规则 |
| L7 | 结构级句式模式 | LLM 语义理解 |

### 破折号零容忍策略

- 所有层级统一：0 处/章
- thought_interrupt 场景改用省略号
- 不设例外、不设限频缓冲

### "像"字比喻限频

- 规则：`像+具体意象` ≤1/千字
- 排除：`好像+动词`（"好像有人来了"）、`像是+判断`（"像是累了"）
- 实现：在 `category_metadata.simile_cliche` 中定义 `like_simile_rule`

### Agent 消费路径

```
ai-sentence-patterns.json
  ├── ChapterWriter (C21: 生成时避免)
  ├── StyleRefiner (Constraint 12: 后处理检测替换)
  └── QualityJudge (anti_ai.sentence_pattern_violations: 评分扣分)

ai-blacklist.json (simile_cliche 扩展 + like_simile_rule)
  ├── ChapterWriter (C22: 像字限频)
  ├── StyleRefiner (Constraint 11: 比喻限频)
  └── QualityJudge (blacklist_hits 统计)
```

## Key Decisions

1. **句式模式用 JSON 定义而非正则** — 语义级模式无法正则匹配，靠 LLM 在 prompt 中理解定义来识别
2. **扩展为 L7 而非修改 L1-L6** — 保持现有规则稳定性，增量新增
3. **破折号零容忍无例外** — 包括 thought_interrupt 场景也改用省略号
4. **"像"字限频而非禁止** — 避免误伤非比喻义用法
