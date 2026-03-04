# Proposal: CS7 — CLAUDE.md + 项目文档更新

## 动机

M8 引入了大量增强：

- **CS1** canon_status 生命周期（established/planned/deprecated）
- **CS2** excitement_type 爽点标注
- **CS3** 平台扩展（+fanqie, +jinjiang）、平台写作指南、黄金三章门控
- **CS4** 题材爽点映射 + 题材黄金标准
- **CS5** Step F0 迷你卷规划（黄金三章）
- **CS6** 用户文档（quick-start.md, migration-guide.md）

但项目的核心入口文档 `CLAUDE.md` 尚未更新以反映这些变化。`CLAUDE.md` 是 Claude Code 的项目指令文件，如果不更新，AI 助手在后续操作中可能不知道新功能的存在或使用方式。

## 变更内容

更新 `CLAUDE.md` 的 4 个主要区域：

1. **Spec-Driven Writing** — 添加 canon_status（L1/L2）和 excitement_type（L3）描述
2. **平台列表** — 扩展为 qidian/fanqie/jinjiang，注明 tomato→fanqie 别名兼容
3. **Directory Map** — 新增 templates/platforms/、golden-chapter-gates.json、genre-excitement-map.json、genre-golden-standards.json、docs/user/ 条目
4. **Quality Gating** — 新增平台加权评分、黄金三章门控、题材差异化标准说明

## 能力影响

- Modified: `project-documentation`

## 影响范围

修改 1 个文件（CLAUDE.md）。无代码变更。
