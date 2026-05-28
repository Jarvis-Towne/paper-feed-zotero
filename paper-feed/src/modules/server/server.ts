import type { ServerRuntimeState } from "../../addon";
import { getFeedRuntimeSummary } from "../fetch/fetchService";
import {
  getServerBaseUrl,
  registerLegacyEndpoint,
  unregisterLegacyEndpoint,
} from "../zotero/compat/server";
import {
  AI_SUMMARY_HTML_ENDPOINT_PATH,
  AiSummaryHtmlEndpoint,
} from "./aiSummaryHtmlEndpoint";
import { HEALTH_ENDPOINT_PATH, HealthEndpoint } from "./healthEndpoint";
import {
  AI_RSS_ENDPOINT_PATH,
  AiRssEndpoint,
  RSS_ENDPOINT_PATH,
  RssEndpoint,
} from "./rssEndpoint";

const ENDPOINT_STRATEGY = "legacy-init-2arg async + cached snapshot store";

export async function registerServerEndpoints(): Promise<ServerRuntimeState> {
  registerLegacyEndpoint(HEALTH_ENDPOINT_PATH, HealthEndpoint);
  registerLegacyEndpoint(RSS_ENDPOINT_PATH, RssEndpoint);
  registerLegacyEndpoint(AI_RSS_ENDPOINT_PATH, AiRssEndpoint);
  registerLegacyEndpoint(AI_SUMMARY_HTML_ENDPOINT_PATH, AiSummaryHtmlEndpoint);

  const baseUrl = getServerBaseUrl();
  const summary = await getFeedRuntimeSummary();

  return {
    status: "ready",
    baseUrl,
    healthUrl: `${baseUrl}${HEALTH_ENDPOINT_PATH}`,
    rssUrl: `${baseUrl}${RSS_ENDPOINT_PATH}`,
    aiRssUrl: `${baseUrl}${AI_RSS_ENDPOINT_PATH}`,
    endpointStrategy: ENDPOINT_STRATEGY,
    error: null,
    generatedAt: summary.generatedAt,
    storedItemCount: summary.storedItemCount,
  };
}

export function unregisterServerEndpoints() {
  unregisterLegacyEndpoint(HEALTH_ENDPOINT_PATH);
  unregisterLegacyEndpoint(RSS_ENDPOINT_PATH);
  unregisterLegacyEndpoint(AI_RSS_ENDPOINT_PATH);
  unregisterLegacyEndpoint(AI_SUMMARY_HTML_ENDPOINT_PATH);
}
