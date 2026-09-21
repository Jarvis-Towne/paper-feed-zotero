import assert from "node:assert/strict";
import test from "node:test";

import type {
  FeedEntry,
  FeedSourceReader,
  PluginConfig,
} from "../../src/modules/domain/types";
import { runFetchPipeline } from "../../src/modules/fetch/fetchRunner";
import { createDefaultConfig } from "../../src/modules/storage/configStore";

test("cached entries receive source metadata without becoming new or mutating input", async () => {
  const config = createDefaultConfig();
  config.journals = [
    {
      name: "ACS",
      url: "https://pubs.acs.org/action/showFeed?type=axatoc&jc=jacsat",
    },
  ];
  config.keywordQueries = ["battery"];
  const previous: FeedEntry = {
    title: "battery",
    id: "old-guid",
    link: "https://doi.org/10.1021/test",
    summary: "battery",
    journal: "JACS",
    pubDate: new Date("2026-09-18"),
  };
  const result = await runFetchPipeline({
    config,
    previousItems: [previous],
    reader: {
      async read(url) {
        assert.equal(url, "https://pubs.acs.org/rss/jacsat/asap.xml");
        return {
          sourceUrl: url,
          feedTitle: "JACS",
          items: [
            {
              guid: "new-url-guid",
              title: "battery",
              DOI: "10.1021/test",
              creators: [{ firstName: "Jane", lastName: "Li" }],
              volume: "148",
            },
          ],
        };
      },
      async enrich() {
        throw new Error("must not request already known authors");
      },
    },
  });
  assert.equal(result.newItems.length, 0);
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].id, "old-guid");
  assert.equal(result.items[0].authors, "Jane Li");
  assert.equal(result.items[0].volume, "148");
  assert.match(result.xml, /<dc:creator>Jane Li<\/dc:creator>/);
  assert.equal(previous.doi, undefined);
  assert.equal(previous.authors, undefined);
  assert.equal(result.errors.length, 0);
});

test("enrichment runs only on retained matches and failure preserves all papers", async () => {
  const config = createDefaultConfig();
  config.journals = [{ name: "ACS", url: "https://example.com/feed" }];
  config.keywordQueries = ["battery"];
  let calls = 0;
  const result = await runFetchPipeline({
    config,
    reader: {
      async read(url) {
        return {
          sourceUrl: url,
          feedTitle: "ACS",
          items: [
            { guid: "1", title: "battery A", DOI: "10.1021/a" },
            { guid: "2", title: "battery B", DOI: "10.1021/b" },
            { guid: "3", title: "unrelated", DOI: "10.1021/c" },
          ],
        };
      },
      async enrich() {
        calls++;
        throw new Error("HTTP 429");
      },
    },
  });
  assert.equal(calls, 1);
  assert.equal(result.items.length, 2);
  assert.equal(result.newItems.length, 2);
  assert.match(
    result.errors[0].message,
    /Metadata enrichment failed: HTTP 429/,
  );
  assert.match(result.xml, /doi:10.1021\/a/);
});

test("metadata batches progress past unavailable DOIs on subsequent refreshes", async () => {
  const config = createDefaultConfig();
  const previousItems = Array.from(
    { length: 51 },
    (_, i): FeedEntry => ({
      title: `paper ${i}`,
      id: `id-${i}`,
      link: `https://doi.org/10.1021/p${i}`,
      summary: "",
      journal: "ACS",
      pubDate: new Date("2026-09-18"),
    }),
  );
  const calls: string[] = [];
  const reader: FeedSourceReader = {
    async read() {
      throw new Error("no feeds configured");
    },
    async enrich(entry) {
      calls.push(entry.id);
      return entry;
    },
  };
  const first = await runFetchPipeline({
    config,
    previousItems,
    reader,
    now: new Date("2026-09-21"),
  });
  assert.equal(calls.length, 50);
  calls.length = 0;
  await runFetchPipeline({
    config,
    previousItems: first.items,
    reader,
    now: new Date("2026-09-22"),
  });
  assert.equal(calls[0], "id-50");
});

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
    aiSummary: {
      enabled: false,
      baseUrl: "",
      apiKey: "",
      model: "",
      prompt: "",
      subscription: {
        name: "Paper Feed AI Summary",
        refreshIntervalHours: 24,
        cleanupReadAfterDays: 30,
        cleanupUnreadAfterDays: 365,
      },
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
