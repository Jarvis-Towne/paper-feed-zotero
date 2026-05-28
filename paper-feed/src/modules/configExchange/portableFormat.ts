import type { JournalConfig, PluginConfig } from "../domain/types";
import { normalizeAiSummaryDailyTime } from "../ai/aiSummarySchedule";
import {
  createDefaultConfig,
  normalizePositiveInteger,
} from "../storage/configStore";

export const PORTABLE_CONFIG_EXTENSION = ".paperfeed.txt";
export const DEFAULT_PORTABLE_CONFIG_FILE_NAME = `paper-feed-config${PORTABLE_CONFIG_EXTENSION}`;

function formatBoolean(value: boolean) {
  return value ? "true" : "false";
}

function parseBoolean(value: string, fallback: boolean) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

function parseSectionHeader(line: string) {
  const match = line.match(/^\[([a-z_]+)\]$/i);
  return match?.[1]?.toLowerCase() || null;
}

function parseKeyValueLine(line: string) {
  const separatorIndex = line.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = line.slice(0, separatorIndex).trim().toLowerCase();
  const rawValue = line.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }

  const value =
    rawValue.startsWith('"') && rawValue.endsWith('"') && rawValue.length >= 2
      ? rawValue.slice(1, -1)
      : rawValue;

  return { key, value };
}

function parseJournalLine(line: string): JournalConfig | null {
  const tabIndex = line.indexOf("\t");
  const pipeIndex = line.indexOf("|");
  const separatorIndex =
    tabIndex === -1
      ? pipeIndex
      : pipeIndex === -1
        ? tabIndex
        : Math.min(tabIndex, pipeIndex);

  if (separatorIndex === -1) {
    const url = line.trim();
    return url ? { name: "", url } : null;
  }

  const name = line.slice(0, separatorIndex).trim();
  const url = line.slice(separatorIndex + 1).trim();
  return url ? { name, url } : null;
}

export function serializePortableConfig(config: PluginConfig) {
  const lines = [
    "# Paper Feed config v1",
    "[general]",
    `profile_name = ${config.profileName}`,
    `auto_fetch_enabled = ${formatBoolean(config.autoFetchEnabled)}`,
    `auto_fetch_interval_hours = ${config.autoFetchIntervalHours}`,
    "",
    "[subscription]",
    `name = ${config.subscription.name}`,
    `refresh_interval_hours = ${config.subscription.refreshIntervalHours}`,
    `cleanup_read_after_days = ${config.subscription.cleanupReadAfterDays}`,
    `cleanup_unread_after_days = ${config.subscription.cleanupUnreadAfterDays}`,
    "",
    "[ai]",
    `enabled = ${formatBoolean(config.aiSummary.enabled)}`,
    `base_url = ${config.aiSummary.baseUrl}`,
    `api_key = ${config.aiSummary.apiKey}`,
    `model = ${config.aiSummary.model}`,
    `summary_schedule_mode = ${config.aiSummary.schedule?.mode ?? "interval"}`,
    `summary_interval_hours = ${config.aiSummary.schedule?.intervalHours ?? 24}`,
    `summary_daily_time = ${config.aiSummary.schedule?.dailyTime ?? "09:00"}`,
    "prompt = <<END_PROMPT",
    config.aiSummary.prompt,
    "END_PROMPT",
    "",
    "[ai_subscription]",
    `name = ${config.aiSummary.subscription.name}`,
    `refresh_interval_hours = ${config.aiSummary.subscription.refreshIntervalHours}`,
    `cleanup_read_after_days = ${config.aiSummary.subscription.cleanupReadAfterDays}`,
    `cleanup_unread_after_days = ${config.aiSummary.subscription.cleanupUnreadAfterDays}`,
    "",
    "[keywords]",
    ...config.keywordQueries,
    "",
    "[journals]",
    ...config.journals.map((journal) => `${journal.name} | ${journal.url}`),
    "",
  ];

  return lines.join("\n");
}

export function parsePortableConfig(raw: string): PluginConfig {
  const config = createDefaultConfig();
  let section: string | null = null;
  const journalRows: JournalConfig[] = [];
  const keywordRows: string[] = [];
  let multilineKey: string | null = null;
  let multilineValue: string[] = [];

  for (const rawLine of raw.split(/\r?\n/g)) {
    const line = rawLine.trim();
    if (multilineKey) {
      if (line === "END_PROMPT") {
        if (section === "ai" && multilineKey === "prompt") {
          config.aiSummary.prompt = multilineValue.join("\n");
        }
        multilineKey = null;
        multilineValue = [];
      } else {
        multilineValue.push(rawLine);
      }
      continue;
    }

    if (!line || line.startsWith("#")) {
      continue;
    }

    const nextSection = parseSectionHeader(line);
    if (nextSection) {
      section = nextSection;
      continue;
    }

    if (section === "keywords") {
      keywordRows.push(line);
      continue;
    }

    if (section === "journals") {
      const journal = parseJournalLine(line);
      if (journal) {
        journalRows.push(journal);
      }
      continue;
    }

    const pair = parseKeyValueLine(line);
    if (!pair) {
      continue;
    }

    if (pair.value === "<<END_PROMPT") {
      multilineKey = pair.key;
      multilineValue = [];
      continue;
    }

    if (section === "general") {
      switch (pair.key) {
        case "profile_name":
          config.profileName = pair.value || config.profileName;
          break;
        case "auto_fetch_enabled":
          config.autoFetchEnabled = parseBoolean(
            pair.value,
            config.autoFetchEnabled,
          );
          break;
        case "auto_fetch_interval_hours":
          config.autoFetchIntervalHours = normalizePositiveInteger(
            pair.value,
            config.autoFetchIntervalHours,
          );
          break;
        default:
          break;
      }
      continue;
    }

    if (section === "subscription") {
      switch (pair.key) {
        case "name":
          config.subscription.name =
            pair.value.trim() || config.subscription.name;
          break;
        case "refresh_interval_hours":
          config.subscription.refreshIntervalHours = normalizePositiveInteger(
            pair.value,
            config.subscription.refreshIntervalHours,
          );
          break;
        case "cleanup_read_after_days":
          config.subscription.cleanupReadAfterDays = normalizePositiveInteger(
            pair.value,
            config.subscription.cleanupReadAfterDays,
          );
          break;
        case "cleanup_unread_after_days":
          config.subscription.cleanupUnreadAfterDays = normalizePositiveInteger(
            pair.value,
            config.subscription.cleanupUnreadAfterDays,
          );
          break;
        default:
          break;
      }
    }

    if (section === "ai") {
      switch (pair.key) {
        case "enabled":
          config.aiSummary.enabled = parseBoolean(
            pair.value,
            config.aiSummary.enabled,
          );
          break;
        case "base_url":
          config.aiSummary.baseUrl = pair.value.trim();
          break;
        case "api_key":
          config.aiSummary.apiKey = pair.value.trim();
          break;
        case "model":
          config.aiSummary.model = pair.value.trim();
          break;
        case "summary_schedule_mode":
          config.aiSummary.schedule = {
            ...(config.aiSummary.schedule ?? {
              mode: "interval",
              intervalHours: 24,
              dailyTime: "09:00",
            }),
            mode: pair.value.trim() === "daily" ? "daily" : "interval",
          };
          break;
        case "summary_interval_hours":
          config.aiSummary.schedule = {
            ...(config.aiSummary.schedule ?? {
              mode: "interval",
              intervalHours: 24,
              dailyTime: "09:00",
            }),
            intervalHours: normalizePositiveInteger(
              pair.value,
              config.aiSummary.schedule?.intervalHours ?? 24,
            ),
          };
          break;
        case "summary_daily_time":
          config.aiSummary.schedule = {
            ...(config.aiSummary.schedule ?? {
              mode: "interval",
              intervalHours: 24,
              dailyTime: "09:00",
            }),
            dailyTime: normalizeAiSummaryDailyTime(pair.value),
          };
          break;
        case "prompt":
          config.aiSummary.prompt = pair.value;
          break;
        default:
          break;
      }
      continue;
    }

    if (section === "ai_subscription") {
      switch (pair.key) {
        case "name":
          config.aiSummary.subscription.name =
            pair.value.trim() || config.aiSummary.subscription.name;
          break;
        case "refresh_interval_hours":
          config.aiSummary.subscription.refreshIntervalHours =
            normalizePositiveInteger(
              pair.value,
              config.aiSummary.subscription.refreshIntervalHours,
            );
          break;
        case "cleanup_read_after_days":
          config.aiSummary.subscription.cleanupReadAfterDays =
            normalizePositiveInteger(
              pair.value,
              config.aiSummary.subscription.cleanupReadAfterDays,
            );
          break;
        case "cleanup_unread_after_days":
          config.aiSummary.subscription.cleanupUnreadAfterDays =
            normalizePositiveInteger(
              pair.value,
              config.aiSummary.subscription.cleanupUnreadAfterDays,
            );
          break;
        default:
          break;
      }
    }
  }

  config.keywordQueries = keywordRows;
  config.journals = journalRows;
  return config;
}

export function ensurePortableConfigPath(path: string) {
  if (/\.[a-z0-9]+$/i.test(path)) {
    return path;
  }

  return `${path}${PORTABLE_CONFIG_EXTENSION}`;
}
