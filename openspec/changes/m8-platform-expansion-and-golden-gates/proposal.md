## Why

当前系统仅支持起点(qidian)/番茄(tomato)两个平台，且缺少平台写作指南、黄金三章硬门控、平台差异化加权评分。番茄小说网已更名为 fanqie，tomato 作为旧 ID 需要向后兼容。晋江(jinjiang)作为国内第三大网文平台缺乏支持。

黄金三章（前 3 章）是读者留存的关键窗口，不同平台对前 3 章有截然不同的要求，但当前系统对前 3 章无特殊质量门控。评分权重固定不随平台调整，导致番茄的节奏要求和晋江的角色/风格要求无法被准确评估。

此外，风格档案（style-profile）缺少平台字段，Agent 写作时无法获取平台级写作规范（如对话比例、节奏密度、情感回报周期），只能依赖泛化的通用指导。

## What Changes

6 项子能力，覆盖平台扩展、写作指南、硬门控、加权评分：

1. **平台 ID 扩展（3a）**：`PlatformId` 从 `qidian | tomato` 扩展为 `qidian | tomato | fanqie | jinjiang`；新增 `canonicalPlatformId()` 将 tomato 映射为 fanqie；schema/init/start 技能同步更新。
2. **平台写作指南（3b）**：为 fanqie/qidian/jinjiang 各新增一份 markdown 写作指南模板，定义节奏密度、对话比例、钩子策略、情感回报周期、风格要求等平台特征。
3. **风格档案平台字段（3c）**：`style-profile-template.json` 新增 `"platform": null` 字段，初始化时由编排器填充。
4. **编排器平台指南加载（3d）**：init 阶段复制平台指南到项目根目录；`buildInstructionPacket` 新增 `paths.platform_writing_guide`；ChapterWriter 接收并遵循平台写作规范。
5. **黄金三章门控（3e）**：新增 `golden-chapter-gates.json` 模板，定义各平台前 3 章的硬门控规则（如番茄要求主角 200 字内出场 + 冲突 + 章末钩子）；QualityJudge 新增 Track 3 评估轨；门控失败强制 revise。
6. **平台加权评分（3f）**：`genre-weight-profiles.json` 新增 `platform_multipliers` 段；`computeEffectiveScoringWeights` 接受 `platformId` 参数并应用乘数后重归一化。

## Capabilities

### New Capabilities

- `platform-id-expansion`: fanqie/jinjiang 平台 ID + tomato→fanqie 规范化映射
- `platform-writing-guides`: 平台级 markdown 写作指南模板（fanqie/qidian/jinjiang）
- `golden-chapter-gates`: 黄金三章（Ch001-003）平台差异化硬门控
- `platform-weighted-scoring`: 平台维度评分乘数 + 重归一化

### Modified Capabilities

- `platform-profile`: PlatformId 枚举扩展 + canonicalPlatformId 映射 + schema 更新
- `style-profile`: 新增 platform 字段
- `instruction-packet`: buildInstructionPacket 新增 paths.platform_writing_guide
- `chapter-writer-constraints`: 新增平台写作规范遵循约束
- `quality-gating`: QualityJudge 新增 Track 3（黄金三章门控）
- `scoring-weights`: computeEffectiveScoringWeights 新增 platformId 参数 + 乘数逻辑
- `start-skill`: 平台选择 UI 扩展为 3 可见选项
- `continue-skill`: 章节 ≤3 时注入 golden_chapter_gates + platform_writing_guide 条件加载

## Impact

- 修改约 12 个现有文件（`src/platform-profile.ts`、`src/init.ts`、`src/instructions.ts`、`src/scoring-weights.ts`、`schemas/platform-profile.schema.json`、`templates/platform-profile.json`、`templates/genre-weight-profiles.json`、`templates/style-profile-template.json`、`agents/chapter-writer.md`、`agents/quality-judge.md`、`skills/continue/SKILL.md`、`skills/start/SKILL.md`）
- 新增 4 个模板文件（`templates/golden-chapter-gates.json`、`templates/platforms/fanqie.md`、`templates/platforms/qidian.md`、`templates/platforms/jinjiang.md`）
- 新增 1 条质量评估轨道（Track 3: Golden Chapter Gates）
- 无新 Agent、无新依赖
- 完全向后兼容：tomato 继续有效；platform_multipliers 可选（缺失时所有维度乘数默认 1.0）；黄金门控仅在 chapter ≤ 3 且模板存在时生效
