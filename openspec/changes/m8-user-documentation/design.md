## Context

项目当前的文档体系由三层构成：

1. **PRD（11 章）**：产品需求文档，面向产品经理和架构师，描述系统的"是什么"和"为什么"
2. **Tech Spec（6 章）+ Agent 定义（9 份）**：技术规格，面向开发者，描述系统的"怎么做"
3. **DR 报告（21 份）**：设计决策记录，面向贡献者，描述"为什么这样做而不是那样做"

这三层对系统的内部实现者足够了，但对终端用户（中文网文作者）存在明显缺口：

- 用户不关心 Agent 的 prompt 设计或状态机的实现细节
- 用户需要知道的是：如何安装、如何开始、遇到问题怎么办
- M8 引入了 5 项增强（canon_status、excitement_type、平台扩展+黄金三章、题材映射、迷你卷规划），这些变更散布在 5 个 changeset 中，用户无法自行整合

此外，现有项目面临 M8 迁移问题。虽然所有变更都向后兼容（字段缺失有合理默认值），但用户需要明确的指引来决定"要不要做什么"以及"不做会怎样"。

## Goals / Non-Goals

**Goals:**
- 提供一份从安装到日常写作的完整指南（quick-start），按工作流时间顺序组织，降低新用户认知门槛
- 提供一份面向现有用户的迁移指南（migration-guide），覆盖 M8 所有变更的迁移路径
- 覆盖 M8 全部新增功能：canon_status、excitement_type、平台扩展、黄金三章门控、题材兴奋点映射、迷你卷规划
- 全文中文撰写，技术术语首次出现时附英文原文

**Non-Goals:**
- 不替代 PRD 或 Tech Spec（那是开发者/架构师文档）
- 不做交互式教程或视频教程（纯 Markdown 文档）
- 不做 API 参考文档（CLI 的 Skill 调用由系统自动编排，用户无需了解 API 细节）
- 不翻译为英文（目标用户为中文网文作者）

## Decisions

1) **两个文件分工明确**
   - `quick-start.md` 面向新用户：从零开始，假设读者对系统完全陌生
   - `migration-guide.md` 面向现有用户：增量迁移，假设读者已有运行中的项目
   - 不合并为一个大文件，避免新用户被迁移细节干扰、老用户被入门内容浪费时间

2) **quick-start 按工作流顺序组织（而非按功能模块）**
   - 用户的心智模型是"我要写一本小说"，不是"我要配置 canon_status"。按时间顺序（安装→创建→写作→回顾）组织内容，让用户跟着做就能完成第一卷。功能特性（如 canon_status、excitement_type）嵌入到对应的工作流步骤中介绍，不单独成章。

3) **migration-guide 按 changeset 组织**
   - 每个 M8 changeset 对应一个迁移段落，统一结构："是否需要操作" → "如何操作" → "不操作会怎样"。用户可以快速定位自己关心的变更，不需要通读全文。

4) **FAQ 放在 quick-start 末尾**
   - 收集常见问题（如"质量分低于阈值怎么办""可以跳过黄金三章吗"）。FAQ 用 Q&A 格式，方便查找。

5) **文档路径：`docs/user/`**
   - 与现有 `docs/prd/`、`docs/spec/`、`docs/dr-workflow/` 同级，但单独开一个 `user/` 子目录，明确表示这是面向终端用户的文档层。

## Risks / Trade-offs

- [Low] 文档与实现不同步 → Mitigation: 文档在 M8 各 changeset 实现完成后编写/更新；后续 changeset 如修改工作流，应同步更新用户文档。
- [Low] 中文术语翻译不统一 → Mitigation: 技术术语首次出现时附英文原文（如"正典状态（canon_status）"），后续使用中文名；在 quick-start 开头建立关键术语表。
- [Low] 文档过长导致用户不读 → Mitigation: quick-start 控制在 300-500 行；每节开头用一句话总结该节目标；提供目录锚点支持跳转。

## Migration Plan

N/A — 本 changeset 本身就是迁移文档。

## References

- `openspec/changes/m8-canon-status-lifecycle/` — CS1: canon_status 生命周期
- `openspec/changes/m8-excitement-type-annotation/` — CS2: excitement_type 注解
- `openspec/changes/m8-platform-expansion-and-golden-gates/` — CS3: 平台扩展与黄金三章
- `openspec/changes/m8-genre-excitement-mapping/` — CS4: 题材兴奋点映射
- `openspec/changes/m8-golden-chapter-mini-planning/` — CS5: 迷你卷规划 Step F0
- `skills/novel-writing/SKILL.md` — 核心工作流定义
- `skills/novel-writing/references/quality-rubric.md` — 8 维度评分标准
