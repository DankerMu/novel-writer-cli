import { join } from "node:path";

import type { Checkpoint } from "./checkpoint.js";
import { NovelCliError } from "./errors.js";
import { ensureDir, pathExists, readJsonFile, readTextFile, writeJsonFile, writeTextFileIfMissing } from "./fs-utils.js";
import { loadContinuityLatestSummary } from "./consistency-auditor.js";
import { computeForeshadowVisibilityReport, loadForeshadowGlobalItems } from "./foreshadow-visibility.js";
import { computeEffectiveScoringWeights, loadGenreWeightProfiles } from "./scoring-weights.js";
import { parseNovelAskQuestionSpec, type NovelAskQuestionSpec } from "./novel-ask.js";
import { loadPlatformProfile } from "./platform-profile.js";
import { computePrejudgeGuardrailsReport, writePrejudgeGuardrailsReport } from "./prejudge-guardrails.js";
import { resolveProjectRelativePath } from "./safe-path.js";
import { computeTitlePolicyReport } from "./title-policy.js";
import { chapterRelPaths, formatStepId, pad2, titleFixSnapshotRel, type Step } from "./steps.js";
import { isPlainObject } from "./type-guards.js";

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

export async function buildInstructionPacket(args: BuildArgs): Promise<Record<string, unknown>> {
  const stepId = formatStepId(args.step);
  if (args.step.kind !== "chapter") throw new NovelCliError(`Unsupported step: ${stepId}`, 2);

  const volume = args.checkpoint.current_volume;
  const volumeOutlineRel = `volumes/vol-${pad2(volume)}/outline.md`;
  const chapterContractRel = `volumes/vol-${pad2(volume)}/chapter-contracts/chapter-${String(args.step.chapter).padStart(3, "0")}.json`;

  const rel = chapterRelPaths(args.step.chapter);

  const commonPaths: Record<string, unknown> = {};

  const maybeAdd = async (key: string, relPath: string): Promise<void> => {
    const absPath = join(args.rootDir, relPath);
    if (await pathExists(absPath)) commonPaths[key] = relPath;
  };

  await maybeAdd("project_brief", "brief.md");
  await maybeAdd("style_profile", "style-profile.json");
  await maybeAdd("platform_profile", "platform-profile.json");
  await maybeAdd("ai_blacklist", "ai-blacklist.json");
  await maybeAdd("web_novel_cliche_lint", "web-novel-cliche-lint.json");
  await maybeAdd("genre_weight_profiles", "genre-weight-profiles.json");
  await maybeAdd("style_guide", "skills/novel-writing/references/style-guide.md");
  await maybeAdd("quality_rubric", "skills/novel-writing/references/quality-rubric.md");
  await maybeAdd("current_state", "state/current-state.json");
  await maybeAdd("world_rules", "world/rules.json");
  await maybeAdd("character_voice_profiles", "character-voice-profiles.json");
  await maybeAdd("character_voice_drift", "character-voice-drift.json");

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
  const inline: Record<string, unknown> = { chapter: args.step.chapter, volume };
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

  if (args.step.stage === "draft") {
    agent = { kind: "subagent", name: "chapter-writer" };
    // Optional: inject character voice drift directives (best-effort).
    await maybeAttachCharacterVoiceDirectives();
    // Optional: inject non-spoiler light-touch reminders for dormant foreshadowing items (best-effort).
    try {
      const loadedPlatform = await loadPlatformProfile(args.rootDir).catch(() => null);
      const platform = loadedPlatform?.profile.platform ?? null;
      const genreDriveType = typeof loadedPlatform?.profile.scoring?.genre_drive_type === "string" ? loadedPlatform.profile.scoring.genre_drive_type : null;

      const items = await loadForeshadowGlobalItems(args.rootDir);
      const report = computeForeshadowVisibilityReport({
        items,
        asOfChapter: args.step.chapter,
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
      command: `novel instructions chapter:${String(args.step.chapter).padStart(3, "0")}:summarize --json`,
      note: "After advance, proceed to summarize."
    });
  } else if (args.step.stage === "summarize") {
    agent = { kind: "subagent", name: "summarizer" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    expected_outputs.push({ path: rel.staging.summaryMd, required: true });
    expected_outputs.push({ path: rel.staging.deltaJson, required: true });
    expected_outputs.push({ path: rel.staging.crossrefJson, required: true });
    expected_outputs.push({ path: "staging/storylines/{storyline_id}/memory.md", required: true, note: "storyline_id comes from delta.json" });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (args.step.stage === "refine") {
    agent = { kind: "subagent", name: "style-refiner" };
    // Optional: inject character voice drift directives (best-effort).
    await maybeAttachCharacterVoiceDirectives();
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    expected_outputs.push({ path: rel.staging.chapterMd, required: true });
    expected_outputs.push({ path: rel.staging.styleRefinerChangesJson, required: false });
    next_actions.push({ kind: "command", command: `novel validate ${stepId}` });
    next_actions.push({ kind: "command", command: `novel advance ${stepId}` });
  } else if (args.step.stage === "judge") {
    agent = { kind: "subagent", name: "quality-judge" };
    const chapterDraftRel = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    paths.chapter_draft = chapterDraftRel;
    paths.cross_references = relIfExists(rel.staging.crossrefJson, await pathExists(join(args.rootDir, rel.staging.crossrefJson)));

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
        hookPolicy: loadedPlatform.profile.hook_policy
      });
      inline.scoring_weights = {
        ...effective,
        source: { platform_profile: loadedPlatform.relPath, genre_weight_profiles: loadedWeights.relPath }
      };
    }

    // Optional: inject compact continuity summary for LS-001 evidence (non-blocking).
    inline.continuity_report_summary = await loadContinuityLatestSummary(args.rootDir);

    // Optional: pre-judge guardrails report (title/readability/naming). Non-blocking here; gate engine decides.
    inline.prejudge_guardrails = null;
    if (loadedPlatform && chapterDraftRel) {
      try {
        const report = await computePrejudgeGuardrailsReport({
          rootDir: args.rootDir,
          chapter: args.step.chapter,
          chapterAbsPath: join(args.rootDir, chapterDraftRel),
          platformProfileRelPath: loadedPlatform.relPath,
          platformProfile: loadedPlatform.profile
        });
        const { relPath } = await writePrejudgeGuardrailsReport({ rootDir: args.rootDir, chapter: args.step.chapter, report });
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
  } else if (args.step.stage === "title-fix") {
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
    const snapshotRel = titleFixSnapshotRel(args.step.chapter);
    await writeTextFileIfMissing(join(args.rootDir, snapshotRel), before);
    paths.title_fix_before = snapshotRel;

    const report = computeTitlePolicyReport({ chapter: args.step.chapter, chapterText: before, platformProfile: loadedPlatform.profile });
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
  } else if (args.step.stage === "hook-fix") {
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
      command: `novel instructions chapter:${String(args.step.chapter).padStart(3, "0")}:judge --json`,
      note: "After hook-fix, re-run QualityJudge to refresh eval."
    });
  } else if (args.step.stage === "review") {
    agent = { kind: "cli", name: "manual-review" };
    paths.chapter_draft = relIfExists(rel.staging.chapterMd, await pathExists(join(args.rootDir, rel.staging.chapterMd)));
    paths.chapter_eval = relIfExists(rel.staging.evalJson, await pathExists(join(args.rootDir, rel.staging.evalJson)));
    expected_outputs.push({ path: "(manual)", required: false, note: "Review required: guardrails still failing after bounded auto-fix." });
    next_actions.push({
      kind: "command",
      command: `novel instructions chapter:${String(args.step.chapter).padStart(3, "0")}:judge --json`,
      note: "After manually fixing the chapter (title/hook/etc), re-run QualityJudge."
    });
  } else if (args.step.stage === "commit") {
    agent = { kind: "cli", name: "novel" };
    expected_outputs.push({ path: `chapters/chapter-${String(args.step.chapter).padStart(3, "0")}.md`, required: true });
    next_actions.push({ kind: "command", command: `novel commit --chapter ${args.step.chapter}` });
  } else {
    throw new NovelCliError(`Unsupported step stage: ${(args.step as Step).stage}`, 2);
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
