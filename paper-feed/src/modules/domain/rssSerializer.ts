import { cleanTitle, getJournalAbbr } from "./journalMap";
import { ensureDate, escapeXml, removeIllegalXmlChars } from "./normalize";
import type { FeedEntry, RssBuildOptions } from "./types";

export const DEFAULT_FEED_TITLE = "Paper Feed";
export const DEFAULT_FEED_LINK = "http://127.0.0.1/";
export const DEFAULT_FEED_DESCRIPTION = "Filtered papers from journal RSS feeds";
export const DEFAULT_MAX_ITEMS = 1000;

function toRfc822Date(value: Date) {
  return value.toUTCString();
}

function serializeItem(item: FeedEntry) {
  const title = removeIllegalXmlChars(cleanTitle(item.title, item.journal));
  const description = removeIllegalXmlChars(item.summary);
  const source = removeIllegalXmlChars(getJournalAbbr(item.journal));
  const guid = removeIllegalXmlChars(item.id || item.link);
  const link = removeIllegalXmlChars(item.link);
  const pubDate = ensureDate(item.pubDate);

  return [
    "<item>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    `<guid isPermaLink="false">${escapeXml(guid)}</guid>`,
    `<pubDate>${escapeXml(toRfc822Date(pubDate))}</pubDate>`,
    `<dc:source>${escapeXml(source)}</dc:source>`,
    "</item>",
  ].join("");
}

export function sortFeedEntriesForOutput(
  items: FeedEntry[],
  maxItems: number = DEFAULT_MAX_ITEMS,
) {
  return [...items]
    .sort(
      (left, right) =>
        ensureDate(right.pubDate).getTime() - ensureDate(left.pubDate).getTime(),
    )
    .slice(0, maxItems);
}

export function buildRssXml(
  items: FeedEntry[],
  options: RssBuildOptions = {},
) {
  const title = options.title ?? DEFAULT_FEED_TITLE;
  const link = options.link ?? DEFAULT_FEED_LINK;
  const description = options.description ?? DEFAULT_FEED_DESCRIPTION;
  const maxItems = options.maxItems ?? DEFAULT_MAX_ITEMS;

  const sortedItems = sortFeedEntriesForOutput(items, maxItems);

  const serializedItems = sortedItems.map(serializeItem).join("");
  const buildDate = toRfc822Date(ensureDate(options.buildDate ?? new Date()));

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/">',
    "<channel>",
    `<title>${escapeXml(title)}</title>`,
    `<link>${escapeXml(link)}</link>`,
    `<description>${escapeXml(description)}</description>`,
    `<lastBuildDate>${escapeXml(buildDate)}</lastBuildDate>`,
    serializedItems,
    "</channel>",
    "</rss>",
  ].join("");
}
