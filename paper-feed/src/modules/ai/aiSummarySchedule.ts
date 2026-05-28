import type { AiSummaryScheduleConfig } from "../domain/types";

export const DEFAULT_AI_SUMMARY_INTERVAL_HOURS = 24;
export const DEFAULT_AI_SUMMARY_DAILY_TIME = "09:00";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAiSummaryIntervalHours(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : DEFAULT_AI_SUMMARY_INTERVAL_HOURS;
}

export function getAiSummaryIntervalMs(intervalHours: number) {
  return Math.max(
    1,
    Math.round(normalizeAiSummaryIntervalHours(intervalHours) * MS_PER_HOUR),
  );
}

export function normalizeAiSummaryDailyTime(value: unknown) {
  const match = String(value ?? "")
    .trim()
    .match(/^([01]?\d|2[0-3]):([0-5]\d)$/);

  if (!match) {
    return DEFAULT_AI_SUMMARY_DAILY_TIME;
  }

  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function normalizeAiSummarySchedule(
  value: unknown,
  fallbackIntervalHours = DEFAULT_AI_SUMMARY_INTERVAL_HOURS,
): AiSummaryScheduleConfig {
  const raw =
    value && typeof value === "object"
      ? (value as Partial<AiSummaryScheduleConfig>)
      : {};

  return {
    mode: raw.mode === "daily" ? "daily" : "interval",
    intervalHours: normalizeAiSummaryIntervalHours(
      raw.intervalHours ?? fallbackIntervalHours,
    ),
    dailyTime: normalizeAiSummaryDailyTime(raw.dailyTime),
  };
}

function getDailyScheduleDate(now: Date, dailyTime: string) {
  const normalized = normalizeAiSummaryDailyTime(dailyTime);
  const [hour, minute] = normalized.split(":").map((part) => Number(part));
  const scheduled = new Date(now.getTime());
  scheduled.setHours(hour, minute, 0, 0);
  return scheduled;
}

export function getAiSummaryStartupDelayMs(input: {
  schedule: AiSummaryScheduleConfig | undefined;
  lastSuccessAt: string | null;
  now: Date;
}) {
  const schedule = normalizeAiSummarySchedule(input.schedule);

  if (schedule.mode === "interval") {
    const intervalMs = getAiSummaryIntervalMs(schedule.intervalHours);
    const nowMs = input.now.getTime();
    const lastSuccessMs = parseTimestamp(input.lastSuccessAt);

    if (lastSuccessMs === null) {
      return 0;
    }

    if (lastSuccessMs >= nowMs) {
      return intervalMs;
    }

    const elapsedMs = nowMs - lastSuccessMs;
    return elapsedMs >= intervalMs ? 0 : intervalMs - elapsedMs;
  }

  const scheduledToday = getDailyScheduleDate(
    input.now,
    schedule.dailyTime,
  ).getTime();
  const nowMs = input.now.getTime();
  const lastSuccessMs = parseTimestamp(input.lastSuccessAt);

  if (nowMs >= scheduledToday) {
    if (lastSuccessMs === null || lastSuccessMs < scheduledToday) {
      return 0;
    }

    return scheduledToday + MS_PER_DAY - nowMs;
  }

  return scheduledToday - nowMs;
}

export function getAiSummaryPostRunDelayMs(input: {
  schedule: AiSummaryScheduleConfig | undefined;
  now: Date;
}) {
  const schedule = normalizeAiSummarySchedule(input.schedule);

  if (schedule.mode === "interval") {
    return getAiSummaryIntervalMs(schedule.intervalHours);
  }

  const scheduledToday = getDailyScheduleDate(
    input.now,
    schedule.dailyTime,
  ).getTime();
  const nowMs = input.now.getTime();
  const nextScheduledMs =
    nowMs < scheduledToday ? scheduledToday : scheduledToday + MS_PER_DAY;
  return nextScheduledMs - nowMs;
}

export function isAiSummaryScheduleDue(input: {
  schedule: AiSummaryScheduleConfig | undefined;
  lastSuccessAt: string | null;
  now: Date;
}) {
  return (
    getAiSummaryStartupDelayMs({
      schedule: input.schedule,
      lastSuccessAt: input.lastSuccessAt,
      now: input.now,
    }) === 0
  );
}
