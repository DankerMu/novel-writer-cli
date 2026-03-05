import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { NovelCliError } from "./errors.js";
import { readJsonFile, readTextFile } from "./fs-utils.js";
import { QUICKSTART_STAGING_RELS } from "./quickstart.js";
import { isPlainObject } from "./type-guards.js";

function requireStringField(
  obj: Record<string, unknown>,
  field: string,
  file: string,
  opts?: { trim: boolean }
): string {
  const v = obj[field];
  if (typeof v !== "string" || (opts?.trim ? v.trim().length === 0 : v.length === 0)) {
    throw new NovelCliError(`Invalid ${file}: missing string field '${field}'.`, 2);
  }
  return v;
}

type ValidateQuickstartRulesSchemaOptions = {
  trimRequiredStrings?: boolean;
};

export async function validateQuickstartRulesSchema(absPath: string, options?: ValidateQuickstartRulesSchemaOptions): Promise<number> {
  const raw = await readJsonFile(absPath);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.rulesJson}: expected JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  const rules = obj.rules;
  if (!Array.isArray(rules)) throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.rulesJson}: missing 'rules' array.`, 2);
  const trimRequiredStrings = options?.trimRequiredStrings === true;
  for (const [idx, rule] of rules.entries()) {
    if (!isPlainObject(rule)) throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.rulesJson}: rules[${idx}] must be an object.`, 2);
    const r = rule as Record<string, unknown>;
    requireStringField(r, "id", QUICKSTART_STAGING_RELS.rulesJson, { trim: trimRequiredStrings });
    requireStringField(r, "category", QUICKSTART_STAGING_RELS.rulesJson, { trim: trimRequiredStrings });
    requireStringField(r, "rule", QUICKSTART_STAGING_RELS.rulesJson, { trim: trimRequiredStrings });
    const ct = requireStringField(r, "constraint_type", QUICKSTART_STAGING_RELS.rulesJson, { trim: false });
    if (ct !== "hard" && ct !== "soft") {
      throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.rulesJson}: rules[${idx}].constraint_type must be hard|soft.`, 2);
    }
    if (!Array.isArray(r.exceptions)) {
      throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.rulesJson}: rules[${idx}].exceptions must be an array.`, 2);
    }
  }
  return rules.length;
}

export async function listQuickstartContractJsonFiles(absContractsDir: string): Promise<string[]> {
  const entries = await readdir(absContractsDir, { withFileTypes: true });
  const jsonFiles = entries
    .filter((e) => e.isFile() && e.name.endsWith(".json"))
    .map((e) => e.name)
    .sort();
  if (jsonFiles.length === 0) {
    throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.contractsDir}: expected at least 1 *.json contract file.`, 2);
  }
  return jsonFiles;
}

export async function validateQuickstartContractJsonFiles(absContractsDir: string, jsonFiles: string[]): Promise<void> {
  for (const file of jsonFiles) {
    const raw = await readJsonFile(join(absContractsDir, file));
    if (!isPlainObject(raw)) {
      throw new NovelCliError(`Invalid contract JSON: ${QUICKSTART_STAGING_RELS.contractsDir}/${file} must be an object.`, 2);
    }
  }
}

export async function validateQuickstartContractsDir(absContractsDir: string): Promise<void> {
  const jsonFiles = await listQuickstartContractJsonFiles(absContractsDir);
  await validateQuickstartContractJsonFiles(absContractsDir, jsonFiles);
}

export async function validateQuickstartStyleProfileSchema(absPath: string): Promise<void> {
  const raw = await readJsonFile(absPath);
  if (!isPlainObject(raw)) throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.styleProfileJson}: expected JSON object.`, 2);
  const obj = raw as Record<string, unknown>;
  const sourceType = obj.source_type;
  if (typeof sourceType !== "string" || sourceType.trim().length === 0) {
    throw new NovelCliError(`Invalid ${QUICKSTART_STAGING_RELS.styleProfileJson}: source_type must be a non-empty string.`, 2);
  }
  if (sourceType !== "original" && sourceType !== "reference" && sourceType !== "template" && sourceType !== "write_then_extract") {
    throw new NovelCliError(
      `Invalid ${QUICKSTART_STAGING_RELS.styleProfileJson}: source_type must be one of: original, reference, template, write_then_extract.`,
      2
    );
  }
}

export async function validateQuickstartTrialChapter(absPath: string): Promise<string | null> {
  const text = await readTextFile(absPath);
  if (text.trim().length === 0) throw new NovelCliError(`Empty draft file: ${QUICKSTART_STAGING_RELS.trialChapterMd}`, 2);
  if (!text.trimStart().startsWith("#")) {
    return `Trial chapter does not start with a Markdown H1 (# ...): ${QUICKSTART_STAGING_RELS.trialChapterMd}`;
  }
  return null;
}
