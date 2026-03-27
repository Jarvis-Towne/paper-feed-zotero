import assert from "node:assert/strict";
import test from "node:test";

import { createImportedConfig } from "../../src/modules/storage/configStore";
import { resolveLegacyImportResult } from "../../src/modules/migration/legacyImport";

test("resolveLegacyImportResult replaces imported fields and preserves missing ones", () => {
  const currentConfig = createImportedConfig({
    journalsContent: "https://existing-journal.example\n",
    keywordContent: "existing keyword\n",
    autoFetchEnabled: true,
    autoFetchIntervalHours: 8,
    profileName: "lab",
  });

  const result = resolveLegacyImportResult({
    directoryPath: "C:/legacy",
    currentConfig,
    journalsContent: "https://journal-a.example\nhttps://journal-b.example\n",
    keywordContent: null,
  });

  assert.equal(result.journalFileFound, true);
  assert.equal(result.keywordFileFound, false);
  assert.equal(result.importedJournals, 2);
  assert.equal(result.importedKeywords, 0);
  assert.deepEqual(result.config.journals, [
    { name: "", url: "https://journal-a.example" },
    { name: "", url: "https://journal-b.example" },
  ]);
  assert.deepEqual(result.config.keywordQueries, ["existing keyword"]);
  assert.equal(result.config.autoFetchEnabled, true);
  assert.equal(result.config.autoFetchIntervalHours, 8);
  assert.equal(result.config.profileName, "lab");
});

test("resolveLegacyImportResult imports both legacy files when both are present", () => {
  const currentConfig = createImportedConfig({
    journalsContent: "https://existing-journal.example\n",
    keywordContent: "existing keyword\n",
  });

  const result = resolveLegacyImportResult({
    directoryPath: "C:/legacy",
    currentConfig,
    journalsContent: "https://journal-a.example\n",
    keywordContent: "perovskite AND stability\n",
  });

  assert.equal(result.journalFileFound, true);
  assert.equal(result.keywordFileFound, true);
  assert.deepEqual(result.config.journals, [
    { name: "", url: "https://journal-a.example" },
  ]);
  assert.deepEqual(result.config.keywordQueries, [
    "perovskite AND stability",
  ]);
});

test("resolveLegacyImportResult fails when no legacy files are found", () => {
  const currentConfig = createImportedConfig({});

  assert.throws(
    () =>
      resolveLegacyImportResult({
        directoryPath: "C:/legacy",
        currentConfig,
        journalsContent: null,
        keywordContent: null,
      }),
    /No legacy config files were found/,
  );
});
