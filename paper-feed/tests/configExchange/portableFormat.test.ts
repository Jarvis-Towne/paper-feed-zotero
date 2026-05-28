import assert from "node:assert/strict";
import test from "node:test";

import { createDefaultConfig } from "../../src/modules/storage/configStore";
import {
  ensurePortableConfigPath,
  parsePortableConfig,
  serializePortableConfig,
} from "../../src/modules/configExchange/portableFormat";

test("portable config format round-trips journals, keywords, and subscription settings", () => {
  const config = createDefaultConfig();
  config.profileName = "lab";
  config.autoFetchEnabled = true;
  config.autoFetchIntervalHours = 12;
  config.subscription = {
    name: "Lab Feed",
    refreshIntervalHours: 8,
    cleanupReadAfterDays: 14,
    cleanupUnreadAfterDays: 90,
  };
  config.aiSummary = {
    enabled: true,
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "paper-model",
    prompt: "1. solid electrolytes\n2. catalyst genome",
    schedule: {
      mode: "daily",
      intervalHours: 24,
      dailyTime: "08:30",
    },
    subscription: {
      name: "Lab AI Feed",
      refreshIntervalHours: 24,
      cleanupReadAfterDays: 21,
      cleanupUnreadAfterDays: 120,
    },
  };
  config.keywordQueries = ["machine learning", "perovskite AND stability"];
  config.journals = [
    { name: "Nature Communications", url: "https://www.nature.com/ncomms.rss" },
    { name: "PRX", url: "https://feeds.aps.org/rss/recent/prx.xml" },
  ];

  const restored = parsePortableConfig(serializePortableConfig(config));
  assert.deepEqual(restored, config);
});

test("portable config parser accepts blank journal names and comments", () => {
  const restored = parsePortableConfig(`
# comment
[keywords]
machine learning

[journals]
 | https://example.com/rss
`);

  assert.deepEqual(restored.keywordQueries, ["machine learning"]);
  assert.deepEqual(restored.journals, [
    { name: "", url: "https://example.com/rss" },
  ]);
});

test("ensurePortableConfigPath appends the portable extension when missing", () => {
  assert.equal(
    ensurePortableConfigPath("C:/tmp/paper-feed-config"),
    "C:/tmp/paper-feed-config.paperfeed.txt",
  );
  assert.equal(
    ensurePortableConfigPath("C:/tmp/paper-feed-config.txt"),
    "C:/tmp/paper-feed-config.txt",
  );
});
