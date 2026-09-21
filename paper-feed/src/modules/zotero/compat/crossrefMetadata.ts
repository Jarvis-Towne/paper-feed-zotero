import type { FeedEntry } from "../../domain/types";
import { extractDoi } from "../../fetch/feedSource";

interface CrossrefWork {
  DOI?: string;
  author?: Array<{ given?: string; family?: string; name?: string }>;
  "container-title"?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  ISSN?: string[];
}

export async function enrichFromCrossref(entry: FeedEntry): Promise<FeedEntry> {
  if (!entry.doi || entry.authors) return entry;
  const response = await Zotero.HTTP.request(
    "GET",
    `https://api.crossref.org/works/${encodeURIComponent(entry.doi)}`,
    {
      responseType: "json",
      successCodes: [200, 404],
      timeout: 10000,
      errorDelayMax: 0,
      headers: { Accept: "application/json" },
    },
  );
  if (response.status === 404) return entry;
  const work = response.response?.message as CrossrefWork | undefined;
  if (
    !work ||
    extractDoi(work.DOI)?.toLowerCase() !== entry.doi.toLowerCase()
  ) {
    throw new Error(
      "Crossref returned metadata for a different or missing DOI",
    );
  }
  const names = (work.author || [])
    .map(
      (author) =>
        author.name?.trim() ||
        [author.given, author.family].filter(Boolean).join(" ").trim(),
    )
    .filter(Boolean);
  return {
    ...entry,
    authors: names.length ? names.join(", ") : entry.authors,
    authorNames: names.length ? names : entry.authorNames,
    journal: work["container-title"]?.[0] || entry.journal,
    volume: entry.volume || work.volume,
    issue: entry.issue || work.issue,
    pages: entry.pages || work.page,
    ISSN: entry.ISSN || work.ISSN?.[0],
  };
}
