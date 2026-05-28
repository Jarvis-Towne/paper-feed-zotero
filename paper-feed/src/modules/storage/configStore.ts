import type {
  AiSummaryConfig,
  JournalConfig,
  ManagedSubscriptionConfig,
  PluginConfig,
} from "../domain/types";
import {
  normalizeAiSummarySchedule,
  DEFAULT_AI_SUMMARY_INTERVAL_HOURS,
} from "../ai/aiSummarySchedule";
import {
  readTextFileIfExists,
  writeTextFile,
} from "../zotero/compat/fileSystem";
import { getConfigFilePath } from "./paths";

export const DEFAULT_PLUGIN_CONFIG: PluginConfig = {
  journals: [],
  keywordQueries: [],
  autoFetchEnabled: false,
  autoFetchIntervalHours: 6,
  profileName: "default",
  subscription: {
    name: "Paper Feed",
    refreshIntervalHours: 6,
    cleanupReadAfterDays: 30,
    cleanupUnreadAfterDays: 365,
  },
  aiSummary: {
    enabled: false,
    baseUrl: "",
    apiKey: "",
    model: "",
    prompt: "",
    schedule: {
      mode: "interval",
      intervalHours: DEFAULT_AI_SUMMARY_INTERVAL_HOURS,
      dailyTime: "09:00",
    },
    subscription: {
      name: "Paper Feed AI Summary",
      refreshIntervalHours: DEFAULT_AI_SUMMARY_INTERVAL_HOURS,
      cleanupReadAfterDays: 30,
      cleanupUnreadAfterDays: 365,
    },
  },
};

export function createDefaultConfig(): PluginConfig {
  return {
    ...DEFAULT_PLUGIN_CONFIG,
    journals: [],
    keywordQueries: [],
    subscription: {
      ...DEFAULT_PLUGIN_CONFIG.subscription,
    },
    aiSummary: {
      ...DEFAULT_PLUGIN_CONFIG.aiSummary,
      subscription: {
        ...DEFAULT_PLUGIN_CONFIG.aiSummary.subscription,
      },
    },
  };
}

export function parseLineSeparatedValues(content: string) {
  return content
    .split(/\r?\n/g)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
}

export function createImportedConfig(input: {
  journalsContent?: string;
  keywordContent?: string;
  autoFetchEnabled?: boolean;
  autoFetchIntervalHours?: number;
  profileName?: string;
  subscription?: Partial<ManagedSubscriptionConfig>;
}): PluginConfig {
  return {
    journals: parseLineSeparatedValues(input.journalsContent || "").map(
      (url) => ({
        name: "",
        url,
      }),
    ),
    keywordQueries: parseLineSeparatedValues(input.keywordContent || ""),
    autoFetchEnabled: input.autoFetchEnabled ?? false,
    autoFetchIntervalHours: input.autoFetchIntervalHours ?? 6,
    profileName: input.profileName || "default",
    subscription: {
      ...DEFAULT_PLUGIN_CONFIG.subscription,
      ...input.subscription,
    },
    aiSummary: {
      ...DEFAULT_PLUGIN_CONFIG.aiSummary,
      subscription: {
        ...DEFAULT_PLUGIN_CONFIG.aiSummary.subscription,
      },
    },
  };
}

export function mergeImportedConfig(
  currentConfig: PluginConfig,
  input: {
    journalsContent?: string | null;
    keywordContent?: string | null;
  },
): PluginConfig {
  return {
    ...currentConfig,
    journals:
      input.journalsContent === undefined || input.journalsContent === null
        ? currentConfig.journals.map((journal) => ({ ...journal }))
        : parseLineSeparatedValues(input.journalsContent).map((url) => ({
            name: "",
            url,
          })),
    keywordQueries:
      input.keywordContent === undefined || input.keywordContent === null
        ? [...currentConfig.keywordQueries]
        : parseLineSeparatedValues(input.keywordContent),
  };
}

export function normalizePositiveInteger(
  value: unknown,
  fallback: number,
): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseStoredJournal(value: unknown): JournalConfig | null {
  if (typeof value === "string") {
    const url = value.trim();
    return url ? { name: "", url } : null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const raw = value as Partial<JournalConfig>;
  const url = typeof raw.url === "string" ? raw.url.trim() : "";
  if (!url) {
    return null;
  }

  return {
    name: typeof raw.name === "string" ? raw.name.trim() : "",
    url,
  };
}

function parseStoredSubscription(
  value: unknown,
  fallbackName: string,
): ManagedSubscriptionConfig {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<ManagedSubscriptionConfig>)
      : {};

  return {
    name:
      typeof raw.name === "string" && raw.name.trim()
        ? raw.name.trim()
        : fallbackName,
    refreshIntervalHours: normalizePositiveInteger(
      raw.refreshIntervalHours,
      DEFAULT_PLUGIN_CONFIG.subscription.refreshIntervalHours,
    ),
    cleanupReadAfterDays: normalizePositiveInteger(
      raw.cleanupReadAfterDays,
      DEFAULT_PLUGIN_CONFIG.subscription.cleanupReadAfterDays,
    ),
    cleanupUnreadAfterDays: normalizePositiveInteger(
      raw.cleanupUnreadAfterDays,
      DEFAULT_PLUGIN_CONFIG.subscription.cleanupUnreadAfterDays,
    ),
  };
}

function parseStoredAiSummary(value: unknown): AiSummaryConfig {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<AiSummaryConfig>)
      : {};

  return {
    enabled: raw.enabled ?? false,
    baseUrl: typeof raw.baseUrl === "string" ? raw.baseUrl.trim() : "",
    apiKey: typeof raw.apiKey === "string" ? raw.apiKey.trim() : "",
    model: typeof raw.model === "string" ? raw.model.trim() : "",
    prompt: typeof raw.prompt === "string" ? raw.prompt : "",
    schedule: normalizeAiSummarySchedule(
      raw.schedule,
      normalizePositiveInteger(
        raw.subscription?.refreshIntervalHours,
        DEFAULT_PLUGIN_CONFIG.aiSummary.schedule?.intervalHours ??
          DEFAULT_AI_SUMMARY_INTERVAL_HOURS,
      ),
    ),
    subscription: parseStoredSubscription(
      raw.subscription,
      DEFAULT_PLUGIN_CONFIG.aiSummary.subscription.name,
    ),
  };
}

export function serializeConfig(config: PluginConfig) {
  return JSON.stringify(config, null, 2);
}

export function parseStoredConfig(raw: string): PluginConfig {
  const parsed = JSON.parse(raw) as Partial<PluginConfig>;
  const profileName = parsed.profileName || "default";

  return {
    journals: Array.isArray(parsed.journals)
      ? parsed.journals
          .map((journal) => parseStoredJournal(journal))
          .filter((journal): journal is JournalConfig => !!journal)
      : [],
    keywordQueries: parsed.keywordQueries || [],
    autoFetchEnabled: parsed.autoFetchEnabled ?? false,
    autoFetchIntervalHours: normalizePositiveInteger(
      parsed.autoFetchIntervalHours,
      6,
    ),
    profileName,
    subscription: parseStoredSubscription(parsed.subscription, "Paper Feed"),
    aiSummary: parseStoredAiSummary(parsed.aiSummary),
  };
}

export async function readConfig(baseDir?: string): Promise<PluginConfig> {
  const path = getConfigFilePath(baseDir);
  const raw = await readTextFileIfExists(path);

  if (!raw) {
    return createDefaultConfig();
  }

  return parseStoredConfig(raw);
}

export async function writeConfig(
  config: PluginConfig,
  baseDir?: string,
): Promise<void> {
  const path = getConfigFilePath(baseDir);
  await writeTextFile(path, serializeConfig(config));
}

export async function ensureConfigInitialized(baseDir?: string) {
  const config = await readConfig(baseDir);
  await writeConfig(config, baseDir);
  return config;
}
