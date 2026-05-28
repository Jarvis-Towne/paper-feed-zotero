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

function normalizeCreatorName(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as {
    firstName?: unknown;
    lastName?: unknown;
    name?: unknown;
    creatorSummary?: unknown;
  };
  const name = firstNonEmpty(
    typeof raw.name === "string" ? raw.name : null,
    [raw.firstName, raw.lastName]
      .filter((part): part is string => typeof part === "string")
      .join(" "),
    typeof raw.creatorSummary === "string" ? raw.creatorSummary : null,
  );

  return name || null;
}

function normalizeCreators(value: unknown): string | null {
  if (Array.isArray(value)) {
    const names = value
      .map((creator) => normalizeCreatorName(creator))
      .filter((name): name is string => !!name);
    return names.length ? names.join(", ") : null;
  }

  return normalizeCreatorName(value);
}

function getItemAuthors(item: FeedSourceItem) {
  return firstNonEmpty(
    normalizeCreators(item.creators),
    normalizeCreators(item.authors),
    item.creatorSummary,
    item.author,
    item.creator,
  );
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
    authors: getItemAuthors(item),
  };
}
