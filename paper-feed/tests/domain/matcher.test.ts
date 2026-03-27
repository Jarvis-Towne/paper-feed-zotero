import assert from "node:assert/strict";
import test from "node:test";

import { matchesEntry, parseKeywordQuery } from "../../src/modules/domain/matcher";

test("parseKeywordQuery splits AND expressions case-insensitively", () => {
  assert.deepEqual(parseKeywordQuery("Perovskite AND Stability").terms, [
    "perovskite",
    "stability",
  ]);
  assert.deepEqual(parseKeywordQuery("machine learning").terms, [
    "machine learning",
  ]);
});

test("matchesEntry finds a single keyword across title and summary", () => {
  const matched = matchesEntry(
    {
      title: "Machine learning for solid electrolytes",
      summary: "A compact review article",
    },
    ["machine learning"],
  );

  assert.equal(matched, true);
});

test("matchesEntry requires all AND terms to be present", () => {
  const matched = matchesEntry(
    {
      title: "Perovskite transport study",
      summary: "Stability is discussed together with degradation pathways",
    },
    ["Perovskite AND Stability"],
  );

  const unmatched = matchesEntry(
    {
      title: "Perovskite transport study",
      summary: "No degradation discussion here",
    },
    ["Perovskite AND Stability"],
  );

  assert.equal(matched, true);
  assert.equal(unmatched, false);
});
