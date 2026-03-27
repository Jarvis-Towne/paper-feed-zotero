import assert from "node:assert/strict";
import test from "node:test";

import {
  createImportedConfig,
  mergeImportedConfig,
  parseLineSeparatedValues,
  parseStoredConfig,
  serializeConfig,
} from "../../src/modules/storage/configStore";

test("parseLineSeparatedValues ignores blank lines and comments", () => {
  assert.deepEqual(
    parseLineSeparatedValues("# comment\n\nhttps://a.example\nhttps://b.example\n"),
    ["https://a.example", "https://b.example"],
  );
});

test("createImportedConfig builds config from legacy dat file contents", () => {
  const config = createImportedConfig({
    journalsContent: "https://journal-a.example\nhttps://journal-b.example\n",
    keywordContent: "machine learning\nPerovskite AND Stability\n",
    autoFetchEnabled: true,
    autoFetchIntervalHours: 8,
  });

  assert.deepEqual(config.journals, [
    { name: "", url: "https://journal-a.example" },
    { name: "", url: "https://journal-b.example" },
  ]);
  assert.deepEqual(config.keywordQueries, [
    "machine learning",
    "Perovskite AND Stability",
  ]);
  assert.equal(config.autoFetchEnabled, true);
  assert.equal(config.autoFetchIntervalHours, 8);
  assert.equal(config.subscription.name, "Paper Feed");
});

test("mergeImportedConfig preserves missing imported fields", () => {
  const currentConfig = createImportedConfig({
    journalsContent: "https://existing.example\n",
    keywordContent: "existing keyword\n",
    autoFetchEnabled: true,
    autoFetchIntervalHours: 9,
    profileName: "lab",
  });

  const merged = mergeImportedConfig(currentConfig, {
    journalsContent: null,
    keywordContent: "new keyword\n",
  });

  assert.deepEqual(merged.journals, [
    { name: "", url: "https://existing.example" },
  ]);
  assert.deepEqual(merged.keywordQueries, ["new keyword"]);
  assert.equal(merged.autoFetchEnabled, true);
  assert.equal(merged.autoFetchIntervalHours, 9);
  assert.equal(merged.profileName, "lab");
  assert.equal(merged.subscription.cleanupReadAfterDays, 30);
});

test("parseStoredConfig migrates legacy string journal arrays and missing subscription", () => {
  const restored = parseStoredConfig(
    JSON.stringify({
      journals: ["https://journal-a.example"],
      keywordQueries: ["machine learning"],
      autoFetchEnabled: true,
      autoFetchIntervalHours: 12,
      profileName: "legacy",
    }),
  );

  assert.deepEqual(restored.journals, [
    { name: "", url: "https://journal-a.example" },
  ]);
  assert.equal(restored.subscription.name, "Paper Feed");
  assert.equal(restored.subscription.refreshIntervalHours, 6);
});

test("serializeConfig and parseStoredConfig round-trip data", () => {
  const original = createImportedConfig({
    journalsContent: "https://journal-a.example\n",
    keywordContent: "machine learning\n",
  });

  const restored = parseStoredConfig(serializeConfig(original));
  assert.deepEqual(restored, original);
});
