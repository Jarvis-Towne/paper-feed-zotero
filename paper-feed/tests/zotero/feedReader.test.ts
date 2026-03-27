import assert from "node:assert/strict";
import test from "node:test";

import { describeFeedReaderFailure } from "../../src/modules/zotero/compat/feedReader";

test("describeFeedReaderFailure reports Cloudflare challenges clearly", async () => {
  const originalZotero = globalThis.Zotero;

  (globalThis as any).Zotero = {
    HTTP: {
      async request() {
        return {
          status: 403,
          responseText: "<html><title>Just a moment...</title></html>",
          getResponseHeader(name: string) {
            return name.toLowerCase() === "cf-mitigated" ? "challenge" : "text/html";
          },
        };
      },
    },
  };

  try {
    const message = await describeFeedReaderFailure(
      "https://chemrxiv.org/engage/rss/chemrxiv",
      new Error("Processing failed"),
    );
    assert.equal(message, "HTTP 403 blocked by Cloudflare challenge");
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});

test("describeFeedReaderFailure falls back to the original error when diagnostics are unavailable", async () => {
  const originalZotero = globalThis.Zotero;
  (globalThis as any).Zotero = {};

  try {
    const message = await describeFeedReaderFailure(
      "https://example.com/feed.xml",
      new Error("Processing failed"),
    );
    assert.equal(message, "Processing failed");
  } finally {
    (globalThis as any).Zotero = originalZotero;
  }
});
