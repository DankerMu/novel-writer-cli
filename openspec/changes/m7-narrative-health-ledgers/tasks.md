## 1. Promise Ledger

- [x] 1.1 Define `promise-ledger.json` schema (types/status/history/dormancy fields) (`schemas/promise-ledger.schema.json`, `src/promise-ledger.ts`)
- [x] 1.2 Add initializer that can seed ledger from `brief.md`, volume outline, and recent summaries (with user confirmation gate) (`novel promises init` dry-run/--apply)
- [x] 1.3 Implement periodic promise-ledger report generation under `logs/promises/` (`latest.json` + history) (`src/promise-ledger.ts`, `src/commit.ts`)
- [x] 1.4 Implement non-spoiler “light-touch” suggestion generator for dormant promises (`src/promise-ledger.ts`)

## 2. Engagement Density Metrics

- [ ] 2.1 Define `engagement-metrics.jsonl` record schema and append-only writer
- [ ] 2.2 Implement metrics extractor (prefer summaries/evals; fall back to minimal heuristics)
- [ ] 2.3 Implement sliding-window analysis (default window=10) and low-density stretch detection
- [ ] 2.4 Persist engagement reports under `logs/engagement/` (`latest.json` + history)

## 3. Character Voice Drift

- [ ] 3.1 Define `character-voice-profiles.json` schema and selection rules (protagonist + core cast)
- [ ] 3.2 Implement profile builder from early chapters/dialogue excerpts (baseline calibration)
- [ ] 3.3 Implement drift detector (window=10) with evidence snippets and corrective directives
- [ ] 3.4 Write `character-voice-drift.json` when drift detected and clear/deactivate on recovery

## 4. Cadence & Injection

- [ ] 4.1 Add periodic trigger cadence (every 10 chapters + volume end) without blocking commit by default
- [ ] 4.2 Inject compact summaries into PlotArchitect/ChapterWriter/StyleRefiner manifests as optional context
- [ ] 4.3 Ensure injection is null-safe and backwards compatible

## 5. Documentation

- [ ] 5.1 Document new ledgers/metrics files and their schemas
- [ ] 5.2 Document how to interpret engagement warnings vs hard violations (default advisory-only)
