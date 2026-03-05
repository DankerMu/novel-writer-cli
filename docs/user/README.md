# 用户手册

本目录是 **novel-writer-cli** 的用户文档集合。这里的文档同时覆盖两层使用方式：

- **CLI 层**：`novel ...`（确定性编排，不调用任何 LLM）
- **执行器/Skill 层**：在 Claude Code / Codex 中使用 `/novel:*` 等入口命令（底层会调用 CLI，并运行各类 subagent）

## 入口索引

- 快速上手（Skill 入口）：[快速起步指南](quick-start.md)
- CLI 手册（最重要）：[`novel` CLI](novel-cli.md)
- 常用操作（Skill 入口）：[常用操作](ops.md)
- 规范体系（文件/契约/平台画像）：[规范体系](spec-system.md)
- Guardrails（留存/可读性/命名）：[Guardrails](guardrails.md)
- 交互式门控（NOVEL_ASK）：[交互式门控](interactive-gates.md)
- 故事线（storylines）：[故事线](storylines.md)
