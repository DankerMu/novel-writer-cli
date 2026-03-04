## Why

当前项目的技术文档体系完备（11 章 PRD + 6 章 Tech Spec + 9 个 Agent 定义 + 21 份 DR 报告），但这些文档面向开发者和系统架构师，对想要使用本 CLI 创作小说的终端用户并不友好。技术规格分散在多个文件中，用户需要在 PRD、Agent prompt、Skill 定义之间反复跳转才能拼凑出完整的使用流程。

M8 引入的多项增强进一步加剧了这个问题：

- **canon_status（CS1）**：规则和角色有了生命周期状态，但用户不知道这对写作意味着什么
- **excitement_type（CS2）**：章节契约新增了兴奋点类型注解，用户不清楚如何利用
- **平台扩展与黄金三章（CS3）**：起点/番茄/晋江三平台 + Ch1-3 专项门控，用户需要知道如何选择平台和应对黄金三章
- **题材兴奋点映射（CS4）**：6 大题材有了独立标准，但分散在 Agent 定义中
- **迷你卷规划 Step F0（CS5）**：工作流新增了步骤，用户需要了解流程变化

缺少统一的用户指南，这些新功能的价值无法有效传递给终端用户。

## What Changes

新建两个面向终端用户的文档：

- **`docs/user/quick-start.md`**：从零到续写的完整指南，按工作流顺序组织（安装 → 创建项目 → 平台选择 → 风格来源 → 黄金三章 → 卷规划 → 日常写作 → 质量回顾 → FAQ），覆盖 M8 全部新功能
- **`docs/user/migration-guide.md`**：现有项目的迁移路径指南，按 changeset 组织，每个变更说明"是否需要操作""如何操作""不操作会怎样"

两份文档均以中文撰写，面向中文网文作者。

## Capabilities

### New Capabilities

- `user-quick-start-guide`: 面向终端用户的从零到续写完整指南
- `user-migration-guide`: 面向现有用户的 M8 增量迁移路径文档

### Modified Capabilities

None.

## Impact

- 新建 2 个文档文件（`docs/user/quick-start.md`、`docs/user/migration-guide.md`）
- 不修改任何代码、Agent prompt 或 Skill 定义
- 不影响任何现有功能或工作流
