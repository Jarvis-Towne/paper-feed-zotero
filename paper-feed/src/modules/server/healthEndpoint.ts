import { getFeedRuntimeSummary } from "../fetch/fetchService";
import type { SendResponseCallback } from "../zotero/compat/server";

export const HEALTH_ENDPOINT_PATH = "/paper-feed/health";

function toErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export class HealthEndpoint {
  supportedMethods = ["GET"];
  supportedDataTypes = ["application/json"];
  allowRequestsFromUnsafeWebContent = true;

  async init(_data: unknown, sendResponseCallback: SendResponseCallback) {
    try {
      const summary = await getFeedRuntimeSummary();

      sendResponseCallback(
        200,
        "application/json; charset=utf-8",
        JSON.stringify(
          {
            status: "ok",
            ...summary,
          },
          null,
          2,
        ),
      );
    } catch (error) {
      sendResponseCallback(
        500,
        "application/json; charset=utf-8",
        JSON.stringify(
          {
            status: "error",
            error: toErrorMessage(error),
          },
          null,
          2,
        ),
      );
    }
  }
}
