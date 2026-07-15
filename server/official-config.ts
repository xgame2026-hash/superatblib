import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { assertActiveSuperMtNodeLicense } from "./supermtnode-license";

export type SecurityCheckItem = {
  scope: string;
  key: string;
  label: string;
  value: string;
  ok: boolean;
  message: string;
  action?: "repair_secure_upload";
};

type EndpointBindingSource = {
  label: string;
  endpoints: Array<Record<string, unknown>>;
};

type OfficialEndpointRule = {
  key: string;
  label: string;
  defaultValue: string;
  protocols: string[];
  hosts: string[];
  paths: string[];
  required: boolean;
};

const OFFICIAL_ENDPOINTS: OfficialEndpointRule[] = [
  {
    key: "LIQUIDATION_SNAPSHOT_API_URL",
    label: "清算快照接口",
    defaultValue: "https://market-snapshot.superarb.ai/api/public/liquidations/snapshot",
    protocols: ["https:"],
    hosts: ["market-snapshot.superarb.ai"],
    paths: ["/api/public/liquidations/snapshot"],
    required: true,
  },
];

export function checkOfficialConfig(scope: string, env: Record<string, string>): SecurityCheckItem[] {
  return OFFICIAL_ENDPOINTS.map((rule) => checkOfficialEndpoint(scope, env, rule));
}

export async function checkRuntimeSettings(scope: string, env: Record<string, string>, authCode = ""): Promise<SecurityCheckItem[]> {
  const wallet = checkWallet(scope, env);
  const tokenPromise = checkSuperMtNodeToken(scope, env);
  const licensePromise = authCode ? checkLicenseEndpoints(env, authCode) : Promise.resolve({ endpoints: [], error: "" });
  const [token, license] = await Promise.all([tokenPromise, licensePromise]);
  const bindingSources: EndpointBindingSource[] = [];
  if (license.endpoints.length) bindingSources.push({ label: "当前授权码", endpoints: license.endpoints });
  if (token.endpoints.length) bindingSources.push({ label: "SUPERMTNODE_APP_TOKEN", endpoints: token.endpoints });
  const bnbRpc = await checkBnbRpc(scope, env, bindingSources);
  const password = checkUserPassword(scope, env);
  const items = [wallet, token.item, bnbRpc, password];
  if (license.error) {
    items.push({
      scope,
      key: "AUTH_CODE",
      label: "登录授权码",
      value: "已输入",
      ok: false,
      message: `授权码校验失败：${license.error}`,
    });
  }
  return items;
}

function checkUserPassword(scope: string, env: Record<string, string>): SecurityCheckItem {
  const configured = env.LIQ2_PASSWORD_CONFIGURED?.trim() === "true";
  const setupRequired = env.LIQ2_PASSWORD_SETUP_REQUIRED?.trim() === "true";
  const pendingStart = env.LIQ2_PASSWORD_PENDING_START?.trim() === "true";
  if (!configured && !setupRequired && !pendingStart) {
    return {
      scope,
      key: "LIQ2_PASSWORD_CONFIGURED",
      label: "用户密码",
      value: "未设置",
      ok: true,
      message: "password_first_use",
    };
  }
  return {
    scope,
    key: "LIQ2_PASSWORD_CONFIGURED",
    label: "用户密码",
    value: configured ? "已配置" : "未配置",
    ok: configured && !setupRequired && !pendingStart,
    message: configured && !setupRequired && !pendingStart
      ? "password_configured"
      : pendingStart
        ? "password_pending_start"
        : "password_setup_required",
  };
}

/**
 * Verifies a token with the official SuperMTNode endpoint before it is used to
 * send any wallet bootstrap data.  A syntactically valid or unexpired token is
 * deliberately not sufficient here.
 */
export async function validateSuperMtNodeAppToken(env: Record<string, string>): Promise<Array<Record<string, unknown>>> {
  const token = await checkSuperMtNodeToken("安全提交", env);
  if (!token.item.ok) throw new Error(token.item.message);
  return token.endpoints;
}

export function assertOfficialConfig(scope: string, env: Record<string, string>): void {
  const failed = checkOfficialConfig(scope, env).filter((item) => !item.ok);
  if (!failed.length) return;
  const details = failed.map((item) => `${item.label}(${item.key})：${item.message}`).join("；");
  throw new Error(`服务器已拒绝非官方配置：${details}`);
}

function checkOfficialEndpoint(scope: string, env: Record<string, string>, rule: OfficialEndpointRule): SecurityCheckItem {
  const configured = env[rule.key]?.trim();
  const value = configured || rule.defaultValue;
  if (!value) {
    return {
      scope,
      key: rule.key,
      label: rule.label,
      value: "",
      ok: !rule.required,
      message: rule.required ? "必须配置官方地址" : "未配置，运行时不使用该备用项",
    };
  }

  if (!rule.hosts.length) {
    const normalizedPath = value.startsWith("/") ? value : `/${value}`;
    const ok = rule.paths.includes(normalizedPath);
    return {
      scope,
      key: rule.key,
      label: rule.label,
      value,
      ok,
      message: ok ? "官方路径" : `应使用 ${rule.paths.join(" 或 ")}`,
    };
  }

  try {
    const url = new URL(value);
    const normalizedPath = url.pathname.replace(/\/+$/, "") || "/";
    const ok = rule.protocols.includes(url.protocol) && rule.hosts.includes(url.hostname) && rule.paths.includes(normalizedPath);
    return {
      scope,
      key: rule.key,
      label: rule.label,
      value,
      ok,
      message: ok ? "官方地址" : `官方要求：${expectedEndpoint(rule)}`,
    };
  } catch {
    return {
      scope,
      key: rule.key,
      label: rule.label,
      value,
      ok: false,
      message: "地址格式无效",
    };
  }
}

function expectedEndpoint(rule: OfficialEndpointRule): string {
  return rule.protocols
    .flatMap((protocol) => rule.hosts.flatMap((host) => rule.paths.map((path) => `${protocol}//${host}${path === "/" ? "" : path}`)))
    .join(" 或 ");
}

function privateKeyToAddress(privateKey: string): string | null {
  const hex = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) return null;
  try {
    const publicKey = getPublicKey(hexToBytes(hex), false).slice(1);
    const hash = keccak_256(publicKey);
    return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
  } catch {
    return null;
  }
}

function checkWallet(scope: string, env: Record<string, string>): SecurityCheckItem {
  const privateKey = env.PRIVATE_KEY?.trim() ?? "";
  if (!privateKey) {
    return { scope, key: "PRIVATE_KEY", label: "钱包地址", value: "", ok: false, message: "本地未配置" };
  }
  const walletAddress = privateKeyToAddress(privateKey);
  return {
    scope,
    key: "PRIVATE_KEY",
    label: "钱包地址",
    value: walletAddress ?? "",
    ok: Boolean(walletAddress),
    message: walletAddress ? "已解析钱包地址" : "钱包授权格式无效，请检查输入",
  };
}

async function checkSuperMtNodeToken(
  scope: string,
  env: Record<string, string>,
): Promise<{ item: SecurityCheckItem; endpoints: Array<Record<string, unknown>> }> {
  const token = env.SUPERMTNODE_APP_TOKEN?.trim() ?? "";
  if (!token) {
    return {
      item: { scope, key: "SUPERMTNODE_APP_TOKEN", label: "服务授权 Token", value: "", ok: false, message: "本地未配置" },
      endpoints: [],
    };
  }

  const expiry = jwtExpiry(token);
  if (expiry && expiry.getTime() <= Date.now()) {
    return {
      item: {
        scope,
        key: "SUPERMTNODE_APP_TOKEN",
        label: "服务授权 Token",
        value: "已配置",
        ok: false,
        message: `Token 已过期：${formatDateTime(expiry)}`,
      },
      endpoints: [],
    };
  }

  try {
    const endpoints = await fetchSuperMtNodeEndpoints(env, token);
    return {
      item: {
        scope,
        key: "SUPERMTNODE_APP_TOKEN",
        label: "服务授权 Token",
        value: expiry ? `有效期至 ${formatDateTime(expiry)}` : "已通过官方校验",
        ok: true,
        message: expiry ? `官方校验通过，有效期至 ${formatDateTime(expiry)}` : "官方校验通过",
      },
      endpoints,
    };
  } catch (error) {
    return {
      item: {
        scope,
        key: "SUPERMTNODE_APP_TOKEN",
        label: "服务授权 Token",
        value: expiry ? `本地有效期至 ${formatDateTime(expiry)}` : "已配置",
        ok: false,
        message: `官方校验失败：${error instanceof Error ? error.message : String(error)}`,
      },
      endpoints: [],
    };
  }
}

async function checkBnbRpc(
  scope: string,
  env: Record<string, string>,
  bindingSources: EndpointBindingSource[],
): Promise<SecurityCheckItem> {
  const rpcUrl = env.BNB_RPC_URL?.trim() ?? "";
  if (!rpcUrl) return { scope, key: "BNB_RPC_URL", label: "BNB RPC", value: "", ok: false, message: "本地未配置" };
  const bindingSource = bindingSources.find((source) => source.endpoints.some((item) => matchSuperMtNodeEndpoint(item, "bnb", rpcUrl)));
  const requiresBinding = bindingSources.length > 0;
  const isBound = !requiresBinding || Boolean(bindingSource);
  const usage = bindingSource ? readEndpointUsage(bindingSource.endpoints, rpcUrl) : "";
  const bindingMessage = bindingSource ? `；绑定到${bindingSource.label}` : requiresBinding ? `；未绑定到${bindingSources.map((source) => source.label).join("或")}` : "";

  try {
    const chainId = await rpc<string>(rpcUrl, "eth_chainId", [], env);
    const isBnb = chainId.toLowerCase() === "0x38";
    return {
      scope,
      key: "BNB_RPC_URL",
      label: "BNB RPC",
      value: maskUrl(rpcUrl),
      ok: isBnb && isBound,
      message: `${isBnb ? "RPC 连接正常" : `链 ID 异常：${chainId}`}${bindingMessage}${usage ? `；${usage}` : ""}`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isPermissiveRpcCheckError(message)) {
      return {
        scope,
        key: "BNB_RPC_URL",
        label: "BNB RPC",
        value: maskUrl(rpcUrl),
        ok: true,
        message: `RPC 已配置；当前直连检测不稳定，允许继续排队${bindingSource ? `；绑定到${bindingSource.label}` : ""}${usage ? `；${usage}` : ""}`,
      };
    }
    return {
      scope,
      key: "BNB_RPC_URL",
      label: "BNB RPC",
      value: maskUrl(rpcUrl),
      ok: false,
      message: `RPC 检测失败：${message}${bindingMessage}`,
    };
  }
}

function isPermissiveRpcCheckError(message: string): boolean {
  return /rate limit|too many requests|429|request limit|quota|unexpected end of json|invalid json|empty response|timeout|aborted|fetch failed|network|econn|enotfound|eai_again/i.test(message);
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], env?: Record<string, string>): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(4_000),
  });
  const text = await response.text();
  if (!text.trim()) throw new Error("empty response");
  let payload: { result?: T; error?: { message?: string } };
  try {
    payload = JSON.parse(text) as { result?: T; error?: { message?: string } };
  } catch {
    throw new Error(`invalid JSON response: ${text.slice(0, 80)}`);
  }
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  return payload.result;
}

async function fetchSuperMtNodeEndpoints(env: Record<string, string>, token: string): Promise<Array<Record<string, unknown>>> {
  // Token endpoint discovery remains on the canonical SuperMT Node host.  It
  // is distinct from the fixed authorization-code check URL in
  // supermtnode-license.ts.
  const apiBase = "https://supermtnode.io";
  const response = await fetch(`${apiBase}/api/rpc-endpoints`, {
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(4_000),
  });
  const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown };
  if (!response.ok) {
    const detail = typeof payload.error === "string" ? payload.error : typeof payload.message === "string" ? payload.message : "";
    throw new Error(`HTTP ${response.status}${detail ? `：${detail}` : ""}`);
  }
  return Array.isArray(payload.endpoints) ? payload.endpoints.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
}

async function checkLicenseEndpoints(
  env: Record<string, string>,
  authCode: string,
): Promise<{ endpoints: Array<Record<string, unknown>>; error: string }> {
  try {
    await assertActiveSuperMtNodeLicense(authCode);
    return { endpoints: await fetchSuperMtNodeEndpointsByLicense(env, authCode), error: "" };
  } catch (error) {
    return { endpoints: [], error: error instanceof Error ? error.message : String(error) };
  }
}

async function fetchSuperMtNodeEndpointsByLicense(env: Record<string, string>, authCode: string): Promise<Array<Record<string, unknown>>> {
  const errors: string[] = [];
  for (const apiBase of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${apiBase}/api/rpc-endpoints/by-license`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-license-code": authCode,
        },
        body: JSON.stringify({ code: authCode }),
        signal: AbortSignal.timeout(4_000),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        endpoints?: unknown;
        error?: unknown;
        message?: unknown;
        reason?: unknown;
        status?: unknown;
        valid?: unknown;
      };
      if (!response.ok) {
        const detail = stringValue(payload.error, payload.message) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      if (payload.valid === false) {
        const reason = stringValue(payload.reason, payload.message, payload.status) || "授权码失效";
        throw new Error(reason);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

function superMtNodeApiBaseUrls(_env: Record<string, string>): string[] {
  return ["https://supermtnode.io", "https://api.supermtnode.io"].map((value) => value.replace(/\/+$/, ""));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function readEndpointUsage(endpoints: Array<Record<string, unknown>>, rpcUrl: string): string {
  const endpoint = endpoints.find((item) => {
    const url = stringValue(item.httpUrl, item.http_url);
    return url && normalizeUrl(url) === normalizeUrl(rpcUrl);
  });
  if (!endpoint) return "";
  const count = numberValue(endpoint.requestCount, endpoint.request_count);
  const limit = numberValue(endpoint.requestLimit, endpoint.request_limit);
  if (count !== null && limit !== null && limit > 0) return `剩余 ${Math.max(0, limit - count)}`;
  return "";
}

function matchSuperMtNodeEndpoint(endpoint: Record<string, unknown>, chain: "bnb", rpcUrl: string): boolean {
  const endpointChain = normalizeSuperMtNodeEndpointChain(endpoint.chain);
  if (endpointChain !== chain) return false;
  const endpointUrl = normalizeComparableUrl(stringValue(endpoint.httpUrl, endpoint.http_url));
  const configuredUrl = normalizeComparableUrl(rpcUrl);
  const configuredSlug = normalizeEndpointSlug(rpcEndpointSlugFromUrl(rpcUrl));
  const endpointSlug = normalizeEndpointSlug(stringValue(endpoint.endpointSlug, endpoint.endpoint_slug));
  return endpointUrl === configuredUrl || (Boolean(configuredSlug) && endpointSlug === configuredSlug);
}

function normalizeSuperMtNodeEndpointChain(value: unknown): string {
  const chain = stringValue(value)?.toLowerCase();
  if (chain === "bsc" || chain === "binance" || chain === "bnb" || chain === "bnb chain") return "bnb";
  return chain ?? "";
}

function rpcEndpointSlugFromUrl(value: string): string | undefined {
  try {
    return new URL(value).pathname.split("/").filter(Boolean).pop();
  } catch {
    return value.split("/").filter(Boolean).pop();
  }
}

function normalizeEndpointSlug(value?: string): string {
  return (value ?? "").trim().replace(/^\/+|\/+$/g, "").toLowerCase();
}

function normalizeComparableUrl(value: string | undefined): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    url.protocol = url.protocol.toLowerCase();
    url.hostname = url.hostname.toLowerCase();
    url.pathname = url.pathname.replace(/\/+$/, "");
    url.searchParams.sort();
    return url.toString().replace(/\/+$/, "");
  } catch {
    return raw.replace(/\/+$/, "");
  }
}

function jwtExpiry(token: string): Date | null {
  const payload = token.split(".")[1];
  if (!payload) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: unknown };
    return typeof parsed.exp === "number" && Number.isFinite(parsed.exp) ? new Date(parsed.exp * 1000) : null;
  } catch {
    return null;
  }
}

function usableToken(value: string | undefined): string {
  const token = value?.trim() ?? "";
  if (!token) return "";
  const expiry = jwtExpiry(token);
  return expiry && expiry.getTime() <= Date.now() ? "" : token;
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    const numeric = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function maskUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname === "/" ? "" : url.pathname}`;
  } catch {
    return value;
  }
}

function formatDateTime(value: Date): string {
  return value.toLocaleString("zh-CN", { hour12: false });
}
