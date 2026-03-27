import type {
  FeedSourceReader,
  FeedSourceResult,
} from "../../domain/types";
import { normalizeFeedSourceUrl } from "../../fetch/feedSource";

function getFeedReaderConstructor() {
  const FeedReader = (Zotero as any).FeedReader;
  if (!FeedReader) {
    throw new Error("Zotero.FeedReader is unavailable in this runtime");
  }

  return FeedReader;
}

function formatErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function describeFeedReaderFailure(
  url: string,
  error: unknown,
): Promise<string> {
  if (!Zotero.HTTP?.request) {
    return formatErrorMessage(error);
  }

  try {
    const response = await Zotero.HTTP.request("GET", url, {
      successCodes: false,
      timeout: 15000,
      responseType: "text",
      headers: {
        Accept:
          "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8",
      },
    });

    const status = response.status;
    const contentType = response.getResponseHeader("Content-Type") || "";
    const cfMitigated = response.getResponseHeader("cf-mitigated") || "";
    const responseText =
      typeof response.responseText === "string" ? response.responseText : "";

    if (status === 403 && /challenge/i.test(`${cfMitigated} ${responseText}`)) {
      return "HTTP 403 blocked by Cloudflare challenge";
    }

    if (
      /text\/html/i.test(contentType) &&
      /<(?:!doctype\s+html|html)\b/i.test(responseText)
    ) {
      return `Expected RSS/XML but received HTML (HTTP ${status || "unknown"})`;
    }

    if (status >= 400) {
      return `HTTP ${status} while loading feed`;
    }
  } catch (_diagnosticError) {
    // Ignore secondary diagnostic failures and fall back to the original error.
  }

  return formatErrorMessage(error);
}

export async function readFeedSourceWithZotero(
  url: string,
): Promise<FeedSourceResult> {
  const normalizedUrl = normalizeFeedSourceUrl(url);
  const FeedReader = getFeedReaderConstructor();
  const reader = new FeedReader(normalizedUrl);

  try {
    await reader.process();
  } catch (error) {
    throw new Error(await describeFeedReaderFailure(normalizedUrl, error));
  }

  const feedProperties = (await reader.feedProperties) || {};
  const iterator = new reader.ItemIterator();
  const items = [];

  while (true) {
    const step = iterator.next();
    const item = await step.value;

    if (!item) {
      break;
    }

    items.push(item);
  }

  return {
    sourceUrl: normalizedUrl,
    feedTitle:
      feedProperties.publicationTitle || feedProperties.title || normalizedUrl,
    items,
  };
}

export function createZoteroFeedSourceReader(): FeedSourceReader {
  return {
    read: readFeedSourceWithZotero,
  };
}
