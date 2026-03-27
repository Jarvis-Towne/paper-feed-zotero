import { buildRssXml } from "../domain/rssSerializer";
import type { FeedFetchResult, FeedRuntimeSummary } from "../domain/types";
import {
  ensureConfigInitialized,
  readConfig,
} from "../storage/configStore";
import {
  ensureFeedSnapshotInitialized,
  readFeedSnapshot,
  writeFeedSnapshot,
} from "../storage/feedSnapshotStore";
import {
  createFailedRunState,
  createSuccessfulRunState,
  ensureRunStateInitialized,
  readRunState,
  writeRunState,
} from "../storage/runStateStore";
import { createZoteroFeedSourceReader } from "../zotero/compat/feedReader";
import { refreshManagedFeedSubscription } from "../zotero/feedProvision";
import { runFetchPipeline } from "./fetchRunner";

let activeRebuildPromise: Promise<FeedFetchResult> | null = null;

function createFeedTitle(profileName: string) {
  return profileName ? `Paper Feed (${profileName})` : "Paper Feed";
}

function createFeedDescription(profileName: string) {
  return profileName
    ? `Filtered papers for profile ${profileName}`
    : "Filtered papers from journal RSS feeds";
}

function formatIssues(result: FeedFetchResult) {
  if (!result.errors.length) {
    return null;
  }

  return result.errors
    .map((error) => `${error.sourceUrl}: ${error.message}`)
    .join("\n");
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeIssueMessages(...messages: Array<string | null>) {
  return messages.filter(Boolean).join("\n") || null;
}

function updateServerRuntimeMetadata(input: {
  generatedAt: string;
  storedItemCount: number;
}) {
  const state = addon.data.server;
  if (!state) {
    return;
  }

  state.generatedAt = input.generatedAt;
  state.storedItemCount = input.storedItemCount;
}

async function refreshManagedFeedSubscriptionSafely() {
  try {
    await refreshManagedFeedSubscription();
    return null;
  } catch (error) {
    if (typeof Zotero !== "undefined" && typeof Zotero.logError === "function") {
      Zotero.logError(error instanceof Error ? error : new Error(String(error)));
    }

    return `Managed Zotero feed refresh failed: ${formatError(error)}`;
  }
}

export async function ensureFeedStorageInitialized() {
  const [config, runState, snapshot] = await Promise.all([
    ensureConfigInitialized(),
    ensureRunStateInitialized(),
    ensureFeedSnapshotInitialized(),
  ]);

  return {
    config,
    runState,
    snapshot,
  };
}

export async function getFeedRuntimeSummary(): Promise<FeedRuntimeSummary> {
  const [config, runState, snapshot] = await Promise.all([
    readConfig(),
    readRunState(),
    readFeedSnapshot(),
  ]);

  return {
    profileName: config.profileName,
    generatedAt: snapshot.generatedAt ?? runState.generatedAt,
    lastRunAt: runState.lastRunAt,
    lastSuccessAt: runState.lastSuccessAt,
    lastError: runState.lastError,
    autoFetchEnabled: config.autoFetchEnabled,
    autoFetchIntervalHours: config.autoFetchIntervalHours,
    journalCount: config.journals.length,
    queryCount: config.keywordQueries.length,
    storedItemCount: snapshot.items.length,
    lastMatchCount: runState.lastMatchCount,
  };
}

export async function getGeneratedFeedXml() {
  const [config, snapshot] = await Promise.all([readConfig(), readFeedSnapshot()]);

  return buildRssXml(snapshot.items, {
    title: config.subscription.name || createFeedTitle(config.profileName),
    description: createFeedDescription(config.profileName),
    buildDate: snapshot.generatedAt,
  });
}

async function performRebuildFeedCache() {
  const [config, runState, snapshot] = await Promise.all([
    readConfig(),
    readRunState(),
    readFeedSnapshot(),
  ]);

  try {
    const result = await runFetchPipeline({
      config,
      previousItems: snapshot.items,
      previousSeenIds: runState.seenIds,
      reader: createZoteroFeedSourceReader(),
    });

    await writeFeedSnapshot({
      generatedAt: result.generatedAt,
      items: result.items,
    });
    const lastError = mergeIssueMessages(
      formatIssues(result),
      await refreshManagedFeedSubscriptionSafely(),
    );
    await writeRunState(
      createSuccessfulRunState(runState, {
        generatedAt: result.generatedAt,
        lastError,
        seenIds: result.seenIds,
        lastMatchCount: result.newItems.length,
        storedItemCount: result.items.length,
      }),
    );
    updateServerRuntimeMetadata({
      generatedAt: result.generatedAt,
      storedItemCount: result.items.length,
    });

    return result;
  } catch (error) {
    await writeRunState(
      createFailedRunState(runState, {
        occurredAt: new Date().toISOString(),
        error: formatError(error),
      }),
    );
    throw error;
  }
}

export async function rebuildFeedCache() {
  if (activeRebuildPromise) {
    return activeRebuildPromise;
  }

  activeRebuildPromise = performRebuildFeedCache().finally(() => {
    activeRebuildPromise = null;
  });

  return activeRebuildPromise;
}
