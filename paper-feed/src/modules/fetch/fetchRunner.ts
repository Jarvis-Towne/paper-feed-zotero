import { matchesEntry } from "../domain/matcher";
import {
  buildRssXml,
  DEFAULT_MAX_ITEMS,
  sortFeedEntriesForOutput,
} from "../domain/rssSerializer";
import type {
  FeedEntry,
  FeedFetchIssue,
  FeedFetchResult,
  FeedSourceReader,
  PluginConfig,
} from "../domain/types";
import {
  createSeenIdSet,
  dedupeEntries,
  hasSeenEntry,
  recordSeenEntry,
} from "./dedupe";
import { normalizeFeedSourceItem, normalizeFeedSourceUrl } from "./feedSource";

function createFeedTitle(profileName: string) {
  return profileName ? `Paper Feed (${profileName})` : "Paper Feed";
}

function createFeedDescription(profileName: string) {
  return profileName
    ? `Filtered papers for profile ${profileName}`
    : "Filtered papers from journal RSS feeds";
}

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function runFetchPipeline(input: {
  config: PluginConfig;
  previousItems?: FeedEntry[];
  previousSeenIds?: string[];
  reader: FeedSourceReader;
  now?: Date;
  maxItems?: number;
}): Promise<FeedFetchResult> {
  const now = input.now ?? new Date();
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const previousItems = dedupeEntries(input.previousItems ?? []);
  const seenIds = createSeenIdSet(previousItems, input.previousSeenIds ?? []);
  const newItems: FeedEntry[] = [];
  const errors: FeedFetchIssue[] = [];

  for (const configuredJournal of input.config.journals) {
    const sourceUrl = normalizeFeedSourceUrl(configuredJournal.url);
    if (!sourceUrl) {
      continue;
    }

    try {
      const source = await input.reader.read(sourceUrl);
      const fallbackJournal = source.feedTitle || sourceUrl;

      for (const rawItem of source.items) {
        const entry = normalizeFeedSourceItem(rawItem, {
          fallbackJournal,
          fallbackLink: source.sourceUrl || sourceUrl,
        });

        if (!entry) {
          continue;
        }

        if (!matchesEntry(entry, input.config.keywordQueries)) {
          continue;
        }

        if (hasSeenEntry(entry, seenIds)) {
          continue;
        }

        recordSeenEntry(entry, seenIds);
        newItems.push(entry);
      }
    } catch (error) {
      errors.push({
        sourceUrl,
        message: toErrorMessage(error),
      });
    }
  }

  const items = sortFeedEntriesForOutput(
    dedupeEntries([...previousItems, ...newItems]),
    maxItems,
  );
  const finalizedSeenIds = Array.from(createSeenIdSet(items));
  const generatedAt = now.toISOString();
  const xml = buildRssXml(items, {
    title:
      input.config.subscription.name ||
      createFeedTitle(input.config.profileName),
    description: createFeedDescription(input.config.profileName),
    maxItems,
    buildDate: generatedAt,
  });

  return {
    generatedAt,
    items,
    newItems,
    seenIds: finalizedSeenIds,
    errors,
    xml,
  };
}
