## 1. Schema & Storage

- [x] 1.1 Update `agents/world-builder.md`: add `canon_status` field (`"established"` | `"planned"` | `"deprecated"`, default `"established"`) to `rules.json` output schema; WorldBuilder sets it explicitly on create/update
- [x] 1.2 Update `agents/character-weaver.md`: add `canon_status` field to character `.json` output schema; CharacterWeaver sets it explicitly on create/update
- [x] 1.3 Document backward compatibility rule: all consumers treat missing `canon_status` as `"established"`

## 2. Context Assembly (novel CLI instruction packet)

- [x] 2.1 Implement in `src/instructions.ts` and document in `skills/continue/SKILL.md`: filter `hard_rules_list` to only include rules where `canon_status == "established"` or field is missing
- [x] 2.2 Implement in `src/instructions.ts` and document in `skills/continue/SKILL.md`: collect `planned` rules into a separate `planned_rules_info` manifest field (for ChapterWriter informational reference)
- [x] 2.3 Implement in `src/instructions.ts` and document in `skills/continue/SKILL.md`: skip characters with `canon_status == "deprecated"` during L2 contract trimming (exclude from `character_contracts` and `character_profiles` path lists)
- [x] 2.4 Implement in `src/instructions.ts` and document in `skills/continue/SKILL.md`: include `planned` characters in context but annotate them as non-enforced

## 3. ChapterWriter Consumption

- [x] 3.1 Update `agents/chapter-writer.md`: document that `hard_rules_list` only contains `established` rules; add handling for `planned_rules_info` as a non-binding reference section
- [x] 3.2 Update `agents/chapter-writer.md`: document that `planned` characters may be referenced/foreshadowed but their L2 constraints are not enforced

## 4. QualityJudge Gating

- [x] 4.1 Update `agents/quality-judge.md` Track 1 L1 check: skip rules with `canon_status == "planned"` or `"deprecated"`; verify rules with `canon_status == "established"` or missing field
- [x] 4.2 Update `agents/quality-judge.md` Track 1 L2 check: skip characters with `canon_status == "planned"` or `"deprecated"`

## 5. Validation

- [x] 5.1 Verify backward compatibility: confirm that a `rules.json` with no `canon_status` fields produces identical `hard_rules_list` output as before this change
- [x] 5.2 Verify that `planned` rules do not appear in `hard_rules_list` and do not trigger QualityJudge violations
- [x] 5.3 Verify that `deprecated` characters are excluded from context assembly path lists
