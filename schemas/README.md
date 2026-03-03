# JSON Schemas

This directory contains machine-readable JSON Schemas that act as **single sources of truth** (SSOT) for project-facing JSON files.

## Integration plan

- Templates SHOULD be derived from these schemas (and may include a `$schema` pointer for editor tooling).
- Runtime validators SHOULD validate project files against these schemas (e.g., via Ajv or python-jsonschema) and fail fast on enum/range violations.
- Specs SHOULD reference the schema path instead of duplicating field definitions.

## Available schemas

- `schemas/platform-profile.schema.json` — `platform-profile.json` (M6 baseline + M7 optional extensions)
- `schemas/hook-ledger.schema.json` — `hook-ledger.json` (M7 retention hook ledger)
- `schemas/engagement-metrics.schema.json` — `engagement-metrics.jsonl` record (M7 engagement density stream)
- `schemas/character-voice-profiles.schema.json` — `character-voice-profiles.json` (M7 per-character voice profiles)
- `schemas/character-voice-drift.schema.json` — `character-voice-drift.json` (M7 voice drift directives)
