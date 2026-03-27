export interface FeedEntry {
  title: string;
  link: string;
  summary: string;
  journal: string;
  id: string;
  pubDate: Date;
  doi?: string | null;
  isOld?: boolean;
}

export interface FeedSnapshot {
  generatedAt: string | null;
  items: FeedEntry[];
}

export interface QueryRule {
  raw: string;
  terms: string[];
}

export interface JournalConfig {
  name: string;
  url: string;
}

export interface ManagedSubscriptionConfig {
  name: string;
  refreshIntervalHours: number;
  cleanupReadAfterDays: number;
  cleanupUnreadAfterDays: number;
}

export interface RssBuildOptions {
  title?: string;
  link?: string;
  description?: string;
  maxItems?: number;
  buildDate?: Date | string | null;
}

export interface PluginConfig {
  journals: JournalConfig[];
  keywordQueries: string[];
  autoFetchEnabled: boolean;
  autoFetchIntervalHours: number;
  profileName: string;
  subscription: ManagedSubscriptionConfig;
}

export interface PluginRunState {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  generatedAt: string | null;
  seenIds: string[];
  lastMatchCount: number;
  storedItemCount: number;
}

export interface FeedSourceItem {
  id?: string | null;
  guid?: string | null;
  title?: string | null;
  summary?: string | null;
  abstractNote?: string | null;
  publicationTitle?: string | null;
  url?: string | null;
  link?: string | null;
  date?: Date | string | number | null;
  pubDate?: Date | string | number | null;
  DOI?: string | null;
  doi?: string | null;
}

export interface FeedSourceResult {
  sourceUrl: string;
  feedTitle: string;
  items: FeedSourceItem[];
}

export interface FeedSourceReader {
  read: (url: string) => Promise<FeedSourceResult>;
}

export interface FeedFetchIssue {
  sourceUrl: string;
  message: string;
}

export interface FeedFetchResult {
  generatedAt: string;
  items: FeedEntry[];
  newItems: FeedEntry[];
  seenIds: string[];
  errors: FeedFetchIssue[];
  xml: string;
}

export interface FeedRuntimeSummary {
  profileName: string;
  generatedAt: string | null;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastError: string | null;
  autoFetchEnabled: boolean;
  autoFetchIntervalHours: number;
  journalCount: number;
  queryCount: number;
  storedItemCount: number;
  lastMatchCount: number;
}
