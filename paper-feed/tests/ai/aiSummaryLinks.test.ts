import assert from "node:assert/strict";
import test from "node:test";

import {
  getAiSummaryDateSlug,
  getAiSummaryHtmlPath,
  getAiSummaryHtmlUrl,
  withAiSummaryHtmlLinks,
} from "../../src/modules/ai/aiSummaryLinks";
import type { FeedEntry } from "../../src/modules/domain/types";

const entry: FeedEntry = {
  title: "AI Literature Summary - 2026-05-23",
  link: "http://127.0.0.1/paper-feed/ai/2026-05-23-05-54-05",
  summary: "<p>summary</p>",
  journal: "Paper Feed AI",
  id: "paper-feed-ai-summary-2026-05-23-05-54-05",
  pubDate: new Date("2026-05-23T02:34:00.000Z"),
};

test("AI summary links target the current local HTML endpoint", () => {
  assert.equal(getAiSummaryDateSlug(entry), "2026-05-23-05-54-05");
  assert.equal(
    getAiSummaryHtmlPath(entry),
    "/paper-feed/ai/2026-05-23-05-54-05",
  );
  assert.equal(
    getAiSummaryHtmlUrl(entry, "http://127.0.0.1:23119"),
    "http://127.0.0.1:23119/paper-feed/ai/2026-05-23-05-54-05",
  );
});

test("withAiSummaryHtmlLinks repairs stale local HTTP summary links", () => {
  assert.equal(
    withAiSummaryHtmlLinks([entry], "http://127.0.0.1:23119")[0].link,
    "http://127.0.0.1:23119/paper-feed/ai/2026-05-23-05-54-05",
  );
});
