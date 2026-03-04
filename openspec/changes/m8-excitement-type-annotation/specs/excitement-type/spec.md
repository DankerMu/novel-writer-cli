## ADDED Requirements

### Requirement 1: L3 chapter contracts SHALL support an optional `excitement_type` field

L3 chapter contracts SHALL support an optional `excitement_type` field with enum values: `reversal | face_slap | power_up | reveal | cliffhanger | setup | null`.

When the field is absent, it SHALL be treated as `null`. Unknown values SHALL trigger a validation warning (not error).

#### Scenario: PlotArchitect creates contract with excitement_type "face_slap"
- **WHEN** PlotArchitect generates a chapter contract with `excitement_type: "face_slap"`
- **THEN** the contract is valid and the field is preserved in the L3 contract output

#### Scenario: Contract has no excitement_type field
- **WHEN** an L3 chapter contract does not include `excitement_type`
- **THEN** the system treats it as `null`
- **AND** no excitement landing evaluation is performed

#### Scenario: Contract has unknown excitement_type value
- **WHEN** an L3 chapter contract includes `excitement_type: "unknown_value"`
- **THEN** the system emits a validation warning
- **AND** the contract is still accepted (not rejected)

---

### Requirement 2: PlotArchitect SHALL assign `excitement_type` when generating chapter outlines

PlotArchitect SHALL assign an `excitement_type` value for each chapter when generating volume outlines. The outline format SHALL include an `ExcitementType` line as the 9th item.

#### Scenario: Volume outline includes ExcitementType line for each chapter
- **WHEN** PlotArchitect generates a volume outline
- **THEN** each chapter entry includes a line `- **ExcitementType**: <value>` with a valid enum value

#### Scenario: Chapter designated as transition
- **WHEN** PlotArchitect determines a chapter is a transition/setup chapter
- **THEN** `excitement_type` is set to `null` or `setup`
- **AND** the choice between `null` and `setup` reflects whether the chapter actively builds toward a future payoff (`setup`) or is purely transitional (`null`)

---

### Requirement 3: QualityJudge pacing evaluation SHALL adapt based on `excitement_type`

QualityJudge Track 2 pacing dimension SHALL use differentiated evaluation criteria based on the chapter's `excitement_type`. The evaluation output SHALL include `excitement_type` and `excitement_landing` fields in the eval JSON.

#### Scenario: excitement_type is "face_slap"
- **WHEN** QualityJudge evaluates a chapter with `excitement_type: "face_slap"`
- **THEN** the pacing evaluation assesses whether the face-slap moment lands with satisfying impact
- **AND** `excitement_landing` is set to one of `hit | partial | miss`

#### Scenario: excitement_type is "reversal"
- **WHEN** QualityJudge evaluates a chapter with `excitement_type: "reversal"`
- **THEN** the pacing evaluation assesses whether the reversal delivers sufficient surprise and emotional payoff
- **AND** `excitement_landing` is set to one of `hit | partial | miss`

#### Scenario: excitement_type is "setup"
- **WHEN** QualityJudge evaluates a chapter with `excitement_type: "setup"`
- **THEN** the pacing evaluation uses 铺垫有效性 (foreshadowing effectiveness) criteria instead of standard conflict intensity
- **AND** the evaluation assesses whether the chapter builds expectation and causal links to future payoffs
- **AND** `excitement_landing` is set to one of `hit | partial | miss` (measuring setup quality, not conflict)

#### Scenario: excitement_type is null
- **WHEN** QualityJudge evaluates a chapter with `excitement_type: null` (or field absent)
- **THEN** the pacing evaluation uses standard criteria (no excitement landing check)
- **AND** `excitement_landing` is omitted or set to `null` in the eval JSON

#### Scenario: Evaluation output includes excitement fields in JSON
- **WHEN** QualityJudge completes evaluation of a chapter with a non-null `excitement_type`
- **THEN** the eval JSON output includes:
  - `"excitement_type": "<value>"` echoing the contract value
  - `"excitement_landing": "hit" | "partial" | "miss"`

---

### Requirement 4: Continue skill SHALL parse and inject excitement_type into QualityJudge manifest

The continue skill SHALL parse the optional `ExcitementType` line from chapter outlines and inject the value into the QualityJudge evaluation manifest.

#### Scenario: Step 2.1 parses optional ExcitementType from outline
- **WHEN** the continue skill parses a chapter outline in Step 2.1
- **AND** the outline includes a `- **ExcitementType**: <value>` line
- **THEN** the parsed value is stored and available for downstream steps

#### Scenario: Step 2.1 handles missing ExcitementType
- **WHEN** the continue skill parses a chapter outline in Step 2.1
- **AND** the outline does not include an ExcitementType line
- **THEN** the value defaults to `null` and downstream steps proceed normally

#### Scenario: Step 2.6 injects excitement_type into QualityJudge manifest
- **WHEN** the continue skill constructs the QualityJudge manifest in Step 2.6
- **AND** a non-null `excitement_type` was parsed
- **THEN** the manifest includes `excitement_type` for QualityJudge to use in pacing evaluation

## References

- `openspec/changes/m8-excitement-type-annotation/proposal.md`
- `openspec/changes/m8-excitement-type-annotation/design.md`
- `agents/plot-architect.md` — L3 contract schema
- `agents/quality-judge.md` — Track 2 pacing evaluation
- `skills/continue/SKILL.md` — Chapter pipeline orchestration
- `skills/start/references/vol-planning.md` — Contract validation
