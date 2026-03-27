import type { ServerRuntimeState } from "../../addon";
import { getFeedRuntimeSummary } from "../fetch/fetchService";
import {
  getServerBaseUrl,
  registerLegacyEndpoint,
  unregisterLegacyEndpoint,
} from "../zotero/compat/server";
import { HEALTH_ENDPOINT_PATH, HealthEndpoint } from "./healthEndpoint";
import { RSS_ENDPOINT_PATH, RssEndpoint } from "./rssEndpoint";

const ENDPOINT_STRATEGY = "legacy-init-2arg async + cached snapshot store";

export async function registerServerEndpoints(): Promise<ServerRuntimeState> {
  registerLegacyEndpoint(HEALTH_ENDPOINT_PATH, HealthEndpoint);
  registerLegacyEndpoint(RSS_ENDPOINT_PATH, RssEndpoint);

  const baseUrl = getServerBaseUrl();
  const summary = await getFeedRuntimeSummary();

  return {
    status: "ready",
    baseUrl,
    healthUrl: `${baseUrl}${HEALTH_ENDPOINT_PATH}`,
    rssUrl: `${baseUrl}${RSS_ENDPOINT_PATH}`,
    endpointStrategy: ENDPOINT_STRATEGY,
    error: null,
    generatedAt: summary.generatedAt,
    storedItemCount: summary.storedItemCount,
  };
}

export function unregisterServerEndpoints() {
  unregisterLegacyEndpoint(HEALTH_ENDPOINT_PATH);
  unregisterLegacyEndpoint(RSS_ENDPOINT_PATH);
}
