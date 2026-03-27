import { ensureDate } from "../domain/normalize";
import type { FeedEntry, FeedSnapshot } from "../domain/types";
import {
  readTextFileIfExists,
  writeTextFile,
} from "../zotero/compat/fileSystem";
import { getSnapshotFilePath } from "./paths";

export const DEFAULT_FEED_SNAPSHOT: FeedSnapshot = {
  generatedAt: null,
  items: [],
};

function serializeEntry(entry: FeedEntry) {
  return {
    ...entry,
    pubDate: ensureDate(entry.pubDate).toISOString(),
  };
}

function parseEntry(raw: Partial<FeedEntry>): FeedEntry {
  const fallbackLink = raw.link || raw.id || "http://127.0.0.1/";

  return {
    title: raw.title || "(untitled)",
    link: fallbackLink,
    summary: raw.summary || "",
    journal: raw.journal || "Unknown Journal",
    id: raw.id || fallbackLink,
    pubDate: ensureDate(raw.pubDate),
    doi: raw.doi ?? null,
    isOld: raw.isOld ?? false,
  };
}

export function createEmptyFeedSnapshot(): FeedSnapshot {
  return {
    ...DEFAULT_FEED_SNAPSHOT,
    items: [],
  };
}

export function serializeFeedSnapshot(snapshot: FeedSnapshot) {
  return JSON.stringify(
    {
      generatedAt: snapshot.generatedAt ?? null,
      items: snapshot.items.map(serializeEntry),
    },
    null,
    2,
  );
}

export function parseStoredFeedSnapshot(raw: string): FeedSnapshot {
  const parsed = JSON.parse(raw) as Partial<FeedSnapshot> & {
    items?: Partial<FeedEntry>[];
  };

  return {
    generatedAt: parsed.generatedAt ?? null,
    items: Array.isArray(parsed.items) ? parsed.items.map(parseEntry) : [],
  };
}

export async function readFeedSnapshot(baseDir?: string): Promise<FeedSnapshot> {
  const path = getSnapshotFilePath(baseDir);
  const raw = await readTextFileIfExists(path);

  if (!raw) {
    return createEmptyFeedSnapshot();
  }

  return parseStoredFeedSnapshot(raw);
}

export async function writeFeedSnapshot(
  snapshot: FeedSnapshot,
  baseDir?: string,
): Promise<void> {
  const path = getSnapshotFilePath(baseDir);
  await writeTextFile(path, serializeFeedSnapshot(snapshot));
}

export async function ensureFeedSnapshotInitialized(baseDir?: string) {
  const snapshot = await readFeedSnapshot(baseDir);
  await writeFeedSnapshot(snapshot, baseDir);
  return snapshot;
}
