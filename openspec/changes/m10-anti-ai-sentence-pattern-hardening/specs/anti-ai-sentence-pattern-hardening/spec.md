## Scope

新增 8 种结构级 AI 句式模式定义、扩充比喻黑名单、破折号零容忍、并将这些约束同步到 3 个 Agent prompt + style-guide + quality-rubric。

## Data Model

### ai-sentence-patterns.json Schema

```json
{
  "version": "1.0.0",
  "description": "...",
  "patterns": [
    {
      "id": "SP-01",
      "name": "解释型旁白句",
      "severity": "high | medium",
      "per_chapter_max": 0,
      "description": "...",
      "examples": {
        "bad": ["...", "..."],
        "good": ["...", "..."]
      },
      "replacement_strategy": "..."
    }
  ]
}
```

### ai-blacklist.json Additions

- `simile_cliche` 类别新增 8-10 个"像"字比喻词条
- `category_metadata.simile_cliche` 新增 `like_simile_rule` 对象：
  ```json
  {
    "like_simile_rule": {
      "pattern": "像+具体意象",
      "per_kchars_max": 1,
      "exclusions": ["好像+动词", "像是+判断"],
      "description": "..."
    }
  }
  ```
- `version` 升级至 `2.1.0`

### Agent Input Path 新增

所有 3 个 Agent 的 `paths` 新增：
- `paths.ai_sentence_patterns` → `templates/ai-sentence-patterns.json`

## Behavioral Changes

### style-guide.md

- §2.1：补充"像"字限频说明
- §2.6：破折号从 `0-1 处/千字` 改为 `0 处/千字`
- §2.9：`thought_interrupt` 示例去除破折号，改用省略号
- §2.10：L6 破折号从 `≤5/章` 改为 `0/章`；新增 L7 句式模式检测层
- §2.12 Step 2：追加 L7 检查项

### chapter-writer.md

- C14：破折号从"每千字 ≤ 1 处"改为"完全禁止"
- 新增 C21：句式模式禁止（severity=high 零容忍，medium ≤2/章）
- 新增 C22：通用比喻限频（`像+具体意象` ≤1/千字）

### style-refiner.md

- Constraint 4：破折号从"每千字 ≤ 1 处"改为"0 处，命中即替换"
- Step 2：追加 L7 句式模式检测
- 新增 Constraint 11：比喻限频
- 新增 Constraint 12：句式模式后处理

### quality-judge.md

- `anti_ai` 输出新增 `sentence_pattern_violations[]`
- `punctuation_overuse`：`em_dash_count > 0` 为 red
- `style_naturalness` 纳入句式模式命中作为扣分因子

### quality-rubric.md

- style_naturalness 维度补充句式模式扣分规则

## Acceptance Criteria

1. `ai-sentence-patterns.json` 包含 8 种模式，每种有 id/name/severity/description/examples(bad+good)/replacement_strategy/per_chapter_max
2. `ai-blacklist.json` version=2.1.0，`simile_cliche` 类别 ≥11 条
3. `grep -r "每千字 ≤ 1 处" agents/ skills/` 对破折号无残留限频措辞
4. `grep -r "≤5/章" skills/` 对破折号无残留限频措辞
5. style-guide §2.10 包含 L7 层定义
6. 3 个 Agent 均引用 `paths.ai_sentence_patterns`
