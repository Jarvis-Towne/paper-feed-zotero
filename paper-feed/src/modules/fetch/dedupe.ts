import { ensureDate, normalizeSearchText } from "../domain/normalize";
import type { FeedEntry } from "../domain/types";

function canonicalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return new URL(trimmed).toString();
  } catch (_error) {
    return trimmed;
  }
}

function buildTitleDateKey(entry: FeedEntry) {
  const title = normalizeSearchText(entry.title).replace(/\s+/g, " ");
  if (!title) {
    return null;
  }

  const date = ensureDate(entry.pubDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return `title-date:${title}|${date.toISOString().slice(0, 10)}`;
}

export function getEntrySeenIds(entry: FeedEntry) {
  const keys = new Set<string>();

  const guid = entry.id?.trim();
  if (guid) {
    keys.add(`guid:${guid}`);
  }

  const doi = entry.doi?.trim().toLowerCase();
  if (doi) {
    keys.add(`doi:${doi}`);
  }

  const link = canonicalizeUrl(entry.link);
  if (link) {
    keys.add(`link:${link}`);
  }

  const titleDateKey = buildTitleDateKey(entry);
  if (titleDateKey) {
    keys.add(titleDateKey);
  }

  return [...keys];
}

export function hasSeenEntry(entry: FeedEntry, seenIds: Set<string>) {
  return getEntrySeenIds(entry).some((key) => seenIds.has(key));
}

export function recordSeenEntry(entry: FeedEntry, seenIds: Set<string>) {
  for (const key of getEntrySeenIds(entry)) {
    seenIds.add(key);
  }
}

export function createSeenIdSet(
  entries: FeedEntry[] = [],
  previousSeenIds: string[] = [],
) {
  const seenIds = new Set(previousSeenIds);

  for (const entry of entries) {
    recordSeenEntry(entry, seenIds);
  }

  return seenIds;
}

export function dedupeEntries(entries: FeedEntry[]) {
  const seenIds = new Set<string>();
  const deduped: FeedEntry[] = [];

  for (const entry of entries) {
    if (hasSeenEntry(entry, seenIds)) {
      continue;
    }

    recordSeenEntry(entry, seenIds);
    deduped.push(entry);
  }

  return deduped;
}
