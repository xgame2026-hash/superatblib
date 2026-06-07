import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";

export type SecurityCheckItem = {
  scope: string;
  key: string;
  label: string;
  value: string;
  ok: boolean;
  message: string;
  action?: "repair_secure_upload";
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
    defaultValue: "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
    protocols: ["https:"],
    hosts: ["bsc.rpc.supermtnode.io"],
    paths: ["/api/public/liquidations/snapshot"],
    required: true,
  },
  {
    key: "MANAGE_LIQUIDATION_QUEUE_INGEST_URL",
    label: "管理端上报地址",
    defaultValue: "https://manage.supermtnode.io/api/ingest/liquidation-queue",
    protocols: ["https:"],
    hosts: ["manage.supermtnode.io"],
    paths: ["/api/ingest/liquidation-queue"],
    required: true,
  },
  {
    key: "LIQUIDATION_QUEUE_INGEST_URL",
    label: "备用队列上报地址",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["manage.supermtnode.io"],
    paths: ["/api/ingest/liquidation-queue"],
    required: false,
  },
  {
    key: "LIQUIDATION_QUEUE_WSS_URL",
    label: "队列 WSS 地址",
    defaultValue: "wss://private.superarb.ai/ws/liquidation-queue-v2",
    protocols: ["wss:"],
    hosts: ["private.superarb.ai"],
    paths: ["/ws/liquidation-queue-v2"],
    required: true,
  },
  {
    key: "MANAGE_LIQUIDATION_QUEUE_WSS_URL",
    label: "备用队列 WSS 地址",
    defaultValue: "",
    protocols: ["wss:"],
    hosts: ["private.superarb.ai"],
    paths: ["/ws/liquidation-queue-v2"],
    required: false,
  },
  {
    key: "LIQUIDATION_QUEUE_STATUS_URL",
    label: "队列状态接口",
    defaultValue: "https://api.supermtnode.io/api/public/liquidations/queue-status",
    protocols: ["https:"],
    hosts: ["api.supermtnode.io"],
    paths: ["/api/public/liquidations/queue-status"],
    required: false,
  },
  {
    key: "LIQUIDATION_QUEUE_PUBLIC_STATUS_URL",
    label: "公共队列状态接口",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["api.supermtnode.io"],
    paths: ["/api/public/liquidations/queue-status"],
    required: false,
  },
  {
    key: "LIQUIDATION_QUEUE_WSS_STATUS_URL",
    label: "WSS 队列状态接口",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/api/liquidation-queue/status"],
    required: false,
  },
  {
    key: "PRIVATE_MEMBER_LIQUIDATION_QUEUE_STATUS_URL",
    label: "privateMember 队列状态接口",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/api/liquidation-queue/status"],
    required: false,
  },
  {
    key: "LIQUIDATION_QUEUE_TX_EVENTS_URL",
    label: "执行流水接口",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/api/liquidation-queue/contract-events/today"],
    required: false,
  },
  {
    key: "PRIVATE_MEMBER_TX2_CONTRACT_EVENTS_URL",
    label: "备用执行流水接口",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/api/liquidation-queue/contract-events/today"],
    required: false,
  },
  {
    key: "LIQ2_PRIVATE_MEMBER_API_URL",
    label: "安全通道主机",
    defaultValue: "https://private.superarb.ai",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/"],
    required: true,
  },
  {
    key: "PRIVATE_MEMBER_ADMIN_API_URL",
    label: "备用安全通道主机",
    defaultValue: "",
    protocols: ["https:"],
    hosts: ["private.superarb.ai"],
    paths: ["/"],
    required: false,
  },
  {
    key: "LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH",
    label: "安全通道路径",
    defaultValue: "/api/internal/liq2-wallet/bootstrap",
    protocols: [],
    hosts: [],
    paths: ["/api/internal/liq2-wallet/bootstrap"],
    required: true,
  },
];

const OFFICIAL_PATHS = {
  TX_WALLET_PUBLIC_KEY_PATH: "server/tx-wallet-public.pem",
};

export function checkOfficialConfig(scope: string, env: Record<string, string>): SecurityCheckItem[] {
  const items = OFFICIAL_ENDPOINTS.map((rule) => checkOfficialEndpoint(scope, env, rule));
  const txPublicKeyPath = env.TX_WALLET_PUBLIC_KEY_PATH?.trim() || OFFICIAL_PATHS.TX_WALLET_PUBLIC_KEY_PATH;
  items.push({
    scope,
    key: "TX_WALLET_PUBLIC_KEY_PATH",
    label: "安全校验文件",
    value: txPublicKeyPath,
    ok: txPublicKeyPath === OFFICIAL_PATHS.TX_WALLET_PUBLIC_KEY_PATH,
    message:
      txPublicKeyPath === OFFICIAL_PATHS.TX_WALLET_PUBLIC_KEY_PATH
        ? "官方校验文件"
        : `应使用 ${OFFICIAL_PATHS.TX_WALLET_PUBLIC_KEY_PATH}`,
  });
  if (env.TX_WALLET_PUBLIC_KEY?.trim()) {
    items.push({
      scope,
      key: "TX_WALLET_PUBLIC_KEY",
      label: "自定义安全校验材料",
      value: "已配置自定义校验材料",
      ok: false,
      message: "请使用官方校验文件，避免安全通道被替换",
    });
  }
  return items;
}

export async function checkRuntimeSettings(scope: string, env: Record<string, string>, authCode = ""): Promise<SecurityCheckItem[]> {
  const wallet = checkWallet(scope, env);
  const queueToken = checkQueueWssToken(scope, env);
  const tokenPromise = checkSuperMtNodeToken(scope, env);
  const licensePromise = authCode ? checkLicenseEndpoints(env, authCode) : Promise.resolve({ endpoints: [], error: "" });
  const [token, license] = await Promise.all([tokenPromise, licensePromise]);
  const bindingEndpoints = license.endpoints.length ? license.endpoints : token.endpoints;
  const bnbRpcResult = await checkBnbRpc(scope, env, bindingEndpoints, authCode ? "当前授权码" : bindingEndpoints.length ? "SUPERMTNODE_APP_TOKEN" : "");
  const usage = bnbRpcResult.ok ? readEndpointUsage(bindingEndpoints, env.BNB_RPC_URL?.trim() ?? "") : "";
  const bnbRpc = usage ? { ...bnbRpcResult, message: `${bnbRpcResult.message}；${usage}` } : bnbRpcResult;
  const items = [wallet, token.item, bnbRpc, queueToken];
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

function checkQueueWssToken(scope: string, env: Record<string, string>): SecurityCheckItem {
  const token = env.LIQUIDATION_QUEUE_WSS_TOKEN?.trim() ?? "";
  return {
    scope,
    key: "LIQUIDATION_QUEUE_WSS_TOKEN",
    label: "队列 WSS Token",
    value: token ? "已配置" : "",
    ok: Boolean(token),
    message: token ? "队列授权已配置" : "本地未配置",
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
  endpoints: Array<Record<string, unknown>>,
  bindingLabel: string,
): Promise<SecurityCheckItem> {
  const rpcUrl = env.BNB_RPC_URL?.trim() ?? "";
  if (!rpcUrl) return { scope, key: "BNB_RPC_URL", label: "BNB RPC", value: "", ok: false, message: "本地未配置" };

  try {
    const chainId = await rpc<string>(rpcUrl, "eth_chainId", []);
    const isBnb = chainId.toLowerCase() === "0x38";
    const isBound = !bindingLabel || endpoints.some((item) => matchSuperMtNodeEndpoint(item, "bnb", rpcUrl));
    const usage = readEndpointUsage(endpoints, rpcUrl);
    return {
      scope,
      key: "BNB_RPC_URL",
      label: "BNB RPC",
      value: maskUrl(rpcUrl),
      ok: isBnb && isBound,
      message: `${isBnb ? "RPC 连接正常" : `链 ID 异常：${chainId}`}${isBound ? "" : `；未绑定到${bindingLabel}`}${usage ? `；${usage}` : ""}`,
    };
  } catch (error) {
    return {
      scope,
      key: "BNB_RPC_URL",
      label: "BNB RPC",
      value: maskUrl(rpcUrl),
      ok: false,
      message: `RPC 检测失败：${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(4_000),
  });
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  return payload.result;
}

async function fetchSuperMtNodeEndpoints(env: Record<string, string>, token: string): Promise<Array<Record<string, unknown>>> {
  const apiBase = (env.SUPERMTNODE_API_BASE_URL?.trim() || "https://api.supermtnode.io").replace(/\/+$/, "");
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

function superMtNodeApiBaseUrls(env: Record<string, string>): string[] {
  return uniqueStrings([env.SUPERMTNODE_API_BASE_URL?.trim(), "https://supermtnode.io", "https://api.supermtnode.io"]).map((value) => value.replace(/\/+$/, ""));
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
  if (count === null && limit === null) return "用量已获取";
  if (count !== null && limit !== null && limit > 0) return `用量 ${count}/${limit}，剩余 ${Math.max(0, limit - count)}`;
  if (count !== null) return `已用 ${count}`;
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
