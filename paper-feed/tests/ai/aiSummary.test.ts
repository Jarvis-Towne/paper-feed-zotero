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
  assert.match(calls[0], /Importance order affects ranking only/);
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

test("generateAiSummaryReport keeps every selected paper beyond forty", async () => {
  const client: ChatCompletionClient = {
    async complete(messages) {
      const content = messages.at(-1)?.content || "";
      if (/Paper Batch/.test(content)) {
        const ids = [...content.matchAll(/"id": (\d+)/g)].map((match) =>
          Number(match[1]),
        );
        return JSON.stringify(
          ids.map((id) => ({
            id,
            matched_direction: "solid electrolytes",
            summary: `Summary ${id}`,
          })),
        );
      }
      return "<p>final</p>";
    },
  };
  const papers = Array.from({ length: 41 }, (_value, index) =>
    createPaper({
      title: `Paper ${index + 1}`,
      id: `paper-${index + 1}`,
    }),
  );

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers,
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(report.matchedCount, 41);
});

test("generateAiSummaryReport annotates failed screening batches", async () => {
  let calls = 0;
  const client: ChatCompletionClient = {
    async complete() {
      calls += 1;
      if (calls === 2) {
        throw new Error("HTTP 403");
      }
      return "[]";
    },
  };
  const papers = Array.from({ length: 26 }, (_value, index) =>
    createPaper({
      title: `Paper ${index + 1}`,
      id: `paper-${index + 1}`,
    }),
  );

  await assert.rejects(
    generateAiSummaryReport({
      config: createAiConfig(),
      papers,
      client,
      now: new Date("2026-05-22T08:00:00.000Z"),
    }),
    /AI screening batch 2\/2 failed for papers 26-26: HTTP 403/,
  );
});

test("generateAiSummaryReport retries empty screening responses", async () => {
  let screeningCalls = 0;
  const client: ChatCompletionClient = {
    async complete(messages) {
      const systemMessage = messages[0]?.content || "";
      if (/screening and summarization/.test(systemMessage)) {
        screeningCalls += 1;
        if (screeningCalls === 1) {
          throw new Error("AI response did not include message content");
        }
        return '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关总结"}]';
      }

      return "<p>final</p>";
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(screeningCalls, 2);
  assert.equal(report.matchedCount, 1);
  assert.deepEqual(report.warnings, []);
});

test("generateAiSummaryReport retries a transient screening gateway error", async () => {
  let screeningCalls = 0;
  const client: ChatCompletionClient = {
    async complete(messages) {
      const systemMessage = messages[0]?.content || "";
      if (/screening and summarization/.test(systemMessage)) {
        screeningCalls += 1;
        if (screeningCalls === 1) {
          throw new Error("AI request failed with HTTP 502: Bad Gateway");
        }
        return '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关总结"}]';
      }

      return "<p>final</p>";
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(screeningCalls, 2);
  assert.equal(report.matchedCount, 1);
  assert.deepEqual(report.warnings, []);
});

test("generateAiSummaryReport fails instead of omitting a persistently empty paper", async () => {
  const screeningPrompts: string[] = [];
  const client: ChatCompletionClient = {
    async complete(messages) {
      const systemMessage = messages[0]?.content || "";
      const userMessage = messages.at(-1)?.content || "";
      if (/screening and summarization/.test(systemMessage)) {
        screeningPrompts.push(userMessage);
        if (/"id": 1,[\s\S]*"id": 2/.test(userMessage)) {
          throw new Error("AI response did not include message content");
        }
        if (/"id": 1/.test(userMessage)) {
          return '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关总结"}]';
        }

        throw new Error("AI response did not include message content");
      }

      return "<p>final</p>";
    },
  };

  await assert.rejects(
    generateAiSummaryReport({
      config: createAiConfig(),
      papers: [
        createPaper({ id: "paper-1", title: "Paper 1" }),
        createPaper({ id: "paper-2", title: "Paper 2" }),
      ],
      client,
      now: new Date("2026-05-22T08:00:00.000Z"),
    }),
    /AI screening paper 2 returned empty content after 3 attempts/,
  );

  assert.ok(screeningPrompts.length >= 7);
});

test("generateAiSummaryReport annotates failed final synthesis", async () => {
  let calls = 0;
  const client: ChatCompletionClient = {
    async complete() {
      calls += 1;
      if (calls === 1) {
        return '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关总结"}]';
      }
      throw new Error("HTTP 403");
    },
  };

  await assert.rejects(
    generateAiSummaryReport({
      config: createAiConfig(),
      papers: [createPaper()],
      client,
      now: new Date("2026-05-22T08:00:00.000Z"),
    }),
    /AI final HTML synthesis failed after 1 selected papers: HTTP 403/,
  );
});

test("generateAiSummaryReport falls back to local HTML on final synthesis timeout", async () => {
  let calls = 0;
  const client: ChatCompletionClient = {
    async complete() {
      calls += 1;
      if (calls === 1) {
        return '[{"id":1,"matched_direction":"solid electrolytes","importance":"high","summary":"本文研究固态电解质中的锂离子输运。"}]';
      }
      throw new Error("AI request failed with HTTP 524: <!DOCTYPE html>");
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(calls, 4);
  assert.equal(report.matchedCount, 1);
  assert.match(report.warnings.join("\n"), /local HTML fallback/i);
  assert.match(report.entry.summary, /Paper Feed 注意/);
  assert.match(report.entry.summary, /AI 最终排版请求连续失败/);
  assert.doesNotMatch(report.entry.summary, /筛选过程中有部分批次返回空内容/);
  assert.doesNotMatch(report.entry.summary, /可能遗漏少量论文/);
  assert.match(report.entry.summary, /Fast lithium conduction/);
  assert.match(report.entry.summary, /本文研究固态电解质中的锂离子输运。/);
});

test("screening splits persistent 524 batches and preserves global paper IDs", async () => {
  const ranges: number[][] = [];
  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper({ id: "a" }), createPaper({ id: "b" })],
    client: {
      async complete(messages) {
        if (/screening and summarization/.test(messages[0].content)) {
          const ids = [...messages[1].content.matchAll(/"id": (\d+)/g)].map(
            (match) => Number(match[1]),
          );
          ranges.push(ids);
          if (ids.length > 1)
            throw new Error("AI request failed with HTTP 524: gateway timeout");
          return JSON.stringify(
            ids.map((id) => ({
              id,
              matched_direction: "solid electrolytes",
              summary: `summary-${id}`,
            })),
          );
        }
        throw new Error("AI request failed with HTTP 524: gateway timeout");
      },
    },
  });
  assert.equal(report.matchedCount, 2);
  assert.deepEqual(ranges.slice(-2), [[1], [2]]);
  assert.match(report.entry.summary, /summary-1/);
  assert.match(report.entry.summary, /summary-2/);
});

test("screening single-paper timeout fails with stage and paper range", async () => {
  let calls = 0;
  await assert.rejects(
    generateAiSummaryReport({
      config: createAiConfig(),
      papers: [createPaper()],
      client: {
        async complete() {
          calls++;
          throw new Error("AI request failed with HTTP 524: timeout");
        },
      },
    }),
    /AI screening batch 1\/1 failed for papers 1-1: AI screening paper 1 failed after 3 attempts.*HTTP 524/,
  );
  assert.equal(calls, 3);
});

test("authentication failure is not retried or split", async () => {
  let calls = 0;
  await assert.rejects(
    generateAiSummaryReport({
      config: createAiConfig(),
      papers: [createPaper(), createPaper()],
      client: {
        async complete() {
          calls++;
          throw new Error("AI request failed with HTTP 401: Unauthorized");
        },
      },
    }),
    /HTTP 401/,
  );
  assert.equal(calls, 1);
});

test("generateAiSummaryReport retries a transient final synthesis timeout", async () => {
  let calls = 0;
  const client: ChatCompletionClient = {
    async complete() {
      calls += 1;
      if (calls === 1) {
        return '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关总结"}]';
      }
      if (calls === 2) {
        throw new Error("AI request failed with HTTP 523: origin unreachable");
      }
      return "<p>final after retry</p>";
    },
  };

  const report = await generateAiSummaryReport({
    config: createAiConfig(),
    papers: [createPaper()],
    client,
    now: new Date("2026-05-22T08:00:00.000Z"),
  });

  assert.equal(calls, 3);
  assert.deepEqual(report.warnings, []);
  assert.match(report.entry.summary, /final after retry/);
});
