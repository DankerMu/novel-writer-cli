## Context

L3 章节契约当前包含 `chapter_id`, `preconditions`, `postconditions`, `plot_points`, `storyline_refs` 等字段，但没有对章节"爽点"的分类。网文创作中，不同类型的爽点（打脸、逆袭、升级、揭秘、悬念、铺垫）需要不同的写作策略和质量评估标准。

现有 QualityJudge pacing 维度使用统一的"冲突强度"标准评估所有章节，导致两个问题：
- 铺垫章天然冲突弱，被通用标准评分偏低，但其实质量应以"是否有效为后续爽点蓄力"来衡量；
- 打脸/逆袭等高爆发章缺少"落地感"的专项评估——爽点是否真正落地、读者爽感是否到位，这才是关键质量点。

## Goals / Non-Goals

**Goals:**
- 让 PlotArchitect 在卷级大纲规划时显式标注每章爽点类型，使创作意图可追踪
- 让 QualityJudge 根据爽点类型使用差异化评审标准，提升评分精度
- 为后续题材→爽点映射（CS4 genre-excitement-map）提供基础枚举

**Non-Goals:**
- 不自动推断爽点类型（由 PlotArchitect 规划时指定，不做后验推断）
- 不改变 pacing 维度的权重（8%），只改评审标准
- 不强制所有章节都有爽点（`null` 为合法值，代表过渡章/无显式爽点）
- 不引入新的运行时文件或持久化工件

## Decisions

1) **7 个枚举值覆盖网文主流爽点类型 + null**
   - `reversal`（逆袭）/ `face_slap`（打脸）/ `power_up`（升级）/ `reveal`（揭秘）/ `cliffhanger`（悬念）/ `setup`（铺垫）/ `null`（无爽点/过渡章）
   - 覆盖都市、玄幻、科幻、历史等主流题材的常见爽点模式；未来可扩展但当前不预留 `custom` 值以避免滥用

2) **`setup` 单独处理**
   - 铺垫章的质量在于"为后续爽点做了有效铺垫"而非本章冲突强度
   - QualityJudge 对 `setup` 章使用"铺垫有效性"标准：是否引入了足够的期待感、是否与后续爽点形成因果链

3) **评估结果用 hit/partial/miss 三档，不用数值**
   - 爽点落地是定性判断（"这个打脸爽不爽"），三档比数值更直觉、更可复现
   - `hit`：爽点充分落地，读者预期满足或超越
   - `partial`：爽点有但力度不足或被稀释
   - `miss`：爽点未落地或偏离预期类型

4) **字段缺失 = null，零迁移成本**
   - 现有 L3 契约无 `excitement_type` 字段时自动视为 `null`
   - QualityJudge 遇到 `null` 使用标准 pacing 评估，不做爽点落地评估，行为完全不变

## Risks / Trade-offs

- [Low] PlotArchitect 标注不准 → Mitigation: QualityJudge 可在评估时记录 `excitement_type_override` 纠正标注偏差，不阻断流水线
- [Low] 枚举不够用 → Mitigation: 当前 6+null 覆盖主流场景；未来可通过新 changeset 扩展，向后兼容
- [Low] setup 章的"铺垫有效性"难以量化 → Mitigation: 以定性判断为主（是否建立期待感），不追求数值化

## Migration Plan

无需迁移。现有 L3 契约无 `excitement_type` 字段，自动视为 `null`，QualityJudge 不做爽点落地评估，行为不变。新项目从创建第一卷大纲起自动启用。
