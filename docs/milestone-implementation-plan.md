# 里程碑实现顺序计划 (Milestone Implementation Plan)

*文档创建日期: 2026-03-04*

本文档梳理了 M5/M8/M9 三个里程碑的未完成 changeset 和 issues，并提出了基于依赖关系和优先级的合理实现顺序，以及对应的 npm 发版计划。

## 1. 分析里程碑依赖关系

当前有三个主要里程碑需要实施：

1. **M5**: CLI 全量编排下沉（5 个 CS）— 核心基础设施
2. **M8**: 上下文质量增强 + 黄金三章（7 个 CS）— 内容质量和平台功能
3. **M9**: 反 AI 检测升级（4 个 CS）— 内容质量和检测防护

从项目架构角度，这三个里程碑之间的隐含优先级是：

## 2. 里程碑内实现顺序

### M5 内部顺序 (CLI 全量编排下沉)

实现顺序：
1. #141 (CS-O1) - Step 类型基础设施 + orchestrator_state 路由 [priority:critical]
2. #144 (CS-O4) - Gate Decision + Review Pipeline [priority:high]
3. #142 (CS-O2) - Volume Pipeline [priority:high]
4. ✅ #143 (CS-O3) - Quick-Start Pipeline [priority:medium] — PR #149 已审核通过
5. #150 (CS-O3b) - quickstart hardening (checkpoint recovery + novel_ask gate) [priority:low]
6. #145 (CS-O5) - Thin Skill Adapters [priority:low]

### M8 内部顺序 (上下文质量增强 + 黄金三章)

实现顺序：
1. #130 (CS3) - 平台扩展 + 硬门 + 加权评分 [priority:high]
2. #129 (CS2) - excitement_type 爽点标注
3. #128 (CS1) - L1/L2 canon_status 生命周期
4. #131 (CS4) - 题材→爽点映射
5. #132 (CS5) - 黄金三章 L3 契约
6. #133 (CS6) - 用户文档
7. #134 (CS7) - CLAUDE.md + 项目文档

### M9 内部顺序 (反 AI 检测升级)

实现顺序：
1. #136 (CS-A1) - 数据模板 + 黑名单扩展
2. #137 (CS-A2) - 方法论层升级
3. #138 (CS-A3) - Agent Prompt 升级
4. #139 (CS-A4) - 支撑设施更新

## 3. 全局优先级排序

综合优先级、依赖关系和并行实施可能性，建议实现顺序如下：

### 第一批（基础设施）
1. 🔴 **#141** (M5-O1): Step 类型 + orchestrator_state [priority:critical]
2. 🟠 **#144** (M5-O4): Gate Decision + Review [priority:high]
3. 🟠 **#142** (M5-O2): Volume Pipeline [priority:high]

### 第二批（M5 完成 + M9/M8 并行）
4. ✅ **#143** (M5-O3): Quick-Start Pipeline [priority:medium] — PR #149 已审核通过
5. 🟢 **#150** (M5-O3b): quickstart hardening [priority:low, follow-up of #143]
6. 🟢 **#145** (M5-O5): Thin Skill Adapters [priority:low]
7. 🟠 **#136** (M9-A1): 数据模板 + 黑名单 [与 M5 无强依赖，可并行]
8. 🟠 **#130** (M8-CS3): 平台扩展 + 硬门 [priority:high]

### 第三批（M9/M8 持续推进）
8. 🟡 **#137** (M9-A2): 方法论层升级 [依赖 A1]
9. 🟡 **#129** (M8-CS2): excitement_type 爽点标注
10. 🟡 **#128** (M8-CS1): canon_status 生命周期

### 第四批（M9/M8 完成）
11. 🟡 **#138** (M9-A3): Agent Prompt 升级 [依赖 A2]
12. 🟡 **#131** (M8-CS4): 题材→爽点映射 [依赖 CS2+CS3]
13. 🟡 **#132** (M8-CS5): 黄金三章 L3 契约 [依赖 CS2]
14. 🟡 **#139** (M9-A4): 支撑设施更新 [依赖 A3]

### 第五批（文档收尾）
15. 🟢 **#133** (M8-CS6): 用户文档
16. 🟢 **#134** (M8-CS7): CLAUDE.md + 项目文档 [依赖 CS1-CS5]

## 4. 并行实施建议

为提高开发效率，可以考虑以下并行策略：

- **M5 基础设施团队**: 专注 Step 类型、编排器状态和流水线 (#141, #142, #143, #144, #145)
- **M9 反 AI 团队**: 专注黑名单、方法论和 Agent 升级 (#136, #137, #138, #139)
- **M8 平台团队**: 专注平台扩展和内容质量增强 (#130, #129, #128, #131, #132)
- **文档团队**: 在功能基本完成后跟进用户文档和项目文档 (#133, #134)

这种分配可以让不同团队并行工作，仅在关键节点（如 M5 完成后）进行同步。

## 5. 里程碑/Issue 状态汇总表

| Issue | 标题 | 优先级 | 依赖 | 批次 |
|-------|------|--------|------|------|
| **M5 里程碑** | | | | |
| #140 | [Epic] M5 CLI 全量编排下沉 | critical | - | - |
| #141 | CS-O1: Step 类型 + orchestrator_state | critical | - | 1 |
| #144 | CS-O4: Gate Decision + Review | high | #141 | 1 |
| #142 | CS-O2: Volume Pipeline | high | #141 | 1 |
| #143 | CS-O3: Quick-Start Pipeline | medium | #141 | 2 | ✅ PR #149 |
| #150 | CS-O3b: quickstart hardening | low | #143 | 2 | follow-up |
| #145 | CS-O5: Thin Skill Adapters | low | #142, #143, #144 | 2 |
| **M8 里程碑** | | | | |
| #127 | [Epic] M8 上下文质量增强 + 黄金三章 | high | - | - |
| #130 | CS3: 平台扩展 + 硬门 + 加权评分 | high | - | 2 |
| #129 | CS2: excitement_type 爽点标注 | medium | - | 3 |
| #128 | CS1: L1/L2 canon_status 生命周期 | medium | - | 3 |
| #131 | CS4: 题材→爽点映射 | medium | #129, #130 | 4 |
| #132 | CS5: 黄金三章 L3 契约 | medium | #129 | 4 |
| #133 | CS6: 用户文档 | low | - | 5 |
| #134 | CS7: CLAUDE.md + 项目文档 | low | #128-#132 | 5 |
| **M9 里程碑** | | | | |
| #135 | [Epic] M9 反 AI 检测升级 | high | - | - |
| #136 | CS-A1: 数据模板 + 黑名单扩展 | medium | - | 2 |
| #137 | CS-A2: 方法论层升级 | medium | #136 | 3 |
| #138 | CS-A3: Agent Prompt 升级 | medium | #137 | 4 |
| #139 | CS-A4: 支撑设施更新 | medium | #138 | 4 |

## 6. npm 发版计划

基于上述实现批次，建议按照以下节点进行 npm 发版（当前版本：0.0.3）：

### 📦 v0.1.0 - M5 基础设施完成（第一批后）
- **时机**: #141, #144, #142 完成后
- **理由**: 完成了 Step 类型系统和核心编排基础设施
- **内容**:
  - Step 类型基础设施
  - orchestrator_state 路由系统
  - Gate Decision + Review Pipeline
  - Volume Pipeline
- **版本号**: 次版本号升级 (0.0.3 → 0.1.0)，表示 CLI 编排核心功能可用

### 📦 v0.2.0 - M5 完整实现（第二批后）
- **时机**: #143, #150, #145 完成后
- **理由**: M5 里程碑全部完成，CLI 编排下沉实现完毕
- **内容**:
  - Quick-Start Pipeline
  - quickstart hardening（checkpoint recovery + novel_ask gate）
  - Thin Skill Adapters
  - 全部 5+1 个 M5-O* 特性完整可用
- **版本号**: 次版本号升级 (0.1.0 → 0.2.0)，表示 CLI 完整功能集可用

### 📦 v0.3.0 - M9 反 AI 功能（第四批中期）
- **时机**: #136, #137, #138 完成后
- **理由**: 反 AI 核心功能可用（Agent 层面实现完成）
- **内容**:
  - 数据模板 + 黑名单 (200+ 词)
  - 方法论层升级 (零配额 + 技法工具箱)
  - Agent Prompt 升级 (CW/SR/QJ)
- **版本号**: 次版本号升级 (0.2.0 → 0.3.0)，表示反 AI 能力显著增强

### 📦 v0.4.0 - M8 平台能力（第四批完成后）
- **时机**: #130, #129, #128, #131, #132, #139 完成后
- **理由**: 平台能力和 M9 支撑设施全部完成
- **内容**:
  - 平台扩展 + 硬门 + 加权评分
  - 爽点标注 + 题材映射
  - 黄金三章 L3 契约
  - 反 AI 支撑设施更新
- **版本号**: 次版本号升级 (0.3.0 → 0.4.0)，表示平台功能全面可用

### 📦 v0.5.0 - 文档完善版（第五批完成后）
- **时机**: #133, #134 完成后
- **理由**: 文档完善，项目达到完整状态但保持保守版本策略
- **内容**:
  - 完整用户文档
  - 项目文档更新
  - M5/M8/M9 全部特性打磨完成
- **版本号**: 次版本号升级 (0.4.0 → 0.5.0)，保持保守版本策略

### 补充说明

1. **更多精细发版**:
   - 如果每个批次的开发时间较长，可以考虑在批次内部增加补丁版本 (如 0.1.1, 0.1.2 等)

2. **预发布版本**:
   - 对于重大功能更改，可以使用预发布标签 (如 0.2.0-beta.1)，让用户提前测试

3. **发版注意事项**:
   - 每次发版前确保运行完整测试套件
   - 更新 CHANGELOG.md 记录所有变更
   - 在 package.json 中更新版本号

4. **1.0.0 版本考量**:
   - 项目在 0.5.0 运行一段时间，确认 API 稳定且用户反馈良好后
   - 可以考虑升级到 1.0.0，表示生产环境可用及 API 稳定
