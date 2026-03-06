## 1. L3 Contract Schema — excitement_type 枚举

- [x] 1.1 Add `excitement_type` enum field (`reversal | face_slap | power_up | reveal | cliffhanger | setup | null`) to L3 chapter contract schema in `agents/plot-architect.md`
- [x] 1.2 Add 9th outline format line `- **ExcitementType**: <value>` to PlotArchitect volume outline template (`agents/plot-architect.md`)
- [x] 1.3 Add `excitement_type` presence check (missing = warning, not error) to contract validation in `skills/start/references/vol-planning.md`

## 2. QualityJudge — 差异化 Pacing 评审

- [x] 2.1 Add excitement-type-aware evaluation logic to Track 2 pacing dimension in `agents/quality-judge.md`: non-null types trigger excitement landing assessment (hit/partial/miss)
- [x] 2.2 Add `setup` chapter special handling: use 铺垫有效性 criteria instead of standard conflict intensity (`agents/quality-judge.md`)
- [x] 2.3 Add `excitement_type` and `excitement_landing` fields to eval JSON output schema (`agents/quality-judge.md`)
- [x] 2.4 Ensure null/missing `excitement_type` preserves existing pacing evaluation behavior unchanged

## 3. Continue Skill — 解析与注入

- [x] 3.1 Parse optional `- **ExcitementType**: <value>` line in Step 2.1 outline parsing (`skills/continue/SKILL.md`)
- [x] 3.2 Default to `null` when ExcitementType line is absent
- [x] 3.3 Inject `excitement_type` into QualityJudge manifest in Step 2.6 when present (`skills/continue/SKILL.md`)

## 4. Validation

- [x] 4.1 Verify backward compatibility: existing L3 contracts without `excitement_type` produce identical QualityJudge behavior
- [x] 4.2 Verify unknown enum values trigger warning (not error) and do not block pipeline
- [x] 4.3 Verify `setup` chapters receive 铺垫有效性 evaluation instead of conflict intensity
