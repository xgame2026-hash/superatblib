import type { IncomingMessage, ServerResponse } from "node:http";

const PROFILE_ROUTE = "/api/profile/avatar";
const PROFILE_IMAGE_ROUTE = "/api/profile/avatar/image";
const PROFILE_API_URL = "https://api.supermtglobal.com/avatar";
const PROFILE_IMAGE_API_URL = "https://upload.supermtglobal.com/api/avatar";

const METADATA_BODY_LIMIT_BYTES = 1024 * 1024;
const IMAGE_BODY_LIMIT_BYTES = 6 * 1024 * 1024;
const PROFILE_READ_TIMEOUT_MS = 15_000;
const PROFILE_WRITE_TIMEOUT_MS = 15_000;
const IMAGE_WRITE_TIMEOUT_MS = 45_000;
const WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;

type JsonObject = Record<string, unknown>;

type UpstreamReadResult =
  | {
      kind: "response";
      response: Response;
      text: string;
      payload: unknown;
      validJson: boolean;
    }
  | {
      kind: "error";
      error: unknown;
      timedOut: boolean;
    };

class RequestFailure extends Error {
  readonly statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "RequestFailure";
    this.statusCode = statusCode;
  }
}

export function handleAvatarProfileRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (pathname !== PROFILE_ROUTE && pathname !== PROFILE_IMAGE_ROUTE) return false;

  if (pathname === PROFILE_IMAGE_ROUTE) {
    if (req.method !== "POST") {
      methodNotAllowed(res, "POST");
      return true;
    }
  } else if (req.method !== "GET" && req.method !== "POST") {
    methodNotAllowed(res, "GET, POST");
    return true;
  }

  const wallet = normalizeWallet(headerValue(req.headers["x-wallet-address"]));
  if (!wallet) {
    json(res, 400, { message: "A valid x-wallet-address header is required." });
    return true;
  }

  const uploadToken = headerValue(req.headers["x-superimg-upload-token"]);

  if (pathname === PROFILE_ROUTE && req.method === "GET") {
    void readMergedProfile(wallet, uploadToken)
      .then((result) => sendMergedProfileResult(res, wallet, result))
      .catch((error: unknown) => sendUnexpectedError(res, error));
    return true;
  }

  const targetUrl = pathname === PROFILE_IMAGE_ROUTE ? PROFILE_IMAGE_API_URL : PROFILE_API_URL;
  const bodyLimit = pathname === PROFILE_IMAGE_ROUTE ? IMAGE_BODY_LIMIT_BYTES : METADATA_BODY_LIMIT_BYTES;
  const timeoutMs = pathname === PROFILE_IMAGE_ROUTE ? IMAGE_WRITE_TIMEOUT_MS : PROFILE_WRITE_TIMEOUT_MS;

  void forwardMultipartRequest(req, res, {
    targetUrl,
    wallet,
    uploadToken,
    bodyLimit,
    timeoutMs,
  }).catch((error: unknown) => sendUnexpectedError(res, error));

  return true;
}

async function readMergedProfile(wallet: string, uploadToken?: string): Promise<[UpstreamReadResult, UpstreamReadResult]> {
  const headers = upstreamHeaders(wallet, uploadToken);
  return Promise.all([
    readUpstreamJson(PROFILE_API_URL, headers, PROFILE_READ_TIMEOUT_MS),
    readUpstreamJson(PROFILE_IMAGE_API_URL, headers, PROFILE_READ_TIMEOUT_MS),
  ]);
}

function sendMergedProfileResult(
  res: ServerResponse,
  wallet: string,
  [metadataResult, imageResult]: [UpstreamReadResult, UpstreamReadResult],
): void {
  const metadata = usableProfilePayload(metadataResult);
  const image = usableProfilePayload(imageResult);

  if (!metadata && !image) {
    sendReadFailure(res, metadataResult, imageResult);
    return;
  }

  const imageAvatarUrl = nonEmptyStringField(image, "avatarUrl", "avatar_url", "url");
  const metadataAvatarUrl = nonEmptyStringField(metadata, "avatarUrl", "avatar_url");
  const imageUpdatedAt = nonEmptyStringField(image, "avatarUpdatedAt", "avatar_updated_at");
  const metadataUpdatedAt = nonEmptyStringField(metadata, "avatarUpdatedAt", "avatar_updated_at");

  json(res, 200, {
    walletAddress: wallet,
    nickname: stringField(metadata, "nickname", "displayName", "display_name") ?? stringField(image, "nickname", "displayName", "display_name") ?? "",
    bio: stringField(metadata, "bio", "intro", "introduction") ?? stringField(image, "bio", "intro", "introduction") ?? "",
    avatarUrl: imageAvatarUrl || metadataAvatarUrl || "",
    avatarUpdatedAt: imageUpdatedAt || metadataUpdatedAt || null,
  });
}

async function readUpstreamJson(url: string, headers: Record<string, string>, timeoutMs: number): Promise<UpstreamReadResult> {
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers,
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await response.text();
    const parsed = parseJson(text);
    return {
      kind: "response",
      response,
      text,
      payload: parsed.payload,
      validJson: parsed.valid,
    };
  } catch (error) {
    return { kind: "error", error, timedOut: isTimeoutError(error) };
  }
}

function usableProfilePayload(result: UpstreamReadResult): JsonObject | undefined {
  if (result.kind !== "response" || !result.response.ok || !result.validJson) return undefined;
  return isJsonObject(result.payload) ? result.payload : undefined;
}

function sendReadFailure(res: ServerResponse, ...results: UpstreamReadResult[]): void {
  const upstreamFailure = results.find((result): result is Extract<UpstreamReadResult, { kind: "response" }> => {
    return result.kind === "response" && !result.response.ok;
  });
  if (upstreamFailure) {
    sendUpstreamBody(res, upstreamFailure.response, upstreamFailure.text);
    return;
  }

  const timedOut = results.some((result) => result.kind === "error" && result.timedOut);
  const details = results
    .map((result) => upstreamFailureMessage(result))
    .filter(Boolean)
    .join("; ");
  json(res, timedOut ? 504 : 502, {
    message: details || (timedOut ? "Avatar profile request timed out." : "Avatar profile services returned invalid responses."),
  });
}

async function forwardMultipartRequest(
  req: IncomingMessage,
  res: ServerResponse,
  options: {
    targetUrl: string;
    wallet: string;
    uploadToken?: string;
    bodyLimit: number;
    timeoutMs: number;
  },
): Promise<void> {
  const contentType = headerValue(req.headers["content-type"]);
  if (!contentType || !/^multipart\/form-data\s*;/i.test(contentType) || !/\bboundary=/i.test(contentType)) {
    throw new RequestFailure(415, "multipart/form-data with a boundary is required.");
  }

  const body = await readBody(req, options.bodyLimit);

  let response: Response;
  let responseBody: Buffer;
  try {
    response = await fetch(options.targetUrl, {
      method: "POST",
      headers: {
        ...upstreamHeaders(options.wallet, options.uploadToken),
        "content-type": contentType,
      },
      body,
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    responseBody = Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (isTimeoutError(error)) throw new RequestFailure(504, "Avatar profile request timed out.");
    throw new RequestFailure(502, error instanceof Error ? error.message : "Avatar profile service is unavailable.");
  }

  res.statusCode = response.status;
  copyResponseHeader(response, res, "content-type", "application/json; charset=utf-8");
  copyResponseHeader(response, res, "retry-after");
  res.end(responseBody);
}

function readBody(req: IncomingMessage, limit: number): Promise<ArrayBuffer> {
  const declaredLength = contentLength(req.headers["content-length"]);
  if (declaredLength !== undefined && declaredLength > limit) {
    req.resume();
    return Promise.reject(new RequestFailure(413, `Request body exceeds the ${formatBytes(limit)} limit.`));
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let settled = false;

    const cleanup = () => {
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.off("aborted", onAborted);
    };

    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    };

    const onData = (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > limit) {
        fail(new RequestFailure(413, `Request body exceeds the ${formatBytes(limit)} limit.`));
        req.resume();
        return;
      }
      chunks.push(bytes);
    };

    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      const body = new ArrayBuffer(total);
      new Uint8Array(body).set(Buffer.concat(chunks, total));
      resolve(body);
    };

    const onError = (error: Error) => fail(error);
    const onAborted = () => fail(new RequestFailure(400, "Request body was aborted."));

    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
    req.once("aborted", onAborted);
  });
}

function upstreamHeaders(wallet: string, uploadToken?: string): Record<string, string> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "x-wallet-address": wallet,
  };
  if (uploadToken) headers["x-superimg-upload-token"] = uploadToken;
  return headers;
}

function sendUnexpectedError(res: ServerResponse, error: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  if (error instanceof RequestFailure) {
    json(res, error.statusCode, { message: error.message });
    return;
  }
  json(res, 500, { message: error instanceof Error ? error.message : String(error) });
}

function sendUpstreamBody(res: ServerResponse, response: Response, text: string): void {
  res.statusCode = response.status;
  copyResponseHeader(response, res, "content-type", "application/json; charset=utf-8");
  copyResponseHeader(response, res, "retry-after");
  res.end(text);
}

function copyResponseHeader(response: Response, res: ServerResponse, name: string, fallback?: string): void {
  const value = response.headers.get(name) || fallback;
  if (value) res.setHeader(name, value);
}

function upstreamFailureMessage(result: UpstreamReadResult): string {
  if (result.kind === "error") {
    return result.timedOut ? "Avatar profile upstream timed out" : errorMessage(result.error);
  }
  if (result.response.ok && !result.validJson) return "Avatar profile upstream returned invalid JSON";
  if (result.response.ok && !isJsonObject(result.payload)) return "Avatar profile upstream returned an invalid payload";
  return "";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "Avatar profile service is unavailable";
}

function parseJson(text: string): { valid: boolean; payload: unknown } {
  if (!text.trim()) return { valid: false, payload: undefined };
  try {
    return { valid: true, payload: JSON.parse(text) as unknown };
  } catch {
    return { valid: false, payload: undefined };
  }
}

function isJsonObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(payload: JsonObject | undefined, ...keys: string[]): string | undefined {
  if (!payload) return undefined;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

function nonEmptyStringField(payload: JsonObject | undefined, ...keys: string[]): string | undefined {
  const value = stringField(payload, ...keys)?.trim();
  return value || undefined;
}

function requestPathname(url?: string): string {
  if (!url) return "";
  try {
    return new URL(url, "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

function normalizeWallet(value?: string): string | undefined {
  const wallet = value?.trim();
  return wallet && WALLET_PATTERN.test(wallet) ? wallet.toLowerCase() : undefined;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function contentLength(value: string | string[] | undefined): number | undefined {
  const raw = headerValue(value);
  if (!raw || !/^\d+$/.test(raw)) return undefined;
  const length = Number(raw);
  return Number.isSafeInteger(length) ? length : undefined;
}

function formatBytes(value: number): string {
  return value % (1024 * 1024) === 0 ? `${value / (1024 * 1024)} MiB` : `${value} byte`;
}

function isTimeoutError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = "name" in error ? String(error.name) : "";
  return name === "TimeoutError" || name === "AbortError";
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.setHeader("Allow", allow);
  json(res, 405, { message: "Method not allowed." });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
