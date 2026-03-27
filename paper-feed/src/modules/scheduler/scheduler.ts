import type {
  PluginConfig,
  PluginRunState,
} from "../domain/types";
import { rebuildFeedCache } from "../fetch/fetchService";
import { readConfig } from "../storage/configStore";
import { readRunState } from "../storage/runStateStore";

const DEFAULT_INTERVAL_HOURS = 6;
const MS_PER_HOUR = 60 * 60 * 1000;

export type SchedulerSyncReason = "startup" | "config-change" | "post-run";
export type ScheduledTriggerReason = "scheduled" | "startup-catchup";

export interface SchedulerTimerDriver {
  setTimeout: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  clearTimeout: (handle: unknown) => void;
}

export interface AutoFetchSchedulerState {
  enabled: boolean;
  intervalHours: number | null;
  running: boolean;
  scheduled: boolean;
  nextRunAt: string | null;
  lastTriggerAt: string | null;
  lastTriggerReason: ScheduledTriggerReason | null;
}

export interface AutoFetchSchedulerDependencies {
  readConfig: () => Promise<PluginConfig>;
  readRunState: () => Promise<PluginRunState>;
  rebuildFeedCache: () => Promise<unknown>;
  now?: () => Date;
  timer?: SchedulerTimerDriver;
  logDebug?: (message: string) => void;
  logError?: (error: unknown) => void;
}

function createDefaultState(): AutoFetchSchedulerState {
  return {
    enabled: false,
    intervalHours: null,
    running: false,
    scheduled: false,
    nextRunAt: null,
    lastTriggerAt: null,
    lastTriggerReason: null,
  };
}

function defaultNow() {
  return new Date();
}

const DEFAULT_TIMER_DRIVER: SchedulerTimerDriver = {
  setTimeout(callback, delayMs) {
    return setTimeout(callback, delayMs);
  },
  clearTimeout(handle) {
    clearTimeout(handle as Parameters<typeof clearTimeout>[0]);
  },
};

function defaultLogDebug(message: string) {
  if (typeof Zotero !== "undefined" && typeof Zotero.debug === "function") {
    Zotero.debug(message);
  }
}

function defaultLogError(error: unknown) {
  if (typeof Zotero === "undefined" || typeof Zotero.logError !== "function") {
    return;
  }

  Zotero.logError(error instanceof Error ? error : new Error(String(error)));
}

function parseTimestamp(value: string | null) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeAutoFetchIntervalHours(value: number) {
  return Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_INTERVAL_HOURS;
}

export function getAutoFetchIntervalMs(intervalHours: number) {
  return Math.max(
    1,
    Math.round(normalizeAutoFetchIntervalHours(intervalHours) * MS_PER_HOUR),
  );
}

export function getStartupCatchUpDelayMs(input: {
  intervalHours: number;
  lastSuccessAt: string | null;
  now?: Date;
}) {
  const intervalMs = getAutoFetchIntervalMs(input.intervalHours);
  const nowMs = (input.now ?? defaultNow()).getTime();
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

export class AutoFetchScheduler {
  private readonly deps: Required<
    Pick<AutoFetchSchedulerDependencies, "now" | "timer" | "logDebug" | "logError">
  > &
    AutoFetchSchedulerDependencies;

  private state = createDefaultState();
  private timeoutHandle: unknown = null;
  private scheduleToken = 0;
  private syncTask: Promise<void> = Promise.resolve();

  constructor(dependencies: AutoFetchSchedulerDependencies) {
    this.deps = {
      ...dependencies,
      now: dependencies.now ?? defaultNow,
      timer: dependencies.timer ?? DEFAULT_TIMER_DRIVER,
      logDebug: dependencies.logDebug ?? defaultLogDebug,
      logError: dependencies.logError ?? defaultLogError,
    };
  }

  getState(): AutoFetchSchedulerState {
    return { ...this.state };
  }

  async start() {
    await this.sync("startup");
  }

  async sync(reason: SchedulerSyncReason = "config-change") {
    const queuedSync = this.syncTask
      .catch(() => undefined)
      .then(() => this.performSync(reason));
    this.syncTask = queuedSync;
    await queuedSync;
  }

  stop() {
    this.cancelScheduledRun();
    this.state.enabled = false;
  }

  private async performSync(reason: SchedulerSyncReason) {
    const config = await this.deps.readConfig();
    const intervalHours = normalizeAutoFetchIntervalHours(
      config.autoFetchIntervalHours,
    );

    this.state.enabled = config.autoFetchEnabled;
    this.state.intervalHours = intervalHours;
    this.cancelScheduledRun();

    if (!config.autoFetchEnabled) {
      this.deps.logDebug("[Paper Feed] Auto-fetch scheduler disabled.");
      return;
    }

    let delayMs = getAutoFetchIntervalMs(intervalHours);
    let triggerReason: ScheduledTriggerReason = "scheduled";

    if (reason !== "post-run") {
      const runState = await this.deps.readRunState();
      delayMs = getStartupCatchUpDelayMs({
        intervalHours,
        lastSuccessAt: runState.lastSuccessAt,
        now: this.deps.now(),
      });
      triggerReason = delayMs === 0 ? "startup-catchup" : "scheduled";
    }

    this.schedule(delayMs, triggerReason);
  }

  private schedule(delayMs: number, triggerReason: ScheduledTriggerReason) {
    const normalizedDelay = Math.max(0, Math.floor(delayMs));
    const token = this.scheduleToken;
    const nextRunAt = new Date(
      this.deps.now().getTime() + normalizedDelay,
    ).toISOString();

    this.state.scheduled = true;
    this.state.nextRunAt = nextRunAt;
    this.timeoutHandle = this.deps.timer.setTimeout(
      () => this.handleScheduledRun(token, triggerReason),
      normalizedDelay,
    );
    this.deps.logDebug(
      `[Paper Feed] Auto-fetch scheduler armed for ${nextRunAt} (${triggerReason}).`,
    );
  }

  private cancelScheduledRun() {
    this.scheduleToken += 1;

    if (this.timeoutHandle !== null) {
      this.deps.timer.clearTimeout(this.timeoutHandle);
      this.timeoutHandle = null;
    }

    this.state.scheduled = false;
    this.state.nextRunAt = null;
  }

  private async handleScheduledRun(
    token: number,
    triggerReason: ScheduledTriggerReason,
  ) {
    if (token !== this.scheduleToken || !this.state.enabled) {
      return;
    }

    this.timeoutHandle = null;
    this.state.scheduled = false;
    this.state.nextRunAt = null;

    if (this.state.running) {
      return;
    }

    this.state.running = true;
    this.state.lastTriggerAt = this.deps.now().toISOString();
    this.state.lastTriggerReason = triggerReason;
    this.deps.logDebug(
      `[Paper Feed] Auto-fetch triggered at ${this.state.lastTriggerAt} (${triggerReason}).`,
    );

    try {
      await this.deps.rebuildFeedCache();
    } catch (error) {
      this.deps.logError(error);
    } finally {
      this.state.running = false;

      if (!this.state.enabled || token !== this.scheduleToken) {
        return;
      }

      try {
        await this.sync("post-run");
      } catch (error) {
        this.deps.logError(error);
      }
    }
  }
}

const autoFetchScheduler = new AutoFetchScheduler({
  readConfig,
  readRunState,
  rebuildFeedCache,
});

export async function startAutoFetchScheduler() {
  await autoFetchScheduler.start();
}

export async function syncAutoFetchScheduler(
  reason: SchedulerSyncReason = "config-change",
) {
  await autoFetchScheduler.sync(reason);
}

export function stopAutoFetchScheduler() {
  autoFetchScheduler.stop();
}

export function getAutoFetchSchedulerState() {
  return autoFetchScheduler.getState();
}
