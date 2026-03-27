import assert from "node:assert/strict";
import test from "node:test";

import type {
  FeedEntry,
  FeedSourceReader,
  PluginConfig,
} from "../../src/modules/domain/types";
import { runFetchPipeline } from "../../src/modules/fetch/fetchRunner";

test("runFetchPipeline normalizes feed URLs, filters matches, and dedupes results", async () => {
  const calls: string[] = [];
  const reader: FeedSourceReader = {
    async read(url) {
      calls.push(url);

      if (url === "https://broken.example/feed") {
        throw new Error("network timeout");
      }

      return {
        sourceUrl: url,
        feedTitle: "Advanced Materials",
        items: [
          {
            guid: "duplicate-doi",
            title: "Perovskite stability update",
            abstractNote: "Perovskite stability remains important.",
            publicationTitle: "Advanced Materials",
            url: "https://example.com/duplicate",
            date: "2026-03-21T00:00:00.000Z",
            DOI: "10.1000/existing",
          },
          {
            guid: "fresh-guid",
            title: "Fresh stability result",
            abstractNote: "Perovskite stability improves under bias.",
            publicationTitle: "Advanced Materials",
            url: "https://example.com/fresh",
            date: "2026-03-25T00:00:00.000Z",
            DOI: "10.1000/fresh",
          },
          {
            guid: "noise-guid",
            title: "Unrelated catalysis note",
            abstractNote: "No keyword match here.",
            publicationTitle: "Advanced Materials",
            url: "https://example.com/noise",
            date: "2026-03-24T00:00:00.000Z",
          },
        ],
      };
    },
  };

  const config: PluginConfig = {
    journals: [
      { name: "PRX", url: "feeds.aps.org/rss/recent/prx.xml" },
      { name: "Broken", url: "https://broken.example/feed" },
    ],
    keywordQueries: ["perovskite AND stability"],
    autoFetchEnabled: false,
    autoFetchIntervalHours: 6,
    profileName: "lab",
    subscription: {
      name: "Lab Feed",
      refreshIntervalHours: 6,
      cleanupReadAfterDays: 30,
      cleanupUnreadAfterDays: 365,
    },
  };

  const previousItems: FeedEntry[] = [
    {
      title: "Existing matched paper",
      link: "https://example.com/existing",
      summary: "Perovskite stability baseline.",
      journal: "Advanced Materials",
      id: "existing-guid",
      pubDate: new Date("2026-03-20T00:00:00.000Z"),
      doi: "10.1000/existing",
    },
  ];

  const result = await runFetchPipeline({
    config,
    previousItems,
    previousSeenIds: [],
    reader,
    now: new Date("2026-03-27T00:05:00.000Z"),
  });

  assert.deepEqual(calls, [
    "https://feeds.aps.org/rss/recent/prx.xml",
    "https://broken.example/feed",
  ]);
  assert.equal(result.generatedAt, "2026-03-27T00:05:00.000Z");
  assert.equal(result.newItems.length, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].title, "Fresh stability result");
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /network timeout/);
  assert.match(result.xml, /Lab Feed/);
  assert.ok(result.seenIds.includes("doi:10.1000/existing"));
  assert.ok(result.seenIds.includes("doi:10.1000/fresh"));
});
