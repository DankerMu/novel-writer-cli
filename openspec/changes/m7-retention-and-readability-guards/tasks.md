## 1. Platform Profile Extensions

- [x] 1.1 Extend `platform-profile.json` schema with `retention/title_policy`, `retention/hook_ledger`, `readability/mobile`, and `naming` fields
- [x] 1.2 Update built-in qidian/tomato defaults to include reasonable retention/readability/naming policies
- [x] 1.3 Add validation for new profile fields (fail fast with clear errors; do not hang pipeline)

## 2. Title System

- [x] 2.1 Implement title presence + policy validator (length/patterns/banned words)
- [x] 2.2 Add `title-fix` micro-step that edits only the H1 title line (bounded retries + escalation)
- [x] 2.3 Wire title report into pre-judge compliance/guardrail report and chapter logs

## 3. Mobile Readability Lint

- [x] 3.1 Define readability issue taxonomy + severity mapping (warn/soft/hard) driven by platform profile
- [x] 3.2 Add deterministic lint script hook (e.g., `scripts/lint-readability.sh`) with JSON stdout contract
- [x] 3.3 Implement safe fallback when script missing/fails (warn-only; no blocking)
- [x] 3.4 Persist readability reports under `logs/readability/` (`latest.json` + history)

## 4. Naming Conflict Lint

- [x] 4.1 Implement name registry derivation from `characters/active/*.json` (+ optional aliases)
- [x] 4.2 Implement duplicate + near-duplicate + alias collision detection with configurable thresholds
- [x] 4.3 Integrate NER/unknown-entity signals (if available) to warn on confusing new names
- [x] 4.4 Persist naming reports under `logs/naming/` (`latest.json` + history)

## 5. Hook Ledger

- [x] 5.1 Define `hook-ledger.json` schema (id/type/strength/promise_text/window/status/history)
- [x] 5.2 Update evaluation/metadata to capture hook type + strength + compact end-of-chapter evidence
- [x] 5.3 Implement ledger update on commit + fulfillment window assignment + overdue detection
- [x] 5.4 Implement diversity checks (streak + distinct types in window) and retention reporting under `logs/retention/`

## 6. Pipeline Integration

- [ ] 6.1 Extend pre-judge checks to include title/readability/naming guardrails (structured report input)
- [ ] 6.2 Ensure hard issues can block commit when enabled, while defaults remain non-blocking
- [ ] 6.3 Keep all new fields backward-compatible in manifests (optional fields; null-safe)

## 7. Documentation

- [ ] 7.1 Document new platform profile sections and default behaviors
- [ ] 7.2 Document how to interpret `logs/retention/*`, `logs/readability/*`, `logs/naming/*`
