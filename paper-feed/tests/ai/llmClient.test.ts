import assert from "node:assert/strict";
import test from "node:test";

import {
  createOpenAiCompatibleClient,
  type ChatCompletionTransport,
} from "../../src/modules/ai/llmClient";

function createTransport(body: string): ChatCompletionTransport {
  return {
    async postJson() {
      return {
        ok: true,
        status: 200,
        body,
      };
    },
  };
}

test("524 reports a compact error and Zotero transport does not retry implicitly", async () => {
  const original = globalThis.Zotero;
  let calls = 0;
  (globalThis as any).Zotero = {
    HTTP: {
      async request(
        _method: string,
        _url: string,
        options: { errorDelayMax: number; successCodes: boolean },
      ) {
        calls++;
        assert.equal(options.errorDelayMax, 0);
        assert.equal(options.successCodes, false);
        return {
          status: 524,
          responseText: "<!DOCTYPE html><html>Cloudflare error page</html>",
        };
      },
    },
  };
  try {
    const client = createOpenAiCompatibleClient({
      baseUrl: "https://example.com/v1",
      apiKey: "test",
      model: "test",
    });
    await assert.rejects(
      client.complete([{ role: "user", content: "test" }]),
      /^Error: AI request failed with HTTP 524: upstream gateway timed out$/,
    );
    assert.equal(calls, 1);
  } finally {
    (globalThis as any).Zotero = original;
  }
});

test("complete accepts text content parts from compatible chat APIs", async () => {
  const client = createOpenAiCompatibleClient(
    {
      baseUrl: "https://api.example.com/v1",
      apiKey: "sk-test",
      model: "paper-model",
    },
    createTransport(
      JSON.stringify({
        choices: [
          {
            message: {
              role: "assistant",
              content: [
                { type: "text", text: "  [" },
                {
                  type: "text",
                  text: '{"id":1,"matched_direction":"solid electrolytes","summary":"相关"}',
                },
                { type: "text", text: "]  " },
              ],
            },
          },
        ],
      }),
    ),
  );

  assert.equal(
    await client.complete([{ role: "user", content: "screen papers" }]),
    '[{"id":1,"matched_direction":"solid electrolytes","summary":"相关"}]',
  );
});
