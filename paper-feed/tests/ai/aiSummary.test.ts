import assert from "node:assert/strict";
import test from "node:test";

import type {
  AiSummaryConfig,
  FeedEntry,
} from "../../src/modules/domain/types";
import {
  generateAiSummaryReport,
  isAiSummaryConfigUsable,
} from "../../src/modules/ai/aiSummary";
import type { ChatCompletionClient } from "../../src/modules/ai/llmClient";

function createAiConfig(
  overrides: Partial<AiSummaryConfig> = {},
): AiSummaryConfig {
  return {
    enabled: true,
    baseUrl: "https://api.example.com/v1",
    apiKey: "sk-test",
    model: "paper-model",
    prompt: "1. solid electrolytes\n2. catalysts",
    subscription: {
      name: "Paper Feed AI Summary",
      refreshIntervalHours: 24,
      cleanupReadAfterDays: 30,
      cleanupUnreadAfterDays: 365,
    },
    ...overrides,
  };
}

function createPaper(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return {
    title: "Fast lithium conduction in solid electrolytes",
    link: "https://example.com/paper",
    summary: "This paper studies lithium ion transport in a solid electrolyte.",
    journal: "Advanced Materials",
    id: "paper-1",
    pubDate: new Date("2026-05-22T00:00:00.000Z"),
    doi: "10.1000/example",
    authors: "A. Zhang, B. Chen",
    ...overrides,
  };
}

test("isAiSummaryConfigUsable requires enabled API settings and prompt", () => {
  assert.equal(isAiSummaryConfigUsable(createAiConfig()), true);
  assert.equal(
    isAiSummaryConfigUsable(createAiConfig({ enabled: false })),
    false,
  );
  assert.equal(isAiSummaryConfigUsable(createAiConfig({ apiKey: "" })), false);
  assert.equal(isAiSummaryConfigUsable(createAiConfig({ prompt: "" })), false);
});

test("generateAiSummaryReport summarizes papers in batches then wraps final HTML", async () => {
  const calls: string[] = [];
  const client: ChatCompletionClient = {
    async complete(messages) {
      calls.push(messages.at(-1)?.content || "");
      if (calls.length === 1) {
        return '[{"id":1,"matched_direction":"solid electrolytes","importance":"high","summary":"本文研究固态电解质中的锂离子输运，并结合 <strong>VASP</strong> 计算分析迁移能垒。"}]';
      }
      return "<section><h3>固态电解质</h3><p><strong>VASP</strong> summary.</p></section>";
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(calls.length, 2);
  assert.match(calls[1], /Classified Paper Summaries/);
  assert.equal(report.generatedAt, "2026-05-22T08:00:00.000Z");
  assert.equal(report.matchedCount, 1);
  assert.match(report.entry.title, /2026-05-22 16:00/);
  assert.equal(report.entry.id, "paper-feed-ai-summary-2026-05-22-16-00-00");
  assert.match(report.entry.link, /\/paper-feed\/ai\/2026-05-22-16-00-00$/);
  assert.match(report.entry.summary, /Daily AI Literature Insights/);
  assert.match(report.entry.summary, /<strong>VASP<\/strong>/);
});

test("generateAiSummaryReport creates an empty report without synthesis call", async () => {
  let calls = 0;
  const client: ChatCompletionClient = {
    async complete() {
      calls += 1;
      return "[]";
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(calls, 1);
  assert.equal(report.matchedCount, 0);
  assert.match(report.entry.summary, /今日暂无/);
});

test("generateAiSummaryReport screens large paper lists in batches", async () => {
  const screeningCalls: string[] = [];
  const client: ChatCompletionClient = {
    async complete(messages) {
      const content = messages.at(-1)?.content || "";
      if (/Paper Batch/.test(content)) {
        screeningCalls.push(content);
        return "[]";
      }
      return "<p>unused</p>";
    },
  };
  const papers = Array.from({ length: 61 }, (_value, index) =>
    createPaper({
      title: `Paper ${index + 1}`,
      id: `paper-${index + 1}`,
    }),
  );

  await generateAiSummaryReport({
    config: createAiConfig(),
    papers,
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(screeningCalls.length, 3);
  assert.match(screeningCalls[0], /"id": 25/);
  assert.doesNotMatch(screeningCalls[0], /"id": 26/);
  assert.match(screeningCalls[2], /"id": 61/);
});
