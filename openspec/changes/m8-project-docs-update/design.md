# Design: CS7 — CLAUDE.md + 项目文档更新

## 背景

`CLAUDE.md` 是 Claude Code 读取的项目级指令文件，定义了项目架构、约定和目录结构。M8 的 6 个 changeset 引入了新概念和新文件，需要同步更新。

## 设计目标

1. CLAUDE.md 准确反映 M8 全部变更
2. 新开发者/AI 助手通过 CLAUDE.md 即可了解新增能力

## Non-Goals

- 不重写 CLAUDE.md（只增量更新）
- 不更新 PRD/Tech Spec（由 CS6 的 migration-guide 覆盖）

## 设计决策

### D1: 增量更新而非重写

只修改受 M8 影响的段落，保持其余内容不变。理由：最小变更原则，减少 diff 噪音。

### D2: 目录映射新增条目按逻辑分组插入

新条目插入到对应父目录下方，与现有条目风格一致。

### D3: Quality Gating 段落扩展

在现有 8 维度评分说明之后，追加平台加权和黄金三章门控的简要说明，详细内容指向子文档。

### D4: Spec-Driven Writing 段落扩展

在现有 4 层规范的代码块中，为 L1/L2 追加 canon_status 注释，为 L3 追加 excitement_type 注释。保持代码块格式一致。

## 变更详情

### 1. Spec-Driven Writing Section



### 2. Platform Context（新增段落，Anti-AI Pipeline 之前）

新增简要说明支持平台：起点 (qidian)、番茄 (fanqie)、晋江 (jinjiang)。注明 tomato 为 fanqie 的向后兼容别名。

### 3. Directory Map

在 `templates/` 行下方新增：
- `templates/platforms/` — 平台写作指南（fanqie.md, qidian.md, jinjiang.md）
- `templates/golden-chapter-gates.json` — 黄金三章门控阈值
- `templates/genre-excitement-map.json` — 题材爽点映射
- `templates/genre-golden-standards.json` — 题材黄金标准

在 `docs/` 块末尾新增：
- `docs/user/` — 用户文档（quick-start.md, migration-guide.md）

在 `openspec/` 块更新里程碑范围。

### 4. Quality Gating

在现有评分说明之后追加：
- 平台加权：不同平台对 8 维度权重有乘数调整
- 黄金三章门控：Track 3 独立评估 Ch1-3，参见 golden-chapter-gates.json
- 题材标准：不同题材有差异化评分基线，参见 genre-golden-standards.json

### 5. Current Milestone

更新里程碑信息以包含 M8。

## 风险

| 级别 | 风险 | 缓解 |
|------|------|------|
| Low | CLAUDE.md 过长 | 保持简洁，详细内容指向子文档 |

## 迁移计划

N/A — CLAUDE.md 更新是一次性的。
