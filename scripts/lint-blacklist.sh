#!/usr/bin/env bash
#
# Deterministic AI-blacklist linter (M3+ extension point).
#
# Usage:
#   lint-blacklist.sh <chapter.md> <ai-blacklist.json>
#
# Output:
#   stdout JSON (exit 0 on success)
#
# Exit codes:
#   0 = success (valid JSON emitted to stdout)
#   1 = validation failure (bad args, missing files, invalid JSON/schema)
#   2 = script exception (unexpected runtime error)

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: lint-blacklist.sh <chapter.md> <ai-blacklist.json>" >&2
  exit 1
fi

chapter_path="$1"
blacklist_path="$2"

if [ ! -f "$chapter_path" ]; then
  echo "lint-blacklist.sh: chapter file not found: $chapter_path" >&2
  exit 1
fi

if [ ! -f "$blacklist_path" ]; then
  echo "lint-blacklist.sh: blacklist file not found: $blacklist_path" >&2
  exit 1
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "lint-blacklist.sh: python3 is required but not found" >&2
  exit 2
fi

python3 - "$chapter_path" "$blacklist_path" <<'PY'
import json
import re
import sys
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Set, Tuple


@dataclass
class WordEntry:
    word: str
    category: Optional[str]
    replacement_hint: Optional[str]
    per_chapter_max: Optional[int]
    context: Optional[str]


def _die(msg: str, exit_code: int = 1) -> None:
    sys.stderr.write(msg.rstrip() + "\n")
    raise SystemExit(exit_code)


def _load_json(path: str) -> Any:
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception as exc:
        _die(f"lint-blacklist.sh: invalid JSON at {path}: {exc}", 1)


def _as_str_list(value: Any) -> List[str]:
    if not isinstance(value, list):
        return []
    out: List[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            out.append(item.strip())
    return out


def _get_whitelist_words(blacklist: Dict[str, Any]) -> Set[str]:
    words: List[str] = []
    whitelist = blacklist.get("whitelist")
    if isinstance(whitelist, list):
        words.extend(_as_str_list(whitelist))
    elif isinstance(whitelist, dict):
        words.extend(_as_str_list(whitelist.get("words")))

    exemptions = blacklist.get("exemptions")
    if isinstance(exemptions, dict):
        words.extend(_as_str_list(exemptions.get("words")))

    return set(words)


def _collect_entries(blacklist: Dict[str, Any], whitelist: Set[str]) -> List[WordEntry]:
    category_metadata = blacklist.get("category_metadata") if isinstance(blacklist.get("category_metadata"), dict) else {}
    entries_by_word: Dict[str, WordEntry] = {}

    def register(entry: WordEntry) -> None:
        if not entry.word or entry.word in whitelist:
            return
        existing = entries_by_word.get(entry.word)
        if existing is None:
            entries_by_word[entry.word] = entry
            return
        # Prefer categorized entries because they carry richer metadata.
        if existing.category is None and entry.category is not None:
            entries_by_word[entry.word] = entry
            return
        replacement_hint = existing.replacement_hint or entry.replacement_hint
        per_chapter_max = existing.per_chapter_max if existing.per_chapter_max is not None else entry.per_chapter_max
        context = existing.context or entry.context
        entries_by_word[entry.word] = WordEntry(
            word=entry.word,
            category=existing.category or entry.category,
            replacement_hint=replacement_hint,
            per_chapter_max=per_chapter_max,
            context=context,
        )

    for word in _as_str_list(blacklist.get("words")):
        register(WordEntry(word=word, category=None, replacement_hint=None, per_chapter_max=None, context=None))

    categories = blacklist.get("categories")
    if isinstance(categories, dict):
        for category, raw_items in categories.items():
            metadata = category_metadata.get(category) if isinstance(category_metadata, dict) else None
            context = metadata.get("context") if isinstance(metadata, dict) and isinstance(metadata.get("context"), str) else None
            if not isinstance(raw_items, list):
                continue
            for raw_item in raw_items:
                if isinstance(raw_item, str):
                    word = raw_item.strip()
                    if not word:
                        continue
                    register(WordEntry(word=word, category=category, replacement_hint=None, per_chapter_max=None, context=context))
                    continue
                if not isinstance(raw_item, dict):
                    continue
                word = raw_item.get("word")
                if not isinstance(word, str) or not word.strip():
                    continue
                per_chapter_max = raw_item.get("per_chapter_max")
                if not isinstance(per_chapter_max, int) or per_chapter_max < 0:
                    per_chapter_max = None
                replacement_hint = raw_item.get("replacement_hint") if isinstance(raw_item.get("replacement_hint"), str) else None
                register(
                    WordEntry(
                        word=word.strip(),
                        category=category,
                        replacement_hint=replacement_hint,
                        per_chapter_max=per_chapter_max,
                        context=context,
                    )
                )

    entries = list(entries_by_word.values())
    entries.sort(key=lambda item: (-len(item.word), item.word))
    return entries


def _line_number_at(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def _line_snippet(text: str, index: int) -> str:
    start = text.rfind("\n", 0, index) + 1
    end = text.find("\n", index)
    if end < 0:
        end = len(text)
    snippet = text[start:end].strip()
    return f"{snippet[:160]}…" if len(snippet) > 160 else snippet


def _build_dialogue_ranges(text: str) -> Tuple[List[Tuple[int, int]], int, int]:
    ranges: List[Tuple[int, int]] = []
    in_dialogue = False
    start = -1
    open_count = 0
    close_count = 0
    for index, char in enumerate(text):
        if char == "“":
            open_count += 1
            if not in_dialogue:
                in_dialogue = True
                start = index
        elif char == "”":
            close_count += 1
            if in_dialogue:
                ranges.append((start, index + 1))
                in_dialogue = False
                start = -1
    if in_dialogue and start >= 0:
        ranges.append((start, len(text)))
    return ranges, open_count, close_count


def _in_dialogue(index: int, ranges: List[Tuple[int, int]]) -> bool:
    for start, end in ranges:
        if start <= index < end:
            return True
    return False


def main() -> None:
    chapter_path = sys.argv[1]
    blacklist_path = sys.argv[2]

    blacklist = _load_json(blacklist_path)
    if not isinstance(blacklist, dict):
        _die("lint-blacklist.sh: ai-blacklist.json must be a JSON object", 1)

    whitelist = _get_whitelist_words(blacklist)
    entries = _collect_entries(blacklist, whitelist)

    try:
        with open(chapter_path, "r", encoding="utf-8") as handle:
            text = handle.read()
    except Exception as exc:
        _die(f"lint-blacklist.sh: failed to read chapter: {exc}", 1)

    dialogue_ranges, open_count, close_count = _build_dialogue_ranges(text)
    non_ws_chars = len(re.sub(r"\s+", "", text))

    warnings: List[Dict[str, Any]] = []
    total_quotes = open_count + close_count
    if total_quotes % 2 != 0 or open_count != close_count:
        warnings.append(
            {
                "code": "quote_parity_mismatch",
                "message": f"Chinese quote parity mismatch: “={open_count}, ”={close_count}, total={total_quotes}.",
            }
        )

    masked = text
    hits: List[Dict[str, Any]] = []
    total_hits = 0
    narration_connector_count = 0
    per_limit_hits: List[Dict[str, Any]] = []

    for entry in entries:
        occurrences: List[int] = []
        search_from = 0
        while True:
            index = masked.find(entry.word, search_from)
            if index < 0:
                break
            search_from = index + len(entry.word)
            in_dialogue = _in_dialogue(index, dialogue_ranges)
            if entry.context == "narration_only" and in_dialogue:
                continue
            occurrences.append(index)
            masked = masked[:index] + ("\x00" * len(entry.word)) + masked[index + len(entry.word):]

        count = len(occurrences)
        if count == 0:
            continue

        total_hits += count
        if entry.category == "narration_connector":
            narration_connector_count += count

        lines: List[int] = []
        snippets: List[str] = []
        contexts: List[str] = []
        for index in occurrences:
            lines.append(_line_number_at(text, index))
            if len(snippets) < 5:
                snippets.append(_line_snippet(text, index))
            contexts.append("dialogue" if _in_dialogue(index, dialogue_ranges) else "narration")

        hit_obj: Dict[str, Any] = {
            "word": entry.word,
            "count": count,
            "lines": lines[:20],
            "snippets": snippets,
            "contexts": sorted(set(contexts)),
        }
        if entry.category is not None:
            hit_obj["category"] = entry.category
        if entry.replacement_hint:
            hit_obj["replacement_hint"] = entry.replacement_hint
        if entry.per_chapter_max is not None:
            hit_obj["per_chapter_max"] = entry.per_chapter_max
            if count > entry.per_chapter_max:
                per_limit_hits.append(
                    {
                        "word": entry.word,
                        "count": count,
                        "per_chapter_max": entry.per_chapter_max,
                        "category": entry.category,
                        "replacement_hint": entry.replacement_hint,
                    }
                )
                warnings.append(
                    {
                        "code": "per_chapter_max_exceeded",
                        "message": f"{entry.word} appeared {count} times (limit {entry.per_chapter_max}).",
                        "word": entry.word,
                        "count": count,
                        "per_chapter_max": entry.per_chapter_max,
                    }
                )
        hits.append(hit_obj)

    hits.sort(key=lambda item: (-int(item["count"]), str(item["word"])))
    per_limit_hits.sort(key=lambda item: (-int(item["count"]), str(item["word"])))

    hits_per_kchars = 0.0
    if non_ws_chars > 0:
        hits_per_kchars = total_hits / (non_ws_chars / 1000.0)

    unique_words_count = len(entries)
    words_flat_count = len(_as_str_list(blacklist.get("words")))

    output: Dict[str, Any] = {
        "chapter_path": chapter_path,
        "blacklist_path": blacklist_path,
        "chars": non_ws_chars,
        "blacklist_words_count": unique_words_count,
        "flat_words_count": words_flat_count,
        "whitelist_words_count": len(whitelist),
        "effective_words_count": unique_words_count,
        "total_hits": total_hits,
        "hits_per_kchars": round(hits_per_kchars, 3),
        "hits": hits,
        "warnings": warnings,
        "per_chapter_limit_hits": per_limit_hits,
        "statistical_profile": {
            "blacklist_hit_rate": round(hits_per_kchars, 3),
            "narration_connector_count": narration_connector_count,
        },
    }

    sys.stdout.write(json.dumps(output, ensure_ascii=False) + "\n")


try:
    main()
except SystemExit:
    raise
except Exception as exc:
    sys.stderr.write(f"lint-blacklist.sh: unexpected error: {exc}\n")
    raise SystemExit(2)
PY
