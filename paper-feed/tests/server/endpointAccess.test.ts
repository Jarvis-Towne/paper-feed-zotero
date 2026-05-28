import assert from "node:assert/strict";
import test from "node:test";

import { AiSummaryHtmlEndpoint } from "../../src/modules/server/aiSummaryHtmlEndpoint";
import { HealthEndpoint } from "../../src/modules/server/healthEndpoint";
import {
  AiRssEndpoint,
  RssEndpoint,
} from "../../src/modules/server/rssEndpoint";

test("local feed endpoints allow Zotero FeedReader fetch requests", () => {
  assert.equal(new RssEndpoint().allowRequestsFromUnsafeWebContent, true);
  assert.equal(new AiRssEndpoint().allowRequestsFromUnsafeWebContent, true);
  assert.equal(
    new AiSummaryHtmlEndpoint().allowRequestsFromUnsafeWebContent,
    true,
  );
});

test("health endpoint can be opened from a browser for diagnostics", () => {
  assert.equal(new HealthEndpoint().allowRequestsFromUnsafeWebContent, true);
});
