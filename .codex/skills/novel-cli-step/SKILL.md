---
name: novel-cli-step
description: >
  Codex adapter: run ONE `novel` step via instruction packet (next → instructions → dispatch agent),
  then stop for human review (no auto-commit).
---

# Codex CLI 单步适配器

目标：把确定性编排交给 `novel` CLI，把执行交给 instruction packet 指定的 agent（subagent 或 CLI actions）；每步后都留断点给用户 review。

## 流程（单步）

前置：若 `dist/` 不存在，先执行：
```bash
npm ci
npm run build
```

注意：`data.packet.next_actions[]` 里的命令默认以 `novel ...` 形式给出。若当前环境没有安装 `novel` 二进制，请将每条命令的前缀 `novel` 替换为 `node dist/cli.js` 执行。

1) 计算下一步：
```bash
node dist/cli.js next --json
```
取 `data.step`（例如 `chapter:048:draft`）。

2) 生成 instruction packet（必须落盘，便于 gate 恢复/审计）：
```bash
node dist/cli.js instructions "<STEP>" --json --write-manifest
```
取：
- `data.packet`（InstructionPacket）
- `data.written_manifest_path`（packet JSON 路径）

3) **（可选）NOVEL_ASK gate：Plan Mode 优先，工具不可用则 JSON fallback**

如果 `data.packet` 同时包含：
- `novel_ask`（QuestionSpec）
- `answer_path`（project-relative）

则该 step 在执行 agent 之前 **必须** 先满足 gate：

**3.1 先检查是否已存在可用 AnswerSpec（可恢复语义）**

- 若 `answer_path` 已存在且能通过校验：直接继续执行 step
- 若缺失：进入提问采集
- 若存在但无效：停止并提示用户修复/删除该文件后重试（不得继续执行 step）

校验命令（会做 questionSpec↔answerSpec cross-validate）：
```bash
PACKET_JSON="<data.written_manifest_path>" node --input-type=module - <<'EOF'
import fs from "node:fs/promises";
import { extractNovelAskGate, loadNovelAskAnswerIfPresent } from "./dist/instruction-gates.js";

const packet = JSON.parse(await fs.readFile(process.env.PACKET_JSON, "utf8"));
const gate = extractNovelAskGate(packet);
if (!gate) process.exit(0);
const answer = await loadNovelAskAnswerIfPresent(process.cwd(), gate);
if (answer) {
  console.error("NOVEL_ASK gate: OK");
  process.exit(0);
}
console.error(`NOVEL_ASK gate: missing AnswerSpec at ${gate.answer_path}`);
process.exit(2);
EOF
```

**3.2 Plan Mode（推荐）：用 `request_user_input` 采集**

- `single_choice`：直接用 `request_user_input`（将 `default` 对应选项放到 options 第一项，并标注 Recommended）
- `multi_choice`：循环调用 `request_user_input`，每轮让用户 pick 1 个 option（外加一个保留 label `__done__` 的结束项；该项不写入 answers），累积为 string[]
  - required=true：必须至少选 1 个再选择 `__done__`，否则视为未回答（blocked）
  - required=false：若最终 0 选择，则**不要写入该 question id**（而不是写入空数组）
- `free_text`：改用下方 JSON fallback（保持语义，不做不可靠映射）
- 注意：UI 可能会自动提供 “Other” 自定义输入；若 question 未设置 `allow_other=true`，则校验会拒绝该输入，需要重新回答

采集完成后：将 answers 写入 `answer_path` 的 AnswerSpec（见 3.3 的“构造 + 写入 AnswerSpec”命令；仅替换其中的 `raw.answers` 为采集到的 answers 映射）。

**3.3 工具不可用：严格 JSON fallback**

向用户输出严格合约，让用户只回复一段 JSON（不要夹杂解释文字）：
```json
{
  "answers": {
    "question_id": "value",
    "multi_choice_id": ["a", "b"]
  }
}
```

然后由适配器构造并落盘 AnswerSpec（`answered_by="codex"`）：
```json
{
  "version": "<copied from QuestionSpec.version>",
  "topic": "<copied from QuestionSpec.topic>",
  "answers": { "...": "..." },
  "answered_at": "<ISO-8601>",
  "answered_by": "codex"
}
```

写入后再次运行 3.1 的校验命令（exit code 0 才算通过）；通过后才允许继续执行 step。

（建议）把 fallback JSON 先落盘为 `staging/novel-ask/answers.json`，再用以下命令构造 + 写入 AnswerSpec：
```bash
mkdir -p staging/novel-ask
PACKET_JSON="<data.written_manifest_path>" ANSWERS_JSON="staging/novel-ask/answers.json" node --input-type=module - <<'EOF'
import fs from "node:fs/promises";
import { dirname } from "node:path";
import { extractNovelAskGate, requireNovelAskAnswer } from "./dist/instruction-gates.js";
import { parseNovelAskAnswerSpec, validateNovelAskAnswerAgainstQuestionSpec } from "./dist/novel-ask.js";
import { resolveProjectRelativePath } from "./dist/safe-path.js";

const packet = JSON.parse(await fs.readFile(process.env.PACKET_JSON, "utf8"));
const gate = extractNovelAskGate(packet);
if (!gate) process.exit(0);

const raw = JSON.parse(await fs.readFile(process.env.ANSWERS_JSON, "utf8"));
if (typeof raw !== "object" || raw === null || Array.isArray(raw)) throw new Error("ANSWERS_JSON must be a JSON object.");
if (typeof raw.answers !== "object" || raw.answers === null || Array.isArray(raw.answers)) throw new Error("ANSWERS_JSON.answers must be an object.");

const answerSpec = parseNovelAskAnswerSpec({
  version: gate.novel_ask.version,
  topic: gate.novel_ask.topic,
  answers: raw.answers,
  answered_at: new Date().toISOString(),
  answered_by: "codex"
});
validateNovelAskAnswerAgainstQuestionSpec(gate.novel_ask, answerSpec);

const absAnswer = resolveProjectRelativePath(process.cwd(), gate.answer_path, "answer_path");
await fs.mkdir(dirname(absAnswer), { recursive: true });
await fs.writeFile(absAnswer, `${JSON.stringify(answerSpec, null, 2)}\n`, "utf8");
await requireNovelAskAnswer(process.cwd(), gate);
console.error(`NOVEL_ASK gate: wrote AnswerSpec to ${gate.answer_path}`);
EOF
```

4) 按 packet 执行（thin adapter：不做 stage→agent 映射）

从 `data.packet.agent` 读取执行方式：

- `agent.kind == "subagent"`：
  - 派发 `agent.name` 对应 subagent（例如 `plot-architect`/`world-builder`/`character-weaver`/`style-analyzer`/`chapter-writer`/`summarizer`/`style-refiner`/`quality-judge`/`consistency-auditor`）
  - 将 `data.packet.manifest`（JSON 原样）作为 context manifest 传入
  - 要求 subagent **只写入** `data.packet.expected_outputs[]` 指定路径（通常在 `staging/**`）
  - 若 subagent 返回结构化 JSON：执行器需将其写入 packet 指定的 JSON 输出路径（见 `expected_outputs.note`）

- `agent.kind == "cli"`：
  - 不派发 subagent
  - 逐条执行/提示 `data.packet.next_actions[]`（必要时将 `novel` 前缀替换为 `node dist/cli.js`）
  - 若 `agent.name == "manual-review"`：先让用户手动检查/确认，再继续执行后续 validate/advance
  - 若 `next_actions[]` 含 `novel commit ...`：本适配器不自动 commit，应停下并提示用户手动执行该命令

5) 执行 validate/advance（若适用）并返回控制权

优先遵循 `data.packet.next_actions[]`：

- 若包含 `novel validate ...`：执行它；失败则停止（不得 advance）
- 若包含 `novel advance ...`：仅在 validate 成功后执行
- 若不包含 validate/advance（常见于 `chapter:*:review` 或 `*:commit`）：直接停下并向用户展示 `next_actions[]` 作为下一步提示
