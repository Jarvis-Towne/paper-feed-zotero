import assert from "node:assert/strict";
import test from "node:test";

import {
  createDefaultRunState,
  parseStoredRunState,
  serializeRunState,
} from "../../src/modules/storage/runStateStore";

test("serializeRunState and parseStoredRunState round-trip metadata", () => {
  const original = {
    ...createDefaultRunState(),
    lastRunAt: "2026-03-27T00:00:00.000Z",
    lastSuccessAt: "2026-03-27T00:05:00.000Z",
    lastError: "partial source failure",
    generatedAt: "2026-03-27T00:05:00.000Z",
    seenIds: ["guid:existing", "doi:10.1000/example"],
    aiSummarySubmittedIds: ["doi:10.1000/example"],
    aiSummaryLastRunAt: "2026-03-27T00:10:00.000Z",
    aiSummaryLastSuccessAt: "2026-03-27T00:10:00.000Z",
    lastMatchCount: 3,
    storedItemCount: 12,
  };

  const restored = parseStoredRunState(serializeRunState(original));
  assert.deepEqual(restored, original);
});
