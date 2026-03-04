## 1. De-quota (§2.3)

- [ ] 1.1 Audit all fixed quotas in `style-guide.md` Layer 2: identify every instance of "至少.*处", "每章.*次", "每.*次.*出现.*次", and similar fixed-count mandates
- [ ] 1.2 Replace §2.2 角色语癖 frequency from "每 2-3 次对话出现 1 次" to "recurring but irregular, naturally varying frequency"
- [ ] 1.3 Replace §2.3 反直觉细节 from "每章至少 1 处" to "naturally varying, presence encouraged but count not mandated"
- [ ] 1.4 Review §2.5 句式多样性 and §2.6 标点符号约束 for any implicit fixed quotas; adjust language to emphasize rate ranges with natural variance acknowledgment
- [ ] 1.5 Verify zero matches for quota patterns (`至少.*处`, `每章.*次`, `每.*次.*出现.*次`) in the updated file

## 2. Statistical Distribution Targets (§2.8)

- [ ] 2.1 Add new §2.8 section header "统计分布目标" after existing §2.7
- [ ] 2.2 Define dimension 1: `sentence_length_variance` — reference `statistical.sentence_length_std_dev` from style-profile, fallback range 8–18, AI characteristic: std_dev < 5
- [ ] 2.3 Define dimension 2: `paragraph_length_cv` — reference `statistical.paragraph_length_cv` from style-profile, fallback range 0.4–1.2, AI characteristic: CV < 0.3
- [ ] 2.4 Define dimension 3: `vocabulary_diversity` — reference `statistical.vocabulary_diversity` from style-profile, describe human vs AI lexical diversity patterns
- [ ] 2.5 Define dimension 4: `narration_connectors` — zero tolerance in narration ("与此同时"、"值得一提的是" etc.), reference existing blacklist overlap
- [ ] 2.6 Define dimension 5: `register_mixing` — describe varying formality levels within text, reference style-profile writing_directives
- [ ] 2.7 Define dimension 6: `emotional_arc` — non-monotonic emotional trajectory per chapter, reference narrative health concepts
- [ ] 2.8 Add summary table with columns: dimension / style-profile field / fallback range / AI characteristic

## 3. Humanization Toolbox (§2.9)

- [ ] 3.1 Add new §2.9 section header "人性化技法工具箱" after §2.8
- [ ] 3.2 Document cognitive techniques: `thought_interrupt` (思维中断) and `self_correction` (自我纠正) with Chinese descriptions and examples
- [ ] 3.3 Document sensory techniques: `sensory_intrusion` (感官侵入) and `mundane_detail` (琐碎细节) with Chinese descriptions and examples
- [ ] 3.4 Document linguistic techniques: `dialect_slip` (方言滑落), `incomplete_sentence` (不完整句), `rhetorical_question` (反问) with Chinese descriptions and examples
- [ ] 3.5 Document emotional techniques: `stream_of_consciousness` (意识流片段), `emotional_non_sequitur` (情感跳跃), `contradiction` (矛盾) with Chinese descriptions and examples
- [ ] 3.6 Document structural techniques: `nested_parenthetical` (嵌套补充) and `abrupt_topic_shift` (突然转题) with Chinese descriptions and examples
- [ ] 3.7 Add explicit random sampling instruction: "每章从工具箱中随机采样若干技法使用，不固定数量，不固定组合"
- [ ] 3.8 Add categorization summary table: technique / category / Chinese name

## 4. Structural Rules (§2.10) — from anti-ai-polish.md

- [ ] 4.1 Add new §2.10 section header "六层结构规则"
- [ ] 4.2 L1 反模板句式: document forbidden patterns (三段式总结 / 二元对立 / 递进堆砌 / 排比开头) and alternatives (场景推进/对话推进/动作推进)
- [ ] 4.3 L2 形容词/副词密度控制: document thresholds (每300字强调词≤2 / 形容词≤6 / 连续两个以上形容词修饰同名词禁止 / "的"字连用≤2)
- [ ] 4.4 L3 四字成语密度控制: document thresholds (每500字≤3 / 连续两个以上禁止 / 同段≤2); note "四字词组连用是AI写作最明显的特征之一"
- [ ] 4.5 L4 对话去AI化: document intent system (试探/回避/施压/诱导/挑衅/敷衍); document 3 prohibitions (书面语对话 / 叙述重复 / 语气同质化); add "去掉对话标签能否分辨说话人" test
- [ ] 4.6 L5 段落结构 `⚙️ 可覆写`: document defaults (单句段25-45% / 每段20-100字 / 禁止3段以上同句式/同长度); add genre override table
- [ ] 4.7 L6 标点节奏 `⚙️ 可覆写`: document defaults (省略号≤5/章 / 感叹号≤8/章 / 破折号≤5/章 / 禁止连用); add genre override table

## 5. Genre Override Mechanism (§2.11)

- [ ] 5.1 Add new §2.11 section header "类型覆写机制"
- [ ] 5.2 Define genre override source: `concept.md` "类型覆写" section or `platform-profile.json` genre field
- [ ] 5.3 Document override table for 4 genres:
  - 科幻: 单句段15-30%, 每段可到120字, 感叹号≤5/章, 抽象空词"难以形容/不可名状"每章≤2处
  - 悬疑: 单句段20-35%, 每段可到100字
  - 恐怖: 单句段30-50%, 省略号可到≤8/章
  - 言情: 使用默认值
- [ ] 5.4 State override precedence: genre override > default values

## 6. Polish Execution Flow (§2.12) + Quick Checklist (§2.13)

- [ ] 6.1 Add new §2.12 section header "润色执行流程"
- [ ] 6.2 Document Step 1: 黑名单扫描 — cross-reference 10 categories, decision criteria (角色对话中合理使用→保留 / 首次出现不可替代→保留 / 其他→替换)
- [ ] 6.3 Document Step 2: 结构规则检查 — 6-layer checklist (模板句式 / 形容词密度 / 四字词组 / 对话意图 / 段落长短 / 标点频次)
- [ ] 6.4 Document Step 3: 抽象→具体转换 — "感到XX"→身体反应 / "非常/极其"→具体程度 / "难以形容"→努力形容 / 通用比喻→专属意象
- [ ] 6.5 Document Step 4: 节奏朗读测试 — check 3+ consecutive same-rhythm sentences / logic connector pileup / overlong descriptions
- [ ] 6.6 Add new §2.13 section header "快速检查清单"
- [ ] 6.7 Document 5-item minimum checklist: 四字词组连用 / 情绪直述("感到XX") / 微微系列 / 缓缓系列 / 标点过度

## 7. Layer 4 Rewrite

- [ ] 7.1 Replace the existing 4-indicator 5-point scoring table with a 7-indicator 3-zone assessment table
- [ ] 7.2 Define green/yellow/red zones for `blacklist_hit_rate` (per 1000 chars)
- [ ] 7.3 Define green/yellow/red zones for `sentence_repetition_rate`
- [ ] 7.4 Define green/yellow/red zones for `sentence_length_std_dev` (new, reference §2.8 and style-profile)
- [ ] 7.5 Define green/yellow/red zones for `paragraph_length_cv` (new, reference §2.8 and style-profile)
- [ ] 7.6 Define green/yellow/red zones for `vocabulary_diversity_score` (new)
- [ ] 7.7 Define green/yellow/red zones for `narration_connector_count` (new, green = 0)
- [ ] 7.8 Define green/yellow/red zones for `humanize_technique_variety` (new)
- [ ] 7.9 Preserve old 4-indicator 5-point table as legacy fallback, clearly marked with backward compatibility note

## 8. Validation

- [ ] 8.1 Verify zero fixed quotas remain in the entire `style-guide.md` Layer 2
- [ ] 8.2 Verify all 6 dimensions in §2.8 reference style-profile statistical fields defined in CS-A1
- [ ] 8.3 Verify all 12 techniques in §2.9 have Chinese name + description + example
- [ ] 8.4 Verify §2.10 covers all 6 layers with quantified thresholds matching anti-ai-polish.md
- [ ] 8.5 Verify §2.11 genre overrides cover 科幻/悬疑/恐怖/言情 with specific parameter adjustments
- [ ] 8.6 Verify §2.12 documents all 4 steps of polish execution flow
- [ ] 8.7 Verify §2.13 quick checklist has exactly 5 items
- [ ] 8.8 Verify Layer 4 table has exactly 7 indicators, each with 3 zones
- [ ] 8.9 Verify backward compatibility: old 4-indicator table preserved as legacy
- [ ] 8.10 Cross-reference with `docs/anti-ai-polish.md` — verify all content from sections 一~四 is represented
