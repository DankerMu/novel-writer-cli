# 规范体系

本系统用 4 层规范驱动写作，确保长篇小说在数百章后仍保持一致性。

## 四层规范概览

```
L1 世界规则    → 硬约束，不可违反（类似编译错误）
L2 角色契约    → 能力/行为边界，变更需走协议
L3 章节契约    → 每章的前置/后置条件（类似函数签名）
LS 故事线规范  → 多线叙事约束（防串线、控节奏）
```

## L1 世界规则

**文件**：`world/rules.json`
**生成者**：WorldBuilder

每条规则标注 `hard`（不可违反）或 `soft`（可有例外但需说明理由）：

```json
{
  "id": "W-001",
  "category": "magic_system",
  "rule": "修炼者突破金丹期必须经历雷劫",
  "constraint_type": "hard",
  "exceptions": []
}
```

快速起步阶段只生成 ≤3 条核心 hard 规则，后续卷规划时按需扩展。

ChapterWriter 收到 hard 规则时会以禁止项注入：违反即自动拒绝。

## L2 角色契约

**文件**：`characters/active/*.json`
**生成者**：CharacterWeaver

定义每个角色的能力边界和行为模式：

- 能力上限（不能做什么）
- 性格底线（绝不会做的事）
- 关系约束（敌友关系不可突变）
- 成长轨迹（从 A 到 B 需要什么条件）

角色退场有三重保护：活跃伏笔检查 → 故事线依赖检查 → 用户确认。

## L3 章节契约

**文件**：`volumes/vol-XX/chapter-contracts/chapter-XXX.json`
**生成者**：PlotArchitect（卷规划阶段）

每章的前置条件（写之前必须满足什么）和后置条件（写完后必须达成什么）：

- 继承哪条故事线
- 必须推进的情节点
- 必须出场的角色
- 伏笔埋设/回收要求
- 状态变更预期

QualityJudge 验收时逐条检查章节契约的达成情况。

## LS 故事线规范

**文件**：`storylines/storyline-spec.json`
**规则编号**：LS-001 ~ LS-005

5 条核心故事线规则：

| 规则 | 说明 |
|------|------|
| LS-001 | 故事线 ID 一经定义不可重命名 |
| LS-002 | 同时活跃故事线 ≤4 条 |
| LS-003 | 交汇事件必须按 schedule 在指定范围内完成 |
| LS-004 | 副线最小出场频率（如每 8 章至少 1 次） |
| LS-005 | 跨线实体不可泄漏（A 线的秘密不能无故出现在 B 线） |

详见 [多线叙事指南](storylines.md)。

## 质量门控

QualityJudge 采用双轨验收：

1. **合规检查**（硬门槛）：L1/L2/L3/LS 逐条校验，有 high-confidence 违规即强制修订
2. **质量评分**（软评估）：8 维度加权评分

> **注意（动态权重）**：实际评分权重以 `platform-profile.json.scoring` + `genre-weight-profiles.json` 计算得到的 instruction packet JSON 的 `manifest.inline.scoring_weights` 为准（commit 后也会写入 `evaluations/*-eval.json.scoring_weights`）；下表仅为 **legacy fallback 默认值**（当未提供 `scoring_weights` 时使用）。
>
> 当 `platform-profile.json.hook_policy.required=true` 时，会额外启用 **章末钩子强度**（`hook_strength`，1–5 分）维度；若低于 `hook_policy.min_strength`，`novel next` 可能返回 `chapter:NNN:hook-fix`（只改章末 1–2 段；最多一次）或 `...:review`。未启用时该维度权重为 0，不影响综合分。
>
> 若项目存在 `platform-profile.json.scoring`，但缺失 `genre-weight-profiles.json`，则质量评估/commit 会报错并提示你从 `templates/genre-weight-profiles.json` 恢复（这是动态权重的必需输入）。

| 维度 | 权重 |
|------|------|
| 情节逻辑 | 18% |
| 角色塑造 | 18% |
| 沉浸感 | 15% |
| 风格自然度 | 15% |
| 伏笔处理 | 10% |
| 节奏 | 8% |
| 情感冲击 | 8% |
| 故事线连贯 | 8% |

评分阈值：≥4.0 通过，3.5-3.9 二次润色，3.0-3.4 自动修订，2.0-2.9 人工审核，<2.0 强制重写。

## 文件结构

```
project/
├── brief.md                  创作纲领
├── .checkpoint.json           进度快照
├── style-profile.json         风格指纹
├── ai-blacklist.json          AI 用语黑名单
├── platform-profile.json      平台画像/约束配置（平台绑定不可变）
├── genre-weight-profiles.json QualityJudge 动态权重配置
├── web-novel-cliche-lint.json （可选）网文套路词 / 模板腔 lint 词库
├── world/
│   ├── geography.md           地理设定
│   ├── history.md             历史背景
│   ├── rules.md               规则叙述
│   ├── rules.json             L1 结构化规则
│   └── changelog.md           变更记录
├── characters/
│   └── active/                活跃角色档案 + L2 契约
├── storylines/
│   ├── storylines.json        故事线定义
│   ├── storyline-spec.json    LS 规范
│   └── {id}/memory.md         各线记忆文件
├── volumes/vol-XX/
│   ├── outline.md             卷大纲
│   ├── storyline-schedule.json 故事线调度
│   ├── foreshadowing.json     伏笔计划
│   └── chapter-contracts/     L3 章节契约
├── chapters/                  章节正文
├── summaries/                 章节摘要
├── evaluations/               质量评估
├── foreshadowing/global.json  伏笔全局索引
├── state/current-state.json   世界状态快照
└── logs/                      流水线日志
```

### 平台画像与不可变绑定

`platform-profile.json` 在项目初始化时生成，用于约束字数/信息负载/合规策略/章末钩子策略，并提供 QualityJudge 的动态权重输入（`scoring`）。  
其中 `platform-profile.json.platform`（以及对应的叙事驱动类型 `scoring.genre_drive_type`）一旦写入，系统视为该项目的**不可变绑定**：后续不会被“更新设定”等操作改写。若要更换平台/驱动类型，建议新建项目目录重新初始化。

`web-novel-cliche-lint.json` 为可选文件：缺失时 cliché lint 会降级跳过（不阻断流水线）。启用后三级 severity 行为如下：

| severity | 行为 |
|----------|------|
| `warn` | 仅在日志中提示，不影响评分或流水线 |
| `soft` | 作为评分信号降低 `style_naturalness` 维度得分，不阻断 commit |
| `hard` | 阻断 `novel commit`，必须修改后重新提交 |

需要启用时可从 `templates/web-novel-cliche-lint.json` 复制到项目根目录并按需微调。当前 cliché lint 由 `scripts/lint-cliche.sh` 脚本执行（通过 `platform-profile.json.compliance.script_paths.lint_cliche` 配置），尚未作为 Agent context manifest 的内联输入注入。

### M7 Guardrails（留存 / 可读性 / 命名）

`platform-profile.json` 还包含一组可选的 Guardrails 配置（可逐项启用/关闭），并在 `novel next`/`novel commit` 阶段产出可审计报告：

- Retention：`retention.title_policy`、`retention.hook_ledger` → `logs/retention/*`
- Readability：`readability.mobile` → `logs/readability/*`
- Naming：`naming` → `logs/naming/*`

如何配置这些字段、以及如何解读上述日志，见 [Guardrails 文档](guardrails.md)。
