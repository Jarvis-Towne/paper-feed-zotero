import { readConfig } from "../storage/configStore";
import { getServerBaseUrl } from "./compat/server";

export interface FeedProvisionResult {
  action: "created" | "updated" | "unchanged";
  libraryID: number;
  name: string;
  url: string;
}

export interface ManagedFeedSettings {
  name: string;
  refreshIntervalHours: number;
  cleanupReadAfterDays: number;
  cleanupUnreadAfterDays: number;
}

function getFeedsManager() {
  const feeds = (Zotero as any).Feeds;
  if (!feeds) {
    throw new Error("Zotero.Feeds is unavailable in this runtime");
  }

  return feeds;
}

export function getDefaultManagedFeedName(profileName: string) {
  return profileName ? `Paper Feed (${profileName})` : "Paper Feed";
}

export function isManagedFeedUrl(url: string) {
  return /\/paper-feed\/rss\//.test(url);
}

function normalizePositiveNumber(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function normalizeManagedFeedSettings(input: {
  profileName: string;
  subscription?: Partial<ManagedFeedSettings> | null;
}) {
  return {
    name:
      input.subscription?.name?.trim() ||
      getDefaultManagedFeedName(input.profileName),
    refreshIntervalHours: normalizePositiveNumber(
      input.subscription?.refreshIntervalHours ?? NaN,
      24,
    ),
    cleanupReadAfterDays: normalizePositiveNumber(
      input.subscription?.cleanupReadAfterDays ?? NaN,
      30,
    ),
    cleanupUnreadAfterDays: normalizePositiveNumber(
      input.subscription?.cleanupUnreadAfterDays ?? NaN,
      365,
    ),
  };
}

export function getCurrentManagedFeedUrl() {
  return `${getServerBaseUrl()}/paper-feed/rss/default`;
}

function getManagedFeeds() {
  const feeds = getFeedsManager().getAll?.() || [];
  return feeds.filter((feed: any) => isManagedFeedUrl(feed.url || ""));
}

function findManagedFeedByName(name: string) {
  return getManagedFeeds().find((feed: any) => feed.name === name);
}

function getFeedByUrl(url: string) {
  return getFeedsManager().getByURL?.(url);
}

async function saveFeedIfChanged(
  feed: any,
  input: {
    name: string;
    url: string;
    refreshInterval: number;
    cleanupReadAfter: number;
    cleanupUnreadAfter: number;
  },
) {
  let changed = false;

  if (feed.name !== input.name) {
    feed.name = input.name;
    changed = true;
  }

  if (feed.url !== input.url) {
    feed.url = input.url;
    changed = true;
  }

  if (feed.refreshInterval !== input.refreshInterval) {
    feed.refreshInterval = input.refreshInterval;
    changed = true;
  }

  if (feed.cleanupReadAfter !== input.cleanupReadAfter) {
    feed.cleanupReadAfter = input.cleanupReadAfter;
    changed = true;
  }

  if (feed.cleanupUnreadAfter !== input.cleanupUnreadAfter) {
    feed.cleanupUnreadAfter = input.cleanupUnreadAfter;
    changed = true;
  }

  if (changed) {
    await feed.saveTx();
  }

  return changed;
}

export async function provisionManagedFeedSubscription(): Promise<FeedProvisionResult> {
  const config = await readConfig();
  const url = getCurrentManagedFeedUrl();
  const settings = normalizeManagedFeedSettings({
    profileName: config.profileName,
    subscription: config.subscription,
  });

  const exactFeed = getFeedByUrl(url) as any;
  if (exactFeed) {
    const changed = await saveFeedIfChanged(exactFeed, {
      name: settings.name,
      url,
      refreshInterval: settings.refreshIntervalHours,
      cleanupReadAfter: settings.cleanupReadAfterDays,
      cleanupUnreadAfter: settings.cleanupUnreadAfterDays,
    });

    return {
      action: changed ? "updated" : "unchanged",
      libraryID: exactFeed.libraryID,
      name: exactFeed.name,
      url: exactFeed.url,
    };
  }

  const namedFeed = findManagedFeedByName(settings.name) as any;
  if (namedFeed) {
    await saveFeedIfChanged(namedFeed, {
      name: settings.name,
      url,
      refreshInterval: settings.refreshIntervalHours,
      cleanupReadAfter: settings.cleanupReadAfterDays,
      cleanupUnreadAfter: settings.cleanupUnreadAfterDays,
    });

    return {
      action: "updated",
      libraryID: namedFeed.libraryID,
      name: namedFeed.name,
      url: namedFeed.url,
    };
  }

  const feed = new Zotero.Feed({
    name: settings.name,
    url,
    refreshInterval: settings.refreshIntervalHours,
    cleanupReadAfter: settings.cleanupReadAfterDays,
    cleanupUnreadAfter: settings.cleanupUnreadAfterDays,
  } as any) as any;
  await feed.saveTx();

  return {
    action: "created",
    libraryID: feed.libraryID,
    name: feed.name,
    url: feed.url,
  };
}

export async function refreshManagedFeedSubscription() {
  const feed = getFeedByUrl(getCurrentManagedFeedUrl());
  if (!feed || typeof (feed as any).updateFeed !== "function") {
    return false;
  }

  await (feed as any).updateFeed();
  return true;
}
