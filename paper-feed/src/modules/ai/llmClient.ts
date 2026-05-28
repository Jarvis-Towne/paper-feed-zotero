import type { AiSummaryConfig } from "../domain/types";

export interface ChatCompletionMessage {
  role: "system" | "user";
  content: string;
}

export interface ChatCompletionClient {
  complete: (messages: ChatCompletionMessage[]) => Promise<string>;
}

export interface ChatCompletionResponse {
  ok: boolean;
  status: number;
  body: string;
}

export interface ChatCompletionTransport {
  postJson: (
    url: string,
    payload: unknown,
    headers: Record<string, string>,
    timeoutMs: number,
  ) => Promise<ChatCompletionResponse>;
}

const DEFAULT_TIMEOUT_MS = 300000;

function hasZoteroHttpRequest() {
  return (
    typeof Zotero !== "undefined" &&
    typeof Zotero.HTTP?.request === "function"
  );
}

async function readResponseBody(response: Response) {
  try {
    return await response.text();
  } catch (_error) {
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<T>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new Error("AI request timed out"));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timeout) {
      clearTimeout(timeout);
    }
  });
}

function normalizeBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function getCompletionsUrl(baseUrl: string) {
  return `${normalizeBaseUrl(baseUrl)}/chat/completions`;
}

function parseCompletionContent(body: string) {
  const parsed = JSON.parse(body) as {
    choices?: Array<{
      message?: {
        content?: unknown;
      };
      text?: unknown;
    }>;
  };
  const content =
    parsed.choices?.[0]?.message?.content ?? parsed.choices?.[0]?.text;

  if (typeof content !== "string" || !content.trim()) {
    throw new Error("AI response did not include message content");
  }

  return content.trim();
}

async function postJsonWithZoteroHttp(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ChatCompletionResponse> {
  const response = await Zotero.HTTP.request("POST", url, {
    body: JSON.stringify(payload),
    headers,
    responseType: "text",
    successCodes: false,
    timeout: timeoutMs,
  });

  return {
    ok: response.status >= 200 && response.status < 300,
    status: response.status,
    body: typeof response.responseText === "string" ? response.responseText : "",
  };
}

async function postJsonWithFetch(
  url: string,
  payload: unknown,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<ChatCompletionResponse> {
  if (typeof fetch !== "function") {
    throw new Error("No HTTP client is available in this runtime");
  }

  const response = await withTimeout(
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    }),
    timeoutMs,
  );

  return {
    ok: response.ok,
    status: response.status,
    body: await readResponseBody(response),
  };
}

function createDefaultTransport(): ChatCompletionTransport {
  return {
    postJson(url, payload, headers, timeoutMs) {
      if (hasZoteroHttpRequest()) {
        return postJsonWithZoteroHttp(url, payload, headers, timeoutMs);
      }

      return postJsonWithFetch(url, payload, headers, timeoutMs);
    },
  };
}

export function createOpenAiCompatibleClient(
  config: Pick<AiSummaryConfig, "baseUrl" | "apiKey" | "model">,
  transport: ChatCompletionTransport = createDefaultTransport(),
): ChatCompletionClient {
  return {
    async complete(messages) {
      const response = await transport.postJson(
        getCompletionsUrl(config.baseUrl),
        {
          model: config.model,
          messages,
          temperature: 0.2,
        },
        {
          "Content-Type": "application/json",
          Authorization: `Bearer ${config.apiKey}`,
        },
        DEFAULT_TIMEOUT_MS,
      );

      if (!response.ok) {
        throw new Error(
          `AI request failed with HTTP ${response.status}: ${response.body.slice(0, 240)}`,
        );
      }

      return parseCompletionContent(response.body);
    },
  };
}
