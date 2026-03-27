import { config } from "../package.json";
import type { ColumnOptions, DialogHelper } from "zotero-plugin-toolkit";
import hooks from "./hooks";
import {
  getFeedRuntimeSummary,
  rebuildFeedCache,
} from "./modules/fetch/fetchService";
import type {
  FeedFetchResult,
  FeedRuntimeSummary,
} from "./modules/domain/types";
import {
  provisionManagedFeedSubscription,
  type FeedProvisionResult,
} from "./modules/zotero/feedProvision";
import {
  exportConfigToPath,
  importConfigFromPath,
  type ConfigImportResult,
  type PortableConfigExportResult,
} from "./modules/configExchange/configExchange";
import {
  getAutoFetchSchedulerState,
  syncAutoFetchScheduler,
  type AutoFetchSchedulerState,
  type SchedulerSyncReason,
} from "./modules/scheduler/scheduler";
import { createZToolkit } from "./utils/ztoolkit";

export interface ServerRuntimeState {
  status: "ready" | "error";
  baseUrl: string | null;
  healthUrl: string | null;
  rssUrl: string | null;
  endpointStrategy: string;
  error: string | null;
  generatedAt: string | null;
  storedItemCount: number;
}

class Addon {
  public data: {
    alive: boolean;
    config: typeof config;
    // Env type, see build.js
    env: "development" | "production";
    initialized?: boolean;
    ztoolkit: ZToolkit;
    locale?: {
      current: any;
    };
    prefs?: {
      window: Window;
      columns?: Array<ColumnOptions>;
      rows?: Array<{ [dataKey: string]: string }>;
    };
    server?: ServerRuntimeState;
    dialog?: DialogHelper;
  };
  // Lifecycle hooks
  public hooks: typeof hooks;
  // APIs
  public api: {
    getServerState: () => ServerRuntimeState | undefined;
    getFeedRuntimeSummary: () => Promise<FeedRuntimeSummary>;
    rebuildFeedCache: () => Promise<FeedFetchResult>;
    provisionManagedFeedSubscription: () => Promise<FeedProvisionResult>;
    importConfigFromPath: (path: string) => Promise<ConfigImportResult>;
    exportConfigToPath: (path: string) => Promise<PortableConfigExportResult>;
    getAutoFetchSchedulerState: () => AutoFetchSchedulerState;
    syncAutoFetchScheduler: (
      reason?: SchedulerSyncReason,
    ) => Promise<void>;
  };

  constructor() {
    this.data = {
      alive: true,
      config,
      env: __env__,
      initialized: false,
      ztoolkit: createZToolkit(),
    };
    this.hooks = hooks;
    this.api = {
      getServerState: () => this.data.server,
      getFeedRuntimeSummary,
      rebuildFeedCache,
      provisionManagedFeedSubscription,
      importConfigFromPath,
      exportConfigToPath,
      getAutoFetchSchedulerState,
      syncAutoFetchScheduler,
    };
  }
}

export default Addon;
