import fs from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const inputs = {
  start: "skills/start/SKILL.md",
  continue: "skills/continue/SKILL.md",
  status: "skills/status/SKILL.md",
};

const outputPath = "docs/dr-workflow/novel-writer-tool/final/spec/02-skills.md";

async function readUtf8(relPath) {
  const absPath = resolve(repoRoot, relPath);
  const text = await fs.readFile(absPath, "utf8");
  return text.endsWith("\n") ? text : `${text}\n`;
}

const [startSkill, continueSkill, statusSkill] = await Promise.all([
  readUtf8(inputs.start),
  readUtf8(inputs.continue),
  readUtf8(inputs.status),
]);

const out = [
  "## 3. 入口 Skills",
  "",
  `> 说明：本页为入口 skill 文档的快照（便于 Tech Spec 自包含）。canonical 以 \`skills/**/SKILL.md\` 为准；修改 skill 后需同步更新此处（可用 \`node scripts/sync-final-spec-skills.mjs\` 生成）。`,
  "",
  "### 3.1 `/novel:start` — 启动适配层（Thin Adapter）",
  "",
  "## 文件路径：`skills/start/SKILL.md`",
  "",
  "````markdown",
  startSkill.trimEnd(),
  "````",
  "",
  "---",
  "",
  "### 3.2 `/novel:continue` — 续写适配层（Thin Adapter）",
  "",
  "## 文件路径：`skills/continue/SKILL.md`",
  "",
  "````markdown",
  continueSkill.trimEnd(),
  "````",
  "",
  "---",
  "",
  "### 3.3 `/novel:status` — 只读状态展示",
  "",
  "## 文件路径：`skills/status/SKILL.md`",
  "",
  "````markdown",
  statusSkill.trimEnd(),
  "````",
  "",
  "---",
  "",
].join("\n");

await fs.writeFile(resolve(repoRoot, outputPath), `${out}`, "utf8");
console.error(`Wrote ${relative(repoRoot, resolve(repoRoot, outputPath))}`);
