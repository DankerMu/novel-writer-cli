# 快速起步指南

这份指南面向第一次使用 `novel-writer-cli` 的作者：从安装、建项目、跑通黄金三章（golden chapters），到进入日常续写。

> 本文默认你走的是 Skill 入口（`/novel:start`、`/novel:continue`、`/novel:status`）。如果你更喜欢手动调用 CLI，可配合阅读 [`docs/user/novel-cli.md`](novel-cli.md)。如果你是老项目升级到 M8，请看 [`docs/user/migration-guide.md`](migration-guide.md)。

## 目录

- [安装与前置条件](#安装与前置条件)
- [创建项目](#创建项目)
- [选择风格来源](#选择风格来源)
- [跑通黄金三章](#跑通黄金三章)
- [进入正式卷规划](#进入正式卷规划)
- [日常写作工作流](#日常写作工作流)
- [质量评审与门控决策](#质量评审与门控决策)
- [常见问题](#常见问题)

## 安装与前置条件

先把运行环境准备好，后面流程才能顺滑推进。

1. **安装 Node.js**：本 CLI 要求 `Node.js >= 18`。
   ```bash
   node -v
   ```
2. **准备执行器环境**：
   - 如果你使用 `/novel:*` Skill 入口，需准备好 Claude Code，并确保当前环境能访问 Claude API。
   - 如果你是在 Codex 或其他执行器里装载本仓库的 Skills，核心前提仍是底层能调用 `novel` CLI；具体入口名以执行器环境为准。
   - 如果你只使用 `novel` CLI 做确定性编排，则 CLI 本身**不会直接调用 LLM API**。
3. **安装 CLI**：
   ```bash
   npm i -g novel-writer-cli
   ```
4. **验证安装**：当前 CLI 还没有 `--version` 命令，建议用帮助命令验证。
   ```bash
   novel --help
   ```
   或一次性运行：
   ```bash
   npx novel-writer-cli --help
   ```
5. **准备项目目录**：新建一个空目录作为小说项目根目录，避免把模板文件写进现有仓库或杂乱目录。

## 创建项目

目标是把项目骨架、平台绑定和题材入口一次性定好。

### 推荐方式：使用 `/novel:start`

在空目录中执行：

```bash
/novel:start
```

首次启动时，适配层会先调用 `novel init` 建立项目边界，然后进入 Quick Start（快速起步）流程。你通常会依次确认这些信息：

1. **平台**：`qidian` / `fanqie` / `jinjiang`
   - `tomato` 仍然是兼容别名（alias），老项目或手动输入时仍可用。
   - 但新流程的可见选项只展示 `fanqie（番茄）`，不再展示 `tomato`。
   - 可用下面这张表快速判断：

| 平台 | 适合优先强调什么 |
|------|------------------|
| `qidian` | 世界差异点、系统/规则、沉浸感、长期主线承诺 |
| `fanqie` | 快冲突、快反馈、章末钩子、可复述的爽点 |
| `jinjiang` | 人物关系张力、情绪基调、CP 存在感、角色个性落地 |

2. **题材**：如玄幻、都市、科幻、历史、悬疑、言情。
   - 这里的选择会影响 `genre-excitement-map.json` 与 `genre-golden-standards.json` 的命中结果。
   - 后续填写 `brief.md` 时，`- **题材**：` 最好保持一致，否则题材映射可能不稳定。
3. **创作纲领（brief）**：至少把书名、核心冲突、主角概念、目标平台、目标读者写清楚。
4. **平台绑定提醒**：`platform-profile.json.platform` 与 `platform-profile.json.scoring.genre_drive_type` 一旦写入，就视为项目的**不可变绑定**。如果你想从起点切到晋江，最稳妥的方式是新建项目目录重新初始化。

### 备选方式：直接使用 CLI

如果你想手动控制初始化，可以执行：

```bash
mkdir my-novel && cd my-novel
novel init --platform fanqie
```

初始化后，项目根目录通常会看到这些关键文件：

| 文件 | 作用 |
|------|------|
| `.checkpoint.json` | 记录当前工作流状态与断点恢复信息 |
| `brief.md` | 创作纲领，题材 / 平台 / 核心冲突 / 风格来源都写在这里 |
| `style-profile.json` | 风格指纹，由 StyleAnalyzer 提取，后续写作与润色都会读它 |
| `genre-excitement-map.json` | 题材 → 黄金三章 `excitement_type` 默认分配规则 |
| `genre-golden-standards.json` | 题材特定黄金三章评审标准 |
| `ai-blacklist.json` | AI 痕迹规避词库 |
| `web-novel-cliche-lint.json` | 可选的套路词 / 模板腔 lint 词库 |
| `platform-profile.json` | 平台画像，只有你指定 `--platform` 或在启动时确认平台后才会生成 |
| `genre-weight-profiles.json` | 动态评分权重配置，平台/题材感知评分会用到 |
| `golden-chapter-gates.json` | 平台特定的黄金三章硬门控 |
| `platform-writing-guide.md` | 平台写作指南，会透传给写作 Agent |

## 选择风格来源

这一段决定系统“往哪种文风靠”。最好把方向在开局就定清楚。

Quick Start 支持 4 种风格来源：

| 方式 | 适用场景 | `style-profile.json.source_type` |
|------|----------|--------------------------------|
| 提供原创样本 | 你已经写过 1–3 章，想保留自己的笔感 | `original` |
| 指定参考作者 | 你想靠近某位作者的节奏、措辞或叙事气质 | `reference` |
| 使用预置模板 | 你还没有样本，只想先快速开工 | `template` |
| 先写后提 | 先让系统试写，再从试写结果回提风格 | `write_then_extract` |

### 什么时候选哪一种？

- **最推荐：原创样本**。这是风格最稳的来源，尤其适合已经写过开头或有旧稿的作者。
- **参考作者** 适合做“方向锚定”，不适合指望 1:1 模仿。系统会提取风格特征，而不是复制表层句子。
- **预置模板** 适合快速起盘，但后续通常还要再补样本，才能把“像你写的”这件事做实。
- **先写后提** 适合完全空白时的最低阻力开局，但你最好在黄金三章之后尽快回头校准。

### `style-profile.json` 里有什么？

`StyleAnalyzer` 会把样本整理成可复用的风格指纹，常见字段包括：

- `source_type`：风格来源类型。
- `reference_author`：如果你走的是参考作者模式，这里会记录作者名。
- `style_exemplars`：3–5 段代表性原文片段，供写作与润色阶段对齐质感。
- `writing_directives`：正向写作指令，告诉 ChapterWriter “该怎么写”和“不要怎么写”。
- `avg_sentence_length`、`sentence_length_std_dev`、`paragraph_length_cv`：句长和段落节奏特征。
- `dialogue_ratio`、`description_ratio`、`action_ratio`：对话 / 描写 / 动作配比。
- `emotional_volatility`、`register_mixing`、`vocabulary_richness`：情绪波动、语域混合、词汇丰富度。
- `preferred_expressions`、`forbidden_words`：偏好表达与明确避用词。

如果你后续觉得文风“不像自己”，优先检查这三件事：

1. 样本是否足够代表你的目标风格；
2. `style_exemplars` 是否抓到了真正关键的段落；
3. `writing_directives` 是否写得具体，而不是只有“文风自然一点”这种空话。

## 跑通黄金三章

M8 之后，Quick Start 的固定顺序是：`world → characters → style → f0 → trial → results`。

### Step F0 是什么？

Step F0（迷你卷规划，mini volume planning）是黄金三章之前新增的一步。它会先把第 1 卷前 3 章的规划种子做好，再进入试写。

执行 `quickstart:f0` 时，系统会把这些产物先写到 `staging/volumes/vol-01/`，验证通过后再提交到 `volumes/vol-01/`：

- `outline.md`：第 1–3 章的简版卷大纲
- `chapter-contracts/chapter-001.json` ~ `chapter-003.json`：黄金三章的 L3 章节契约
- `storyline-schedule.json`：故事线调度
- `foreshadowing.json`：伏笔计划
- `new-characters.json`：新角色声明（如有）

这一步的意义是：你不再是“先裸写三章，再回头补规划”，而是先拿到一版最小可用的卷规划，再让 ChapterWriter 按契约写。这样黄金三章的质量、节奏和后续可扩展性都会更稳。

### Step F（试写）会做什么？

当 F0 的规划种子通过校验并提交后，Quick Start 会进入 `quickstart:trial`。当前实现会先产出 **1 个试写章**（写入 `staging/quickstart/trial-chapter.md`），并优先读取 `volumes/vol-01/chapter-contracts/chapter-001.json`、卷大纲与伏笔计划来验证开局手感。

试写阶段走的仍然是完整章节流水线：

```text
ChapterWriter → Summarizer → StyleRefiner → QualityJudge
```

随后 `quickstart:results` 会评估这份试写章，并结合 Ch1–3 的迷你规划种子给出“进入正式卷规划 / 调整风格 / 重新试写”等决策入口。也就是说，F0 负责把黄金三章“先规划清楚”，Step F 先用代表性的试写章验证你是否适合继续推进。

### `excitement_type` 在黄金三章里怎么用？

兴奋点类型（`excitement_type`）会写进 L3 章节契约，常见值有：`reversal`、`face_slap`、`power_up`、`reveal`、`cliffhanger`、`setup`、`null`。

- Step F0 / 卷规划时，PlotArchitect 会优先参考 `genre-excitement-map.json` 给前三章分配默认爽点类型。
- 例如：玄幻通常是 `setup → power_up → face_slap`，悬疑更常见 `reveal → setup → cliffhanger`。
- QualityJudge 在评节奏（pacing）时，会根据 `excitement_type` 切换评审口径：
  - `setup` 看“铺垫是否有效”；
  - 其他类型看“爽点是否落地（hit / partial / miss）”；
  - `null` 则按普通节奏标准评估，不做额外爽点落地检查。

### 平台特定的黄金三章门控

黄金三章（golden chapters）不是只有综合分数，还会叠加平台门控和题材门控。

| 平台 | 你需要重点注意什么 |
|------|------------------|
| `fanqie` | 第 1 章要求主角尽量在前 200 字内出现；前三章都要有明确冲突和章末钩子；核心爽点通常应落在 `reversal / face_slap / power_up` 之一 |
| `qidian` | 可以稍慢，但必须持续建立世界差异点 / 系统线索；前三章 `immersion` 通常至少要达到 `3.5` |
| `jinjiang` | 角色个性必须通过动作、对白、反应体现；CP 或核心关系对象要尽早建立存在感；情感基调要站住，`style_naturalness` 通常至少要达到 `3.5` |

除此之外，题材特定标准（genre-specific standards）还会从 `genre-golden-standards.json` 叠加一层要求：

- 玄幻更看重世界 / 力量体系存在感与沉浸感；
- 悬疑更看重核心疑问与逻辑自洽；
- 言情更看重人物关系张力、情绪钩子和 `style_naturalness`；
- 如果你的 `brief.md` 题材为空，或项目里缺少题材模板文件，就会退回通用标准，不会报错。

### 如果黄金三章没过怎么办？

先不要慌，系统设计的就是“早暴露、早修正”。

- **只要黄金门控没过**，即使综合分不低，也可能被强制判为 `revise`。
- **如果 Step F0 或试写中断**，重新运行 `/novel:start` 即可续跑，系统会按 `quickstart_phase` 从 `style`、`f0`、`trial` 或 `results` 恢复。
- **如果平台 × 题材组合有风险**（例如题材与平台偏好不匹配），初始化阶段会给出 warning，但不会阻止你继续。此时更需要你在黄金三章里主动补强对应卖点。

## 进入正式卷规划

黄金三章过关后，你就从“试写阶段”进入“可持续生产阶段”。

通常在 `quickstart:results` 后，系统会建议你进入卷规划。此时再运行 `/novel:start`，会进入 `VOL_PLANNING` 分支，由 PlotArchitect 补齐正式卷规划。

### 正式卷规划会产出什么？

- `volumes/vol-01/outline.md`：本卷完整大纲
- `volumes/vol-01/chapter-contracts/*.json`：从第 4 章开始继续补齐的 L3 契约
- `volumes/vol-01/storyline-schedule.json`：多线叙事排期
- `volumes/vol-01/foreshadowing.json`：本卷伏笔台账
- `volumes/vol-01/new-characters.json`：本卷新增角色声明

如果黄金三章的 F0 种子已经存在，正式卷规划会**在原有 Ch1–3 规划基础上增量扩展**，不会覆盖掉已有契约。

### 怎么管理 `storyline-schedule.json`？

如果你写的是多线叙事，`storyline-schedule.json` 不只是“一个会生成的文件”，它决定了主线 / 副线 / 调味线在本卷的出场节奏。实操上可以这样理解：

- 把它当成“每章该推进哪条线、哪条线先压后放”的排期表；
- 当某条线连续多章不出现时，用 `/novel:status` 看休眠提醒，避免支线蒸发；
- 如果你在卷中途调整重心，优先通过重新规划或设定更新来改排期，而不是手写正文时临场硬拐。

### `canon_status` 应该怎么理解？

正典状态（`canon_status`）用于告诉系统：哪些规则 / 角色“现在就生效”，哪些只是“先露头，后面再正式落地”。

- `established`：已生效；会被当成硬约束参与上下文组装与评审。
- `planned`：已被看见，但暂不强制；适合未来会兑现的设定、伏笔角色、延后上线的规则。
- `deprecated`：已废弃；不会继续进入写作与评审上下文。
- **缺失字段**：默认按 `established` 处理，这是老项目向后兼容的关键。

实际使用建议：

- 如果你已经决定某条世界规则从现在开始必须遵守，就标 `established`。
- 如果某个新角色只是准备在第 20 章登场，现在先给前几章做铺垫，就标 `planned`。
- 如果旧设定已弃用，但你又不想直接删除历史记录，可以标 `deprecated`。

## 日常写作工作流

当卷规划准备好后，你的日常动作会非常固定：续写、查看状态、必要时回顾和更新设定。

### 续写下一章

```bash
/novel:continue
```

底层章节流水线是：

```text
ChapterWriter → Summarizer → StyleRefiner → QualityJudge
```

每章至少会留下这些正式产物：

- `chapters/chapter-XXX.md`：章节正文
- `summaries/chapter-XXX.md`：章节摘要
- `evaluations/chapter-XXX-eval.json`：质量评估
- `state/current-state.json`：世界状态快照（提交后更新）

如果你想一次推进多章：

```bash
/novel:continue 3
```

建议单次不要太多，通常 `1–5` 章最容易控制质量和成本。

### 查看项目状态

```bash
/novel:status
```

你会看到的典型信息包括：

- 当前写到哪一卷、哪一章
- 最近章节评分趋势
- 伏笔推进情况
- 故事线节奏 / 休眠提醒
- 成本与执行摘要

### 什么时候重新回到 `/novel:start`？

`/novel:start` 不只用于开新项目，它还是很多“非写正文”动作的入口：

- 规划下一卷
- 做卷末回顾
- 查看质量回顾
- 更新世界观 / 角色设定
- 导入研究资料

如果你写到中途断掉，也优先重新运行 `/novel:start`。这个入口是幂等的，适合恢复现场。

## 质量评审与门控决策

你最终要学会读的，不只是“这章总分多少”，而是“系统为什么这么判”。

### 先看两层门控

QualityJudge 采用双轨验收：

1. **硬约束检查**：L1 / L2 / L3 / LS 合规校验；如果有 high-confidence violation，会直接触发强制修订。
2. **质量评分**：按 8 个维度做加权综合分。

### 8 维度默认权重（legacy fallback）

> 实际权重优先读取 `platform-profile.json.scoring` + `genre-weight-profiles.json` 计算得到的动态权重；下表只是缺省回退值。

| 维度 | 默认权重 |
|------|----------|
| 情节逻辑（plot_logic） | 18% |
| 角色塑造（character） | 18% |
| 沉浸感（immersion） | 15% |
| 风格自然度（style_naturalness） | 15% |
| 伏笔处理（foreshadowing） | 10% |
| 节奏（pacing） | 8% |
| 情感冲击（emotional_impact） | 8% |
| 故事线连贯（storyline_coherence） | 8% |

如果平台画像启用了 `hook_policy.required=true`，还会额外启用章末钩子强度（`hook_strength`）维度，但它是否计入总分，要看动态权重配置。

### 分数对应什么动作？

| 结果 | 说明 |
|------|------|
| `>= 4.0` | 直接通过 |
| `3.5 - 3.9` | 先走一次 StyleRefiner 二次润色 |
| `3.0 - 3.4` | 自动修订（revision） |
| `2.0 - 2.9` | 暂停给你人工判断重写范围 |
| `< 2.0` | 强制全章重写 |
| 任意分数 + high-confidence violation | 强制修订，分数不豁免 |

### 怎么读低分原因？

可以用“维度 → 处理动作”的方式看：

- **情节逻辑 / 伏笔处理低**：回头看 `outline.md`、L3 契约和 `foreshadowing.json` 是否已经给出足够明确的推进线索。
- **角色塑造 / 情感冲击低**：补人物反应、内心活动和关系张力，不要只堆动作和信息。
- **沉浸感 / 风格自然度低**：检查 `style-profile.json` 是否真的代表你的目标文风，必要时更新样本或收紧 `writing_directives`。
- **节奏低**：先看当前章的 `excitement_type` 是否和正文落点一致，再看是否缺冲突、缺回报或铺垫太空。

### `excitement_type` 对评审的实际影响

这是 M8 后最值得理解的新点之一：

- `setup`：系统会更看“有没有把后续期待和因果链搭起来”，而不是强求本章爆点。
- `reversal` / `face_slap` / `power_up` / `reveal` / `cliffhanger`：系统会看这类爽点是否真正落地，落地结果通常表现为 `hit / partial / miss`。
- `null`：说明这章没有明确爽点类型标注，QualityJudge 会按常规节奏标准判断。

换句话说，`excitement_type` 不是给作者“背模板”，而是让系统知道“这章想达成什么读者体验”，从而减少误判。

## 常见问题

**Q1：黄金三章或日常章节评分很低，第一步该做什么？**
A：先不要立刻大修正文，先看 `evaluations/*-eval.json` 里是哪个维度拖分。如果低分集中在 `style_naturalness` 或 `immersion`，优先补风格样本；如果低在 `plot_logic`、`foreshadowing`，优先回看卷大纲和 L3 契约。

**Q2：我能跳过黄金三章，直接进入正式写作吗？**
A：不建议。M8 的 Step F0 + Step F 就是为了让你在最早阶段验证平台门控、题材门控、风格与节奏是否匹配；跳过它，后面返工成本通常更高。

**Q3：项目写到一半，能把平台从番茄切到晋江吗？**
A：不建议在同一项目里硬切。因为 `platform-profile.json.platform` 和 `scoring.genre_drive_type` 是不可变绑定；想换平台，最稳的做法是新建项目目录重新初始化，再把可复用素材迁过去。

**Q4：我可以手动调 `style-profile.json` 吗？**
A：可以，而且很多时候值得这么做。优先改 `style_exemplars`、`writing_directives`、`preferred_expressions` 这类高杠杆字段；统计字段如果你没有明确依据，不要为了“看起来专业”乱填。

**Q5：`canon_status` 里的 `planned` 和 `deprecated` 什么时候用？**
A：`planned` 适合未来才会正式生效的规则或角色，用来给伏笔和铺垫留位置；`deprecated` 适合保留历史记录但不再参与当前创作。老文件没有这个字段时，会自动按 `established` 处理。

**Q6：`excitement_type` 需要我每章手填吗？**
A：通常不需要。系统会在 Step F0 或正式卷规划时自动生成；你只有在手动维护 L3 契约，或者觉得当前章目标体验与规划不一致时，才需要手动调整。
