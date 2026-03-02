# Guardrails（留存 / 可读性 / 命名）

本项目的 Guardrails 是一组**确定性**检查：由 `platform-profile.json` 驱动，在关键节点生成可审计的 JSON 报告；当出现配置为 “blocking” 的问题时，会阻断 `novel commit` 或让 `novel next` 返回人工介入步骤（如 `...:review` / `...:title-fix`）。

## 1) 配置入口：`platform-profile.json`

Guardrails 的配置都在项目根目录的 `platform-profile.json`：

- **Retention（留存）**：`retention.title_policy`、`retention.hook_ledger`
- **Readability（移动端可读性）**：`readability.mobile`
- **Naming（命名冲突）**：`naming`

最小示例（字段说明见下）：

```json
{
  "retention": {
    "title_policy": {
      "enabled": true,
      "min_chars": 2,
      "max_chars": 30,
      "forbidden_patterns": ["^\\s*$", "^(?:无题|未命名|待定)$"],
      "required_patterns": [],
      "auto_fix": false
    },
    "hook_ledger": {
      "enabled": true,
      "fulfillment_window_chapters": 12,
      "diversity_window_chapters": 5,
      "max_same_type_streak": 2,
      "min_distinct_types_in_window": 2,
      "overdue_policy": "warn"
    }
  },
  "readability": {
    "mobile": {
      "enabled": true,
      "max_paragraph_chars": 320,
      "max_consecutive_exposition_paragraphs": 3,
      "blocking_severity": "hard_only"
    }
  },
  "naming": {
    "enabled": true,
    "near_duplicate_threshold": 0.88,
    "blocking_conflict_types": ["duplicate"],
    "exemptions": {
      "ignore_names": [],
      "allow_pairs": []
    }
  },
  "compliance": {
    "script_paths": {
      "lint_readability": "scripts/lint-readability.sh"
    }
  }
}
```

### 默认/降级行为（重要）

- 若 `retention/readability/naming` **字段缺失**或显式为 `null`：对应检查会视为“未启用”（报告通常为 `status:"skipped"`，或该类日志不会新增）。
- 若 `*.enabled=false`：同样视为“未启用”。
- Readability lint 优先使用脚本：`compliance.script_paths.lint_readability`（可选），缺省为 `scripts/lint-readability.sh`；脚本缺失/执行失败时会进入 `mode:"fallback"`，并且**只产生 warn 级问题（不阻断）**。

## 2) 如何读日志：`logs/retention/*`、`logs/readability/*`、`logs/naming/*`

> `logs/` 的完整目录清单（SSOT）见：`docs/dr-workflow/novel-writer-tool/final/prd/09-logs-index.md`。

### A) Retention（留存）— `logs/retention/*`

Retention 主要包含两类输出：

1) **Hook ledger（章末钩子台账 + 窗口/多样性报告）**

- 台账文件：`hook-ledger.json`（项目根目录）
- 最新报告：`logs/retention/latest.json`
- 历史报告：`logs/retention/retention-report-vol-{V}-ch{start}-ch{end}.json`

重点字段（`logs/retention/latest.json`）：

- `has_blocking_issues`：为 `true` 时会阻断 `novel commit`（取决于 `retention.hook_ledger.overdue_policy` 等策略）
- `issues[]`：本窗口内的具体问题（`severity` 为 `warn|soft|hard`）
- `debt.open[] / debt.lapsed[]`：仍未兑现/已超期的承诺条目摘要（用于快速定位需要“回收/兑现”的内容）
- `diversity.*`：最近窗口内 hook 类型分布（连击 streak、窗口内 distinct types 等）

2) **Title policy（章节标题策略报告）**

- 最新报告：`logs/retention/title-policy/latest.json`
- 每章历史：`logs/retention/title-policy/title-policy-chapter-{C}.json`

重点字段：

- `title.has_h1`：首个非空行是否为 `# H1` 标题
- `policy`：生效的标题策略（来自 `retention.title_policy`；未启用时为 `null`）
- `status`：`pass|warn|violation|skipped`
- `has_hard_violations`：存在 hard 违规则通常会触发 `novel next` 的 `...:title-fix`/`...:review`

### B) Readability（移动端可读性 lint）— `logs/readability/*`

- 最新报告：`logs/readability/latest.json`
- 每章历史：`logs/readability/readability-report-chapter-{C}.json`

重点字段：

- `mode`：`script` 或 `fallback`
- `script.rel_path` / `script_error`：脚本路径与降级原因（若脚本缺失/失败）
- `issues[]`：问题列表（过长段落、连续说明段、标点风格混用等）
- `has_blocking_issues`：为 `true` 时会阻断 `novel commit`（由 `readability.mobile.blocking_severity` 决定“soft 是否算 blocking”）

### C) Naming（命名冲突 lint）— `logs/naming/*`

- 最新报告：`logs/naming/latest.json`
- 每章历史：`logs/naming/naming-report-chapter-{C}.json`

重点字段：

- `registry.total_characters / total_names`：当前角色档案规模（来自 `characters/active/*.json` + aliases）
- `issues[]`：冲突列表，常见 `conflict_type`：
  - `duplicate`：重名（同名不同人）
  - `near_duplicate`：近似名（相似度 ≥ `near_duplicate_threshold`）
  - `alias_collision`：别名与他人 canonical/alias 冲突
- `has_blocking_issues`：为 `true` 时会阻断 `novel commit`（由 `naming.blocking_conflict_types` 决定哪些冲突属于 hard）

## 3) 常见修复方式（速查）

### Title policy

- 确保首个非空行为 `# 标题`（H1）
- 调整标题长度、避免命中 `forbidden_patterns`，必要时添加 `required_patterns`
- 若启用 `auto_fix=true`：`novel next` 可能先返回 `chapter:NNN:title-fix`（只允许改标题行；最多一次）

### Readability

- 将超长段落拆分为更短段落（或增加对话/动作打断）
- 避免同章内混用标点风格（例如 `...` vs `……`、英文逗号 vs 中文逗号）
- 若你有自定义 lint 脚本：配置 `compliance.script_paths.lint_readability` 指向它；脚本失败会自动降级到 fallback（不阻断）

### Naming

- 在 `characters/active/*.json` 里重命名冲突角色，或为角色添加/整理 `aliases`
- 使用 `naming.exemptions` 做白名单：

```json
{
  "naming": {
    "exemptions": {
      "ignore_names": ["老王"],
      "allow_pairs": [["张三", "张山"]]
    }
  }
}
```
