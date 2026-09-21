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

export function extractDoi(value: string | null | undefined): string | null {
  if (!value) return null;
  let text = value.trim();
  try {
    text = decodeURIComponent(text);
  } catch {
    // Keep literal text when a publisher supplies malformed URL encoding.
  }
  // Silverchair article URLs append an internal article ID and title to the DOI.
  const acs = text.match(
    /pubs\.acs\.org\/[^/]+\/article\/doi\/(10\.1021\/[^/?#\s]+)/i,
  );
  if (acs) return acs[1];
  return text.match(/10\.\d{4,9}\/[^\s<>"?#]+/i)?.[0] || null;
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

  const normalized = URL_SCHEME_RE.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, "")}`;
  try {
    const parsed = new URL(normalized);
    if (
      parsed.hostname === "pubs.acs.org" &&
      parsed.pathname === "/action/showFeed"
    ) {
      const code = parsed.searchParams.get("jc");
      const type = parsed.searchParams.get("type");
      if (
        code &&
        /^[a-z0-9]+$/i.test(code) &&
        (type === "axatoc" || type === "etoc")
      ) {
        return `https://pubs.acs.org/rss/${code}/${type === "axatoc" ? "asap" : "currentIssue"}.xml`;
      }
    }
  } catch {
    // Let the source reader report invalid URLs.
  }
  return normalized;
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
    doi:
      extractDoi(firstNonEmpty(item.DOI, item.doi)) ||
      extractDoi(link) ||
      extractDoi(id),
    authors: getItemAuthors(item),
    authorNames: Array.isArray(item.creators)
      ? item.creators
          .map(normalizeCreatorName)
          .filter((name): name is string => !!name)
      : undefined,
    volume: item.volume,
    issue: item.issue,
    pages: item.pages,
    ISSN: item.ISSN,
  };
}
