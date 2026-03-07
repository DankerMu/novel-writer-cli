# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

中文网文 AI 协作创作 CLI（`novel-writer-cli`）— 确定性编排 + 9 Agent 协作创作系统。卷制滚动工作流 + 去 AI 化输出。CLI 编排核心 + Spec/Agent/Skill 体系。

CLI entry: `novel` (Node.js)
Agent/Skill 定义: `agents/`, `skills/`
Plugin 版本（v1.7.0 fork）: [novel-writer-plugin](https://github.com/DankerMu/novel-writer-plugin)

## CI Commands

CI runs on PRs to `main` via `.github/workflows/docs-ci.yml`:

```bash
# Markdown lint (only docs/**)
npx markdownlint-cli2 "docs/**/*.md"

# Link check
lychee --config .lychee.toml --no-progress --exclude-path node_modules "docs/**/*.md"

# Manifest validation (Python one-liner in CI)
python3 -c "import json; m=json.load(open('docs/dr-workflow/novel-writer-tool/manifest.json')); assert all(k in m for k in ['project','current_phase','current_version','iterations'])"
```

Docs CI 本身不跑 TypeScript build/test；仓库使用 `npm`（见 `package.json`），本地常用校验命令是 `npm run build`、`npm run typecheck`、`npm test`。

## Key Architecture

### Agent System (9 agents)

| Agent | Model | Role |
|-------|-------|------|
| WorldBuilder | Opus | 世界观 + L1 规则 |
| CharacterWeaver | Opus | 角色网络 + L2 契约 |
| PlotArchitect | Opus | 卷级大纲 + L3 契约 + 故事线调度 |
| ChapterWriter | Sonnet | 章节续写 + 防串线 |
| Summarizer | Sonnet | 摘要 + 状态增量 + 串线检测 |
| StyleAnalyzer | Sonnet | 风格指纹提取 → style-profile.json |
| StyleRefiner | Opus | 去 AI 化润色 |
| QualityJudge | Sonnet | 双轨验收（合规 + 8 维度评分） |
| ConsistencyAuditor | Sonnet | 滑动窗口一致性审计（stride=5, window=10）+ 卷末全卷审计 |

Agent 定义位于 `agents/`（CLI 调度）与 `docs/dr-workflow/novel-writer-tool/final/spec/agents/`（对外 spec）中；`agents/` 目录已包含全部 9 个 Agent。

### Entry Skills (3)

- `/novel:start` — 冷启动 / Quick Start（`world → characters → style → f0 → trial → results`）+ 卷规划 / 回顾入口
- `/novel:continue` — 续写下一章 / 卷，驱动 `ChapterWriter → Summarizer → StyleRefiner → QualityJudge`
- `/novel:status` — 查看项目状态、评分趋势、故事线节奏与门控摘要

Skill 定义见 `skills/` 与 `docs/dr-workflow/novel-writer-tool/final/spec/02-skills.md`。

### Spec-Driven Writing (4 层规范)

```
L1: world/rules.json                    — 世界规则；canon_status = established/planned/deprecated
L2: characters/active/*.json           — 角色契约；canon_status 决定当前是否生效
L3: volumes/vol-XX/chapter-contracts/  — 章节契约；可含 excitement_type 爽点标注
LS: storylines/storylines.json         — 多线叙事约束
```

### Platform Support

- Canonical 平台：`qidian`、`fanqie`、`jinjiang`
- 向后兼容别名：`tomato` 仍被接受，但运行时 canonical id 视为 `fanqie`
- 平台绑定写入 `platform-profile.json`；`platform` 与 `scoring.genre_drive_type` 一旦初始化完成即视为不可变绑定

### Anti-AI Pipeline (4 层去 AI 化)

```
L1 风格锚定 → L2 约束注入 → L3 后处理 → L4 检测度量
```

黑名单模板: `templates/ai-blacklist.json` (38 个 AI 高频用语)
风格模板: `templates/style-profile-template.json`

### Quality Gating

基础质量评估仍是 8 维度评分（情节 / 角色 / 沉浸 / 风格自然度 / 伏笔 / 节奏 / 情感 / 故事线），但 M8 后**实际权重**以 `platform-profile.json.scoring` + `genre-weight-profiles.json` 计算出的 `manifest.inline.scoring_weights` 为准，平台与题材会动态影响各维度权重。

除常规评分外，还有两层 M8 门控：
- 黄金三章门控（Track 3）：chapter 1-3 叠加 `golden-chapter-gates.json` 的平台硬门
- 题材差异化标准：chapter 1-3 可叠加 `genre-golden-standards.json` 的 focus dimensions / minimum thresholds

门控结果：`>=4.0` 直接通过，`3.5-3.9` 二次润色，`3.0-3.4` 自动修订，`2.0-2.9` 通知用户人工审核，`<2.0` 强制重写；任意 high-confidence violation 都会强制修订。

详见 `skills/novel-writing/references/quality-rubric.md`。

## Directory Map

```
src/                          CLI 核心 TypeScript 实现
agents/                       9 Agent prompt 模板
skills/
  start/                      Quick Start / 卷规划 / 回顾 thin adapter
  continue/                   章节流水线 thin adapter
  status/                     只读状态查询
  novel-writing/
    SKILL.md                  核心方法论（卷制工作流、规范体系、多线、去AI、评分）
    references/
      quality-rubric.md       8 维度评分标准 + 门控阈值
      style-guide.md          去 AI 化四层策略
templates/
  brief-template.md           创作纲领模板
  ai-blacklist.json           AI 用语黑名单模板
  style-profile-template.json 风格指纹模板
  platform-profile.json       平台画像 / 动态评分输入
  genre-weight-profiles.json  平台 × 题材权重配置
  golden-chapter-gates.json   黄金三章门控
  genre-excitement-map.json   题材 → excitement_type 映射
  genre-golden-standards.json 题材黄金标准
  platforms/                  平台写作指南（fanqie.md, qidian.md, jinjiang.md）
eval/
  datasets/                   人工标注数据集（JSONL）
  schema/                     标注 schema（JSON Schema）
  fixtures/                   脚本冒烟测试 fixture
  runs/                       回归运行输出（gitignored）
  labeling-guide.md           标注指南
scripts/
  run-ner.sh                  NER 命名实体识别
  query-foreshadow.sh         伏笔查询
  calibrate-quality-judge.sh  QualityJudge 校准（Pearson + 阈值建议）
  run-regression.sh           回归运行（Spec+LS 合规率 + 汇总报告）
  compare-regression-runs.sh  回归 run 对比
docs/
  user/                       用户手册（quick-start, migration-guide, novel-cli, ops, guardrails）
  prd/01~11-*.md              PRD 11 章（产品→架构→Agent→工作流→Spec→故事线→去AI→编排→数据→协议→附录）
  spec/01~06-*.md             Tech Spec 6 章
  spec/agents/*.md            9 Agent 独立定义
  dr-workflow/                DR 报告 21 份 + manifest.json（6 个迭代 v1-v6）
openspec/
  changes/m{1-9}-*/           里程碑 Changeset（当前已实现至 M8，后续以目录为准）
  specs/                      主 Spec（待 sync / archive 补齐）
```

## OpenSpec Workflow

本项目使用 OpenSpec 变更管理。Changeset 按里程碑组织在 `openspec/changes/` 下。

常用 CLI 命令（均已注册为 Skill）：
- `/opsx:new` — 新建 Changeset
- `/opsx:continue` — 继续中断的 Changeset
- `/opsx:apply` — 从 Changeset spec 实施任务
- `/opsx:verify` — 验收实现与 spec 一致性
- `/opsx:archive` — 归档已完成 Changeset
- `/opsx:ff` — 快进生成所有 artifact
- `/opsx:explore` — 探索模式（只读）

## Conventions

- **分支命名**: `feat/issue-<N>-short-description`（当前仓库工作流以此格式为主）
- **Commit 格式**: `feat:`, `fix:`, `docs:` 前缀 + refs #N
- **Storyline ID**: 连字符 (`main-arc`, `jiangwang-dao`)，type 枚举用下划线 + `type:` 前缀
- **路径零填充**: `chapter-{C:03d}`, `vol-{V:02d}`
- **Markdown lint**: `.markdownlint.json` 禁用了多数严格规则（line-length, duplicate-heading 等），允许内联 HTML
- **Link check**: `.lychee.toml` 排除 reddit/medium/arxiv.org（403 屏蔽）

## Current Milestone

M8 平台 / 题材 / 文档增强 — canon_status 生命周期、excitement_type、平台扩展、黄金三章门控、题材映射、用户 / 项目文档同步。

已完成里程碑：M1 续写引擎 / M2 Context 与状态机 / M3 质量门控与分析 / M4 端到端打磨 / M5 CLI 编排核心 / M6 平台优化与动态评分 / M7 留存与可读性 Guardrails / M8 平台-题材-文档增强
