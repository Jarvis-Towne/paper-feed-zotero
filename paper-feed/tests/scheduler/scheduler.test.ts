import assert from "node:assert/strict";
import test from "node:test";

import type {
  PluginConfig,
  PluginRunState,
} from "../../src/modules/domain/types";
import {
  AiSummaryScheduler,
  AutoFetchScheduler,
  getAiSummaryIntervalMs,
  getAutoFetchIntervalMs,
  getStartupCatchUpDelayMs,
} from "../../src/modules/scheduler/scheduler";

class FakeTimerDriver {
  private nextId = 1;
  private timers = new Map<
    number,
    { callback: () => void | Promise<void>; delayMs: number }
  >();

  setTimeout(callback: () => void | Promise<void>, delayMs: number) {
    const id = this.nextId++;
    this.timers.set(id, { callback, delayMs });
    return id;
  }

  clearTimeout(handle: unknown) {
    this.timers.delete(handle as number);
  }

  get size() {
    return this.timers.size;
  }

  getNextDelay() {
    return this.timers.values().next().value?.delayMs ?? null;
  }

  async runNext() {
    const next = this.timers.entries().next().value;
    assert.ok(next, "expected a scheduled timer");

    const [id, timer] = next;
    this.timers.delete(id);
    await timer.callback();
  }
}

function createConfig(overrides: Partial<PluginConfig> = {}): PluginConfig {
  return {
    journals: [],
    keywordQueries: [],
    autoFetchEnabled: false,
    autoFetchIntervalHours: 6,
    profileName: "default",
    subscription: {
      name: "Paper Feed",
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
    ...overrides,
  };
}

function createRunState(
  overrides: Partial<PluginRunState> = {},
): PluginRunState {
  return {
    lastRunAt: null,
    lastSuccessAt: null,
    lastError: null,
    generatedAt: null,
    seenIds: [],
    aiSummarySubmittedIds: [],
    aiSummaryLastRunAt: null,
    aiSummaryLastSuccessAt: null,
    lastMatchCount: 0,
    storedItemCount: 0,
    ...overrides,
  };
}

test("getStartupCatchUpDelayMs runs immediately when no successful fetch is recorded", () => {
  assert.equal(
    getStartupCatchUpDelayMs({
      intervalHours: 4,
      lastSuccessAt: null,
      now: new Date("2026-03-27T04:00:00.000Z"),
    }),
    0,
  );
});

test("getStartupCatchUpDelayMs keeps the remaining interval after a recent success", () => {
  assert.equal(
    getStartupCatchUpDelayMs({
      intervalHours: 4,
      lastSuccessAt: "2026-03-27T02:00:00.000Z",
      now: new Date("2026-03-27T03:00:00.000Z"),
    }),
    getAutoFetchIntervalMs(4) - 60 * 60 * 1000,
  );
});

test("scheduler triggers catch-up once on startup and then rearms for the full interval", async () => {
  const timer = new FakeTimerDriver();
  let fetchCalls = 0;

  const scheduler = new AutoFetchScheduler({
    async readConfig() {
      return createConfig({
        autoFetchEnabled: true,
        autoFetchIntervalHours: 4,
      });
    },
    async readRunState() {
      return createRunState({ lastSuccessAt: null });
    },
    async rebuildFeedCache() {
      fetchCalls += 1;
    },
    now: () => new Date("2026-03-27T04:00:00.000Z"),
    timer,
  });

  await scheduler.start();

  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), 0);
  assert.equal(scheduler.getState().lastTriggerAt, null);

  await timer.runNext();

  assert.equal(fetchCalls, 1);
  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), getAutoFetchIntervalMs(4));
  assert.equal(scheduler.getState().lastTriggerReason, "startup-catchup");
});

test("scheduler disables cleanly when auto-fetch is turned off", async () => {
  const timer = new FakeTimerDriver();
  const config = createConfig({
    autoFetchEnabled: true,
    autoFetchIntervalHours: 3,
  });

  const scheduler = new AutoFetchScheduler({
    async readConfig() {
      return config;
    },
    async readRunState() {
      return createRunState({
        lastSuccessAt: "2026-03-27T00:00:00.000Z",
      });
    },
    async rebuildFeedCache() {
      return;
    },
    now: () => new Date("2026-03-27T01:00:00.000Z"),
    timer,
  });

  await scheduler.start();
  assert.equal(timer.size, 1);

  config.autoFetchEnabled = false;
  await scheduler.sync("config-change");

  assert.equal(timer.size, 0);
  assert.equal(scheduler.getState().enabled, false);
  assert.equal(scheduler.getState().scheduled, false);
});

test("scheduler backs off for a full interval after a failed run", async () => {
  const timer = new FakeTimerDriver();
  let loggedErrors = 0;

  const scheduler = new AutoFetchScheduler({
    async readConfig() {
      return createConfig({
        autoFetchEnabled: true,
        autoFetchIntervalHours: 2,
      });
    },
    async readRunState() {
      return createRunState({ lastSuccessAt: null });
    },
    async rebuildFeedCache() {
      throw new Error("reader timeout");
    },
    now: () => new Date("2026-03-27T04:00:00.000Z"),
    timer,
    logError() {
      loggedErrors += 1;
    },
  });

  await scheduler.start();
  await timer.runNext();

  assert.equal(loggedErrors, 1);
  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), getAutoFetchIntervalMs(2));
});

test("AI summary scheduler uses AI summary success time and interval", async () => {
  const timer = new FakeTimerDriver();
  let aiSummaryCalls = 0;

  const scheduler = new AiSummaryScheduler({
    async readConfig() {
      return createConfig({
        aiSummary: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "paper-model",
          prompt: "materials discovery",
          subscription: {
            name: "Paper Feed AI Summary",
            refreshIntervalHours: 24,
            cleanupReadAfterDays: 30,
            cleanupUnreadAfterDays: 365,
          },
        },
      });
    },
    async readRunState() {
      return createRunState({
        lastSuccessAt: "2026-05-24T04:00:00.000Z",
        aiSummaryLastSuccessAt: "2026-05-23T04:00:00.000Z",
      });
    },
    async rebuildAiSummaryCache() {
      aiSummaryCalls += 1;
    },
    now: () => new Date("2026-05-24T05:00:00.000Z"),
    timer,
  });

  await scheduler.start();

  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), 0);

  await timer.runNext();

  assert.equal(aiSummaryCalls, 1);
  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), getAiSummaryIntervalMs(24));
  assert.equal(scheduler.getState().lastTriggerReason, "startup-catchup");
});

test("AI summary scheduler stays independent of auto-fetch success time", async () => {
  const timer = new FakeTimerDriver();

  const scheduler = new AiSummaryScheduler({
    async readConfig() {
      return createConfig({
        aiSummary: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "paper-model",
          prompt: "materials discovery",
          subscription: {
            name: "Paper Feed AI Summary",
            refreshIntervalHours: 24,
            cleanupReadAfterDays: 30,
            cleanupUnreadAfterDays: 365,
          },
        },
      });
    },
    async readRunState() {
      return createRunState({
        lastSuccessAt: "2026-05-24T04:00:00.000Z",
        aiSummaryLastSuccessAt: "2026-05-24T04:00:00.000Z",
      });
    },
    async rebuildAiSummaryCache() {
      return;
    },
    now: () => new Date("2026-05-24T05:00:00.000Z"),
    timer,
  });

  await scheduler.start();

  assert.equal(timer.size, 1);
  assert.equal(
    timer.getNextDelay(),
    getAiSummaryIntervalMs(24) - 60 * 60 * 1000,
  );
});

test("AI summary scheduler can run at a fixed daily local time", async () => {
  const timer = new FakeTimerDriver();
  let aiSummaryCalls = 0;
  let now = new Date(2026, 4, 24, 8, 0, 0, 0);

  const scheduler = new AiSummaryScheduler({
    async readConfig() {
      return createConfig({
        aiSummary: {
          enabled: true,
          baseUrl: "https://api.example.com/v1",
          apiKey: "sk-test",
          model: "paper-model",
          prompt: "materials discovery",
          schedule: {
            mode: "daily",
            intervalHours: 24,
            dailyTime: "09:30",
          },
          subscription: {
            name: "Paper Feed AI Summary",
            refreshIntervalHours: 24,
            cleanupReadAfterDays: 30,
            cleanupUnreadAfterDays: 365,
          },
        },
      });
    },
    async readRunState() {
      return createRunState({ aiSummaryLastSuccessAt: null });
    },
    async rebuildAiSummaryCache() {
      aiSummaryCalls += 1;
    },
    now: () => now,
    timer,
  });

  await scheduler.start();

  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), 90 * 60 * 1000);
  assert.equal(scheduler.getState().scheduleMode, "daily");
  assert.equal(scheduler.getState().dailyTime, "09:30");

  now = new Date(2026, 4, 24, 9, 30, 0, 0);
  await timer.runNext();

  assert.equal(aiSummaryCalls, 1);
  assert.equal(timer.size, 1);
  assert.equal(timer.getNextDelay(), 24 * 60 * 60 * 1000);
});
