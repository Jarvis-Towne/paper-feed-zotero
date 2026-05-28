import { buildRssXml } from "../domain/rssSerializer";
import type {
  AiSummaryConfig,
  FeedEntry,
  FeedFetchResult,
  FeedRuntimeSummary,
  PluginRunState,
} from "../domain/types";
import {
  generateAiSummaryReport,
  isAiSummaryConfigUsable,
} from "../ai/aiSummary";
import { isAiSummaryScheduleDue } from "../ai/aiSummarySchedule";
import {
  getAiSummaryDateSlug,
  getAiSummaryHtmlUrl,
  withAiSummaryHtmlLinks,
} from "../ai/aiSummaryLinks";
import { createOpenAiCompatibleClient } from "../ai/llmClient";
import { ensureConfigInitialized, readConfig } from "../storage/configStore";
import {
  ensureAiSummarySnapshotInitialized,
  readAiSummarySnapshot,
  writeAiSummarySnapshot,
} from "../storage/aiSummarySnapshotStore";
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
import {
  refreshManagedAiFeedSubscription,
  refreshManagedFeedSubscription,
} from "../zotero/feedProvision";
import { runFetchPipeline } from "./fetchRunner";

let activeRebuildPromise: Promise<FeedFetchResult> | null = null;
let activeAiSummaryPromise: Promise<{
  generated: boolean;
  issue: string | null;
}> | null = null;

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

function formatAiIssue(error: unknown) {
  return `AI summary failed: ${formatError(error)}`;
}

function formatError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function mergeIssueMessages(...messages: Array<string | null>) {
  return messages.filter(Boolean).join("\n") || null;
}

function getAiSubmissionId(entry: FeedEntry) {
  const doi = entry.doi?.trim().toLowerCase();
  if (doi) {
    return `doi:${doi}`;
  }

  return `entry:${entry.id || entry.link}`;
}

function selectAiSummaryCandidates(input: {
  items: FeedEntry[];
  runState: PluginRunState;
}) {
  const submittedIds = new Set(input.runState.aiSummarySubmittedIds);

  return input.items.filter((item) => {
    return !submittedIds.has(getAiSubmissionId(item));
  });
}

export function shouldRunAiSummary(input: {
  config: AiSummaryConfig;
  runState: PluginRunState;
  now: Date;
}) {
  return isAiSummaryScheduleDue({
    schedule: input.config.schedule,
    lastSuccessAt: input.runState.aiSummaryLastSuccessAt,
    now: input.now,
  });
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
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return `Managed Zotero feed refresh failed: ${formatError(error)}`;
  }
}

async function refreshManagedAiFeedSubscriptionSafely() {
  try {
    await refreshManagedAiFeedSubscription();
    return null;
  } catch (error) {
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return `Managed Zotero AI feed refresh failed: ${formatError(error)}`;
  }
}

export async function ensureFeedStorageInitialized() {
  const [config, runState, snapshot, aiSummarySnapshot] = await Promise.all([
    ensureConfigInitialized(),
    ensureRunStateInitialized(),
    ensureFeedSnapshotInitialized(),
    ensureAiSummarySnapshotInitialized(),
  ]);

  return {
    config,
    runState,
    snapshot,
    aiSummarySnapshot,
  };
}

export async function getFeedRuntimeSummary(): Promise<FeedRuntimeSummary> {
  const [config, runState, snapshot, aiSummarySnapshot] = await Promise.all([
    readConfig(),
    readRunState(),
    readFeedSnapshot(),
    readAiSummarySnapshot(),
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
    aiSummaryEnabled: config.aiSummary.enabled,
    aiSummaryGeneratedAt: aiSummarySnapshot.generatedAt,
    aiSummaryItemCount: aiSummarySnapshot.items.length,
  };
}

export async function getGeneratedFeedXml() {
  const [config, snapshot] = await Promise.all([
    readConfig(),
    readFeedSnapshot(),
  ]);

  return buildRssXml(snapshot.items, {
    title: config.subscription.name || createFeedTitle(config.profileName),
    description: createFeedDescription(config.profileName),
    buildDate: snapshot.generatedAt,
  });
}

export async function getGeneratedAiSummaryFeedXml() {
  const [config, snapshot] = await Promise.all([
    readConfig(),
    readAiSummarySnapshot(),
  ]);

  return buildRssXml(withAiSummaryHtmlLinks(snapshot.items), {
    title: config.aiSummary.subscription.name || "Paper Feed AI Summary",
    description: "AI summaries of newly matched Paper Feed literature",
    buildDate: snapshot.generatedAt,
  });
}

function removeHtmlTags(value: string) {
  return value.replace(/<[^>]*>/g, "").trim();
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function findAiSummaryItemByDate(items: FeedEntry[], date: string) {
  return items.find((item) => getAiSummaryDateSlug(item) === date);
}

function buildAiSummaryHtmlDocument(item: FeedEntry) {
  const title = removeHtmlTags(item.title) || "AI Literature Summary";

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(title)}</title>`,
    '<base target="_blank">',
    "</head>",
    '<body style="margin:0;background:#ffffff;">',
    item.summary,
    "</body>",
    "</html>",
  ].join("");
}

export async function getLatestAiSummaryDateSlug() {
  const snapshot = await readAiSummarySnapshot();
  const latest = snapshot.items[0];
  return latest ? getAiSummaryDateSlug(latest) : null;
}

export async function getGeneratedAiSummaryHtmlDocument(date: string) {
  const snapshot = await readAiSummarySnapshot();
  const item = findAiSummaryItemByDate(snapshot.items, date);
  if (!item) {
    throw new Error(`AI summary not found for ${date}`);
  }

  return buildAiSummaryHtmlDocument(item);
}

export async function getAiSummaryHtmlPageUrl(date: string) {
  return getAiSummaryHtmlUrl(date);
}

export async function testAiSummaryConnection(config: AiSummaryConfig) {
  const missingFields = [
    ["Base URL", config.baseUrl],
    ["API key", config.apiKey],
    ["Model", config.model],
  ]
    .filter(
      (field): field is [string, string] => !String(field[1] || "").trim(),
    )
    .map(([label]) => label);

  if (missingFields.length) {
    throw new Error(`Missing AI configuration: ${missingFields.join(", ")}`);
  }

  const content = await createOpenAiCompatibleClient(config).complete([
    {
      role: "system",
      content: "You are a concise API health-check assistant.",
    },
    {
      role: "user",
      content: "Reply with exactly: Paper Feed AI connection OK",
    },
  ]);

  return {
    message: content,
  };
}

async function generateAiSummarySafely(input: {
  items: FeedEntry[];
  generatedAt: string;
  runState: PluginRunState;
  force?: boolean;
}) {
  const config = await readConfig();
  const now = new Date(input.generatedAt);
  if (!isAiSummaryConfigUsable(config.aiSummary)) {
    return {
      generated: false,
      issue: null,
      submittedIds: input.runState.aiSummarySubmittedIds,
      lastRunAt: input.runState.aiSummaryLastRunAt,
      lastSuccessAt: input.runState.aiSummaryLastSuccessAt,
    };
  }
  if (
    !input.force &&
    !shouldRunAiSummary({
      config: config.aiSummary,
      runState: input.runState,
      now,
    })
  ) {
    return {
      generated: false,
      issue: null,
      submittedIds: input.runState.aiSummarySubmittedIds,
      lastRunAt: input.runState.aiSummaryLastRunAt,
      lastSuccessAt: input.runState.aiSummaryLastSuccessAt,
    };
  }

  const candidates = selectAiSummaryCandidates({
    items: input.items,
    runState: input.runState,
  });

  if (!candidates.length) {
    return {
      generated: false,
      issue: null,
      submittedIds: input.runState.aiSummarySubmittedIds,
      lastRunAt: input.generatedAt,
      lastSuccessAt: input.generatedAt,
    };
  }

  try {
    const report = await generateAiSummaryReport({
      config: config.aiSummary,
      papers: candidates,
      client: createOpenAiCompatibleClient(config.aiSummary),
      now,
    });
    const previous = await readAiSummarySnapshot();
    const submittedIds = Array.from(
      new Set([
        ...input.runState.aiSummarySubmittedIds,
        ...candidates.map(getAiSubmissionId),
      ]),
    );

    await writeAiSummarySnapshot({
      generatedAt: report.generatedAt,
      items: [report.entry, ...previous.items],
    });

    return {
      generated: true,
      issue: await refreshManagedAiFeedSubscriptionSafely(),
      submittedIds,
      lastRunAt: report.generatedAt,
      lastSuccessAt: report.generatedAt,
    };
  } catch (error) {
    if (
      typeof Zotero !== "undefined" &&
      typeof Zotero.logError === "function"
    ) {
      Zotero.logError(
        error instanceof Error ? error : new Error(String(error)),
      );
    }

    return {
      generated: false,
      issue: formatAiIssue(error),
      submittedIds: input.runState.aiSummarySubmittedIds,
      lastRunAt: input.generatedAt,
      lastSuccessAt: input.runState.aiSummaryLastSuccessAt,
    };
  }
}

async function performRebuildAiSummaryCache(options?: { force?: boolean }) {
  const [runState, snapshot] = await Promise.all([
    readRunState(),
    readFeedSnapshot(),
  ]);
  const generatedAt = new Date().toISOString();
  const aiSummaryResult = await generateAiSummarySafely({
    items: snapshot.items,
    generatedAt,
    runState,
    force: options?.force,
  });

  await writeRunState({
    ...runState,
    lastError: aiSummaryResult.issue ?? runState.lastError,
    aiSummarySubmittedIds: aiSummaryResult.submittedIds,
    aiSummaryLastRunAt: aiSummaryResult.lastRunAt,
    aiSummaryLastSuccessAt: aiSummaryResult.lastSuccessAt,
  });

  return {
    generated: aiSummaryResult.generated,
    issue: aiSummaryResult.issue,
  };
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

    return {
      ...result,
      aiSummaryGenerated: false,
    };
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

export async function rebuildAiSummaryCache(options?: { force?: boolean }) {
  if (activeAiSummaryPromise) {
    return activeAiSummaryPromise;
  }

  activeAiSummaryPromise = performRebuildAiSummaryCache(options).finally(() => {
    activeAiSummaryPromise = null;
  });

  return activeAiSummaryPromise;
}
