import type { FeedEntry } from "../domain/types";
import { getServerBaseUrl } from "../zotero/compat/server";

export const AI_SUMMARY_HTML_ENDPOINT_PREFIX = "/paper-feed/ai";

export function getAiSummaryDateSlug(value: FeedEntry | Date | string) {
  if (typeof value === "string") {
    const dateMatch = value.match(/\d{4}-\d{2}-\d{2}(?:-\d{2}-\d{2}-\d{2})?/);
    return dateMatch?.[0] || value;
  }

  if (!(value instanceof Date)) {
    const idMatch = value.id.match(/\d{4}-\d{2}-\d{2}(?:-\d{2}-\d{2}-\d{2})?/);
    if (idMatch) {
      return idMatch[0];
    }

    const linkMatch = value.link.match(
      /\d{4}-\d{2}-\d{2}(?:-\d{2}-\d{2}-\d{2})?/,
    );
    if (linkMatch) {
      return linkMatch[0];
    }
  }

  const date = value instanceof Date ? value : value.pubDate;
  return date.toISOString().slice(0, 10);
}

export function getAiSummaryHtmlPath(value: FeedEntry | Date | string) {
  const date = encodeURIComponent(getAiSummaryDateSlug(value));
  return `${AI_SUMMARY_HTML_ENDPOINT_PREFIX}/${date}`;
}

export function getAiSummaryHtmlUrl(
  value: FeedEntry | Date | string,
  baseUrl = getServerBaseUrl(),
) {
  return `${baseUrl}${getAiSummaryHtmlPath(value)}`;
}

export function withAiSummaryHtmlLinks(
  items: FeedEntry[],
  baseUrl = getServerBaseUrl(),
) {
  return items.map((item) => ({
    ...item,
    link: getAiSummaryHtmlUrl(item, baseUrl),
  }));
}
