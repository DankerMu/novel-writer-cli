## Context

CS2（m8-excitement-type-annotation）为 L3 章节契约引入了 `excitement_type` 枚举（reversal / face_slap / power_up / reveal / cliffhanger / setup / null），使爽点标注成为可追踪的结构化数据。CS3（m8-platform-expansion-and-golden-gates）为黄金三章引入了平台特定的硬门控（Track 3）。但两者都是题材无关的——玄幻和言情使用完全相同的爽点分配逻辑和评审标准。

网文市场的 6 大主流题材在前 3 章的"抓住读者"策略截然不同：
- **玄幻**：第一章需要铺设体系存在感，第二章通过升级展示体系运作，第三章打脸建立爽感循环
- **悬疑**：第一章需要一个强力揭秘钩子，第二章铺设线索网，第三章悬念拉满
- **言情**：第一章人设立住，第二章揭示人物深层矛盾（制造 CP 化学反应前提），第三章逆转读者对角色的初始印象

用统一标准评审会导致系统性误判：言情的情感铺垫章被按玄幻的冲突强度标准压低分，悬疑的揭秘章缺少逻辑严密度的专项检查。

## Goals / Non-Goals

**Goals:**
1. 为 6 大题材各定义 Ch1-3 的 excitement_type 默认分配规则，使 PlotArchitect 有题材感知的爽点节奏参考
2. 为 6 大题材定义差异化的黄金三章评审标准和最低阈值，使 QualityJudge Track 3 能做题材特定的质量门控
3. 检测无效/罕见的 genre×platform 组合并给出 WARNING，防止用户误选

**Non-Goals:**
- 不覆盖所有网文子类型（只做 6 大主流题材：玄幻/都市/科幻/历史/悬疑/言情）
- 不做题材自动识别（由用户在 init 时选择）
- 不修改 Ch4+ 的评审标准（仅影响黄金三章 Ch1-3）
- 不改变 CS3 已定义的平台特定门控（本 CS 是题材维度的叠加，非替代）

## Decisions

1. **6 题材 = 玄幻/都市/科幻/历史/悬疑/言情**
   - 覆盖国内网文市场 >90% 读者量的主流题材分类
   - 使用英文 key：xuanhuan / dushi / scifi / history / suspense / romance
   - 新增"言情"填补当前 5 题材的空白——晋江平台的核心题材

2. **Ch1-3 爽点分配用固定映射（非随机/非 LLM 推断）**
   - 每个题材有"经过市场验证的"前三章爽点节奏模式
   - xuanhuan: setup → power_up → face_slap（铺体系 → 展升级 → 打脸建循环）
   - dushi: setup → reversal → face_slap（铺设定 → 身份逆转 → 打脸立威）
   - scifi: reveal → setup → cliffhanger（揭秘设定 → 铺世界观 → 悬念拉满）
   - history: setup → reveal → reversal（铺时代背景 → 揭历史秘密 → 命运逆转）
   - suspense: reveal → setup → cliffhanger（案件揭露 → 线索铺设 → 悬念收束）
   - romance: setup → reveal → reversal（人设立住 → 揭深层矛盾 → 印象逆转）
   - PlotArchitect 可以覆盖默认分配（需记录理由），映射是建议而非硬约束

3. **minimum_thresholds 用硬数值**
   - 可客观校验，不依赖 LLM 判断
   - 各题材聚焦不同维度：玄幻→immersion≥3.5，悬疑→plot_logic≥4.0，言情→character≥4.0 + style_naturalness≥3.5
   - 阈值未达 → Track 3 gate failure → recommendation=revise

4. **invalid_combinations 用 WARNING 而非 ERROR**
   - 不阻断用户选择，但明确提示风险
   - 典型警告：言情+起点（起点以男频为主）、玄幻+晋江（晋江以女频为主）
   - 用户确认后正常继续，不影响后续流程

5. **模板缺失 = 不做题材特定评估**
   - genre-excitement-map.json 缺失 → PlotArchitect 自由分配 excitement_type
   - genre-golden-standards.json 缺失 → QualityJudge Track 3 跳过题材特定检查
   - 零迁移成本，现有项目行为完全不变

## Risks / Trade-offs

- [Low] 固定爽点分配可能不适合所有子类型（如玄幻中的"慢热流"）→ Mitigation: 这是默认建议，PlotArchitect 可覆盖并记录理由
- [Low] 最低阈值过高/过低 → Mitigation: 模板文件可用户编辑，后续可通过 calibrate-quality-judge.sh 回归测试校准
- [Low] 6 题材不够用 → Mitigation: 模板 JSON 支持扩展新 key，向后兼容；未来可通过新 changeset 添加
- [Low] genre×platform 警告可能误报 → Mitigation: WARNING 不阻断，用户可忽略

## Migration Plan

无需迁移。模板文件缺失 = 不做题材特定评估，现有行为不变。新增"言情"题材选项不影响现有项目（现有项目的 brief.genre 字段不受改变）。新项目从 init 时选择题材起自动启用。
