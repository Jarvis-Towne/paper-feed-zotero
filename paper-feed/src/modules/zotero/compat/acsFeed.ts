import type { FeedSourceResult } from "../../domain/types";

export function isAcsFeedUrl(url: string) {
  return /^https?:\/\/pubs\.acs\.org\/rss\/[a-z0-9]+\/(?:asap|currentIssue)\.xml$/i.test(
    url,
  );
}

export function parseAcsFeed(
  document: Document | null,
  sourceUrl: string,
): FeedSourceResult {
  if (!document)
    throw new Error("Expected ACS RSS/XML but received no XML document");
  const channel = document.getElementsByTagName("channel")[0];
  if (document.documentElement?.localName !== "rss" || !channel) {
    throw new Error("Expected ACS RSS/XML but received an invalid feed");
  }
  const value = (element: Element, name: string) =>
    element.getElementsByTagNameNS("*", name)[0]?.textContent?.trim() || null;
  const feedTitle =
    value(channel, "title")?.replace(
      /\s+(?:advanceAccess|Current Issue)$/i,
      "",
    ) || sourceUrl;
  return {
    sourceUrl,
    feedTitle,
    items: Array.from<Element>(channel.getElementsByTagName("item")).map(
      (item) => {
        const start = value(item, "startingPage");
        const end = value(item, "endingPage");
        return {
          guid: value(item, "guid"),
          title: value(item, "title"),
          url: value(item, "link"),
          abstractNote: value(item, "description"),
          date: value(item, "pubDate"),
          publicationTitle: feedTitle,
          // ACS currently emits xmlns:prism="prism" on individual fields.
          DOI: value(item, "doi"),
          creators: Array.from<Element>(
            item.getElementsByTagNameNS("*", "creator"),
          )
            .map((creator) => creator.textContent?.trim())
            .filter(Boolean),
          volume: value(item, "volume"),
          issue: value(item, "number"),
          pages:
            value(item, "pageRange") ||
            (start && end ? `${start}–${end}` : start || end),
          ISSN: value(item, "issn"),
        };
      },
    ),
  };
}

export async function readAcsFeed(url: string) {
  const response = await Zotero.HTTP.request("GET", url, {
    responseType: "document",
    timeout: 20000,
    errorDelayMax: 0,
    headers: { Accept: "application/rss+xml, application/xml, text/xml" },
  });
  return parseAcsFeed(response.responseXML, url);
}
