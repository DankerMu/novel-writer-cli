# `novel` CLI 单步适配器（Claude Code）

你是 Claude Code 的执行器适配层：你不做确定性编排逻辑，只调用 `novel` CLI 获取 step + instruction packet，然后按 packet 指定的 agent 执行（subagent 或 CLI actions），再执行 validate → advance（若适用），最后在断点处停下让用户 review。

## 运行约束

- **可用工具**：Bash, Task, Read, Write, Edit, Glob, Grep, AskUserQuestion
- **原则**：只跑 1 个 step；不自动 commit；执行完必须停下并提示用户下一步

## 标准 adapter loop（单步）

单步执行只做这一套固定循环（其余逻辑全部下沉到 CLI）：

1. `novel next --json`
2. `novel instructions "<STEP>" --json --write-manifest`
3. （可选）处理 `NOVEL_ASK` gate
4. 按 `packet.agent.kind/name` 执行（subagent 或 CLI actions）
5. `novel validate "<STEP>"`（若适用）
6. `novel advance "<STEP>"`（若适用）

## 执行流程

### Step 0: 前置检查

- 必须在小说项目目录内（存在 `.checkpoint.json`）
- 如不在项目目录：提示用户 `cd` 到项目根目录后重试
- 若 `dist/` 不存在：先执行 `npm ci && npm run build`

### Step 1: 计算下一步 step id

优先使用已安装的 `novel`：
```bash
novel next --json
```

若 `novel` 不在 PATH（开发态/未发布），使用仓库内 CLI：
```bash
node dist/cli.js next --json
```

解析 stdout 的单对象 JSON：取 `data.step` 得到类似 `chapter:048:draft` 的 step id。

### Step 2: 生成 instruction packet（并落盘 manifest）

```bash
novel instructions "<STEP_ID>" --json --write-manifest
```

同样解析 stdout JSON：取 `data.packet`（以及可选的 `data.written_manifest_path`）。
> 注意：若 packet 携带 `novel_ask` gate，后续需要读取 `data.written_manifest_path`（packet JSON 文件路径）用于校验与恢复；因此建议总是使用 `--write-manifest`。

### Step 3: （可选）NOVEL_ASK gate：AskUserQuestion 采集 + AnswerSpec 落盘

若 packet 同时包含：
- `novel_ask`（QuestionSpec）
- `answer_path`（project-relative）

则在派发 subagent 前必须先满足 gate：收集回答 → 写入 AnswerSpec → 校验通过后才继续。

#### Step 3.1: 检查是否已存在可用 AnswerSpec（可恢复语义）

若 `answer_path` 已存在且通过校验：直接进入 Step 4。

校验命令（会做 questionSpec↔answerSpec cross-validate；缺失则 exit 2）：
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

> 若 AnswerSpec 存在但无效：上述命令会报错并阻断；此时不得继续执行 step，应提示用户修复/删除该文件后重试。

#### Step 3.2: 用 AskUserQuestion 逐题采集 answers 映射

对 `novel_ask.questions[]` 按顺序提问，并构造 `answers: {[id]: value}`：

> AskUserQuestion 对 `options[]` 有硬限制（每次 2-4 个）。当 QuestionSpec 的 options 过多时，必须用“分页/循环”拆成多轮 AskUserQuestion，保证每轮 options 不超过上限。

- `single_choice`：
  - 若 `options.length <= 4`：直接 AskUserQuestion 单选；保存为 string（选项 label 或 allow_other 的自定义字符串）
  - 若 `options.length > 4`：分页展示（每页最多 3 个真实 option + 1 个控制项 `__more__`，`__more__` 不写入 answers；用户选到真实 option 才结束）
  - 若存在 `default`：把 default 对应的 option **排到当前页第一位**，并在 description 里标注 Recommended（不要修改 label，否则会导致校验不通过）
  - `allow_other=false` 风险：AskUserQuestion UI 可能提供 “Other” 自定义输入；若用户选择 Other 且输入不在 option labels 内，会被校验拒绝 → 需要重新提问直到得到合法答案

- `multi_choice`：循环 AskUserQuestion 单选累积为 string[]
  - 目标：每轮 `options[]` 总数 **不超过 4**（AskUserQuestion 限制）
  - 若当前“可选的真实 option”（排除已选项）`<= 3`：本轮直接展示 **全部真实 option + `__done__`**（不需要 `__more__`）
  - 若当前“可选的真实 option”`> 3`：分页展示（每页最多 **2 个真实 option + `__more__` + `__done__`**；控制项不写入 answers）
  - `__more__`：切换到下一页（循环）；仅在 options 过多时使用（`<=3` 时不需要）
  - `__done__`：结束选择并写入 answers
  - required=true：必须至少选 1 个再 `__done__`，否则视为未回答（blocked）
  - required=false：若最终 0 选择，则不要写入该 question id（不要写空数组）
  - `allow_other=false` 风险同上：若用户通过 Other 输入自定义值，会被校验拒绝，需要重新提问

- `free_text`：AskUserQuestion 本身是“选项式交互”，要采集自由文本需要依赖 UI 的 “Other” 输入（或退化为普通消息输入）
  - required=false：先 AskUserQuestion 让用户选 “Skip / Provide”；Skip 则不写入 answers；Provide 则让用户用 Other 输入文本（或在下一条消息直接粘贴文本）
  - required=true：AskUserQuestion 提示用户用 Other 输入文本（或在下一条消息直接粘贴文本），并将该文本写入 answers[id]

#### Step 3.3: 写入 AnswerSpec 到 answer_path，并校验通过

1) 将 answers 暂存到 `staging/novel-ask/answers.json`（结构：`{ "answers": { ... } }`）
2) 用下面命令构造 + 写入 AnswerSpec（`answered_by="claude_code"`），并二次校验：

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
  answered_by: "claude_code"
});
validateNovelAskAnswerAgainstQuestionSpec(gate.novel_ask, answerSpec);

const absAnswer = resolveProjectRelativePath(process.cwd(), gate.answer_path, "answer_path");
await fs.mkdir(dirname(absAnswer), { recursive: true });
await fs.writeFile(absAnswer, `${JSON.stringify(answerSpec, null, 2)}\n`, "utf8");
await requireNovelAskAnswer(process.cwd(), gate);
console.error(`NOVEL_ASK gate: wrote AnswerSpec to ${gate.answer_path}`);
EOF
```

通过后才允许继续派发 subagent。

### Step 4: 执行 step（按 packet 路由）

从 `packet.agent.kind` / `packet.agent.name` 决定如何执行：

#### 4.1 `packet.agent.kind == "subagent"`：派发 subagent

用 Task 派发 `packet.agent.name` 对应 subagent，并把 `packet.manifest` 作为 user message 的 **context manifest**（JSON 原样传入）。

要求 subagent：
- 只写入 `packet.expected_outputs[]` 指定路径（通常在 `staging/**`）
- 若 subagent 返回结构化 JSON：执行器需要将其写入 packet 指定的 JSON 输出路径（见 `expected_outputs.note`）
- 产出完成后停止，不要推进 checkpoint（validate/advance 由本适配器负责）

#### 4.2 `packet.agent.kind == "cli"`：执行/提示 CLI actions

不派发 subagent。按 `packet.next_actions[]` 执行/提示命令。

- 若 `packet.agent.name == "manual-review"`：先让用户手动检查 packet 提示的 review targets（常见于 `packet.manifest.inline.review_targets`），确认后才继续执行后续 validate/advance
- 若 `packet.next_actions[]` 含 `novel commit ...`：本适配器不自动 commit，应在 Step 5 直接停下并提示用户手动执行该命令

### Step 5: validate → advance → 返回控制权（必须）

执行完 Step 4 后：

1) 若 `packet.next_actions[]` 包含 `novel validate "<STEP_ID>"`：执行它
- 若 validate 失败（exit != 0）→ **立即停止**，提示用户修复产物后重试；不得 advance

2) 若 `packet.next_actions[]` 包含 `novel advance "<STEP_ID>"`：仅在 validate 成功后执行它

3) 若该 step 的 `packet.next_actions[]` 不包含 validate/advance（例如 `chapter:*:review` 或 `*:commit`）：
- 直接停下，向用户展示 `packet.next_actions[]`，并提示下一条可执行命令
