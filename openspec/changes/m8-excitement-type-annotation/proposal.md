## Why

当前 L3 章节契约定义了前置/后置条件和情节要点，但缺少对"爽点类型"的显式标注。QualityJudge 的 pacing 维度只做通用节奏评估，无法区分"打脸章"和"铺垫章"的不同评审标准。铺垫章被按冲突强度评分会偏低，打脸章缺少"落地感"评估会漏评关键质量点。

## What Changes

L3 契约新增 `excitement_type` 枚举字段（7 个值含 null）。PlotArchitect 在规划大纲时标注每章爽点类型。QualityJudge pacing 维度根据类型切换评审标准：`setup` 章用铺垫有效性，其他类型评估爽点落地（hit/partial/miss）。

## Capabilities

### New Capabilities

- `excitement-type-annotation`: L3 章节契约爽点类型枚举标注 + QualityJudge 差异化评审

### Modified Capabilities

- `plot-architect-outline`: L3 contract schema 新增 `excitement_type` 枚举；大纲格式新增第 9 行 `- **ExcitementType**:`
- `quality-pacing-evaluation`: pacing 维度根据 `excitement_type` 切换评审标准；eval JSON 新增 `excitement_type` + `excitement_landing` 字段
- `continue-skill-manifest`: Step 2.1 解析可选 ExcitementType 行；Step 2.6 注入 QualityJudge manifest

## Impact

- 修改 4 个文件（2 agents + 2 skills），无新增运行时文件，无新增依赖：

| File | Change |
|------|--------|
| `agents/plot-architect.md` | L3 contract schema adds `excitement_type` enum; outline format adds 9th line |
| `agents/quality-judge.md` | Pacing dimension adapts by excitement type; eval JSON adds new fields |
| `skills/continue/SKILL.md` | Step 2.1 parses optional ExcitementType; Step 2.6 injects into manifest |
| `skills/start/references/vol-planning.md` | Contract validation adds presence check (warning, not error) |
