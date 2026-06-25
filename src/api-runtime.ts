import { t } from "./i18n";

const API_PORT_KEY = "liq2-api-port";

export function installLocalApiPortFallback(): void {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    if (!isLocalApiRequest(input)) return nativeFetch(input, init);

    const urls = localApiUrls(input);
    let lastError: unknown;
    for (const url of urls) {
      try {
        const response = await nativeFetch(url, cloneRequestInit(init));
        if (response.status === 404 && url !== urls[urls.length - 1]) continue;
        rememberApiPort(url);
        return response;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(t("api.localConnectFailed"));
  };
}

function isLocalApiRequest(input: RequestInfo | URL): boolean {
  if (input instanceof Request) return isLocalApiUrl(input.url);
  return isLocalApiUrl(String(input));
}

function isLocalApiUrl(value: string): boolean {
  if (value.startsWith("/api/")) return true;
  try {
    const url = new URL(value, window.location.origin);
    return isLocalHost(url.hostname) && url.pathname.startsWith("/api/");
  } catch {
    return false;
  }
}

function localApiUrls(input: RequestInfo | URL): string[] {
  const path = apiPath(input);
  const candidates = [path];
  const currentPort = window.location.port;
  const savedPort = localStorage.getItem(API_PORT_KEY) || "";
  for (const port of [currentPort, savedPort]) {
    if (port) candidates.push(`http://127.0.0.1:${port}${path}`);
  }
  return [...new Set(candidates)];
}

function apiPath(input: RequestInfo | URL): string {
  const value = input instanceof Request ? input.url : String(input);
  if (value.startsWith("/api/")) return value;
  const url = new URL(value, window.location.origin);
  return `${url.pathname}${url.search}${url.hash}`;
}

function cloneRequestInit(init: RequestInit | undefined): RequestInit | undefined {
  if (!init) return undefined;
  return { ...init, headers: init.headers ? new Headers(init.headers) : init.headers };
}

function rememberApiPort(value: string): void {
  try {
    const url = new URL(value, window.location.origin);
    if (isLocalHost(url.hostname) && url.port) localStorage.setItem(API_PORT_KEY, url.port);
  } catch {
    // Ignore malformed URLs from browser internals.
  }
}

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "127.0.01" || hostname.startsWith("127.");
}
