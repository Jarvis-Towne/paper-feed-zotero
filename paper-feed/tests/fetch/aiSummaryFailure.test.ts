import assert from "node:assert/strict";
import test from "node:test";
import { rebuildAiSummaryCache } from "../../src/modules/fetch/fetchService";
import {
  createDefaultConfig,
  serializeConfig,
} from "../../src/modules/storage/configStore";
import { serializeFeedSnapshot } from "../../src/modules/storage/feedSnapshotStore";
import {
  createDefaultRunState,
  serializeRunState,
} from "../../src/modules/storage/runStateStore";
import {
  getConfigFilePath,
  getSnapshotFilePath,
  getRunStateFilePath,
  getAiSummarySnapshotFilePath,
} from "../../src/modules/storage/paths";

test("persistent screening 524 preserves pending IDs and existing digest", async () => {
  const original = globalThis.Zotero;
  const base = "/paperfeed-test";
  const config = createDefaultConfig();
  Object.assign(config.aiSummary, {
    enabled: true,
    baseUrl: "https://example.com/v1",
    apiKey: "test",
    model: "test",
    prompt: "solid electrolytes",
  });
  const state = {
    ...createDefaultRunState(),
    aiSummarySubmittedIds: ["doi:10.1000/old"],
  };
  const files = new Map([
    [getConfigFilePath(base), serializeConfig(config)],
    [getRunStateFilePath(base), serializeRunState(state)],
    [
      getSnapshotFilePath(base),
      serializeFeedSnapshot({
        generatedAt: null,
        items: [
          {
            id: "pending",
            title: "solid electrolyte",
            link: "https://example.com/pending",
            summary: "Lithium conduction",
            journal: "Test",
            doi: "10.1000/pending",
            pubDate: new Date("2026-09-21"),
          },
        ],
      }),
    ],
    [getAiSummarySnapshotFilePath(base), "previous digest"],
  ]);
  let requests = 0;
  (globalThis as any).Zotero = {
    DataDirectory: { dir: base },
    File: {
      async createDirectoryIfMissingAsync() {},
      async getContentsAsync(path: string) {
        if (!files.has(path)) throw new Error("missing");
        return files.get(path);
      },
      async putContentsAsync(path: string, value: string) {
        files.set(path, value);
      },
    },
    HTTP: {
      async request() {
        requests++;
        return { status: 524, responseText: "<html>gateway timeout</html>" };
      },
    },
    logError() {},
  };
  try {
    const result = await rebuildAiSummaryCache();
    assert.equal(result.generated, false);
    assert.equal(requests, 3);
    const updated = JSON.parse(files.get(getRunStateFilePath(base))!);
    assert.deepEqual(
      updated.aiSummarySubmittedIds,
      state.aiSummarySubmittedIds,
    );
    assert.equal(updated.aiSummaryLastSuccessAt, null);
    assert.match(updated.lastError, /AI screening batch 1\/1.*HTTP 524/);
    assert.equal(
      files.get(getAiSummarySnapshotFilePath(base)),
      "previous digest",
    );
  } finally {
    (globalThis as any).Zotero = original;
  }
});
