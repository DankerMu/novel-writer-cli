## Why

QualityJudge 的 `indicator_breakdown` 当前仅输出 7 项指标的三区判定（green/yellow/red），但实际评审过程中已经在检测更多维度（破折号合规、句式模式命中、省略号/感叹号频率），这些结果散落在 `punctuation_overuse`、`sentence_pattern_violations[]` 等独立对象中，无法统一进入三区判定体系。此外，比喻密度（`像+具体意象`）和对话区分度两个维度有明确的规则定义（style-guide §2.1 / §2.10 L4）却完全没有量化输出。这导致：

1. **评分盲区**：6 个已有规则/检测结果未参与 `style_naturalness` 的三区综合判定
2. **审计断裂**：消费者需要从 3 个不同对象拼凑完整画面，无法用统一接口回溯
3. **回退粒度粗**：当前只有 `7-indicator` 和 `4-indicator-compat` 两档，缺少中间层

## What Changes

- `indicator_breakdown` 从 7 项扩展到 13 项，新增 6 个指标并定义各自的 green/yellow/red 三区阈值
- `indicator_mode` 新增 `"13-indicator"` 作为默认模式；`"7-indicator"` 降级为中间回退；`"4-indicator-compat"` 保留
- `style_naturalness` 评分映射规则更新：13 项三区判定 → 1-5 分
- `punctuation_overuse` 和 `sentence_pattern_violations[]` 保留原有输出结构（向后兼容），同时将汇总值提升到 `indicator_breakdown`
- style-guide Layer 4 三区判定表从 7 行扩展到 13 行
- quality-rubric `style_naturalness` 维度补充新指标参考

## Capabilities

### New Capabilities
- `13-indicator-expansion`: QualityJudge indicator_breakdown 从 7 项扩展到 13 项，含三区阈值定义、评分映射、回退层级

### Modified Capabilities

（无既有 spec 需修改）

## Impact

- `agents/quality-judge.md` — indicator_breakdown 输出结构、indicator_mode 枚举、style_naturalness 评审口径、Format JSON 示例
- `skills/novel-writing/references/style-guide.md` — Layer 4 三区判定表扩展
- `skills/novel-writing/references/quality-rubric.md` — style_naturalness 维度说明
- 向后兼容：`punctuation_overuse` / `sentence_pattern_violations[]` / `statistical_profile` 保留不动，新增指标为纯增量
