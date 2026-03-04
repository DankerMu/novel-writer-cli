## Context

当前系统在 M6 中引入了 `platform-profile.json` 与 `genre-weight-profiles.json`，支持 qidian/tomato 两个平台的画像驱动写作。但存在以下不足：

- 番茄小说网品牌已更名为 fanqie，现有 `tomato` ID 成为历史遗留；晋江（jinjiang）作为国内女频/耽美第一大站完全缺席。
- Agent 写作时只有泛化的风格指导（`style-profile.json` + `ai-blacklist.json`），缺少平台级别的写作规范（如番茄对话比例 40-50%、晋江要求 CP 早期登场等）。
- 前 3 章是读者留存的"黄金窗口"，不同平台对开篇有截然不同的硬性要求，但当前系统对前 3 章无特殊门控。
- 评分权重固定不随平台调整：番茄重节奏/钩子，晋江重角色/风格自然度/情感，但 `computeEffectiveScoringWeights` 只接受 `genre_drive_type`，不感知平台。

本 change 以"平台扩展 + 写作指南 + 黄金门控 + 加权评分"四维度，把平台差异化从"配置参数"提升到"写作规范 + 质量门控 + 评分权重"的完整闭环。

## Goals / Non-Goals

**Goals:**
- 扩展 PlatformId 至 4 值（qidian/tomato/fanqie/jinjiang），tomato 作为 fanqie 的向后兼容别名。
- 为 3 个规范平台（fanqie/qidian/jinjiang）各提供一份 markdown 写作指南，定义平台特有的写作规范。
- style-profile-template 新增 platform 字段，初始化时自动填充。
- 编排器在 init 阶段复制平台指南到项目根目录，并在 instruction packet 中传递给 ChapterWriter。
- 为前 3 章定义平台差异化的硬门控规则（golden chapter gates），QualityJudge 新增 Track 3 评估。
- 评分权重在 genre_drive_type 基础上叠加平台乘数，然后重归一化。

**Non-Goals:**
- 不引入新 Agent。
- 不修改现有门控阈值（≥4.0 通过、3.0-3.4 修订、<2.0 重写的逻辑不变）。
- 不做平台 API 对接或用户数据回灌。
- 不在本次 change 中废弃 tomato ID（只做别名映射）。
- 不为已有项目做自动迁移（已有项目保持原 platform ID 不变）。

## Decisions

### 1. fanqie 作为规范 ID，tomato 作为向后兼容别名（不废弃）

- **理由**：番茄小说网官方品牌已变更为 fanqie；但已有项目的 `platform-profile.json` 中可能写着 `tomato`，强制废弃会破坏兼容性。
- **实现**：`canonicalPlatformId(id)` 函数将 tomato 映射为 fanqie；所有内部逻辑使用规范 ID；tomato 在 schema enum 中保留但在用户面对的选项中隐藏。
- **影响**：所有按平台查找配置/模板/乘数的代码统一使用规范 ID。

### 2. 平台写作指南用 markdown 而非 JSON

- **理由**：写作指南是面向 Agent 上下文注入的自然语言文档，不是结构化配置；markdown 人类可读、可直接注入 prompt、便于平台编辑者维护。
- **实现**：`templates/platforms/{fanqie,qidian,jinjiang}.md`，每份定义节奏密度、对话比例、钩子策略、情感回报周期、风格要求等。
- **约束**：指南内容不超过 2000 token（估算），以控制注入成本。

### 3. 黄金门控用 JSON 配置而非硬编码

- **理由**：不同平台的前 3 章要求差异大（番茄要主角 200 字内出场，晋江要 CP 登场 + 情感基调），硬编码不可扩展。JSON 配置允许用户覆盖与未来新增平台。
- **实现**：`templates/golden-chapter-gates.json` 按平台定义 `chapters` 数组（含硬门控条件与 `invalid_combinations` 警告表）；init 阶段复制到项目根目录。
- **触发条件**：仅当 chapter ≤ 3 且模板存在时注入 QualityJudge。

### 4. 乘数式评分而非每平台独立权重配置

- **理由**：已有 `genre_drive_type` → weight profile 机制（M6）；若每平台再定义完整权重会导致组合爆炸（4 平台 × 4 驱动类型 = 16 套）。乘数可与驱动类型权重正交组合。
- **实现**：`genre-weight-profiles.json` 新增 `platform_multipliers` 段，每个平台定义部分维度的乘数（默认 1.0）。`computeEffectiveScoringWeights(driveType, platformId?)` 先加载驱动类型权重，再逐维度乘以平台乘数，最后重归一化使总和为 1.0。
- **兼容性**：`platformId` 参数可选；缺失或未找到乘数时所有维度默认 1.0（等同无影响）。

### 5. 黄金门控范围限定为 chapter ≤ 3

- **理由**："黄金三章"是网文行业共识；超过第 3 章后，读者留存驱动因素从"开篇吸引力"转向"持续内容质量"（后者由现有 8 维度评分覆盖）。
- **边界明确**：QualityJudge Track 3 仅在 `chapter_number <= 3` 时激活；第 4 章起自动跳过。

### 6. jinjiang 默认参数：word_count 2000-3000，genre_drive_type=character

- **理由**：晋江读者偏好精致文笔与角色塑造，章节偏短；角色驱动是晋江主流题材（言情/耽美/女尊）的核心叙事模式。
- **实现**：`templates/platform-profile.json` 新增 jinjiang 默认配置；Start skill 在用户选择 jinjiang 时预填这些值。

## Risks / Trade-offs

- [Risk] 平台写作指南注入增加 prompt 长度 → Mitigation：每份指南控制在 2000 token 以内；仅 ChapterWriter 接收（不注入所有 Agent）。
- [Risk] 黄金门控过严导致前 3 章反复修订 → Mitigation：门控条件可通过项目级 `golden-chapter-gates.json` 覆盖/放宽；revision 次数受现有 `revision_count` 上限约束。
- [Risk] 平台乘数导致评分维度权重极端化 → Mitigation：乘数值控制在 1.0-1.5 范围；重归一化保证总和为 1.0。
- [Risk] tomato→fanqie 映射对已有项目可能造成意外行为 → Mitigation：`canonicalPlatformId` 仅在内部查找时使用；项目文件中保存的原始 ID 不被修改。
- [Risk] jinjiang 默认参数可能不适用所有晋江题材 → Mitigation：默认值仅为预填，用户在 init 阶段可确认/修改。

## Migration Plan

1) **新项目**：
   - Start skill 显示 3 个可见选项（qidian/fanqie/jinjiang），选择后写入 `platform-profile.json` 并复制对应写作指南。
   - 若选择 fanqie，自动复制 `golden-chapter-gates.json` 中 fanqie 的门控规则。

2) **已有项目（tomato）**：
   - 继续正常工作；`canonicalPlatformId` 在内部将 tomato 映射为 fanqie。
   - 用户可手动复制平台写作指南与门控模板到项目根目录以启用新能力。
   - 不做自动迁移，避免打断进行中的写作。

3) **平台乘数**：
   - `platform_multipliers` 为可选字段；已有 `genre-weight-profiles.json` 无此字段时等同全 1.0。

## References

- `openspec/changes/m6-platform-optimization/` — 平台画像与权重系统基础
- `src/platform-profile.ts` — PlatformId 类型定义
- `src/scoring-weights.ts` — computeEffectiveScoringWeights 实现
- `src/instructions.ts` — buildInstructionPacket 实现
- `agents/quality-judge.md` — QualityJudge 评估轨道定义
- `skills/novel-writing/references/quality-rubric.md` — 8 维度评分标准
