#!/usr/bin/env bash
#
# Deterministic structural anti-AI linter (issue 139).
#
# Usage:
#   lint-structural.sh <chapter.md> [--genre <genre>] [--config <override.json>]
#
# Output:
#   stdout JSON (exit 0 on success)

set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: lint-structural.sh <chapter.md> [--genre <genre>] [--config <override.json>]" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "lint-structural.sh: python3 is required but not found" >&2
  exit 2
fi

python3 - "$@" <<'PY'
import json
import re
import sys
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

GENRE_ALIASES = {
    "科幻": "sci-fi",
    "sci-fi": "sci-fi",
    "scifi": "sci-fi",
    "science-fiction": "sci-fi",
    "悬疑": "mystery",
    "mystery": "mystery",
    "suspense": "mystery",
    "恐怖": "horror",
    "horror": "horror",
    "言情": "romance",
    "romance": "romance",
}

DEFAULT_THRESHOLDS: Dict[str, Any] = {
    "l2": {
        "window_chars": 300,
        "emphasis_words": ["极其", "非常", "十分", "无比"],
        "emphasis_max": 2,
        "adjective_max": 6,
        "adjective_words": [
            "冰冷", "漆黑", "沉重", "压抑", "潮湿", "苍白", "急促", "阴冷", "炽热", "巨大",
            "明亮", "耀眼", "温柔", "优雅", "柔弱", "安静", "模糊", "疲惫", "猩红", "刺骨",
        ],
    },
    "l3": {
        "window_chars": 500,
        "idiom_max": 3,
        "paragraph_max": 2,
        "idioms": [
            "心潮澎湃", "热血沸腾", "激动万分", "波澜壮阔", "惊心动魄", "风起云涌", "不寒而栗", "毛骨悚然",
            "心有余悸", "心惊肉跳", "怒火中烧", "屏住呼吸", "若无其事", "若有所思", "目不转睛", "跌宕起伏",
        ],
    },
    "l5": {
        "single_sentence_ratio": [0.25, 0.45],
        "paragraph_char_max": 100,
        "similar_paragraph_delta": 10,
        "similar_paragraph_run": 3,
    },
    "l6": {
        "ellipsis_per_paragraph_max": 1,
        "ellipsis_per_chapter_max": 5,
        "exclamation_per_paragraph_max": 1,
        "exclamation_per_chapter_max": 8,
        "em_dash_per_chapter_max": 0,
    },
}

GENRE_OVERRIDES: Dict[str, Dict[str, Any]] = {
    "sci-fi": {
        "l5": {"single_sentence_ratio": [0.15, 0.30], "paragraph_char_max": 120},
        "l6": {"exclamation_per_chapter_max": 5},
    },
    "mystery": {
        "l5": {"single_sentence_ratio": [0.20, 0.35], "paragraph_char_max": 100},
        "l6": {"ellipsis_per_chapter_max": 8},
    },
    "horror": {
        "l5": {"single_sentence_ratio": [0.30, 0.50]},
        "l6": {"ellipsis_per_chapter_max": 8},
    },
    "romance": {},
}


def die(message: str, code: int = 1) -> None:
    sys.stderr.write(message.rstrip() + "\n")
    raise SystemExit(code)


def deep_merge(base: Dict[str, Any], update: Dict[str, Any]) -> Dict[str, Any]:
    out = json.loads(json.dumps(base, ensure_ascii=False))
    for key, value in update.items():
        if isinstance(value, dict) and isinstance(out.get(key), dict):
            out[key] = deep_merge(out[key], value)
        else:
            out[key] = value
    return out


def normalize_genre(raw: str) -> Optional[str]:
    if not raw:
        return None
    value = raw.strip()
    return GENRE_ALIASES.get(value) or GENRE_ALIASES.get(value.lower())


def parse_args(argv: List[str]) -> Tuple[str, Optional[str], Optional[str]]:
    chapter_path = argv[1]
    genre = None
    config_path = None
    index = 2
    while index < len(argv):
        token = argv[index]
        if token == "--genre":
            index += 1
            if index >= len(argv):
                die("lint-structural.sh: --genre requires a value", 1)
            genre = normalize_genre(argv[index])
            if genre is None:
                die(f"lint-structural.sh: unsupported genre override '{argv[index]}'", 1)
        elif token == "--config":
            index += 1
            if index >= len(argv):
                die("lint-structural.sh: --config requires a value", 1)
            config_path = argv[index]
        else:
            die(f"lint-structural.sh: unknown argument '{token}'", 1)
        index += 1
    return chapter_path, genre, config_path


def load_text(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return handle.read()
    except FileNotFoundError:
        die(f"lint-structural.sh: chapter file not found: {path}", 1)
    except Exception as exc:
        die(f"lint-structural.sh: failed to read chapter: {exc}", 1)


def load_config(path: str) -> Dict[str, Any]:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError:
        die(f"lint-structural.sh: config file not found: {path}", 1)
    except Exception as exc:
        die(f"lint-structural.sh: invalid JSON at {path}: {exc}", 1)
    if not isinstance(data, dict):
        die("lint-structural.sh: config JSON must be an object", 1)
    return data


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def compact_chars(text: str) -> int:
    return len(re.sub(r"\s+", "", text))


def split_paragraphs(text: str) -> List[Tuple[int, int, int, str]]:
    lines = text.replace("\r", "").split("\n")
    paragraphs: List[Tuple[int, int, int, str]] = []
    buffer: List[str] = []
    start_line = 1
    char_offset = 0
    start_char = 0
    for line_no, line in enumerate(lines, start=1):
        raw_line = line
        line = line.strip()
        line_len = len(raw_line) + 1
        if not line:
            if buffer:
                paragraph = "\n".join(buffer).strip()
                if paragraph and not paragraph.startswith("#"):
                    paragraphs.append((start_line, start_char, start_char + len(paragraph), paragraph))
                buffer = []
            char_offset += line_len
            start_line = line_no + 1
            start_char = char_offset
            continue
        if not buffer:
            start_line = line_no
            start_char = char_offset
        buffer.append(raw_line)
        char_offset += line_len
    if buffer:
        paragraph = "\n".join(buffer).strip()
        if paragraph and not paragraph.startswith("#"):
            paragraphs.append((start_line, start_char, start_char + len(paragraph), paragraph))
    return paragraphs


def sentence_count(paragraph: str) -> int:
    parts = [part for part in re.split(r"[。！？!?]+(?:[”」』])*", paragraph) if part.strip()]
    return max(len(parts), 1)


def chunks(text: str, size: int) -> List[Tuple[int, str]]:
    compact = re.sub(r"\s+", "", text)
    return [(idx, compact[idx:idx + size]) for idx in range(0, len(compact), size) if compact[idx:idx + size]]


def add_violation(violations: List[Dict[str, Any]], rule_id: str, severity: str, line: int, char_start: int, char_end: int, description: str, suggestion: str) -> None:
    violations.append({
        "rule_id": rule_id,
        "severity": severity,
        "location": {"line": max(line, 1), "char_start": max(char_start, 0), "char_end": max(char_end, 0)},
        "description": description,
        "suggestion": suggestion,
    })


def main() -> None:
    chapter_path, genre, config_path = parse_args(sys.argv)
    thresholds = deep_merge(DEFAULT_THRESHOLDS, GENRE_OVERRIDES.get(genre or "", {}))
    if config_path:
        config = load_config(config_path)
        thresholds = deep_merge(thresholds, config.get("thresholds", config))

    text = load_text(chapter_path)
    compact_text = re.sub(r"\s+", "", text)
    paragraphs = split_paragraphs(text)
    violations: List[Dict[str, Any]] = []

    # L2 adjective/adverb density
    for offset, chunk_text in chunks(text, int(thresholds["l2"]["window_chars"])):
        emphasis = sum(chunk_text.count(word) for word in thresholds["l2"]["emphasis_words"])
        adjectives = sum(chunk_text.count(word) for word in thresholds["l2"]["adjective_words"])
        if emphasis > int(thresholds["l2"]["emphasis_max"]):
            add_violation(
                violations,
                "L2.emphasis_density",
                "warning",
                1,
                offset,
                offset + len(chunk_text),
                f"300 字窗口内强调词 {emphasis} 个，超过上限 {thresholds['l2']['emphasis_max']}。",
                "删掉抽象加强词，改为具体动作、程度或感官反馈。",
            )
        if adjectives > int(thresholds["l2"]["adjective_max"]):
            add_violation(
                violations,
                "L2.adjective_density",
                "warning",
                1,
                offset,
                offset + len(chunk_text),
                f"300 字窗口内描述性修饰词命中 {adjectives} 次，超过上限 {thresholds['l2']['adjective_max']}。",
                "减少形容词/副词堆叠，把信息拆到动作和状态变化里。",
            )

    adjective_pattern = "|".join(sorted(thresholds["l2"]["adjective_words"], key=len, reverse=True))
    if adjective_pattern:
        for match in re.finditer(rf"(?:{adjective_pattern}){{2,}}的", compact_text):
            add_violation(
                violations,
                "L2.consecutive_adjectives",
                "error",
                1,
                match.start(),
                match.end(),
                "检测到连续两个以上形容词修饰同一名词。",
                "保留最有力的 1 个修饰词，其余改写成动作或结果。",
            )
    for match in re.finditer(r"[\u4e00-\u9fff]{1,6}的[\u4e00-\u9fff]{1,6}的[\u4e00-\u9fff]{1,6}", compact_text):
        add_violation(
            violations,
            "L2.de_chain",
            "warning",
            1,
            match.start(),
            match.end(),
            "检测到连续三段“的”字链。",
            "拆句或改写结构，避免“XX的XX的XX”连续套接。",
        )

    # L3 four-character idiom density
    idioms = thresholds["l3"]["idioms"]
    for offset, chunk_text in chunks(text, int(thresholds["l3"]["window_chars"])):
        idiom_count = sum(chunk_text.count(idiom) for idiom in idioms)
        if idiom_count > int(thresholds["l3"]["idiom_max"]):
            add_violation(
                violations,
                "L3.idiom_density",
                "warning",
                1,
                offset,
                offset + len(chunk_text),
                f"500 字窗口内四字词组命中 {idiom_count} 个，超过上限 {thresholds['l3']['idiom_max']}。",
                "减少套话式四字词组，优先保留 1 个最有力的表达。",
            )
    for index, (line_no, start_char, end_char, paragraph) in enumerate(paragraphs, start=1):
        paragraph_count = sum(paragraph.count(idiom) for idiom in idioms)
        if paragraph_count > int(thresholds["l3"]["paragraph_max"]):
            add_violation(
                violations,
                "L3.idiom_paragraph_density",
                "warning",
                line_no,
                start_char,
                end_char,
                f"第 {index} 段四字词组命中 {paragraph_count} 个，超过单段上限 {thresholds['l3']['paragraph_max']}。",
                "把四字词组拆散到动作、对白或感官细节里。",
            )
        if re.search(r"(?:" + "|".join(idioms) + r")(?:、|，|,)+(?:" + "|".join(idioms) + r")", paragraph):
            add_violation(
                violations,
                "L3.idiom_chain",
                "error",
                line_no,
                start_char,
                end_char,
                "检测到四字词组连续并列使用。",
                "只保留一个四字词组，其余改成具体动作、反应或后果。",
            )

    # L5 paragraph structure
    if paragraphs:
        ratio = sum(1 for _, _, _, paragraph in paragraphs if sentence_count(paragraph) == 1) / len(paragraphs)
        ratio_min, ratio_max = thresholds["l5"]["single_sentence_ratio"]
        if ratio < ratio_min or ratio > ratio_max:
            add_violation(
                violations,
                "L5.single_sentence_ratio",
                "warning",
                paragraphs[0][0],
                paragraphs[0][1],
                paragraphs[-1][2],
                f"单句段占比为 {ratio:.2%}，超出目标范围 {ratio_min:.0%}-{ratio_max:.0%}。",
                "交错安排单句段、短段和中段，避免整章呼吸节奏过于整齐。",
            )
        paragraph_char_max = int(thresholds["l5"]["paragraph_char_max"])
        for index, (line_no, start_char, end_char, paragraph) in enumerate(paragraphs, start=1):
            char_count = compact_chars(paragraph)
            if char_count > paragraph_char_max:
                add_violation(
                    violations,
                    "L5.paragraph_char_max",
                    "warning",
                    line_no,
                    start_char,
                    end_char,
                    f"第 {index} 段长度 {char_count} 字，超过上限 {paragraph_char_max}。",
                    "优先拆成 2 段，让信息在动作或对白处换气。",
                )
        run = int(thresholds["l5"].get("similar_paragraph_run", 3))
        delta = int(thresholds["l5"]["similar_paragraph_delta"])
        for start in range(0, max(len(paragraphs) - run + 1, 0)):
            window = paragraphs[start:start + run]
            lengths = [compact_chars(item[3]) for item in window]
            if max(lengths) - min(lengths) <= delta:
                add_violation(
                    violations,
                    "L5.similar_paragraph_lengths",
                    "warning",
                    window[0][0],
                    window[0][1],
                    window[-1][2],
                    f"连续 {run} 段长度过于接近（{lengths}，允许波动 ±{delta} 字）。",
                    "主动拉开长短段差异，制造“长-短-短-长”的呼吸感。",
                )
                break

    # L6 punctuation rhythm
    ellipsis_count = len(re.findall(r"……", text))
    exclamation_count = text.count("！")
    em_dash_count = len(re.findall(r"——", text))
    if ellipsis_count > int(thresholds["l6"]["ellipsis_per_chapter_max"]):
        add_violation(
            violations,
            "L6.ellipsis_per_chapter",
            "warning",
            1,
            0,
            len(text),
            f"全章省略号 {ellipsis_count} 个，超过上限 {thresholds['l6']['ellipsis_per_chapter_max']}。",
            "删掉情绪占位式省略号，改用停顿描写或断句。",
        )
    if exclamation_count > int(thresholds["l6"]["exclamation_per_chapter_max"]):
        add_violation(
            violations,
            "L6.exclamation_per_chapter",
            "warning",
            1,
            0,
            len(text),
            f"全章感叹号 {exclamation_count} 个，超过上限 {thresholds['l6']['exclamation_per_chapter_max']}。",
            "减少感叹号，改用动作、语气和句式变化传达情绪强度。",
        )
    if em_dash_count > int(thresholds["l6"]["em_dash_per_chapter_max"]):
        add_violation(
            violations,
            "L6.em_dash_per_chapter",
            "warning",
            1,
            0,
            len(text),
            f"全章破折号 {em_dash_count} 个，超过上限 {thresholds['l6']['em_dash_per_chapter_max']}。",
            "把破折号改成逗号、句号、省略号或重组句式。",
        )
    for index, (line_no, start_char, end_char, paragraph) in enumerate(paragraphs, start=1):
        ellipsis = len(re.findall(r"……", paragraph))
        exclamations = paragraph.count("！")
        if ellipsis > int(thresholds["l6"]["ellipsis_per_paragraph_max"]):
            add_violation(
                violations,
                "L6.ellipsis_per_paragraph",
                "warning",
                line_no,
                start_char,
                end_char,
                f"第 {index} 段省略号 {ellipsis} 个，超过单段上限 {thresholds['l6']['ellipsis_per_paragraph_max']}。",
                "同一段只保留 1 个省略号，其余改为停顿描写或断句。",
            )
        if exclamations > int(thresholds["l6"]["exclamation_per_paragraph_max"]):
            add_violation(
                violations,
                "L6.exclamation_per_paragraph",
                "warning",
                line_no,
                start_char,
                end_char,
                f"第 {index} 段感叹号 {exclamations} 个，超过单段上限 {thresholds['l6']['exclamation_per_paragraph_max']}。",
                "同一段只保留 1 个感叹号，把其他强度落到动作和语气上。",
            )
    for pattern, rule_id, label in [
        (r"(?:……+！|！+……)", "L6.mixed_ellipsis_exclamation", "省略号与感叹号连用"),
        (r"？？+", "L6.repeated_question_marks", "问号连用"),
        (r"！！+", "L6.repeated_exclamation_marks", "感叹号连用"),
    ]:
        for match in re.finditer(pattern, text):
            add_violation(
                violations,
                rule_id,
                "error",
                line_of(text, match.start()),
                match.start(),
                match.end(),
                f"检测到 {label}。",
                "删除重复/叠加标点，把节奏写回正文动作和句式。",
            )

    report = {
        "schema_version": 1,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "chapter_path": chapter_path,
        "genre": genre,
        "chapter_chars": len(compact_text),
        "thresholds": thresholds,
        "violations": violations,
        "summary": {
            "warning_count": sum(1 for item in violations if item["severity"] == "warning"),
            "error_count": sum(1 for item in violations if item["severity"] == "error"),
            "violation_count": len(violations),
            "total": len(violations),
        },
    }
    sys.stdout.write(json.dumps(report, ensure_ascii=False) + "\n")


try:
    main()
except SystemExit:
    raise
except Exception as exc:
    sys.stderr.write(f"lint-structural.sh: unexpected error: {exc}\n")
    raise SystemExit(2)
PY
