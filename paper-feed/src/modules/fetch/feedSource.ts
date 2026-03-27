import { ensureDate } from "../domain/normalize";
import type { FeedEntry, FeedSourceItem } from "../domain/types";

const URL_SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i;

function firstNonEmpty(...values: Array<string | null | undefined>) {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

export function normalizeFeedSourceUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return "";
  }

  if (URL_SCHEME_RE.test(trimmed)) {
    return trimmed;
  }

  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }

  return `https://${trimmed.replace(/^\/+/, "")}`;
}

export function normalizeFeedSourceItem(
  item: FeedSourceItem,
  options: {
    fallbackJournal: string;
    fallbackLink: string;
  },
): FeedEntry | null {
  const id = firstNonEmpty(item.guid, item.id);
  const link = firstNonEmpty(item.url, item.link, id, options.fallbackLink);

  if (!id && !link) {
    return null;
  }

  return {
    title: firstNonEmpty(item.title, "(untitled)")!,
    link: link!,
    summary: firstNonEmpty(item.abstractNote, item.summary) || "",
    journal: firstNonEmpty(item.publicationTitle, options.fallbackJournal)!,
    id: id || link!,
    pubDate: ensureDate(item.pubDate ?? item.date),
    doi: firstNonEmpty(item.DOI, item.doi),
  };
}
