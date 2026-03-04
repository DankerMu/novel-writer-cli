## ADDED Requirements

### Requirement: System SHALL provide platform-specific writing guides as markdown templates
The system SHALL include a markdown writing guide for each canonical platform under `templates/platforms/`. Each guide serves as injected context for ChapterWriter to follow platform-specific conventions.

#### Scenario: Three platform guides exist
- **GIVEN** the `templates/platforms/` directory
- **THEN** it contains exactly three files: `fanqie.md`, `qidian.md`, `jinjiang.md`

### Requirement: Each guide SHALL define pace density, dialogue ratio, hook strategy, emotional payoff timing, and style requirements
Every platform writing guide SHALL cover the following dimensions at minimum:
- **Pace density**: how many plot beats / events per chapter
- **Dialogue ratio**: target percentage of dialogue versus narration
- **Hook strategy**: chapter-end hook conventions and expectations
- **Emotional payoff timing**: how many chapters between setup and payoff
- **Style requirements**: platform-specific style expectations (e.g., naturalness, literary quality)

#### Scenario: fanqie guide defines high pace density
- **GIVEN** `templates/platforms/fanqie.md`
- **THEN** the guide specifies high pace density, dialogue ratio 40-50%, strong chapter-end hooks, 2-3 chapter emotional payoff cycles, and settings woven into action (not standalone description blocks)

#### Scenario: qidian guide defines medium pace with immersion priority
- **GIVEN** `templates/platforms/qidian.md`
- **THEN** the guide specifies medium pace density, dialogue ratio 30-40%, system-building allowed, and immersion as a priority dimension

#### Scenario: jinjiang guide defines character-driven conventions
- **GIVEN** `templates/platforms/jinjiang.md`
- **THEN** the guide specifies character-driven narrative, emotional hooks over plot hooks, CP (couple pairing) early appearance, personality expressed through behavior (not narration), and high style_naturalness requirement

### Requirement: Guides SHALL be human-readable and directly injectable into agent context
Guides SHALL be written in natural language markdown suitable for direct inclusion in ChapterWriter prompt context without additional parsing or transformation.

#### Scenario: Guide content is natural language
- **GIVEN** any platform guide file
- **WHEN** the content is read
- **THEN** it is valid markdown containing prose instructions (not JSON, not code)

## References

- `agents/chapter-writer.md`
- `skills/novel-writing/references/style-guide.md`
