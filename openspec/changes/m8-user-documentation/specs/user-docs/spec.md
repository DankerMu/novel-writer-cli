## ADDED Requirements

### Requirement 1: Project SHALL provide a user-facing quick-start guide at `docs/user/quick-start.md`

The guide SHALL walk a new user through the complete workflow from installation to daily writing, organized in chronological order. All content SHALL be written in simplified Chinese. The guide SHALL cover all M8 enhancements in context of the workflow steps where they apply.

#### Scenario: Guide covers installation prerequisites
- **GIVEN** a new user wants to use the novel-writer CLI
- **WHEN** they open `docs/user/quick-start.md`
- **THEN** the first section explains prerequisites (Node.js, Claude API access)
- **AND** provides the installation command
- **AND** explains how to verify the installation succeeded

#### Scenario: Guide covers project creation with platform and genre selection
- **GIVEN** a user has installed the CLI
- **WHEN** they read the project creation section
- **THEN** the guide explains the `/novel:start` skill
- **AND** describes the three platform options (qidian, fanqie, jinjiang) and their characteristics
- **AND** describes genre selection and its impact on evaluation standards
- **AND** explains the brief template and how to fill it

#### Scenario: Guide covers style source selection
- **GIVEN** a user is creating a new project
- **WHEN** they read the style source section
- **THEN** the guide explains the two style source options: sample chapters or reference author
- **AND** describes how StyleAnalyzer extracts a style profile
- **AND** explains what `style-profile.json` contains and how it affects writing

#### Scenario: Guide covers golden three chapters (Step F0 mini-planning + Step F trial writing)
- **GIVEN** a user has completed project setup
- **WHEN** they read the golden three chapters section
- **THEN** the guide explains Step F0 (mini-volume planning for Ch1-3)
- **AND** explains Step F (trial writing with platform-specific golden chapter gates)
- **AND** describes the gate criteria for Ch1-3 (hook density, character introduction pacing, etc.)
- **AND** explains what happens when a chapter fails the golden gate

#### Scenario: Guide covers volume planning workflow
- **GIVEN** a user has completed the golden three chapters
- **WHEN** they read the volume planning section
- **THEN** the guide explains how PlotArchitect creates volume outlines
- **AND** describes L3 chapter contracts and their role
- **AND** explains storyline management for multi-thread narratives

#### Scenario: Guide covers daily writing workflow
- **GIVEN** a user has a planned volume
- **WHEN** they read the daily writing section
- **THEN** the guide explains the `/novel:continue` skill
- **AND** describes the chapter pipeline (ChapterWriter → Summarizer → StyleRefiner → QualityJudge)
- **AND** explains how to check progress with `/novel:status`

#### Scenario: Guide covers quality review and gate decisions
- **GIVEN** a user receives a quality score for a chapter
- **WHEN** they read the quality review section
- **THEN** the guide explains the 8-dimension scoring system and weights
- **AND** describes the three gate outcomes (pass >= 4.0, revision 3.0-3.4, rewrite < 2.0)
- **AND** explains how to interpret scores and improve low-scoring dimensions

#### Scenario: Guide includes FAQ section
- **GIVEN** a user has questions about common scenarios
- **WHEN** they read the FAQ section
- **THEN** the FAQ covers at least: low quality scores, skipping golden chapters, platform switching, style profile tuning, and canon_status usage
- **AND** each Q&A is concise (answer within 3-5 sentences)

---

### Requirement 2: Project SHALL provide a user-facing migration guide at `docs/user/migration-guide.md`

The guide SHALL help existing project users understand and adopt M8 changes. Each migration section SHALL follow a uniform structure: "是否需要操作" → "如何操作" → "不操作会怎样". All content SHALL be written in simplified Chinese.

#### Scenario: Guide explains canon_status migration (no action needed)
- **GIVEN** an existing project created before M8
- **WHEN** the user reads the canon_status migration section
- **THEN** the guide states that no action is required
- **AND** explains that missing `canon_status` fields default to `established`
- **AND** explains the benefit of optionally adopting `planned`/`deprecated` for new rules

#### Scenario: Guide explains tomato to fanqie platform migration (optional)
- **GIVEN** an existing project with `platform: "tomato"`
- **WHEN** the user reads the platform migration section
- **THEN** the guide explains that `tomato` continues to work as an alias for `fanqie`
- **AND** provides steps to optionally rename to `fanqie` in project config
- **AND** states that not renaming has no functional impact

#### Scenario: Guide explains excitement_type migration (no action needed)
- **GIVEN** an existing project with L3 chapter contracts lacking `excitement_type`
- **WHEN** the user reads the excitement_type migration section
- **THEN** the guide states that no action is required
- **AND** explains that missing `excitement_type` defaults to `null` (no genre-specific evaluation)
- **AND** explains how new chapters will automatically receive `excitement_type` annotations

#### Scenario: Guide explains golden chapter gates impact on new projects
- **GIVEN** an existing project that has already passed Ch1-3
- **WHEN** the user reads the golden chapter gates migration section
- **THEN** the guide explains that golden gates only apply to Ch1-3 during initial writing
- **AND** states that existing projects with completed golden chapters are not affected
- **AND** explains that new volumes will still use standard (non-golden) gates

#### Scenario: Guide explains platform writing guide adoption for existing projects
- **GIVEN** an existing project that wants to adopt platform-specific writing guides
- **WHEN** the user reads the platform guide migration section
- **THEN** the guide explains how to set or update the `platform` field in project config
- **AND** describes what platform-specific adjustments will take effect (scoring weights, style preferences)
- **AND** states that not setting a platform means using default (platform-agnostic) evaluation

#### Scenario: Each section includes uniform structure
- **GIVEN** any migration section in the guide
- **WHEN** the user reads it
- **THEN** the section contains a "是否需要操作" subsection (yes/no with explanation)
- **AND** a "如何操作" subsection (step-by-step instructions, or "N/A" if no action needed)
- **AND** a "不操作会怎样" subsection (impact of inaction)

---

### Requirement 3: Both documents SHALL be written in Chinese

All user-facing content in both documents SHALL use simplified Chinese as the primary language.

#### Scenario: All content uses simplified Chinese
- **GIVEN** either `quick-start.md` or `migration-guide.md`
- **WHEN** a reader opens the file
- **THEN** all headings, body text, and explanations are in simplified Chinese
- **AND** code examples, CLI commands, and file paths remain in English/ASCII

#### Scenario: Technical terms include English original in parentheses where helpful
- **GIVEN** a technical term appears for the first time in either document
- **WHEN** the term has a well-known English original (e.g., canon_status, excitement_type, golden chapter)
- **THEN** the Chinese text includes the English term in parentheses on first occurrence
- **AND** subsequent occurrences may use only the Chinese term

## References

- `openspec/changes/m8-canon-status-lifecycle/` — CS1 spec (canon_status behavior)
- `openspec/changes/m8-excitement-type-annotation/` — CS2 spec (excitement_type behavior)
- `openspec/changes/m8-platform-expansion-and-golden-gates/` — CS3 spec (platform + golden gates)
- `openspec/changes/m8-genre-excitement-mapping/` — CS4 spec (genre mapping)
- `openspec/changes/m8-golden-chapter-mini-planning/` — CS5 spec (Step F0)
- `skills/novel-writing/SKILL.md` — workflow step definitions
- `skills/novel-writing/references/quality-rubric.md` — 8-dimension scoring rubric
