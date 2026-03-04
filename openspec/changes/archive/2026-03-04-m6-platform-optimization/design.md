## Context

当前写作流水线在“通用质量控制”上已形成较完整的框架（8 维度评分、去 AI 化、跨线防串线、NER 与一致性报告、伏笔与故事线分析），但这些机制主要面向“写得像网文但不烂”，缺少对**平台侧商业规则**（章末留存、字数区间、信息负载、合规）与**题材驱动差异**（爽点/悬念/日常流的权重不同）的系统性适配。

本 change 以“可配置的 platform_profile + drive_type 权重”为核心，目标是让同一套流水线在起点/番茄上都能落到可执行的约束与质量门控，同时保持：
- 可落盘、可审计、可恢复（对齐 `.checkpoint.json` / logs / evaluations）
- 尽量确定性（脚本优先，LLM 兜底）
- 全自动但可随时打断调整（交互 gate 与配置覆盖）

## Goals / Non-Goals

**Goals:**
- 引入 `platform-profile.json`（qidian/tomato）作为项目级单一事实来源：字数区间、钩子策略、信息负载阈值、合规规则、权重选择。
- 章末钩子机制：强制存在 + 强度评分 + 失败时 `hook-fix` 微修复（只改尾段）并有上限。
- 新增 `web-novel-cliche-lint`：与 `ai-blacklist` 分离，支持分级 severity 与豁免，避免误杀。
- 合规检测前置：违禁词/重名/繁简混用/字数硬限等在 QualityJudge 前跑一遍，并可选择阻断提交。
- 题材差异化评分：引入 `genre_drive_type` 与 `genre-weight-profiles`，评分权重不再固定；评估输出显式记录使用的权重与 profile。
- 滑动窗口一致性检查：stride=5、window=10（+卷末全卷审计），输出 `logs/continuity/latest.json` 并注入 QualityJudge；额外提供“逻辑漂移”提示但默认不硬阻断。
- 伏笔可见性维护：计算 dormancy（沉默章数），生成 `logs/foreshadowing` 可读报告，并向规划/写作注入“轻触提醒”任务（非剧透）。

**Non-Goals:**
- 不承诺“上榜/爆款/推荐权重提升”的结果；本系统只提供可执行的工程化约束与质量回路。
- 不尝试逆向平台算法细节（仅提供可配置的经验参数与可验证指标）。
- 不做自动发布/双投/平台 API 对接。
- 不强依赖外部模型或第三方 NER；缺失时必须可降级，不阻断主流程。
- 不允许“一本书中途改平台”（平台绑定初始化后不可变）。

## Decisions

1) **平台绑定与配置载体：`platform-profile.json`（不可变平台字段）**
   - 选用 JSON（与现有 `style-profile.json` / `ai-blacklist.json` 风格一致）。
   - `platform` 字段不可变；阈值允许用户在 init 阶段确认并落盘（可覆盖默认值）。

2) **把“钩子”做成显式维度，而不是散落在提示词里**
   - 在质量评估中新增 `hook_strength` 维度（只在 hook_policy 开启时出现/生效）。
   - 失败处理策略选 `hook-fix` 微步骤：只改最后 1–2 段，成本低、可控、易 review，避免整章重写导致新问题。

3) **`web-novel-cliche-lint` 与 `ai-blacklist` 分离**
   - `ai-blacklist` 继续作为“AI-ness”强信号（高置信、可硬门控的来源之一）。
   - `web-novel-cliche-lint` 是“平台/套路腔”信号，必须支持 `warn/soft/hard` 分级 + whitelist/exemptions，避免误报导致用户疲劳。

4) **合规检测作为 QualityJudge 前置的“确定性优先”层**
   - 优先脚本/规则引擎输出结构化报告；失败不得阻断（回退到轻量检查或仅提示）。
   - 高置信合规 violation 可直接触发 hard gate（与现有“high-confidence violation 强制修订”机制对齐）。

5) **动态权重：drive_type → weight_profile →（可选 overrides）**
   - `genre_drive_type` 作为用户可理解的控制面（plot/character/suspense/slice_of_life）。
   - `genre-weight-profiles.json` 定义默认 profile；`platform-profile.json` 选择 profile_id 并允许小范围 overrides。
   - 每章 evaluation 输出必须记录“最终权重”，保证可审计与可回归。

6) **一致性审计输出复用 `logs/continuity` 通道**
   - 兼容 `skills/continue/references/continuity-checks.md` 的最小 schema 与 issue id 稳定性要求。
   - “逻辑漂移”作为低严重度提示，不改变 LS-001 hard 的语义与触发条件。

7) **init 交互 gate 复用 `NOVEL_ASK` 思路（跨执行器一致）**
   - Claude Code 优先用 `AskUserQuestion`；Codex 优先在 Plan Mode 用 `request_user_input`，非 Plan 降级为强约束文本回答。
   - 本 change 不实现交互适配器本体，但把平台/驱动类型/阈值确认定义为必须的 gate（依赖 `m6-interactive-question-adapters` 的协议化方向）。

## Risks / Trade-offs

- [Risk] 过度门控导致写作节奏被打断 → Mitigation：把多数信号做成 warn/soft；硬门控仅限 high-confidence violation；允许在 profile 中关闭部分检查。
- [Risk] 套路腔/合规检测误报 → Mitigation：分级 severity + whitelist/exemptions；输出 evidence；默认不自动写入硬黑名单。
- [Risk] 增加 agent 调用成本（多一次审计/多一次修复） → Mitigation：审计 cadence 固定（5/10/卷末）；`hook-fix` 限制改动范围与次数；关键路径脚本优先。
- [Risk] 配置复杂度上升 → Mitigation：内置 qidian/tomato 默认 profile；init 只暴露少量关键阈值，其他保持默认。
- [Risk] Codex/Claude 交互能力差异导致 UX 不一致 → Mitigation：将交互协议化（NOVEL_ASK），由 adapter 编译；降级路径明确且不阻塞。

## Migration Plan

1) 对已有项目：
   - 新增生成 `platform-profile.json`（一次性选择平台并锁定）。
   - 更新 `brief.md` 补齐 `platform`/`genre_drive_type`/约束摘要（init gate 让用户确认）。
2) 对后续章节：
   - 先以 warn/soft 方式上线大部分新检查（尤其是套路腔与信息负载）。
   - 钩子与合规可按 profile 逐步从 warn 提升到 hard gate。
3) 回滚策略：
   - 通过 profile 关闭新检查（而不是修改历史章节）。
   - 平台绑定不可回滚（除非用户新建项目/清空初始化文件）。

## Open Questions

- qidian/tomato 的默认字数区间与钩子强度阈值：是否由用户在 init 中强制确认，还是给出默认值并允许后续微调？
- “套路腔”词库的维护策略：完全手工维护 vs 半自动候选（不直接进入硬黑名单）？
- “逻辑漂移”提示的最小可回归实现：是基于 summary 对比/契约偏离，还是引入更显式的 goal-tracking？

## References

- `openspec/changes/m6-platform-optimization/proposal.md`
- `skills/continue/references/continuity-checks.md`
- `docs/dr-workflow/novel-writer-tool/final/prd/09-data.md`
- `skills/novel-writing/references/quality-rubric.md`
