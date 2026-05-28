import { ensureDate } from "../domain/normalize";
import type { AiSummarySnapshot, FeedEntry } from "../domain/types";
import {
  readTextFileIfExists,
  writeTextFile,
} from "../zotero/compat/fileSystem";
import { getAiSummarySnapshotFilePath } from "./paths";

export const DEFAULT_AI_SUMMARY_SNAPSHOT: AiSummarySnapshot = {
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
    journal: raw.journal || "Paper Feed AI",
    id: raw.id || fallbackLink,
    pubDate: ensureDate(raw.pubDate),
    doi: raw.doi ?? null,
    authors: raw.authors ?? null,
    isOld: raw.isOld ?? false,
  };
}

export function createEmptyAiSummarySnapshot(): AiSummarySnapshot {
  return {
    ...DEFAULT_AI_SUMMARY_SNAPSHOT,
    items: [],
  };
}

export function serializeAiSummarySnapshot(snapshot: AiSummarySnapshot) {
  return JSON.stringify(
    {
      generatedAt: snapshot.generatedAt ?? null,
      items: snapshot.items.map(serializeEntry),
    },
    null,
    2,
  );
}

export function parseStoredAiSummarySnapshot(raw: string): AiSummarySnapshot {
  const parsed = JSON.parse(raw) as Partial<AiSummarySnapshot> & {
    items?: Partial<FeedEntry>[];
  };

  return {
    generatedAt: parsed.generatedAt ?? null,
    items: Array.isArray(parsed.items) ? parsed.items.map(parseEntry) : [],
  };
}

export async function readAiSummarySnapshot(
  baseDir?: string,
): Promise<AiSummarySnapshot> {
  const path = getAiSummarySnapshotFilePath(baseDir);
  const raw = await readTextFileIfExists(path);

  if (!raw) {
    return createEmptyAiSummarySnapshot();
  }

  return parseStoredAiSummarySnapshot(raw);
}

export async function writeAiSummarySnapshot(
  snapshot: AiSummarySnapshot,
  baseDir?: string,
): Promise<void> {
  const path = getAiSummarySnapshotFilePath(baseDir);
  await writeTextFile(path, serializeAiSummarySnapshot(snapshot));
}

export async function ensureAiSummarySnapshotInitialized(baseDir?: string) {
  const snapshot = await readAiSummarySnapshot(baseDir);
  await writeAiSummarySnapshot(snapshot, baseDir);
  return snapshot;
}
