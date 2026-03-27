import assert from "node:assert/strict";
import test from "node:test";

import {
  parseStoredFeedSnapshot,
  serializeFeedSnapshot,
} from "../../src/modules/storage/feedSnapshotStore";

test("feed snapshot round-trips entries and publication dates", () => {
  const snapshot = {
    generatedAt: "2026-03-27T00:05:00.000Z",
    items: [
      {
        title: "Fresh stability result",
        link: "https://example.com/paper",
        summary: "Perovskite stability improves.",
        journal: "Advanced Materials",
        id: "guid-1",
        pubDate: new Date("2026-03-20T12:00:00.000Z"),
        doi: "10.1000/example",
      },
    ],
  };

  const restored = parseStoredFeedSnapshot(serializeFeedSnapshot(snapshot));

  assert.equal(restored.generatedAt, snapshot.generatedAt);
  assert.equal(restored.items.length, 1);
  assert.equal(restored.items[0].title, snapshot.items[0].title);
  assert.equal(restored.items[0].doi, snapshot.items[0].doi);
  assert.equal(
    restored.items[0].pubDate.toISOString(),
    snapshot.items[0].pubDate.toISOString(),
  );
});
