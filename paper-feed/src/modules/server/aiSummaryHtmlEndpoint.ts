import {
  getGeneratedAiSummaryHtmlDocument,
  getLatestAiSummaryDateSlug,
} from "../fetch/fetchService";
import type {
  LegacyEndpointRequest,
  LegacyEndpointResponse,
} from "../zotero/compat/server";

export const AI_SUMMARY_HTML_ENDPOINT_PATH = "/paper-feed/ai/:date";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class AiSummaryHtmlEndpoint {
  supportedMethods = ["GET"];
  supportedDataTypes = "*" as const;
  allowRequestsFromUnsafeWebContent = true;

  async init(request: LegacyEndpointRequest): Promise<LegacyEndpointResponse> {
    const requestedDate =
      request.pathParams?.date ||
      request.searchParams.get("date") ||
      (await getLatestAiSummaryDateSlug());

    if (!requestedDate) {
      return [
        404,
        "text/plain; charset=utf-8",
        "No AI summary has been generated yet.",
      ];
    }

    try {
      return [
        200,
        "text/html; charset=utf-8",
        await getGeneratedAiSummaryHtmlDocument(requestedDate),
      ];
    } catch (error) {
      return [
        404,
        "text/plain; charset=utf-8",
        `Failed to load AI summary HTML: ${toErrorMessage(error)}`,
      ];
    }
  }
}
