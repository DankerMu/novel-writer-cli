## 1. NOVEL_ASK IR (QuestionSpec)

- [ ] 1.1 Define the `NOVEL_ASK` JSON shape (version/topic/questions) and provide at least one complete example
- [ ] 1.2 Define validation rules (required fields, stable `id` format, choice option constraints, default value constraints)

## 2. AnswerSpec (Audit + Resume)

- [ ] 2.1 Define the canonical answer record schema (`{version, topic, answers, answered_at, answered_by}`) and validation rules
- [ ] 2.2 Specify `answer_path` conventions and how answers are stored for audit and deterministic resume

## 3. Instruction Packet Integration

- [ ] 3.1 Extend instruction packet schema to optionally include `novel_ask` + `answer_path`
- [ ] 3.2 Specify execution semantics: a step is blocked until required questions are answered and validated

## 4. Executor Adapters (Claude Code / Codex)

- [ ] 4.1 Claude Code adapter: compile `NOVEL_ASK` → one or more `AskUserQuestion` calls and persist answers
- [ ] 4.2 Codex adapter: prefer Plan Mode `request_user_input`; define a strict-text fallback when unavailable
- [ ] 4.3 Ensure both adapters write the same AnswerSpec output (tool-agnostic, reviewable)

## References

- `openspec/changes/m6-interactive-question-adapters/proposal.md`
- `openspec/changes/m6-interactive-question-adapters/design.md`
- `openspec/changes/m6-interactive-question-adapters/specs/interactive-questions/spec.md`
