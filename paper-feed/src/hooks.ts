import {
  registerPreferencePane,
  registerPrefsScripts,
} from "./modules/ui/preferences";
import {
  registerServerEndpoints,
  unregisterServerEndpoints,
} from "./modules/server/server";
import { ensureFeedStorageInitialized } from "./modules/fetch/fetchService";
import {
  startAiSummaryScheduler,
  startAutoFetchScheduler,
  stopAiSummaryScheduler,
  stopAutoFetchScheduler,
} from "./modules/scheduler/scheduler";
import { initLocale } from "./utils/locale";

async function onStartup() {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  initLocale();
  await ensureFeedStorageInitialized();
  registerPreferencePane();

  try {
    addon.data.server = await registerServerEndpoints();
    Zotero.debug(
      `[${addon.data.config.addonName}] RSS ready at ${addon.data.server.rssUrl}`,
    );
  } catch (error) {
    addon.data.server = {
      status: "error",
      baseUrl: null,
      healthUrl: null,
      rssUrl: null,
      aiRssUrl: null,
      endpointStrategy: "legacy-init-2arg async",
      error:
        error instanceof Error ? error.message : "Unknown server startup error",
      generatedAt: null,
      storedItemCount: 0,
    };
    Zotero.logError(error instanceof Error ? error : new Error(String(error)));
  }

  try {
    await Promise.all([startAutoFetchScheduler(), startAiSummaryScheduler()]);
  } catch (error) {
    Zotero.logError(error instanceof Error ? error : new Error(String(error)));
  }

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(_win: _ZoteroTypes.MainWindow): Promise<void> {
  return;
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  return;
}

function onShutdown(): void {
  stopAiSummaryScheduler();
  stopAutoFetchScheduler();
  unregisterServerEndpoints();
  addon.data.alive = false;
  delete (Zotero as any)[addon.data.config.addonInstance];
}

/**
 * This function is just an example of dispatcher for Notify events.
 * Any operations should be placed in a function to keep this funcion clear.
 */
async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: any },
) {
  return;
}

/**
 * This function is just an example of dispatcher for Preference UI events.
 * Any operations should be placed in a function to keep this funcion clear.
 * @param type event type
 * @param data event data
 */
async function onPrefsEvent(type: string, data: { [key: string]: any }) {
  switch (type) {
    case "load":
      registerPrefsScripts(data.window);
      break;
    default:
      return;
  }
}

function onShortcuts(type: string) {
  return;
}

function onDialogEvents(type: string) {
  return;
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
