const LICENSE_CHECK_URL = "https://api.supermtnode.io/license/check";
const RPC_ENDPOINT_URLS = [
  "https://supermtnode.io/api/rpc-endpoints",
  "https://api.supermtnode.io/api/rpc-endpoints",
];
const REQUEST_TIMEOUT_MS = 8_000;
export const CREDENTIAL_AUDIT_INTERVAL_MS = 60_000;

type RecordValue = Record<string, unknown>;
export type CredentialState = "valid" | "invalid" | "unknown";
export type RpcCredentialState = "valid" | "expired" | "disabled" | "no_credit" | "unknown";

export type CredentialAuditResult = {
  ok: boolean;
  definitiveInvalid: boolean;
  authorization: { state: CredentialState; reason: string; expiresAt?: string };
  appToken: { state: CredentialState; reason: string };
  rpc: { state: RpcCredentialState; reason: string; endpointId?: string; expiresAt?: string };
  checkedAt: string;
};

export type RuntimeCredentialInput = {
  authCode: string;
  appToken: string;
  rpcUrl: string;
  chain?: "bnb";
  endpointId?: string;
};

export type CredentialAuditMonitor = {
  start: (runImmediately?: boolean) => void;
  stop: () => void;
  runNow: () => Promise<CredentialAuditResult>;
  isRunning: () => boolean;
};

export async function auditAuthorizationCode(authCode: string): Promise<CredentialAuditResult["authorization"]> {
  const code = authCode.trim().toUpperCase();
  if (!code) return { state: "invalid", reason: "授权码未配置。" };
  try {
    const response = await fetch(LICENSE_CHECK_URL, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ code }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as RecordValue;
    if (response.status >= 500) return { state: "unknown", reason: `授权服务暂不可用（HTTP ${response.status}）。` };
    const expiry = dateValue(payload.expiresAt, payload.expires_at, payload.validUntil, payload.valid_until);
    if (!response.ok || payload.ok !== true || payload.valid !== true || stringValue(payload.status)?.toLowerCase() !== "active") {
      return { state: "invalid", reason: stringValue(payload.error, payload.reason, payload.message, payload.status) || `授权无效（HTTP ${response.status}）。` };
    }
    if (!expiry) return { state: "invalid", reason: "授权服务未返回有效期。" };
    if (expiry.getTime() <= Date.now()) return { state: "invalid", reason: `授权码已于 ${expiry.toISOString()} 过期。`, expiresAt: expiry.toISOString() };
    return { state: "valid", reason: "授权码有效。", expiresAt: expiry.toISOString() };
  } catch (error) {
    return { state: "unknown", reason: `授权服务暂时无法访问：${errorMessage(error)}` };
  }
}

export async function auditSubmissionCredentials(input: RuntimeCredentialInput): Promise<CredentialAuditResult> {
  return auditRuntimeCredentials(input);
}

export async function auditRuntimeCredentials(input: RuntimeCredentialInput): Promise<CredentialAuditResult> {
  const authorizationPromise = auditAuthorizationCode(input.authCode);
  const appToken = input.appToken.trim();
  const rpcUrl = input.rpcUrl.trim();
  const chain = input.chain ?? "bnb";
  const tokenExpiry = jwtExpiry(appToken);

  let appTokenResult: CredentialAuditResult["appToken"];
  let rpcResult: CredentialAuditResult["rpc"];
  if (!appToken) {
    appTokenResult = { state: "invalid", reason: "app_token 未配置。" };
    rpcResult = { state: "disabled", reason: "缺少 app_token，无法审计 RPC。" };
  } else if (tokenExpiry && tokenExpiry.getTime() <= Date.now()) {
    appTokenResult = { state: "invalid", reason: `app_token 已于 ${tokenExpiry.toISOString()} 过期。` };
    rpcResult = { state: "expired", reason: "app_token 已过期。", expiresAt: tokenExpiry.toISOString() };
  } else if (!validHttpUrl(rpcUrl)) {
    appTokenResult = { state: "unknown", reason: "尚未通过官方端点验证。" };
    rpcResult = { state: "disabled", reason: "RPC URL 未配置或格式不正确。" };
  } else {
    const inventory = await fetchEndpointInventory(appToken);
    if (inventory.state !== "valid") {
      appTokenResult = { state: inventory.state, reason: inventory.reason };
      rpcResult = { state: inventory.state === "invalid" ? "disabled" : "unknown", reason: inventory.reason };
    } else {
      appTokenResult = { state: "valid", reason: "app_token 已通过官方验证。" };
      const endpoint = inventory.endpoints.find((item) => {
        if (normalizeChain(item.chain) !== chain) return false;
        const id = endpointIdentifier(item);
        if (input.endpointId) return id === input.endpointId;
        return normalizeUrl(stringValue(item.httpUrl, item.http_url)) === normalizeUrl(rpcUrl);
      });
      rpcResult = endpoint
        ? await auditMatchedRpc(endpoint, rpcUrl, chain)
        : { state: "disabled", reason: input.endpointId ? "app_token 名下不存在指定的 RPC endpointId。" : "RPC URL 不属于该 app_token 的 BNB 端点。" };
    }
  }

  const authorization = await authorizationPromise;
  const ok = authorization.state === "valid" && appTokenResult.state === "valid" && rpcResult.state === "valid";
  return {
    ok,
    definitiveInvalid: authorization.state === "invalid"
      || appTokenResult.state === "invalid"
      || ["expired", "disabled", "no_credit"].includes(rpcResult.state),
    authorization,
    appToken: appTokenResult,
    rpc: rpcResult,
    checkedAt: new Date().toISOString(),
  };
}

export function createCredentialAuditMonitor(options: {
  readInput: () => RuntimeCredentialInput | Promise<RuntimeCredentialInput>;
  onResult: (result: CredentialAuditResult) => void | Promise<void>;
  intervalMs?: number;
}): CredentialAuditMonitor {
  const intervalMs = Math.max(10_000, options.intervalMs ?? CREDENTIAL_AUDIT_INTERVAL_MS);
  let timer: ReturnType<typeof setInterval> | undefined;
  let inFlight: Promise<CredentialAuditResult> | undefined;

  const runNow = async (): Promise<CredentialAuditResult> => {
    if (inFlight) return inFlight;
    inFlight = Promise.resolve(options.readInput())
      .then((input) => auditRuntimeCredentials(input))
      .then(async (result) => {
        await options.onResult(result);
        return result;
      })
      .finally(() => {
        inFlight = undefined;
      });
    return inFlight;
  };

  return {
    start(runImmediately = true) {
      if (timer) return;
      timer = setInterval(() => void runNow(), intervalMs);
      if (runImmediately) void runNow();
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = undefined;
    },
    runNow,
    isRunning: () => Boolean(timer),
  };
}

async function auditMatchedRpc(endpoint: RecordValue, rpcUrl: string, chain: "bnb"): Promise<CredentialAuditResult["rpc"]> {
  const endpointId = endpointIdentifier(endpoint);
  const status = stringValue(endpoint.status)?.toLowerCase();
  const expiry = dateValue(
    endpoint.expiresAt,
    endpoint.expires_at,
    endpoint.validUntil,
    endpoint.valid_until,
    endpoint.licenseExpiresAt,
    endpoint.license_expires_at,
    endpoint.tokenExpiresAt,
    endpoint.token_expires_at,
    endpoint.subscriptionExpiresAt,
    endpoint.subscription_expires_at,
  );
  if (!endpointId) return { state: "unknown", reason: "官方端点未返回唯一 endpointId。" };
  if (status !== "active") return { state: "disabled", reason: `RPC 端点状态为 ${status || "unknown"}。`, endpointId };
  if (!expiry) return { state: "unknown", reason: "官方端点未返回 RPC 有效期。", endpointId };
  if (expiry.getTime() <= Date.now()) return { state: "expired", reason: `RPC 已于 ${expiry.toISOString()} 到期。`, endpointId, expiresAt: expiry.toISOString() };
  const remaining = remainingCredits(endpoint);
  if (remaining === null) return { state: "unknown", reason: "官方端点未返回 RPC 剩余额度。", endpointId, expiresAt: expiry.toISOString() };
  if (remaining !== null && remaining <= 0) return { state: "no_credit", reason: "RPC 剩余额度为 0。", endpointId, expiresAt: expiry.toISOString() };
  try {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const payload = (await response.json().catch(() => ({}))) as { result?: unknown; error?: { message?: string } };
    if (response.status === 401 || response.status === 403) return { state: "disabled", reason: payload.error?.message || `RPC HTTP ${response.status}。`, endpointId, expiresAt: expiry.toISOString() };
    if (response.status >= 500 || response.status === 429) return { state: "unknown", reason: `RPC 暂时不可用（HTTP ${response.status}）。`, endpointId, expiresAt: expiry.toISOString() };
    if (!response.ok || payload.error) return { state: "disabled", reason: payload.error?.message || `RPC HTTP ${response.status}。`, endpointId, expiresAt: expiry.toISOString() };
    const expectedChainId = chain === "bnb" ? "0x38" : "";
    if (String(payload.result || "").toLowerCase() !== expectedChainId) return { state: "disabled", reason: `RPC 链 ID 异常：${String(payload.result || "empty")}。`, endpointId, expiresAt: expiry.toISOString() };
    return { state: "valid", reason: "RPC 与 app_token 有效。", endpointId, expiresAt: expiry.toISOString() };
  } catch (error) {
    return { state: "unknown", reason: `RPC 暂时无法访问：${errorMessage(error)}`, endpointId, expiresAt: expiry.toISOString() };
  }
}

async function fetchEndpointInventory(appToken: string): Promise<{ state: CredentialState; reason: string; endpoints: RecordValue[] }> {
  const errors: string[] = [];
  let explicitlyInvalid = false;
  for (const url of RPC_ENDPOINT_URLS) {
    try {
      const response = await fetch(url, {
        headers: { accept: "application/json", authorization: `Bearer ${appToken}`, "x-supermtnode-app-token": appToken },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => ({}))) as RecordValue;
      if (response.ok) {
        const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints.filter(isRecord) : [];
        return { state: "valid", reason: "app_token 已通过官方验证。", endpoints };
      }
      if ([400, 401, 403].includes(response.status)) explicitlyInvalid = true;
      errors.push(stringValue(payload.error, payload.message) || `HTTP ${response.status}`);
    } catch (error) {
      errors.push(errorMessage(error));
    }
  }
  return explicitlyInvalid
    ? { state: "invalid", reason: `app_token 无效：${errors.join("；")}`, endpoints: [] }
    : { state: "unknown", reason: `官方端点服务暂不可用：${errors.join("；")}`, endpoints: [] };
}

function remainingCredits(endpoint: RecordValue): number | null {
  const explicit = numberValue(endpoint.creditsRemaining, endpoint.credits_remaining);
  if (explicit !== null) return explicit;
  const count = numberValue(endpoint.requestCount, endpoint.request_count);
  const limit = numberValue(endpoint.requestLimit, endpoint.request_limit);
  return count !== null && limit !== null ? Math.max(0, limit - count) : null;
}

function endpointIdentifier(endpoint: RecordValue): string | undefined {
  return stringValue(endpoint.id, endpoint.endpointId, endpoint.endpoint_id, endpoint.slug, endpoint.endpointSlug, endpoint.endpoint_slug);
}

function jwtExpiry(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(payload.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as { exp?: unknown };
    return typeof parsed.exp === "number" && Number.isFinite(parsed.exp) ? new Date(parsed.exp * 1_000) : null;
  } catch {
    return null;
  }
}

function dateValue(...values: unknown[]): Date | null {
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    const date = new Date(value);
    if (Number.isFinite(date.getTime())) return date;
  }
  return null;
}

function normalizeChain(value: unknown): string {
  const chain = stringValue(value)?.toLowerCase();
  return ["bnb", "bsc", "binance", "bnb chain"].includes(chain || "") ? "bnb" : chain || "";
}

function normalizeUrl(value?: string): string {
  return (value || "").trim().replace(/\/+$/, "").toLowerCase();
}

function validHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function stringValue(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && Boolean(value.trim()))?.trim();
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(number)) return number;
  }
  return null;
}

function isRecord(value: unknown): value is RecordValue {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
