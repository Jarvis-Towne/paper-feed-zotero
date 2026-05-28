import {
  getGeneratedAiSummaryFeedXml,
  getGeneratedFeedXml,
} from "../fetch/fetchService";
import type { SendResponseCallback } from "../zotero/compat/server";

export const RSS_ENDPOINT_PATH = "/paper-feed/rss/default";
export const AI_RSS_ENDPOINT_PATH = "/paper-feed/rss/ai";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class RssEndpoint {
  supportedMethods = ["GET"];
  supportedDataTypes = ["application/rss+xml"];
  allowRequestsFromUnsafeWebContent = true;

  async init(_data: unknown, sendResponseCallback: SendResponseCallback) {
    try {
      const xml = await getGeneratedFeedXml();
      sendResponseCallback(200, "application/rss+xml; charset=utf-8", xml);
    } catch (error) {
      sendResponseCallback(
        500,
        "text/plain; charset=utf-8",
        `Failed to load RSS snapshot: ${toErrorMessage(error)}`,
      );
    }
  }
}

export class AiRssEndpoint {
  supportedMethods = ["GET"];
  supportedDataTypes = ["application/rss+xml"];
  allowRequestsFromUnsafeWebContent = true;

  async init(_data: unknown, sendResponseCallback: SendResponseCallback) {
    try {
      const xml = await getGeneratedAiSummaryFeedXml();
      sendResponseCallback(200, "application/rss+xml; charset=utf-8", xml);
    } catch (error) {
      sendResponseCallback(
        500,
        "text/plain; charset=utf-8",
        `Failed to load AI RSS snapshot: ${toErrorMessage(error)}`,
      );
    }
  }
}
