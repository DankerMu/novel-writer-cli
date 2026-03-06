import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile, writeTextFile, writeTextFileIfMissing } from "./fs-utils.js";
import { loadContinuityLatestSummary, tryResolveVolumeChapterRange } from "./consistency-auditor.js";
import { normalizeExcitementType, type ExcitementType } from "./excitement-type.js";
import { loadEngagementLatestSummary } from "./engagement.js";
import { computeForeshadowVisibilityReport, loadForeshadowGlobalItems } from "./foreshadow-visibility.js";
import { loadGoldenChapterGates, selectGoldenChapterGatesForPlatform } from "./golden-chapter-gates.js";
import { computeEffectiveScoringWeights, loadGenreWeightProfiles } from "./scoring-weights.js";
import { parseNovelAskQuestionSpec, type NovelAskQuestionSpec } from "./novel-ask.js";
import { loadPlatformProfile } from "./platform-profile.js";
import { computePrejudgeGuardrailsReport, writePrejudgeGuardrailsReport } from "./prejudge-guardrails.js";
import { loadPromiseLedgerLatestSummary } from "./promise-ledger.js";
import { QUICKSTART_STAGING_RELS } from "./quickstart.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { computeTitlePolicyReport } from "./title-policy.js";
import { chapterRelPaths, formatStepId, pad2, pad3, titleFixSnapshotRel, type Step } from "./steps.js";
import { isPlainObject } from "./type-guards.js";
import { VOL_REVIEW_RELS } from "./volume-review.js";
import { computeVolumeChapterRange, volumeFinalRelPaths, volumeStagingRelPaths } from "./volume-planning.js";

export type InstructionPacket = {
  version: 1;
  step: string;
  agent: { kind: "subagent" | "cli"; name: string };
  novel_ask?: NovelAskQuestionSpec;
  answer_path?: string;
  manifest: {
    mode: "paths" | "paths+embed";
    inline: Record<string, unknown>;
    paths: Record<string, unknown>;
    embed?: Record<string, unknown>;
  };
  expected_outputs: Array<{ path: string; required: boolean; note?: string }>;
  next_actions: Array<{ kind: "command"; command: string; note?: string }>;
};

type BuildArgs = {
  rootDir: string;
  checkpoint: Checkpoint;
  step: Step;
  embedMode: string | null;
  writeManifest: boolean;
  novelAskGate?: { novel_ask: NovelAskQuestionSpec; answer_path: string } | null;
};

function relIfExists(relPath: string, exists: boolean): string | null {
  return exists ? relPath : null;
}

function safeEmbedMode(mode: string | null): "off" | "brief" {
  if (!mode) return "off";
  if (mode === "brief") return "brief";
  throw new NovelCliError(`Unsupported --embed mode: ${mode}. Supported: brief`, 2);
}

async function loadOutlineExcitementType(args: { rootDir: string; volume: number; chapter: number }): Promise<ExcitementType | null | undefined> {
  const outlineRel = `volumes/vol-${pad2(args.volume)}/outline.md`;
  const outlineAbs = join(args.rootDir, outlineRel);
  if (!(await pathExists(outlineAbs))) return null;

  const lines = (await readTextFile(outlineAbs)).split(/\r?\n/u);
  const headingRe = /^###\s*第\s*(\d+)\s*章/u;
  const excitementPrefix = "- **ExcitementType**:";

  let startLine = -1;
  let endLine = lines.length;
  for (let i = 0; i < lines.length; i++) {
    const match = headingRe.exec(lines[i] ?? "");
    if (!match) continue;
    const chapter = Number.parseInt(match[1] ?? "", 10);
    if (chapter !== args.chapter) {
      if (startLine >= 0) {
        endLine = i;
        break;
      }
      continue;
    }
    startLine = i;
  }

  if (startLine < 0) return null;

  for (const line of lines.slice(startLine, endLine)) {
    if (line.startsWith(excitementPrefix)) {
      return normalizeExcitementType(line.slice(excitementPrefix.length));
    }
  }
  return null;
}

async function loadChapterExcitementType(args: { rootDir: string; volume: number; chapter: number }): Promise<ExcitementType | null> {
  const contractRel = `volumes/vol-${pad2(args.volume)}/chapter-contracts/chapter-${pad3(args.chapter)}.json`;
  const contractAbs = join(args.rootDir, contractRel);

  if (await pathExists(contractAbs)) {
    try {
      const raw = await readJsonFile(contractAbs);
      if (isPlainObject(raw) && Object.prototype.hasOwnProperty.call(raw, "excitement_type")) {
        const normalized = normalizeExcitementType((raw as Record<string, unknown>).excitement_type);
        return normalized === undefined ? null : normalized;
      }
    } catch {
      // Fall through to outline-based backward-compatible parsing.
    }
  }

  const outlineExcitementType = await loadOutlineExcitementType(args);
  return outlineExcitementType === undefined ? null : outlineExcitementType;
}


type CanonStatus = "established" | "planned" | "deprecated";

type PlannedRuleInfo = {
  id?: string;
  category?: string;
  constraint_type?: string;
  canon_status: "planned";
  rule: string;
};

type RuleLifecycleContext = {
  hardRulesList: string[];
  plannedRulesInfo: PlannedRuleInfo[];
  degraded: boolean;
};

type CharacterCandidate = {
  id: string;
  displayName: string;
  canonStatus: CanonStatus;
  jsonRel: string;
  mdRel: string;
  matched: boolean;
};

type CharacterContext = {
  activeCharacterContracts: string[];
  activeCharacterProfiles: string[];
  plannedCharacterContracts: string[];
  plannedCharacterProfiles: string[];
};

type CharacterContextOptions = {
  includePlannedCharacters: boolean;
  prioritizePlannedOnFallback: boolean;
};

type CanonStatusContextOptions = {
  includePlannedRulesInfo: boolean;
  includePlannedCharacters: boolean;
  prioritizePlannedCharactersOnFallback: boolean;
};

function normalizeCanonStatus(raw: unknown, sourceLabel?: string): CanonStatus {
  if (raw == null) return "established";
  if (typeof raw !== "string") {
    console.warn(`[canon_status] Invalid non-string canon_status${sourceLabel ? ` in ${sourceLabel}` : ""}; defaulting to "established".`);
    return "established";
  }

  const normalized = raw.trim().toLowerCase();
  if (normalized === "") return "established";
  if (normalized === "planned" || normalized === "deprecated" || normalized === "established") return normalized;

  console.warn(`[canon_status] Invalid canon_status "${raw}"${sourceLabel ? ` in ${sourceLabel}` : ""}; defaulting to "established".`);
  return "established";
}

function asNonEmptyString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim().length > 0 ? raw.trim() : null;
}

function buildPlannedRuleInfo(args: {
  id: string | null;
  category: string | null;
  constraintType: string | null;
  rule: string;
}): PlannedRuleInfo {
  const plannedRuleInfo: PlannedRuleInfo = { canon_status: "planned", rule: args.rule };
  if (args.id) plannedRuleInfo.id = args.id;
  if (args.category) plannedRuleInfo.category = args.category;
  if (args.constraintType) plannedRuleInfo.constraint_type = args.constraintType;
  return plannedRuleInfo;
}

async function loadRuleLifecycleContext(rootDir: string): Promise<RuleLifecycleContext> {
  const empty: RuleLifecycleContext = { hardRulesList: [], plannedRulesInfo: [], degraded: false };
  const rulesAbs = join(rootDir, "world/rules.json");
  if (!(await pathExists(rulesAbs))) return empty;

  try {
    const raw = await readJsonFile(rulesAbs);
    if (!isPlainObject(raw)) return { ...empty, degraded: true };
    const rules = raw.rules;
    if (!Array.isArray(rules)) return { ...empty, degraded: true };

    const hardRulesList: string[] = [];
    const plannedRulesInfo: PlannedRuleInfo[] = [];

    for (const item of rules) {
      if (!isPlainObject(item)) continue;
      const rule = asNonEmptyString(item.rule);
      if (!rule) continue;

      const status = normalizeCanonStatus(item.canon_status, `${relative(rootDir, rulesAbs)}${typeof item.id === "string" ? `#${item.id}` : ""}`);
      const id = asNonEmptyString(item.id);
      const category = asNonEmptyString(item.category);
      const constraintType = asNonEmptyString(item.constraint_type);

      if (status === "planned") {
        plannedRulesInfo.push(buildPlannedRuleInfo({ id, category, constraintType, rule }));
        continue;
      }

      if (status === "deprecated") continue;
      if (constraintType !== "hard") continue;
      hardRulesList.push(id ? `${id}: ${rule}` : rule);
    }

    return { hardRulesList, plannedRulesInfo, degraded: false };
  } catch {
    return { ...empty, degraded: true };
  }
}

function selectFallbackCharacterCandidates(candidates: CharacterCandidate[], options: CharacterContextOptions): CharacterCandidate[] {
  const nonDeprecatedCandidates = candidates.filter((candidate) => candidate.canonStatus !== "deprecated");
  if (!options.includePlannedCharacters) {
    return nonDeprecatedCandidates.filter((candidate) => candidate.canonStatus !== "planned").slice(0, 15);
  }
  if (!options.prioritizePlannedOnFallback) return nonDeprecatedCandidates.slice(0, 15);

  const plannedCandidates = nonDeprecatedCandidates.filter((candidate) => candidate.canonStatus === "planned");
  const activeCandidates = nonDeprecatedCandidates.filter((candidate) => candidate.canonStatus !== "planned");
  // Fallback uses a shared 15-slot budget across active + planned candidates.
  // Planned entries go first so future-facing foreshadowing survives truncation;
  // explicit chapter-contract matches bypass this fallback path entirely.
  return [...plannedCandidates, ...activeCandidates].slice(0, 15);
}

async function loadExistingCharacterProfiles(rootDir: string, candidates: CharacterCandidate[]): Promise<string[]> {
  const pathsOrNull = await Promise.all(
    candidates.map(async (candidate) => ((await pathExists(join(rootDir, candidate.mdRel))) ? candidate.mdRel : null))
  );
  return pathsOrNull.filter((path): path is string => path !== null);
}

async function loadCharacterContext(args: {
  rootDir: string;
  chapterContractRel: string;
  options: CharacterContextOptions;
}): Promise<CharacterContext> {
  const empty: CharacterContext = {
    activeCharacterContracts: [],
    activeCharacterProfiles: [],
    plannedCharacterContracts: [],
    plannedCharacterProfiles: []
  };
  const charsDirRel = "characters/active";
  const charsDirAbs = join(args.rootDir, charsDirRel);
  if (!(await pathExists(charsDirAbs))) return empty;

  const desiredRefs = new Set<string>();
  const contractAbs = join(args.rootDir, args.chapterContractRel);
  if (await pathExists(contractAbs)) {
    try {
      const raw = await readJsonFile(contractAbs);
      if (isPlainObject(raw)) {
        const preconditions = isPlainObject(raw.preconditions) ? raw.preconditions : null;
        const characterStates = preconditions && isPlainObject(preconditions.character_states) ? preconditions.character_states : null;
        if (characterStates) {
          for (const key of Object.keys(characterStates)) {
            const normalized = key.trim().toLowerCase();
            if (normalized.length > 0) desiredRefs.add(normalized);
          }
        }
      }
    } catch {
      // Ignore malformed chapter contracts here; validateStep remains the source of truth.
    }
  }

  try {
    const entries = await readdir(charsDirAbs, { withFileTypes: true });
    const candidates: CharacterCandidate[] = [];
    const hasDesiredRefs = desiredRefs.size > 0;

    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
      const jsonRel = `${charsDirRel}/${entry.name}`;
      try {
        const raw = await readJsonFile(join(args.rootDir, jsonRel));
        if (!isPlainObject(raw)) continue;
        const id = asNonEmptyString(raw.id) ?? entry.name.replace(/\.json$/u, "");
        const displayName = asNonEmptyString(raw.display_name) ?? id;
        const canonStatus = normalizeCanonStatus(raw.canon_status, jsonRel);
        const matched = hasDesiredRefs && (desiredRefs.has(id.toLowerCase()) || desiredRefs.has(displayName.toLowerCase()));
        candidates.push({
          id,
          displayName,
          canonStatus,
          jsonRel,
          mdRel: `${charsDirRel}/${entry.name.replace(/\.json$/u, '.md')}`,
          matched
        });
      } catch {
        continue;
      }
    }

    candidates.sort((left, right) => left.jsonRel.localeCompare(right.jsonRel));
    const preferred = hasDesiredRefs
      ? candidates.filter(
          (candidate) =>
            candidate.matched &&
            candidate.canonStatus !== "deprecated" &&
            (args.options.includePlannedCharacters || candidate.canonStatus !== "planned")
        )
      : [];
    const selectedCandidates = preferred.length > 0 ? preferred : selectFallbackCharacterCandidates(candidates, args.options);
    const activeCandidates = selectedCandidates.filter((candidate) => candidate.canonStatus !== "planned");
    const plannedCandidates = args.options.includePlannedCharacters
      ? selectedCandidates.filter((candidate) => candidate.canonStatus === "planned")
      : [];
    const [activeCharacterProfiles, plannedCharacterProfiles] = await Promise.all([
      loadExistingCharacterProfiles(args.rootDir, activeCandidates),
      loadExistingCharacterProfiles(args.rootDir, plannedCandidates)
    ]);

    return {
      activeCharacterContracts: activeCandidates.map((candidate) => candidate.jsonRel),
      activeCharacterProfiles,
      plannedCharacterContracts: plannedCandidates.map((candidate) => candidate.jsonRel),
      plannedCharacterProfiles
    };
  } catch {
    return empty;
  }
}

async function attachCanonStatusContext(args: {
  rootDir: string;
  chapterContractRel: string;
  inline: Record<string, unknown>;
  paths: Record<string, unknown>;
  options: CanonStatusContextOptions;
}): Promise<void> {
  const ruleLifecycle = await loadRuleLifecycleContext(args.rootDir);
  args.inline.hard_rules_list = ruleLifecycle.hardRulesList;
  if (ruleLifecycle.degraded) args.inline.world_rules_context_degraded = true;
  if (args.options.includePlannedRulesInfo && ruleLifecycle.plannedRulesInfo.length > 0) {
    args.inline.planned_rules_info = ruleLifecycle.plannedRulesInfo;
  }

  const characterContext = await loadCharacterContext({
    rootDir: args.rootDir,
    chapterContractRel: args.chapterContractRel,
    options: {
      includePlannedCharacters: args.options.includePlannedCharacters,
      prioritizePlannedOnFallback: args.options.prioritizePlannedCharactersOnFallback
    }
  });

  if (characterContext.activeCharacterContracts.length > 0) args.paths.character_contracts = characterContext.activeCharacterContracts;
  if (characterContext.activeCharacterProfiles.length > 0) args.paths.character_profiles = characterContext.activeCharacterProfiles;
  if (args.options.includePlannedCharacters && characterContext.plannedCharacterContracts.length > 0) {
    args.paths.planned_character_contracts = characterContext.plannedCharacterContracts;
  }
  if (args.options.includePlannedCharacters && characterContext.plannedCharacterProfiles.length > 0) {
    args.paths.planned_character_profiles = characterContext.plannedCharacterProfiles;
  }
}

async function buildReviewInstructionPacket(args: BuildArgs): Promise<Record<string, unknown>> {
  const stepId = formatStepId(args.step);
  if (args.step.kind !== "review") throw new NovelCliError(`Unsupported review step: ${stepId}`, 2);
  const step = args.step;

  const volume = args.checkpoint.current_volume;

  const embedMode = safeEmbedMode(args.embedMode);
  const embed: Record<string, unknown> = {};
  if (embedMode === "brief") {
    const briefAbs = join(args.rootDir, "brief.md");
    if (await pathExists(briefAbs)) {
      const content = await readTextFile(briefAbs);
      embed.brief_preview = content.slice(0, 2000);
    } else {
      embed.brief_preview = null;
    }
  }

  const commonPaths: Record<string, unknown> = {};
  const maybeAddPath = async (target: Record<string, unknown>, key: string, relPath: string): Promise<void> => {
    const absPath = join(args.rootDir, relPath);
    if (await pathExists(absPath)) target[key] = relPath;
  };

  await maybeAddPath(commonPaths, "project_brief", "brief.md");
  await maybeAddPath(commonPaths, "style_profile", "style-profile.json");
  await maybeAddPath(commonPaths, "platform_profile", "platform-profile.json");
  await maybeAddPath(commonPaths, "quality_rubric", "skills/novel-writing/references/quality-rubric.md");
  await maybeAddPath(commonPaths, "foreshadowing_global", "foreshadowing/global.json");
  await maybeAddPath(commonPaths, "storylines", "storylines/storylines.json");

  const volumeOutlineRel = `volumes/vol-${pad2(volume)}/outline.md`;
  if (await pathExists(join(args.rootDir, volumeOutlineRel))) commonPaths.volume_outline = volumeOutlineRel;

  // Resolve chapter range: prefer volume contracts/outline, fallback to last 10 chapters.
  const endChapter = args.checkpoint.last_completed_chapter;
  const resolvedRange =
    (await tryResolveVolumeChapterRange({ rootDir: args.rootDir, volume })) ??
    (Number.isInteger(endChapter) && endChapter >= 1 ? { start: Math.max(1, endChapter - 9), end: endChapter } : null);
  if (!resolvedRange) {
    throw new NovelCliError(`Cannot resolve volume review chapter_range (last_completed_chapter=${String(endChapter)}).`, 2);
  }

  const inline: Record<string, unknown> = { volume, chapter_range: [resolvedRange.start, resolvedRange.end] };
  const paths: Record<string, unknown> = { ...commonPaths };
  const expected_outputs: InstructionPacket["expected_outputs"] = [];
  const next_actions: InstructionPacket["next_actions"] = [];

  let agent: InstructionPacket["agent"];

  if (step.phase === "collect") {
    agent = { kind: "cli", name: "volume-review" };
    paths.quality_summary = VOL_REVIEW_RELS.qualitySummary;
    expected_outputs.push({ path: VOL_REVIEW_RELS.qualitySummary, required: true });
    next_actions.push({ kind: "command", command: `novel volume-review collect` });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.phase === "audit") {
    agent = { kind: "subagent", name: "consistency-auditor" };
    inline.scope = "volume_end";
    inline.stride = 5;
    inline.window = 10;

    // Attach inputs expected by the ConsistencyAuditor agent.
    const chapterPaths: string[] = [];
    const contractPaths: string[] = [];
    for (let chapter = resolvedRange.start; chapter <= resolvedRange.end; chapter++) {
      const chapterRel = `chapters/chapter-${pad3(chapter)}.md`;
      if (await pathExists(join(args.rootDir, chapterRel))) chapterPaths.push(chapterRel);
      const contractRel = `volumes/vol-${pad2(volume)}/chapter-contracts/chapter-${pad3(chapter)}.json`;
      if (await pathExists(join(args.rootDir, contractRel))) contractPaths.push(contractRel);
    }
    paths.chapters = chapterPaths;
    if (contractPaths.length > 0) paths.chapter_contracts = contractPaths;

    await maybeAddPath(paths, "storyline_spec", "storylines/storyline-spec.json");
    await maybeAddPath(paths, "storyline_schedule", `volumes/vol-${pad2(volume)}/storyline-schedule.json`);
    await maybeAddPath(paths, "state_current", "state/current-state.json");
    await maybeAddPath(paths, "state_changelog", "state/changelog.jsonl");

    // Best-effort: include active character contracts.
    const charsDirRel = "characters/active";
    const charsDirAbs = join(args.rootDir, charsDirRel);
    if (await pathExists(charsDirAbs)) {
      try {
        const entries = await readdir(charsDirAbs, { withFileTypes: true });
        const rels = entries
          .filter((e) => e.isFile() && e.name.endsWith(".json"))
          .map((e) => `${charsDirRel}/${e.name}`)
          .sort();
        if (rels.length > 0) paths.characters_active = rels;
      } catch {
        inline.characters_active_degraded = true;
      }
    }

    // Optional: pass quality summary to auditor.
    if (await pathExists(join(args.rootDir, VOL_REVIEW_RELS.qualitySummary))) {
      paths.quality_summary = VOL_REVIEW_RELS.qualitySummary;
    }

    expected_outputs.push({
      path: VOL_REVIEW_RELS.auditReport,
      required: true,
      note: "ConsistencyAuditor returns JSON; the executor should write it to this path."
    });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.phase === "report") {
    agent = { kind: "cli", name: "volume-review" };
    paths.quality_summary = VOL_REVIEW_RELS.qualitySummary;
    paths.audit_report = VOL_REVIEW_RELS.auditReport;
    expected_outputs.push({ path: VOL_REVIEW_RELS.reviewReport, required: true });
    next_actions.push({ kind: "command", command: `novel volume-review report` });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.phase === "cleanup") {
    agent = { kind: "cli", name: "volume-review" };
    expected_outputs.push({ path: VOL_REVIEW_RELS.foreshadowStatus, required: true });
    next_actions.push({ kind: "command", command: `novel volume-review cleanup` });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.phase === "transition") {
    agent = { kind: "cli", name: "novel" };
    expected_outputs.push({
      path: "(checkpoint)",
      required: true,
      note: "Advance updates .checkpoint.json: current_volume++, orchestrator_state=WRITING, and clears staging/vol-review/."
    });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else {
    const _exhaustive: never = step.phase;
    throw new NovelCliError(`Unsupported review phase: ${String(_exhaustive)}`, 2);
  }

  const packet: InstructionPacket = {
    version: 1,
    step: stepId,
    agent,
    manifest: {
      mode: embedMode === "off" ? "paths" : "paths+embed",
      inline,
      paths,
      ...(embedMode === "off" ? {} : { embed })
    },
    expected_outputs,
    next_actions
  };

  let writtenPath: string | null = null;
  if (args.writeManifest) {
    const manifestsDir = join(args.rootDir, "staging/manifests");
    await ensureDir(manifestsDir);
    const fileName = `${stepId.replaceAll(":", "-")}.packet.json`;
    writtenPath = `staging/manifests/${fileName}`;
    await writeJsonFile(join(args.rootDir, writtenPath), packet);
  }

  return {
    packet,
    ...(writtenPath ? { written_manifest_path: writtenPath } : {})
  };
}

async function buildQuickStartInstructionPacket(args: BuildArgs): Promise<Record<string, unknown>> {
  const stepId = formatStepId(args.step);
  if (args.step.kind !== "quickstart") throw new NovelCliError(`Unsupported quickstart step: ${stepId}`, 2);
  const step = args.step;

  const embedMode = safeEmbedMode(args.embedMode);
  const embed: Record<string, unknown> = {};
  if (embedMode === "brief") {
    const briefAbs = join(args.rootDir, "brief.md");
    if (await pathExists(briefAbs)) {
      const content = await readTextFile(briefAbs);
      embed.brief_preview = content.slice(0, 2000);
    } else {
      embed.brief_preview = null;
    }
  }

  const trialChapter = Math.max(1, args.checkpoint.last_completed_chapter + 1);
  const isTrialMode = step.phase === "trial" || step.phase === "results";
  const inline: Record<string, unknown> = {
    quickstart_phase: step.phase,
    trial_mode: isTrialMode,
    volume: args.checkpoint.current_volume,
    ...(isTrialMode ? { chapter: trialChapter } : {})
  };

  const paths: Record<string, unknown> = {};

  const maybeAddPath = async (key: string, relPath: string): Promise<void> => {
    const absPath = join(args.rootDir, relPath);
    if (await pathExists(absPath)) paths[key] = relPath;
  };

  await maybeAddPath("project_brief", "brief.md");
  await maybeAddPath("platform_profile", "platform-profile.json");
  await maybeAddPath("platform_writing_guide", "platform-writing-guide.md");
  await maybeAddPath("style_guide", "skills/novel-writing/references/style-guide.md");
  await maybeAddPath("style_profile_template", "style-profile.json");

  // Attach staging quickstart artifacts when present (for resume/debug).
  await maybeAddPath("quickstart_rules", QUICKSTART_STAGING_RELS.rulesJson);
  await maybeAddPath("quickstart_contracts_dir", QUICKSTART_STAGING_RELS.contractsDir);
  await maybeAddPath("quickstart_style_profile", QUICKSTART_STAGING_RELS.styleProfileJson);
  await maybeAddPath("quickstart_trial_chapter", QUICKSTART_STAGING_RELS.trialChapterMd);
  await maybeAddPath("quickstart_evaluation", QUICKSTART_STAGING_RELS.evaluationJson);

  const asString = (value: unknown): string | null => (typeof value === "string" ? value : null);

  const qsRules = asString(paths.quickstart_rules);
  const qsContractsDir = asString(paths.quickstart_contracts_dir);
  const qsStyleProfile = asString(paths.quickstart_style_profile);
  const qsTrialChapter = asString(paths.quickstart_trial_chapter);
  const styleTemplate = asString(paths.style_profile_template);

  // Provide canonical manifest keys in addition to quickstart-scoped aliases.
  if (qsRules) paths.world_rules = qsRules;
  if (qsContractsDir) paths.character_contracts_dir = qsContractsDir;
  if (qsStyleProfile) paths.style_profile = qsStyleProfile;
  else if (styleTemplate) paths.style_profile = styleTemplate;
  if (qsTrialChapter) paths.chapter_draft = qsTrialChapter;

  let agent: InstructionPacket["agent"];
  const expected_outputs: InstructionPacket["expected_outputs"] = [];
  const next_actions: InstructionPacket["next_actions"] = [];

  if (step.phase === "world") {
    agent = { kind: "subagent", name: "world-builder" };
    expected_outputs.push({ path: QUICKSTART_STAGING_RELS.rulesJson, required: true });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "Compute next deterministic step (skips already-generated artifacts)." });
    next_actions.push({
      kind: "command",
      command: `novel instructions quickstart:characters --json`,
      note: "After advance, proceed to create initial characters/contracts."
    });
  } else if (step.phase === "characters") {
    agent = { kind: "subagent", name: "character-weaver" };
    inline.contracts_output_dir = QUICKSTART_STAGING_RELS.contractsDir;
    expected_outputs.push({
      path: QUICKSTART_STAGING_RELS.contractsDir,
      required: true,
      note: "Write at least 1 character contract JSON under this dir."
    });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "Compute next deterministic step (skips already-generated artifacts)." });
    next_actions.push({ kind: "command", command: `novel instructions quickstart:style --json`, note: "After advance, proceed to style extraction." });
  } else if (step.phase === "style") {
    agent = { kind: "subagent", name: "style-analyzer" };
    expected_outputs.push({ path: QUICKSTART_STAGING_RELS.styleProfileJson, required: true });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "Compute next deterministic step (skips already-generated artifacts)." });
    next_actions.push({ kind: "command", command: `novel instructions quickstart:trial --json`, note: "After advance, proceed to trial chapter." });
  } else if (step.phase === "trial") {
    agent = { kind: "subagent", name: "chapter-writer" };
    expected_outputs.push({ path: QUICKSTART_STAGING_RELS.trialChapterMd, required: true });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "Compute next deterministic step (skips already-generated artifacts)." });
    next_actions.push({ kind: "command", command: `novel instructions quickstart:results --json`, note: "After advance, evaluate trial results." });
  } else if (step.phase === "results") {
    agent = { kind: "subagent", name: "quality-judge" };
    const loadedPlatform = await loadPlatformProfile(args.rootDir);
    if (loadedPlatform?.profile.scoring) {
      const loadedWeights = await loadGenreWeightProfiles(args.rootDir);
      if (!loadedWeights) {
        throw new NovelCliError(
          "Missing required file: genre-weight-profiles.json (required when platform-profile.json.scoring is present). Copy it from templates/genre-weight-profiles.json.",
          2
        );
      }
      inline.scoring_weights = {
        ...computeEffectiveScoringWeights({
          config: loadedWeights.config,
          scoring: loadedPlatform.profile.scoring,
          hookPolicy: loadedPlatform.profile.hook_policy,
          platformId: loadedPlatform.profile.platform
        }),
        source: { platform_profile: loadedPlatform.relPath, genre_weight_profiles: loadedWeights.relPath }
      };
    }
    if (loadedPlatform && trialChapter <= 3) {
      const loadedGoldenGates = await loadGoldenChapterGates(args.rootDir);
      if (loadedGoldenGates) {
        const selectedGoldenGates = selectGoldenChapterGatesForPlatform({
          config: loadedGoldenGates.config,
          platformId: loadedPlatform.profile.platform,
          chapter: trialChapter
        });
        if (selectedGoldenGates) {
          inline.golden_chapter_gates = {
            ...selectedGoldenGates,
            source: loadedGoldenGates.relPath
          };
        }
      }
    }
    expected_outputs.push({
      path: QUICKSTART_STAGING_RELS.evaluationJson,
      required: true,
      note: "QualityJudge returns JSON; the executor should write it to this path."
    });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "After advance, the pipeline transitions to VOL_PLANNING." });
  } else {
    const _exhaustive: never = step.phase;
    throw new NovelCliError(`Unsupported quickstart phase: ${String(_exhaustive)}`, 2);
  }

  const gate = args.novelAskGate ?? null;
  const gateSpec = gate ? parseNovelAskQuestionSpec(gate.novel_ask) : null;
  if (gate) {
    resolveProjectRelativePath(args.rootDir, gate.answer_path, "novelAskGate.answer_path");
    expected_outputs.unshift({
      path: gate.answer_path,
      required: true,
      note: "AnswerSpec JSON record for the NOVEL_ASK gate (written before main step execution)."
    });
  }

  const packet: InstructionPacket = {
    version: 1,
    step: stepId,
    agent,
    ...(gate ? { novel_ask: gateSpec as NovelAskQuestionSpec, answer_path: gate.answer_path } : {}),
    manifest: {
      mode: embedMode === "off" ? "paths" : "paths+embed",
      inline,
      paths,
      ...(embedMode === "off" ? {} : { embed })
    },
    expected_outputs,
    next_actions
  };

  let writtenPath: string | null = null;
  if (args.writeManifest) {
    const manifestsDir = join(args.rootDir, "staging/manifests");
    await ensureDir(manifestsDir);
    const fileName = `${stepId.replaceAll(":", "-")}.packet.json`;
    writtenPath = `staging/manifests/${fileName}`;
    await writeJsonFile(join(args.rootDir, writtenPath), packet);
  }

  return {
    packet,
    ...(writtenPath ? { written_manifest_path: writtenPath } : {})
  };
}

export async function buildInstructionPacket(args: BuildArgs): Promise<Record<string, unknown>> {
  const stepId = formatStepId(args.step);
  if (args.step.kind === "review") {
    if (args.novelAskGate) {
      throw new NovelCliError(`NOVEL_ASK gate is not supported for review steps: ${stepId}`, 2);
    }
    return await buildReviewInstructionPacket(args);
  }
  if (args.step.kind === "quickstart") return await buildQuickStartInstructionPacket(args);
  if (args.step.kind === "volume") {
    const step = args.step;
    const volume = args.checkpoint.current_volume;
    const range = computeVolumeChapterRange({ current_volume: volume, last_completed_chapter: args.checkpoint.last_completed_chapter });

    const embedMode = safeEmbedMode(args.embedMode);
    const embed: Record<string, unknown> = {};
    if (embedMode === "brief") {
      const briefAbs = join(args.rootDir, "brief.md");
      if (await pathExists(briefAbs)) {
        const content = await readTextFile(briefAbs);
        embed.brief_preview = content.slice(0, 2000);
      } else {
        embed.brief_preview = null;
      }
    }

    const inline: Record<string, unknown> = {
      volume,
      volume_plan: { volume, chapter_range: [range.start, range.end] }
    };

    const paths: Record<string, unknown> = {};

    const maybeAddPath = async (key: string, relPath: string): Promise<void> => {
      const absPath = join(args.rootDir, relPath);
      if (await pathExists(absPath)) paths[key] = relPath;
    };

    await maybeAddPath("project_brief", "brief.md");
    await maybeAddPath("style_profile", "style-profile.json");
    await maybeAddPath("platform_profile", "platform-profile.json");
    await maybeAddPath("genre_weight_profiles", "genre-weight-profiles.json");
    await maybeAddPath("style_guide", "skills/novel-writing/references/style-guide.md");
    await maybeAddPath("quality_rubric", "skills/novel-writing/references/quality-rubric.md");
    await maybeAddPath("storylines", "storylines/storylines.json");
    await maybeAddPath("world_rules", "world/rules.json");
    await maybeAddPath("global_foreshadowing", "foreshadowing/global.json");

    if (volume > 1) {
      await maybeAddPath("prev_volume_review", `volumes/vol-${pad2(volume - 1)}/review.md`);
    }

    const worldDirAbs = join(args.rootDir, "world");
    if (await pathExists(worldDirAbs)) paths.world_docs = "world/*.md";
    const charsDirAbs = join(args.rootDir, "characters/active");
    if (await pathExists(charsDirAbs)) {
      paths.characters_md = "characters/active/*.md";
      paths.characters_contracts = "characters/active/*.json";
    }

    let agent: InstructionPacket["agent"];
    const expected_outputs: InstructionPacket["expected_outputs"] = [];
    const next_actions: InstructionPacket["next_actions"] = [];

    const staging = volumeStagingRelPaths(volume);
    const final = volumeFinalRelPaths(volume);

    const addPlanningOutputs = (base: typeof staging): void => {
      expected_outputs.push({ path: base.outlineMd, required: true });
      expected_outputs.push({ path: base.storylineScheduleJson, required: true });
      expected_outputs.push({ path: base.foreshadowingJson, required: true });
      expected_outputs.push({ path: base.newCharactersJson, required: true });
      for (let ch = range.start; ch <= range.end; ch++) {
        expected_outputs.push({ path: base.chapterContractJson(ch), required: true });
      }
    };

    if (step.phase === "outline") {
      agent = { kind: "subagent", name: "plot-architect" };
      inline.expected_outputs_base_dir = staging.dir;
      addPlanningOutputs(staging);
      next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
      next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
      next_actions.push({ kind: "command", command: `novel instructions volume:validate --json`, note: "After advance, proceed to validate/approve." });
    } else if (step.phase === "validate") {
      agent = { kind: "cli", name: "manual-review" };
      inline.review_targets = {
        outline: staging.outlineMd,
        storyline_schedule: staging.storylineScheduleJson,
        foreshadowing: staging.foreshadowingJson,
        new_characters: staging.newCharactersJson,
        chapter_contracts_dir: staging.chapterContractsDir
      };
      addPlanningOutputs(staging);
      next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
      next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
      next_actions.push({ kind: "command", command: `novel instructions volume:commit --json`, note: "After approval, proceed to commit." });
    } else if (step.phase === "commit") {
      agent = { kind: "cli", name: "novel" };
      inline.commit_from = staging.dir;
      inline.commit_to = final.dir;
      addPlanningOutputs(final);
      next_actions.push({ kind: "command", command: `novel commit --volume ${volume}` });
      next_actions.push({ kind: "command", command: `novel next`, note: "After commit, resume the writing pipeline." });
    } else {
      const _exhaustive: never = step.phase;
      throw new NovelCliError(`Unsupported volume phase: ${_exhaustive}`, 2);
    }

    const gate = args.novelAskGate ?? null;
    const gateSpec = gate ? parseNovelAskQuestionSpec(gate.novel_ask) : null;
    if (gate) {
      resolveProjectRelativePath(args.rootDir, gate.answer_path, "novelAskGate.answer_path");
      expected_outputs.unshift({
        path: gate.answer_path,
        required: true,
        note: "AnswerSpec JSON record for the NOVEL_ASK gate (written before main step execution)."
      });
    }

    const packet: InstructionPacket = {
      version: 1,
      step: stepId,
      agent,
      ...(gate ? { novel_ask: gateSpec as NovelAskQuestionSpec, answer_path: gate.answer_path } : {}),
      manifest: {
        mode: embedMode === "off" ? "paths" : "paths+embed",
        inline,
        paths,
        ...(embedMode === "off" ? {} : { embed })
      },
      expected_outputs,
      next_actions
    };

    let writtenPath: string | null = null;
    if (args.writeManifest) {
      const manifestsDir = join(args.rootDir, "staging/manifests");
      await ensureDir(manifestsDir);
      const fileName = `${stepId.replaceAll(":", "-")}.packet.json`;
      writtenPath = `staging/manifests/${fileName}`;
      await writeJsonFile(join(args.rootDir, writtenPath), packet);
    }

    return {
      packet,
      ...(writtenPath ? { written_manifest_path: writtenPath } : {})
    };
  }


  if (args.step.kind !== "chapter") throw new NovelCliError(`Unsupported step: ${stepId}`, 2);
  const step = args.step;

  const volume = args.checkpoint.current_volume;
  const volumeOutlineRel = `volumes/vol-${pad2(volume)}/outline.md`;
  const chapterContractRel = `volumes/vol-${pad2(volume)}/chapter-contracts/chapter-${String(step.chapter).padStart(3, "0")}.json`;

  const rel = chapterRelPaths(step.chapter);

  const commonPaths: Record<string, unknown> = {};

  const maybeAddPath = async (target: Record<string, unknown>, key: string, relPath: string): Promise<void> => {
    const absPath = join(args.rootDir, relPath);
    if (await pathExists(absPath)) target[key] = relPath;
  };

  await maybeAddPath(commonPaths, "project_brief", "brief.md");
  await maybeAddPath(commonPaths, "style_profile", "style-profile.json");
  await maybeAddPath(commonPaths, "platform_profile", "platform-profile.json");
  await maybeAddPath(commonPaths, "platform_writing_guide", "platform-writing-guide.md");
  await maybeAddPath(commonPaths, "ai_blacklist", "ai-blacklist.json");
  await maybeAddPath(commonPaths, "web_novel_cliche_lint", "web-novel-cliche-lint.json");
  await maybeAddPath(commonPaths, "genre_weight_profiles", "genre-weight-profiles.json");
  await maybeAddPath(commonPaths, "style_guide", "skills/novel-writing/references/style-guide.md");
  await maybeAddPath(commonPaths, "quality_rubric", "skills/novel-writing/references/quality-rubric.md");
  await maybeAddPath(commonPaths, "current_state", "state/current-state.json");
  await maybeAddPath(commonPaths, "world_rules", "world/rules.json");
  await maybeAddPath(commonPaths, "character_voice_profiles", "character-voice-profiles.json");
  await maybeAddPath(commonPaths, "character_voice_drift", "character-voice-drift.json");

  // Optional: volume outline and chapter contract.
  if (await pathExists(join(args.rootDir, volumeOutlineRel))) commonPaths.volume_outline = volumeOutlineRel;
  if (await pathExists(join(args.rootDir, chapterContractRel))) commonPaths.chapter_contract = chapterContractRel;

  const embedMode = safeEmbedMode(args.embedMode);
  const embed: Record<string, unknown> = {};
  if (embedMode === "brief") {
    const briefAbs = join(args.rootDir, "brief.md");
    if (await pathExists(briefAbs)) {
      const content = await readTextFile(briefAbs);
      embed.brief_preview = content.slice(0, 2000);
    } else {
      embed.brief_preview = null;
    }
  }

  let agent: InstructionPacket["agent"];
  const inline: Record<string, unknown> = { chapter: step.chapter, volume };
  const paths: Record<string, unknown> = { ...commonPaths };
  const expected_outputs: InstructionPacket["expected_outputs"] = [];
  const next_actions: InstructionPacket["next_actions"] = [];

  const maybeAttachCharacterVoiceDirectives = async (): Promise<void> => {
    const driftAbs = join(args.rootDir, "character-voice-drift.json");
    if (!(await pathExists(driftAbs))) return;
    try {
      const raw = await readJsonFile(driftAbs);
      if (!isPlainObject(raw)) {
        inline.character_voice_drift_degraded = true;
        return;
      }
      const obj = raw as Record<string, unknown>;
      if (obj.schema_version !== 1) return;
      const charsRaw = obj.characters;
      if (!Array.isArray(charsRaw)) return;

      const safeInt = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : null);
      const asOf = isPlainObject(obj.as_of) ? (obj.as_of as Record<string, unknown>) : null;
      const window = isPlainObject(obj.window) ? (obj.window as Record<string, unknown>) : null;

      const directives = charsRaw
        .filter(isPlainObject)
        .map((it) => {
          const character_id = typeof it.character_id === "string" && it.character_id.trim().length > 0 ? it.character_id.trim() : null;
          if (!character_id) return null;
          const display_name = typeof it.display_name === "string" && it.display_name.trim().length > 0 ? it.display_name.trim() : character_id;
          const rawDirectives = (it as Record<string, unknown>).directives;
          const lines = Array.isArray(rawDirectives)
            ? rawDirectives.filter((d) => typeof d === "string" && d.trim().length > 0).map((d) => d.trim())
            : [];
          if (lines.length === 0) return null;
          return { character_id, display_name, directives: lines };
        })
        .filter((it): it is { character_id: string; display_name: string; directives: string[] } => it !== null);

      if (directives.length === 0) return;

      inline.character_voice_drift = {
        as_of: asOf ? { chapter: safeInt(asOf.chapter), volume: safeInt(asOf.volume) } : null,
        window: window
          ? { chapter_start: safeInt(window.chapter_start), chapter_end: safeInt(window.chapter_end), window_chapters: safeInt(window.window_chapters) }
          : null,
        directives
      };
    } catch {
      inline.character_voice_drift_degraded = true;
    }
  };

  const maybeAttachNarrativeHealthSummaries = async (): Promise<void> => {
    const engagementLatestAbs = join(args.rootDir, "logs/engagement/latest.json");
    if (await pathExists(engagementLatestAbs)) {
      const summary = await loadEngagementLatestSummary(args.rootDir);
      if (summary) inline.engagement_report_summary = summary;
      else inline.engagement_report_summary_degraded = true;
    }

    const promiseLatestAbs = join(args.rootDir, "logs/promises/latest.json");
    if (await pathExists(promiseLatestAbs)) {
      const summary = await loadPromiseLedgerLatestSummary(args.rootDir);
      if (summary) inline.promise_ledger_report_summary = summary;
      else inline.promise_ledger_report_summary_degraded = true;
    }
  };

  if (step.stage === "draft") {
    agent = { kind: "subagent", name: "chapter-writer" };
    // Optional: inject character voice drift directives (best-effort).
    await maybeAttachCharacterVoiceDirectives();
    // Optional: include narrative health source files (best-effort).
    await maybeAddPath(paths, "promise_ledger", "promise-ledger.json");
    await maybeAddPath(paths, "engagement_metrics", "engagement-metrics.jsonl");
    await maybeAddPath(paths, "engagement_report_latest", "logs/engagement/latest.json");
    await maybeAddPath(paths, "promise_ledger_report_latest", "logs/promises/latest.json");
    // Optional: inject compact narrative health summaries (best-effort).
    try {
      await maybeAttachNarrativeHealthSummaries();
    } catch {
      inline.engagement_report_summary_degraded = true;
      inline.promise_ledger_report_summary_degraded = true;
    }

    await attachCanonStatusContext({
      rootDir: args.rootDir,
      chapterContractRel,
      inline,
      paths,
      options: {
        includePlannedRulesInfo: true,
        includePlannedCharacters: true,
        prioritizePlannedCharactersOnFallback: true
      }
    });

    // Optional: inject non-spoiler light-touch reminders for dormant foreshadowing items (best-effort).
    try {
      const loadedPlatform = await loadPlatformProfile(args.rootDir).catch(() => null);
      const platform = loadedPlatform?.profile.platform ?? null;
      const genreDriveType = typeof loadedPlatform?.profile.scoring?.genre_drive_type === "string" ? loadedPlatform.profile.scoring.genre_drive_type : null;

      const items = await loadForeshadowGlobalItems(args.rootDir);
      const report = computeForeshadowVisibilityReport({
        items,
        asOfChapter: step.chapter,
        volume,
        platform,
        genreDriveType
      });
      const tasks = report.dormant_items.slice(0, 5).map((it) => ({
        id: it.id,
        scope: it.scope,
        status: it.status,
        chapters_since_last_update: it.chapters_since_last_update,
        instruction: it.writing_task
      }));
      if (tasks.length > 0) inline.foreshadow_light_touch_tasks = tasks;
    } catch {
      inline.foreshadow_light_touch_degraded = true;
    }
    expected_outputs.push({ path: rel.staging.chapterMd, required: true });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({
      kind: "command",
      command: `novel instructions chapter:${String(step.chapter).padStart(3, "0")}:summarize --json`,
      note: "After advance, proceed to summarize."
    });
  } else if (step.stage === "summarize") {
    agent = { kind: "subagent", name: "summarizer" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    expected_outputs.push({ path: rel.staging.summaryMd, required: true });
    expected_outputs.push({ path: rel.staging.deltaJson, required: true });
    expected_outputs.push({ path: rel.staging.crossrefJson, required: true });
    expected_outputs.push({ path: "staging/storylines/{storyline_id}/memory.md", required: true, note: "storyline_id comes from delta.json" });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.stage === "refine") {
    agent = { kind: "subagent", name: "style-refiner" };
    // Optional: inject character voice drift directives (best-effort).
    await maybeAttachCharacterVoiceDirectives();
    // Optional: include narrative health source files (best-effort).
    await maybeAddPath(paths, "promise_ledger", "promise-ledger.json");
    await maybeAddPath(paths, "engagement_metrics", "engagement-metrics.jsonl");
    await maybeAddPath(paths, "engagement_report_latest", "logs/engagement/latest.json");
    await maybeAddPath(paths, "promise_ledger_report_latest", "logs/promises/latest.json");
    // Optional: inject compact narrative health summaries (best-effort).
    try {
      await maybeAttachNarrativeHealthSummaries();
    } catch {
      inline.engagement_report_summary_degraded = true;
      inline.promise_ledger_report_summary_degraded = true;
    }
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    expected_outputs.push({ path: rel.staging.chapterMd, required: true });
    expected_outputs.push({ path: rel.staging.styleRefinerChangesJson, required: false });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (step.stage === "judge") {
    agent = { kind: "subagent", name: "quality-judge" };
    const chapterDraftRel = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    paths.chapter_draft = chapterDraftRel;
    paths.cross_references = relIfExists(rel.staging.crossrefJson, await pathExists(join(args.rootDir, rel.staging.crossrefJson)));

    await attachCanonStatusContext({
      rootDir: args.rootDir,
      chapterContractRel,
      inline,
      paths,
      options: {
        includePlannedRulesInfo: false,
        includePlannedCharacters: false,
        prioritizePlannedCharactersOnFallback: false
      }
    });

    const loadedPlatform = await loadPlatformProfile(args.rootDir);
    if (loadedPlatform?.profile.scoring) {
      const loadedWeights = await loadGenreWeightProfiles(args.rootDir);
      if (!loadedWeights) {
        throw new NovelCliError(
          "Missing required file: genre-weight-profiles.json (required when platform-profile.json.scoring is present). Copy it from templates/genre-weight-profiles.json.",
          2
        );
      }
      const effective = computeEffectiveScoringWeights({
        config: loadedWeights.config,
        scoring: loadedPlatform.profile.scoring,
        hookPolicy: loadedPlatform.profile.hook_policy,
        platformId: loadedPlatform.profile.platform
      });
      inline.scoring_weights = {
        ...effective,
        source: { platform_profile: loadedPlatform.relPath, genre_weight_profiles: loadedWeights.relPath }
      };
    }

    if (loadedPlatform && step.chapter <= 3) {
      const loadedGoldenGates = await loadGoldenChapterGates(args.rootDir);
      if (loadedGoldenGates) {
        const selectedGoldenGates = selectGoldenChapterGatesForPlatform({
          config: loadedGoldenGates.config,
          platformId: loadedPlatform.profile.platform,
          chapter: step.chapter
        });
        if (selectedGoldenGates) {
          inline.golden_chapter_gates = {
            ...selectedGoldenGates,
            source: loadedGoldenGates.relPath
          };
        }
      }
    }

    // Optional: inject compact continuity summary for LS-001 evidence (non-blocking).
    inline.continuity_report_summary = await loadContinuityLatestSummary(args.rootDir);
    inline.excitement_type = await loadChapterExcitementType({ rootDir: args.rootDir, volume, chapter: step.chapter });

    // Optional: pre-judge guardrails report (title/readability/naming). Non-blocking here; gate engine decides.
    inline.prejudge_guardrails = null;
    if (loadedPlatform && chapterDraftRel) {
      try {
        const report = await computePrejudgeGuardrailsReport({
          rootDir: args.rootDir,
          chapter: step.chapter,
          chapterAbsPath: join(args.rootDir, chapterDraftRel),
          platformProfileRelPath: loadedPlatform.relPath,
          platformProfile: loadedPlatform.profile
        });
        const { relPath } = await writePrejudgeGuardrailsReport({ rootDir: args.rootDir, chapter: step.chapter, report });
        paths.prejudge_guardrails = relPath;
        inline.prejudge_guardrails = {
          status: report.status,
          has_blocking_issues: report.has_blocking_issues,
          blocking_reasons: report.blocking_reasons,
          report_path: relPath
        };
      } catch {
        inline.prejudge_guardrails_degraded = true;
      }
    }

    expected_outputs.push({
      path: rel.staging.evalJson,
      required: true,
      note: "QualityJudge returns JSON; the executor should write it to this path."
    });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({
      kind: "command",
      command: `novel next`,
      note: "After advance, compute the next deterministic step (may be title-fix/hook-fix/review/commit)."
    });
  } else if (step.stage === "title-fix") {
    agent = { kind: "subagent", name: "chapter-writer" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    inline.fix_mode = "title-fix";

    const loadedPlatform = await loadPlatformProfile(args.rootDir);
    if (!loadedPlatform) throw new NovelCliError("Missing required file: platform-profile.json (required for title-fix).", 2);
    const titlePolicy = loadedPlatform.profile.retention?.title_policy ?? null;
    if (!titlePolicy) {
      throw new NovelCliError("platform-profile.json.retention.title_policy is required for title-fix.", 2);
    }

    // Snapshot the chapter before title-fix so validate can ensure body is byte-identical.
    const beforeAbs = join(args.rootDir, rel.staging.chapterMd);
    const before = await readTextFile(beforeAbs);
    const snapshotRel = titleFixSnapshotRel(step.chapter);
    await writeTextFileIfMissing(join(args.rootDir, snapshotRel), before);
    paths.title_fix_before = snapshotRel;

    const report = computeTitlePolicyReport({ chapter: step.chapter, chapterText: before, platformProfile: loadedPlatform.profile });
    inline.title_policy = {
      enabled: titlePolicy.enabled,
      min_chars: titlePolicy.min_chars,
      max_chars: titlePolicy.max_chars,
      forbidden_patterns: titlePolicy.forbidden_patterns,
      required_patterns: titlePolicy.required_patterns ?? null,
      auto_fix: titlePolicy.auto_fix
    };
    inline.title_policy_report = {
      status: report.status,
      issues: report.issues.slice(0, 5)
    };

    inline.required_fixes = [
      {
        target: "chapter_title",
        instruction:
          "执行 title-fix：只修改章节 Markdown 的标题行（第一个非空行必须是 H1：`# ...`）。禁止改动正文任何字符（CLI 会校验 body byte-identical）。标题需满足 platform-profile.json.retention.title_policy 的长度与正则规则，且不得包含 compliance.banned_words。避免剧透，保留悬念与吸引力。"
      }
    ];

    expected_outputs.push({ path: rel.staging.chapterMd, required: true, note: "Overwrite chapter draft with title-only fix (body must remain unchanged)." });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({
      kind: "command",
      command: `novel next`,
      note: "After title-fix, compute the next deterministic step (typically judge)."
    });
  } else if (step.stage === "hook-fix") {
    agent = { kind: "subagent", name: "chapter-writer" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    paths.chapter_eval = relIfExists(rel.staging.evalJson, await pathExists(join(args.rootDir, rel.staging.evalJson)));
    inline.fix_mode = "hook-fix";
    inline.required_fixes = [
      {
        target: "chapter_end",
        instruction:
          "执行 hook-fix：在不改变前文既定事件/信息的前提下，只改最后 1–2 段（或末尾 ~10%），补强章末钩子（读者面对面悬念/威胁/反转/情绪 cliff/下一目标承诺）。钩子类型需遵守 platform-profile.json.hook_policy.allowed_types，目标 hook_strength >= platform-profile.json.hook_policy.min_strength。禁止新增关键设定/新命名角色/新地点，尽量不影响 state/crossref。",
      }
    ];
    expected_outputs.push({ path: rel.staging.chapterMd, required: true, note: "Overwrite chapter draft with ending-only hook fix." });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
    next_actions.push({
      kind: "command",
      command: `novel instructions chapter:${String(step.chapter).padStart(3, "0")}:judge --json`,
      note: "After hook-fix, re-run QualityJudge to refresh eval."
    });
  } else if (step.stage === "review") {
    agent = { kind: "cli", name: "manual-review" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    paths.chapter_eval = relIfExists(rel.staging.evalJson, await pathExists(join(args.rootDir, rel.staging.evalJson)));
    expected_outputs.push({ path: "(manual)", required: false, note: "Review required: guardrails still failing after bounded auto-fix." });
    next_actions.push({
      kind: "command",
      command: `novel instructions chapter:${String(step.chapter).padStart(3, "0")}:judge --json`,
      note: "After manually fixing the chapter (title/hook/etc), re-run QualityJudge."
    });
  } else if (step.stage === "commit") {
    agent = { kind: "cli", name: "novel" };
    expected_outputs.push({ path: `chapters/chapter-${String(step.chapter).padStart(3, "0")}.md`, required: true });
    next_actions.push({ kind: "command", command: `novel commit --chapter ${step.chapter}` });
    next_actions.push({ kind: "command", command: `novel next`, note: "After commit, compute next step." });
  } else {
    throw new NovelCliError(`Unsupported step stage: ${step.stage}`, 2);
  }

  const gate = args.novelAskGate ?? null;
  const gateSpec = gate ? parseNovelAskQuestionSpec(gate.novel_ask) : null;
  if (gate) {
    resolveProjectRelativePath(args.rootDir, gate.answer_path, "novelAskGate.answer_path");
    expected_outputs.unshift({
      path: gate.answer_path,
      required: true,
      note: "AnswerSpec JSON record for the NOVEL_ASK gate (written before main step execution)."
    });
  }

  const packet: InstructionPacket = {
    version: 1,
    step: stepId,
    agent,
    ...(gate ? { novel_ask: gateSpec as NovelAskQuestionSpec, answer_path: gate.answer_path } : {}),
    manifest: {
      mode: embedMode === "off" ? "paths" : "paths+embed",
      inline,
      paths,
      ...(embedMode === "off" ? {} : { embed })
    },
    expected_outputs,
    next_actions
  };

  let writtenPath: string | null = null;
  if (args.writeManifest) {
    const manifestsDir = join(args.rootDir, "staging/manifests");
    await ensureDir(manifestsDir);
    const fileName = `${stepId.replaceAll(":", "-")}.packet.json`;
    writtenPath = `staging/manifests/${fileName}`;
    await writeJsonFile(join(args.rootDir, writtenPath), packet);
  }

  return {
    packet,
    ...(writtenPath ? { written_manifest_path: writtenPath } : {})
  };
}
