## 1. Style Profile Statistical Fields

- [x] 1.1 Add `sentence_length_std_dev` (nullable number, default `null`) to `templates/style-profile-template.json` after `sentence_length_range`, with `_sentence_length_std_dev_comment` documenting human range 8-18, AI signature < 6
- [x] 1.2 Add `paragraph_length_cv` (nullable number, default `null`) to `templates/style-profile-template.json`, with `_paragraph_length_cv_comment` documenting human range 0.4-1.2, AI signature < 0.3
- [x] 1.3 Add `emotional_volatility` (nullable enum: `high | medium | low`, default `null`) to `templates/style-profile-template.json`, with `_emotional_volatility_comment` describing semantic meaning and noting AI text typically scores low
- [x] 1.4 Add `register_mixing` (nullable enum: `high | medium | low`, default `null`) to `templates/style-profile-template.json`, with `_register_mixing_comment` describing formal/informal/dialect mixing degree
- [x] 1.5 Add `vocabulary_richness` (nullable enum: `high | medium | low`, default `null`) to `templates/style-profile-template.json`, with `_vocabulary_richness_comment` describing vocabulary diversity and hapax legomena ratio

## 2. Blacklist — New Categories (from anti-ai-polish.md)

- [x] 2.1 Add `summary_word` category (~10 entries: 总而言之/综上所述/总的来说/不言而喻/毋庸置疑/归根结底/一言以蔽之/值得注意的是/需要指出的是 etc.) with `replacement_hint` for each entry
- [x] 2.2 Add `enumeration_template` category (~8 entries: 首先…其次…最后…/一方面…另一方面…/第一…第二…/不仅…而且…更…/既…又…还… etc.) with `replacement_hint`
- [x] 2.3 Add `academic_tone` category (~12 entries: 显而易见/从某种程度上说/具有重要意义/基于/鉴于/旨在/致力于/深刻地/充分地/相应的/进而/从而 etc.) with `replacement_hint`
- [x] 2.4 Add `narration_connector` category (~10 entries: 然而/不过/因此/尽管如此/与此同时/换言之/事实上/实际上 etc.) — do NOT add to flat `words` array; add `category_metadata` with `context: "narration_only"`
- [x] 2.5 Add `environment_cliche` category (~10 entries: 月光如水/阳光明媚/微风拂面/万籁俱寂/如诗如画/璀璨/瑰丽/绚烂 etc.) with `replacement_hint` ("用具体颜色/形状/光线描写")
- [x] 2.6 Add `narrative_filler` category (~8 entries: 就这样/于是乎/话说回来/不得不说/要知道/紧接着/只见/但见 etc.) with `replacement_hint` and `per_chapter_max` where applicable (只见/但见: max 2)
- [x] 2.7 Add `mechanical_opening` category (~5 entries: 时间来到了XX/让我们把目光转向/回到XX这边/夜幕降临/XX的故事还要从XX说起) with `replacement_hint`
- [x] 2.8 Add `paragraph_opener` category (~6 entries: 此刻/这一刻/就在这时/紧接着/话音刚落/下一秒) — add to flat `words` array
- [x] 2.9 Add `smooth_transition` category (~5 entries: 随着时间的推移/在这个过程中/正当...之际/伴随着...的到来/不知不觉间) — add to flat `words` array

## 3. Blacklist — Existing Category Expansion (from anti-ai-polish.md)

- [x] 3.1 Expand `emotion_cliche` by +8 entries (百感交集/五味杂陈/心如刀割/心如死灰/心中涌起一股XX/不禁感到/油然而生/内心充满了XX) with `replacement_hint` ("用身体反应/行为展示")
- [x] 3.2 Expand `expression_cliche` by +4 entries (目光如炬/目光灼灼/面色一沉/嘴角微微上扬) with `replacement_hint`
- [x] 3.3 Expand `action_cliche` by +8 entries (缓缓开口/缓缓说道/微微一笑/淡淡一笑/深吸一口气/眉头微皱/脚步一顿/身形一滞/不由自主地) with `replacement_hint` and `per_chapter_max` (深吸一口气: 1, 眉头微皱: 1, 脚步一顿: 1, 身形一滞: 1)
- [x] 3.4 Add `abstract_filler` category (~8 entries: 某种程度上/难以形容/无法言喻/不可名状/说不清道不明/难以言喻/无法用言语形容/各种各样) with `replacement_hint` and genre override note (科幻类"难以形容/不可名状"每章≤2 处)

## 4. Blacklist Metadata

- [x] 4.1 Add `max_words: 250` field to `templates/ai-blacklist.json` root level
- [x] 4.2 Add `replacement_hint` field support to blacklist entry schema (required string)
- [x] 4.3 Add `per_chapter_max` field support to blacklist entry schema (optional int)
- [x] 4.4 Add `genre_override` field support to `category_metadata` (optional object mapping genre → adjusted rules)
- [x] 4.5 Update `version` to `"2.0.0"` and add entry to `update_log` documenting the expansion (date, description, new count)

## 5. Validation

- [x] 5.1 Verify `templates/style-profile-template.json` loads without error with all 5 new null fields; confirm valid JSON
- [x] 5.2 Verify `templates/ai-blacklist.json` total categorized entries are at least 190 and do not exceed `max_words` (excluding `narration_connector`-only entries in flat `words`)
- [x] 5.3 Verify `narration_connector` category has `context: "narration_only"` in `category_metadata`
- [x] 5.4 Verify all entries in flat `words` array are unique (no duplicates)
- [x] 5.5 Verify `max_words` (250) >= current total unique entries
- [x] 5.6 Verify every entry has `replacement_hint`
- [x] 5.7 Verify `per_chapter_max` entries have valid positive integer values
- [x] 5.8 Cross-reference with `docs/anti-ai-polish.md` — verify all 10 categories from the guide are represented
