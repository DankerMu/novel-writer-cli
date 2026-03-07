## 1. Quick Start Guide

- [x] 1.1 Write installation and prerequisites section (Node.js version, Claude API access, `novel` CLI installation, verification command)
- [x] 1.2 Write project creation section (platform selection: qidian/fanqie/jinjiang; genre selection; brief template filling; `/novel:start` invocation)
- [x] 1.3 Write style source section (sample chapters vs reference author; StyleAnalyzer extraction; `style-profile.json` explanation)
- [x] 1.4 Write golden three chapters section (Step F0 mini-volume planning; Step F trial writing; golden gate criteria per platform; failure handling)
- [x] 1.5 Write volume planning section (PlotArchitect volume outlines; L3 chapter contracts; storyline management; canon_status usage for planned rules)
- [x] 1.6 Write daily writing workflow section (`/novel:continue` invocation; chapter pipeline: ChapterWriter → Summarizer → StyleRefiner → QualityJudge; `/novel:status` for progress)
- [x] 1.7 Write quality review and gate decisions section (8-dimension scoring with weights; gate thresholds: >=4.0 pass / 3.0-3.4 revision / <2.0 rewrite; interpreting scores; excitement_type impact on evaluation)
- [x] 1.8 Write FAQ section (at minimum: low quality scores, skipping golden chapters, platform switching mid-project, style profile tuning, canon_status planned/deprecated usage, excitement_type meaning)

## 2. Migration Guide

- [x] 2.1 Write canon_status migration section (是否需要操作: no; 如何操作: optionally tag new rules; 不操作会怎样: all existing rules treated as established)
- [x] 2.2 Write tomato→fanqie migration section (是否需要操作: optional; 如何操作: rename platform field; 不操作会怎样: tomato alias continues to work)
- [x] 2.3 Write excitement_type migration section (是否需要操作: no; 如何操作: new chapters auto-annotated; 不操作会怎样: missing = null, no genre-specific evaluation)
- [x] 2.4 Write golden chapter gates migration section (是否需要操作: no for existing projects past Ch3; 如何操作: new projects get golden gates automatically; 不操作会怎样: no impact on completed chapters)
- [x] 2.5 Write platform writing guide migration section (是否需要操作: optional; 如何操作: set/update platform field; 不操作会怎样: default platform-agnostic evaluation)
- [x] 2.6 Write genre-specific standards migration section (是否需要操作: no; 如何操作: genre field enables genre-specific evaluation; 不操作会怎样: missing genre = no genre-specific rubric applied)

## 3. Review

- [x] 3.1 Verify all M8 features are covered in quick-start (canon_status, excitement_type, platform expansion, golden gates, genre mapping, Step F0)
- [x] 3.2 Verify migration guide covers all backward-compatibility scenarios from CS1-CS5
- [x] 3.3 Proofread Chinese content for clarity, consistency, and correct technical term usage (English in parentheses on first occurrence)
- [x] 3.4 Verify document structure: quick-start has table of contents with anchor links; migration-guide has uniform section structure
