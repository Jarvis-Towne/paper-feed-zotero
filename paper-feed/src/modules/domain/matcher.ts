import type { FeedEntry, QueryRule } from "./types";
import { normalizeSearchText } from "./normalize";

export function parseKeywordQuery(query: string): QueryRule {
  const terms = query
    .split(/\bAND\b/i)
    .map((term) => normalizeSearchText(term))
    .filter(Boolean);

  return {
    raw: query,
    terms,
  };
}

export function matchesEntry(
  entry: Pick<FeedEntry, "title" | "summary">,
  queries: string[],
) {
  const haystack = normalizeSearchText(`${entry.title} ${entry.summary}`);

  return queries.some((query) => {
    const parsed = parseKeywordQuery(query);

    if (!parsed.terms.length) {
      return false;
    }

    return parsed.terms.every((term) => haystack.includes(term));
  });
}
