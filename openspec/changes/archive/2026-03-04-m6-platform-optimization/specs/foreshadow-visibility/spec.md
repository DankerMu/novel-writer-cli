## ADDED Requirements

### Requirement: The system SHALL track “dormancy” (silent chapters) for foreshadowing items
For each foreshadowing item in `foreshadowing/global.json`, the system SHALL be able to compute:
- `last_updated_chapter` (already stored)
- `chapters_since_last_update` (derived)

The system SHOULD derive “dormancy thresholds” from platform/drive-type configuration (e.g., long-scope items should not go silent for too long without a light touch).

#### Scenario: Dormancy computed for a long-scope item
- **WHEN** a long-scope foreshadowing item was last updated at chapter 12
- **AND** the current chapter is 25
- **THEN** the system computes `chapters_since_last_update = 13` for that item

### Requirement: The system SHALL generate periodic foreshadow visibility reports
The system SHALL generate a periodic foreshadow visibility report and write it under `logs/foreshadowing/`, including:
- dormant items (by scope/status)
- recommended “light-touch” reminders (non-spoiler)
- configuration context (platform id, thresholds)

#### Scenario: Visibility report highlights dormant items
- **WHEN** periodic maintenance runs after a chapter commit
- **THEN** the report highlights any foreshadowing items that exceed dormancy thresholds

### Requirement: The system SHALL provide non-spoiler “light-touch” tasks to planning/writing agents
When a foreshadowing item exceeds dormancy thresholds, the system SHALL provide a non-spoiler “light-touch” task that can be injected into:
- PlotArchitect planning
- ChapterWriter chapter execution

The task MUST avoid revealing the eventual payoff and SHOULD be phrased as a subtle reminder (e.g., a brief mention, a recurring symbol, a small callback).

#### Scenario: Light-touch task injected for a dormant item
- **WHEN** a long-scope foreshadowing item is dormant beyond threshold
- **THEN** the next planning/writing step includes a light-touch reminder task for that item

## References

- `docs/dr-workflow/novel-writer-tool/final/prd/09-data.md`
- `openspec/changes/archive/2026-02-25-m3-foreshadowing-and-storyline-analytics/specs/foreshadowing-and-storyline-analytics/spec.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
