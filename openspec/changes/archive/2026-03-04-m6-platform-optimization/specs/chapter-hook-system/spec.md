## ADDED Requirements

### Requirement: The system SHALL enforce a chapter-end hook when required by platform policy
When `platform-profile.json.hook_policy.required=true`, the system SHALL require each chapter to end with a reader-facing hook.

The hook MAY be implemented as:
- an unresolved question
- a new threat reveal
- a twist / reveal
- an emotional cliff
- a clear “next objective” promise

#### Scenario: Hook required by platform policy
- **WHEN** the project platform profile requires hooks
- **THEN** each committed chapter is expected to end with a hook

### Requirement: The system SHALL detect hook presence and classify hook type
The system SHALL detect whether a chapter contains a chapter-end hook and SHALL classify the hook into a type from a bounded taxonomy (configurable via `platform-profile.json.hook_policy.allowed_types`).

Detection SHOULD use deterministic heuristics when possible, but MUST remain robust to stylistic variance.

#### Scenario: Hook type recorded for a chapter
- **WHEN** a chapter ends with a question hook (e.g., an explicit unresolved question)
- **THEN** the system records `hook.type="question"` for that chapter

### Requirement: The system SHALL score hook strength and include evidence
The system SHALL compute a `hook_strength` score (1-5) for each chapter when hooks are enabled.
The score SHALL:
- be stored in the chapter evaluation output
- include a short evidence snippet taken from the chapter end

#### Scenario: Hook strength is included in evaluation
- **WHEN** QualityJudge evaluates chapter C under a hook-enabled platform profile
- **THEN** `evaluations/chapter-{C:03d}-eval.json` includes a `hook_strength` score and an evidence snippet

### Requirement: Weak or missing hooks MUST trigger a bounded `hook-fix` micro-step
If hook policy is enabled and either:
- hook is missing, OR
- `hook_strength < platform-profile.json.hook_policy.min_strength`
then the system MUST trigger a `hook-fix` micro-step.

The `hook-fix` micro-step MUST:
- only modify the last 1–2 paragraphs of the chapter (or last ~10% by tokens), preserving earlier content
- re-run hook detection and hook strength scoring
- stop after at most 1 automated `hook-fix` attempt and escalate to user review if still failing

#### Scenario: Hook-fix edits only the chapter ending
- **WHEN** a chapter fails hook policy due to weak hook strength
- **THEN** the system runs `hook-fix` and only changes the final 1–2 paragraphs
- **AND** re-evaluates hook strength against the same minimum threshold

## References

- `skills/novel-writing/references/quality-rubric.md`
- `openspec/changes/m6-platform-optimization/specs/quality-rubric/spec.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
