import assert from "node:assert/strict";
import test from "node:test";

import type {
  AiSummaryConfig,
  PluginRunState,
} from "../../src/modules/domain/types";
import { shouldRunAiSummary } from "../../src/modules/fetch/fetchService";
import { createDefaultRunState } from "../../src/modules/storage/runStateStore";

function createAiConfig(
  overrides: Partial<AiSummaryConfig> = {},
): AiSummaryConfig {
  return {
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
    ...overrides,
  };
}

function createRunState(
  overrides: Partial<PluginRunState> = {},
): PluginRunState {
  return {
    ...createDefaultRunState(),
    ...overrides,
  };
}

test("AI summary runs when no prior successful summary is recorded", () => {
  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig(),
      runState: createRunState(),
      now: new Date("2026-05-24T05:00:00.000Z"),
    }),
    true,
  );
});

test("AI summary waits for its own configured refresh interval", () => {
  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig({
        subscription: {
          name: "Paper Feed AI Summary",
          refreshIntervalHours: 24,
          cleanupReadAfterDays: 30,
          cleanupUnreadAfterDays: 365,
        },
      }),
      runState: createRunState({
        aiSummaryLastSuccessAt: "2026-05-24T04:00:00.000Z",
      }),
      now: new Date("2026-05-24T05:00:00.000Z"),
    }),
    false,
  );

  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig(),
      runState: createRunState({
        aiSummaryLastSuccessAt: "2026-05-23T04:00:00.000Z",
      }),
      now: new Date("2026-05-24T05:00:00.000Z"),
    }),
    true,
  );
});

test("AI summary daily schedule waits until the configured local time", () => {
  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig({
        schedule: {
          mode: "daily",
          intervalHours: 24,
          dailyTime: "09:00",
        },
      }),
      runState: createRunState(),
      now: new Date(2026, 4, 24, 8, 0, 0, 0),
    }),
    false,
  );

  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig({
        schedule: {
          mode: "daily",
          intervalHours: 24,
          dailyTime: "09:00",
        },
      }),
      runState: createRunState({
        aiSummaryLastSuccessAt: new Date(2026, 4, 23, 9, 5, 0, 0).toISOString(),
      }),
      now: new Date(2026, 4, 24, 9, 0, 0, 0),
    }),
    true,
  );

  assert.equal(
    shouldRunAiSummary({
      config: createAiConfig({
        schedule: {
          mode: "daily",
          intervalHours: 24,
          dailyTime: "09:00",
        },
      }),
      runState: createRunState({
        aiSummaryLastSuccessAt: new Date(2026, 4, 24, 9, 1, 0, 0).toISOString(),
      }),
      now: new Date(2026, 4, 24, 10, 0, 0, 0),
    }),
    false,
  );
});
