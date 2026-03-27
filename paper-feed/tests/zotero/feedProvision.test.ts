import assert from "node:assert/strict";
import test from "node:test";

import {
  getDefaultManagedFeedName,
  isManagedFeedUrl,
  normalizeManagedFeedSettings,
} from "../../src/modules/zotero/feedProvision";

test("managed feed helpers keep naming and URL rules stable", () => {
  assert.equal(getDefaultManagedFeedName("default"), "Paper Feed (default)");
  assert.equal(getDefaultManagedFeedName(""), "Paper Feed");
  assert.equal(isManagedFeedUrl("http://127.0.0.1:23119/paper-feed/rss/default"), true);
  assert.equal(isManagedFeedUrl("http://127.0.0.1:23119/connector/ping"), false);
  assert.deepEqual(
    normalizeManagedFeedSettings({
      profileName: "default",
      subscription: {
        name: "Team Feed",
        refreshIntervalHours: 8,
        cleanupReadAfterDays: 14,
        cleanupUnreadAfterDays: 90,
      },
    }),
    {
      name: "Team Feed",
      refreshIntervalHours: 8,
      cleanupReadAfterDays: 14,
      cleanupUnreadAfterDays: 90,
    },
  );
  assert.equal(
    normalizeManagedFeedSettings({
      profileName: "default",
      subscription: { name: "", refreshIntervalHours: 0 },
    }).refreshIntervalHours,
    24,
  );
});
