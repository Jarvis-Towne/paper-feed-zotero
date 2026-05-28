const LOCALHOST = "127.0.0.1";

export type SendResponseCallback = (
  status: number,
  contentType?: string,
  body?: string,
) => void;

export interface LegacyEndpointRequest {
  method: string;
  pathname: string;
  pathParams: Record<string, string>;
  searchParams: URLSearchParams;
  headers: Record<string, string>;
  data: unknown;
}

export type LegacyEndpointResponse =
  | number
  | [status: number, contentType?: string, body?: string];

export interface LegacyEndpoint {
  supportedMethods?: string[];
  supportedDataTypes?: string[] | "*";
  allowRequestsFromUnsafeWebContent?: boolean;
  init:
    | ((
        data: unknown,
        sendResponseCallback: SendResponseCallback,
      ) => void | Promise<void>)
    | ((
        request: LegacyEndpointRequest,
      ) => LegacyEndpointResponse | Promise<LegacyEndpointResponse>);
}

export type LegacyEndpointConstructor = new () => LegacyEndpoint;

function getServer() {
  const server = (Zotero as any).Server;
  if (!server) {
    throw new Error("Zotero.Server is unavailable in this runtime");
  }
  return server;
}

export function ensureServerStarted() {
  const server = getServer();

  try {
    void server.port;
  } catch (_error) {
    server.init();
  }

  void server.port;
  return server;
}

export function getServerBaseUrl() {
  const server = ensureServerStarted();
  return `http://${LOCALHOST}:${server.port}`;
}

export function registerLegacyEndpoint(
  path: string,
  endpoint: LegacyEndpointConstructor,
) {
  const server = ensureServerStarted();
  server.Endpoints[path] = endpoint;
}

export function unregisterLegacyEndpoint(path: string) {
  const server = (Zotero as any).Server;
  if (!server?.Endpoints?.[path]) {
    return;
  }

  delete server.Endpoints[path];
}
