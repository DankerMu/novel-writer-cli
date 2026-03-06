## Why

CS2 引入了 `excitement_type` 爽点标注，CS3 引入了黄金三章硬门控，但两者都缺少**题材差异化**：不同题材（玄幻 vs 悬疑 vs 言情）的黄金三章应该有不同的爽点分配和不同的质量门控标准。玄幻前三章需要体系存在感和沉浸感，悬疑需要悬念钩子和逻辑严密度，言情需要 CP 化学反应和角色立体度。用统一标准评审不同题材会导致误判——铺垫型言情被按玄幻的冲突标准压低分。

## What Changes

新增 2 个模板文件：(1) `genre-excitement-map.json` 定义 6 大题材各自 Ch1-3 的 `excitement_type` 分配规则；(2) `genre-golden-standards.json` 定义 6 题材差异化评审标准（聚焦维度 + 评审准则 + 最低阈值）+ Genre×Platform 无效组合警告。QualityJudge Track 3 扩展为题材感知。PlotArchitect 规划 Ch1-3 时参考题材爽点映射。Start skill 新增"言情"题材选项 + genre×platform 兼容性检查。

## Capabilities

### New Capabilities

- `genre-excitement-map`: 6 大题材 Ch1-3 爽点类型分配映射模板
- `genre-golden-standards`: 6 大题材差异化黄金三章评审标准 + Genre×Platform 无效组合警告表

### Modified Capabilities

- `quality-judge-track-3`: Track 3 扩展为题材感知 — 当 chapter≤3 且 genre_golden_standards 存在时，检查题材特定 minimum_thresholds + criteria；阈值未达 → gate failure
- `plot-architect-planning`: 规划 Ch1-3 时参考 genre_excitement_map 分配 excitement_type
- `instruction-runtime-genre-manifest`: `src/instructions.ts` 在 opening chapters 为 `volume:outline` / `chapter:*:judge` / `quickstart:results` 按 `brief.md` 题材注入题材特定 inline manifest
- `start-skill-genre-selection`: Step A 题材选项新增"言情"为第 6 选项；选择后检查 genre×platform invalid_combinations 并 WARNING

## Impact

- 新增 2 个模板文件，修改 6 个现有文件（2 agents + 2 skills + 2 src），无新增 Agent：

| File | Change |
|------|--------|
| `templates/genre-excitement-map.json` | **NEW** — 6 genres × Ch1-3 excitement_type assignment rules |
| `templates/genre-golden-standards.json` | **NEW** — 6 genre differentiated review standards + invalid_combinations WARNING table |
| `agents/quality-judge.md` | Track 3 expansion: genre-specific minimum_thresholds + criteria check |
| `agents/plot-architect.md` | Ch1-3 planning references genre_excitement_map for excitement_type assignment |
| `skills/continue/SKILL.md` | Document QualityJudge context contract for `genre_golden_standards` passthrough |
| `skills/start/SKILL.md` | Step A adds 言情; post-selection genre×platform check + WARNING; documents packet passthrough |
| `src/instructions.ts` | Runtime injects `genre_excitement_map` / `genre_golden_standards` into `volume:outline`, `chapter:*:judge`, and `quickstart:results` packets |
| `src/init.ts` | DEFAULT_TEMPLATES adds genre-excitement-map.json + genre-golden-standards.json |
