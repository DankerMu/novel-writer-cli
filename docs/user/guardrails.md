# Guardrails（留存 / 可读性 / 命名）

本项目的 Guardrails 是一组**确定性**检查：由 `platform-profile.json` 驱动，在 `novel next` 的关键节点生成可审计的 JSON 报告。当出现配置为 blocking 的问题时，`novel next` 会返回人工介入步骤（如 `...:review` / `...:title-fix`），阻止流水线推进到下一阶段。

> **注意**：Guardrails 的判定发生在 CLI 层（`novel next`/`novel commit`）。当返回 `...:title-fix` / `...:review` 等步骤时，需要执行器按 instruction packet 约定运行对应 subagent，并在 `novel validate`/`novel advance` 后继续流水线。

## 配置入口：`platform-profile.json`

Guardrails 的配置都在项目根目录的 `platform-profile.json`：

- **Retention（留存）**：`retention.title_policy`、`retention.hook_ledger`
- **Readability（移动端可读性）**：`readability.mobile`
- **Naming（命名冲突）**：`naming`

参考配置（字段说明见下）：

```json
{
  "retention": {
    "title_policy": {
      "enabled": true,
      "min_chars": 2,
      "max_chars": 30,
      "forbidden_patterns": ["^\\s*$", "^(?:无题|未命名|待定)$"],
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
    "exemptions": {}
  }
}
```

> 上述示例仅展示 guardrails 相关字段。实际 `platform-profile.json` 还包含 `compliance`（含 `banned_words` 等 schema 必填字段）、`scoring` 等其他顶级段落，详见 [规范体系 — 平台画像](spec-system.md#平台画像与不可变绑定)。
>
> Readability lint 脚本路径可通过 `compliance.script_paths.lint_readability` 配置（可选），缺省使用 `scripts/lint-readability.sh`。

### 枚举值说明

**`overdue_policy`**（hook ledger 超期策略）：

| 值 | 含义 |
|------|------|
| `warn` | 仅警告，不阻断 |
| `soft` | 需修订，但可被覆盖 |
| `hard` | 阻断流水线推进 |

**`blocking_severity`**（readability 阻断级别）：

| 值 | 含义 |
|------|------|
| `hard_only` | 仅 severity=hard 的 issue 算 blocking |
| `soft_and_hard` | soft 和 hard 均算 blocking |

### 默认/降级行为

- 若 `platform-profile.json` **文件不存在**：所有 guardrails 跳过（产生 warning 提示）。
- 若 `retention`/`readability`/`naming` **字段缺失**或显式为 `null`：对应检查视为"未启用"（`status:"skipped"`）。
- 若 `*.enabled` 为 `false`：同样视为"未启用"。
- Readability lint 脚本缺失或执行失败时进入 `mode:"fallback"`，**只产生 warn 级问题**。这意味着 fallback 模式下 `blocking_severity` 设置实际无效——只有自定义 lint 脚本（`mode:"script"`）才能产出 `soft`/`hard` 级别的 issue。

> **注意**：`retention` 和 `readability` 若为非 null 对象，则其子字段（如 `title_policy` + `hook_ledger`）均为 schema required。不可只提供其中一个。

## 日志解读

> `logs/` 的完整目录清单（SSOT）见 [09-logs-index.md](../dr-workflow/novel-writer-tool/final/prd/09-logs-index.md)。

### Retention（留存）— `logs/retention/*`

Retention 主要包含两类输出：

1) **Hook ledger（章末钩子台账 + 窗口/多样性报告）**

- 台账文件：`hook-ledger.json`（项目根目录）
- 最新报告：`logs/retention/latest.json`
- 历史报告：`logs/retention/retention-report-vol-{V:02d}-ch{start:03d}-ch{end:03d}.json`

重点字段（`logs/retention/latest.json`）：

- `has_blocking_issues`：为 `true` 时阻断流水线推进（取决于 `overdue_policy` 等策略）
- `issues[]`：本窗口内的具体问题（`severity` 为 `warn|soft|hard`）
- `debt.open[] / debt.lapsed[]`：仍未兑现/已超期的承诺条目摘要
- `diversity.*`：最近窗口内 hook 类型分布（连击 streak、窗口内 distinct types 等）

2) **Title policy（章节标题策略报告）**

- 最新报告：`logs/retention/title-policy/latest.json`
- 每章历史：`logs/retention/title-policy/title-policy-chapter-{C:03d}.json`

重点字段：

- `title.has_h1`：首个非空行是否为 `# H1` 标题
- `policy`：生效的标题策略（来自 `retention.title_policy`；未启用时为 `null`）
- `status`：`pass|warn|violation|skipped`
- `has_hard_violations`：存在 hard 违规则通常会触发 `novel next` 的 `...:title-fix`/`...:review`

> **注意**：标题检查还会使用 `compliance.banned_words`（M6 基线字段）做标题禁词检测。若标题被拒但 `forbidden_patterns` 无匹配，请检查 `banned_words` 配置。

### Readability（移动端可读性 lint）— `logs/readability/*`

- 最新报告：`logs/readability/latest.json`
- 每章历史：`logs/readability/readability-report-chapter-{C:03d}.json`

重点字段：

- `mode`：`script` 或 `fallback`
- `script.rel_path` / `script_error`：脚本路径与降级原因（若脚本缺失/失败）
- `issues[]`：问题列表，fallback 模式下可检测的 issue 类型包括：
  - `overlong_paragraph`：段落超过 `max_paragraph_chars`
  - `exposition_run_too_long`：连续说明段超过阈值
  - `dialogue_dense_paragraph`：单段内对话过密
  - `mixed_quote_styles`、`mixed_ellipsis_styles`、`mixed_comma_styles`、`mixed_period_styles`、`mixed_question_mark_styles`、`mixed_exclamation_styles`：各类标点风格混用
- `has_blocking_issues`：为 `true` 时阻断流水线推进（由 `blocking_severity` 决定"soft 是否算 blocking"）

### Naming（命名冲突 lint）— `logs/naming/*`

- 最新报告：`logs/naming/latest.json`
- 每章历史：`logs/naming/naming-report-chapter-{C:03d}.json`

重点字段：

- `registry.total_characters / total_names`：当前角色档案规模（来自 `characters/active/*.json` + aliases）
- `issues[]`：冲突列表，`conflict_type` 可选值：
  - `duplicate`：重名（同名不同人）
  - `near_duplicate`：近似名（相似度 ≥ `near_duplicate_threshold`）
  - `alias_collision`：别名与他人 canonical/alias 冲突
  - `unknown_entity_confusion`：NER 检测到的未知实体与已有角色名相似（始终为 warn，依赖 NER 预计算）
- `has_blocking_issues`：为 `true` 时阻断流水线推进（由 `naming.blocking_conflict_types` 决定哪些冲突属于 hard）

## 常见修复速查

### Title policy

- 确保首个非空行为 `# 标题`（H1）
- 调整标题长度、避免命中 `forbidden_patterns`（同时注意 `compliance.banned_words` 也会影响标题检查）
- 若 `auto_fix` 设为 `true`：`novel next` 可能先返回 `chapter:NNN:title-fix`（只允许改标题行；最多一次）

### Readability

- 将超长段落拆分为更短段落（或增加对话/动作打断）
- 避免同章内混用标点风格（例如 `...` vs `……`、`,` vs `，`、`"` vs `""`）
- 若你有自定义 lint 脚本：配置 `compliance.script_paths.lint_readability` 指向它；脚本失败会自动降级到 fallback（不阻断）

### Naming

- 在 `characters/active/*.json` 里重命名冲突角色，或为角色添加/整理 `aliases`
- 使用 `naming.exemptions` 做白名单（当前仅支持 `ignore_names` 和 `allow_pairs` 两个字段，其余字段会被忽略）：

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

> `ignore_names` 中的名字会经过规范化（trim + 去空白 + toLowerCase）再匹配。`allow_pairs` 顺序无关——`["张三", "张山"]` 与 `["张山", "张三"]` 等价。
