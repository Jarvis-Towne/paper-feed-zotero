const LOCALHOST = "127.0.0.1";

export interface LegacyEndpoint {
  supportedMethods?: string[];
  supportedDataTypes?: string[] | "*";
  init: (
    data: unknown,
    sendResponseCallback: SendResponseCallback,
  ) => void | Promise<void>;
}

export type LegacyEndpointConstructor = new () => LegacyEndpoint;

export type SendResponseCallback = (
  status: number,
  contentType?: string,
  body?: string,
) => void;

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
