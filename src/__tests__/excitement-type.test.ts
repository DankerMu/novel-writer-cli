import assert from "node:assert/strict";
import test from "node:test";

import { EXCITEMENT_TYPES, normalizeExcitementType } from "../excitement-type.js";

test("normalizeExcitementType accepts every supported enum value", () => {
  for (const value of EXCITEMENT_TYPES) {
    assert.equal(normalizeExcitementType(value), value);
  }
});

test("normalizeExcitementType treats blank and null-like inputs as null", () => {
  assert.equal(normalizeExcitementType(""), null);
  assert.equal(normalizeExcitementType("  "), null);
  assert.equal(normalizeExcitementType("null"), null);
  assert.equal(normalizeExcitementType(null), null);
  assert.equal(normalizeExcitementType(undefined), null);
});

test("normalizeExcitementType returns undefined for unsupported non-string or unknown values", () => {
  assert.equal(normalizeExcitementType(true), undefined);
  assert.equal(normalizeExcitementType(42), undefined);
  assert.equal(normalizeExcitementType({ value: "setup" }), undefined);
  assert.equal(normalizeExcitementType("galaxy_brain"), undefined);
});
