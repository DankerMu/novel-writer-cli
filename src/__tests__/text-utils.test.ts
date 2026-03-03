import assert from "node:assert/strict";
import test from "node:test";

import { truncateWithEllipsis } from "../text-utils.js";

test("truncateWithEllipsis returns original when within limit", () => {
  assert.equal(truncateWithEllipsis("abc", 3), "abc");
  assert.equal(truncateWithEllipsis("abc", 10), "abc");
});

test("truncateWithEllipsis returns empty string for maxLen 0", () => {
  assert.equal(truncateWithEllipsis("abc", 0), "");
});

test("truncateWithEllipsis returns ellipsis only for maxLen 1", () => {
  assert.equal(truncateWithEllipsis("abc", 1), "\u2026");
});

test("truncateWithEllipsis truncates and appends ellipsis", () => {
  assert.equal(truncateWithEllipsis("abcdef", 4), "abc\u2026");
});

test("truncateWithEllipsis does not split surrogate pairs", () => {
  // "\uD83D\uDE00" is U+1F600 encoded as surrogate pair \uD83D\uDE00
  const text = "ab\uD83D\uDE00cd";
  // maxLen=4: would cut at index 3 which is inside the surrogate pair
  const result = truncateWithEllipsis(text, 4);
  // Should back up to avoid splitting: "ab" + "\u2026"
  assert.equal(result, "ab\u2026");
  // Verify no lone surrogate in output
  for (let i = 0; i < result.length; i++) {
    const code = result.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = result.charCodeAt(i + 1);
      assert.ok(next >= 0xdc00 && next <= 0xdfff, "high surrogate must be followed by low surrogate");
    }
  }
});

test("truncateWithEllipsis handles empty string", () => {
  assert.equal(truncateWithEllipsis("", 5), "");
});

test("truncateWithEllipsis handles string exactly at limit boundary", () => {
  assert.equal(truncateWithEllipsis("abcd", 4), "abcd");
  assert.equal(truncateWithEllipsis("abcde", 4), "abc\u2026");
});
