## ADDED Requirements

### Requirement: The system SHALL define a tool-agnostic interactive question IR (`NOVEL_ASK`)
The system SHALL define a tool-agnostic question IR named `NOVEL_ASK` (QuestionSpec) to represent interactive gates in a deterministic, auditable way.

At minimum, `NOVEL_ASK` SHALL include:
- `version` (integer)
- `topic` (string; short label for audit/logging)
- `questions[]` (ordered list)

Each `questions[]` entry SHALL include at minimum:
- `id` (stable `snake_case` identifier)
- `header` (short display label)
- `question` (full prompt)
- `kind` (enum: `single_choice|multi_choice|free_text`)
- `required` (boolean)

For choice kinds, each question SHALL also include:
- `options[]` with `{label, description}` items
- `allow_other` (optional boolean; whether custom input is allowed)
- `default` (optional; must be one of the choices, or a list of choices for multi-choice)

#### Scenario: A platform binding gate is representable
- **WHEN** init requires the user to choose a platform
- **THEN** the system can represent the gate as `NOVEL_ASK` with a `single_choice` question
- **AND** the question has stable `id="platform"`

### Requirement: Answers MUST be persisted in a canonical AnswerSpec record for audit and resume
The executor MUST persist answers to the `NOVEL_ASK` as a single JSON record at an orchestrator-provided `answer_path`.

At minimum, the record SHALL be:
- `version` (integer; copied from QuestionSpec)
- `topic` (string; copied from QuestionSpec)
- `answers` (object mapping `{[question_id]: value}`)
- `answered_at` (ISO-8601 string)
- `answered_by` (string; e.g. `claude_code|codex|human`)

`value` types MUST match the corresponding question `kind`:
- `single_choice`: string (choice label or free-form when `allow_other=true`)
- `multi_choice`: string array
- `free_text`: string

Before proceeding past the gate, the system MUST validate:
- required questions are answered
- choice answers are in-range unless `allow_other=true`
- answer record schema is well-formed JSON

#### Scenario: Answer record is written and validated
- **WHEN** the user completes a `NOVEL_ASK` gate
- **THEN** the executor writes a valid AnswerSpec JSON record to `answer_path`
- **AND** the orchestrator can resume deterministically by re-loading and validating the record

### Requirement: Instruction packets SHALL optionally carry `NOVEL_ASK` as a pre-step gate
An instruction packet MAY include a `novel_ask` field with the QuestionSpec and an `answer_path`.

If `novel_ask` is present, the executor MUST:
- collect answers (via native tools when available)
- write the AnswerSpec record to `answer_path`
- only then proceed to the main step’s agent execution

#### Scenario: Step is blocked until gate is answered
- **WHEN** an instruction packet includes `novel_ask`
- **THEN** the step is considered blocked until a valid AnswerSpec record exists at `answer_path`

### Requirement: Adapters SHALL compile `NOVEL_ASK` into executor-native interaction without changing semantics
The system SHALL provide adapter compilation strategies that preserve QuestionSpec semantics across executors.

At minimum:
- **Claude Code**: compile into one or more native `AskUserQuestion` interactions
- **Codex**: prefer Plan Mode `request_user_input`; if unavailable, fall back to a strict-text JSON reply format

All adapters MUST produce the same AnswerSpec output record.

#### Scenario: Claude Code and Codex produce identical answer records
- **WHEN** the same `NOVEL_ASK` is presented to the user in Claude Code and Codex
- **THEN** both produce AnswerSpec-compatible records with equivalent `answers` mappings

## References

- `openspec/changes/m6-interactive-question-adapters/proposal.md`
- `openspec/changes/m6-interactive-question-adapters/design.md`
- `openspec/changes/m6-platform-optimization/proposal.md`
