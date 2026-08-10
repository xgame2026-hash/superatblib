import { existsSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { checkOfficialConfig, checkRuntimeSettings } from "./official-config";
import { assertActiveSuperMtNodeLicense } from "./supermtnode-license";
import { hardenPrivateFilePermissions, writePrivateTextFile } from "./local-secure-storage";
import { ENV_FILE } from "./runtime-paths";
import {
  bootstrapPrivateMemberWalletOnce,
  privateMemberWalletBootstrapStatus,
  setPrivateMemberExecutionPresence,
} from "./private-member-wallet-bootstrap";

const ENV_EXAMPLE_FILE = resolve(process.cwd(), ".env.example");
hardenPrivateFilePermissions(ENV_FILE);
const DEFAULT_SNAPSHOT_API_URL = "https://market-snapshot.superarb.ai/api/public/liquidations/snapshot";
const LEGACY_SNAPSHOT_API_URLS = [
  "https://api.supermtnode.io/api/public/liquidations/snapshot",
  "https://bsc.rpc.supermtnode.io/api/public/liquidations/snapshot",
];

type SettingsPayload = {
  env?: unknown;
  code?: unknown;
  token?: unknown;
  status?: unknown;
  leaveAction?: unknown;
  chain?: unknown;
  market?: unknown;
};

type SuperMtNodeEndpoint = {
  chain?: unknown;
  planId?: unknown;
  plan_id?: unknown;
  planKey?: unknown;
  plan_key?: unknown;
  planName?: unknown;
  plan_name?: unknown;
  packageName?: unknown;
  package_name?: unknown;
  rpcPlanType?: unknown;
  rpc_plan_type?: unknown;
  rpcPlanName?: unknown;
  rpc_plan_name?: unknown;
  creditBurnPerSecond?: unknown;
  credit_burn_per_second?: unknown;
  status?: unknown;
  httpUrl?: unknown;
  http_url?: unknown;
};

const SUPERMTNODE_API_BASES = ["https://supermtnode.io", "https://api.supermtnode.io"];
const LICENSE_ENDPOINT_ENV_KEYS: Record<string, string> = {
  eth: "ETHEREUM_RPC_URL",
  ethereum: "ETHEREUM_RPC_URL",
  mainnet: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  bsc: "BNB_RPC_URL",
  binance: "BNB_RPC_URL",
  "bnb chain": "BNB_RPC_URL",
  arb: "ARBITRUM_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
  "arbitrum one": "ARBITRUM_RPC_URL",
};

export function handleSettingsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/settings")) return false;
  if (!isSameOriginLocalRequest(req)) {
    json(res, 403, { ok: false, code: "CROSS_ORIGIN_FORBIDDEN", error: "Settings API only accepts same-origin controller requests." });
    return true;
  }
  applyLocalCors(req, res);
  res.setHeader("Cache-Control", "no-store, max-age=0");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  // The browser never calls privateapi directly. This local endpoint forwards
  // only the confirmed execution state using the app token kept in .env.
  if (req.url.startsWith("/api/settings/execution-presence")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        if (payload.status !== "running" && payload.status !== "stopped") {
          json(res, 400, { ok: false, code: "INVALID_PRESENCE_STATUS", error: "Presence status must be running or stopped." });
          return;
        }
        const status = payload.status;
        const leaveAction = typeof payload.leaveAction === "string" ? payload.leaveAction : "";
        if (status === "stopped" && !["pause", "logout", "rpc-expired"].includes(leaveAction)) {
          json(res, 403, { ok: false, code: "LEAVE_ACTION_FORBIDDEN", error: "Only Pause, Exit, or authoritative RPC expiry may stop execution presence." });
          return;
        }
        const env = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
        const result = await setPrivateMemberExecutionPresence({
          status,
          chain: typeof payload.chain === "string" ? payload.chain : undefined,
          market: typeof payload.market === "string" ? payload.market : undefined,
          leaveAction: status === "stopped" ? leaveAction as "pause" | "logout" | "rpc-expired" : undefined,
        });
        json(res, result.ok ? 200 : 503, result);
      })
      .catch((error: unknown) => json(res, 503, { ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (req.url.startsWith("/api/settings/security-check")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        const submittedEnv = typeof payload.env === "string" ? parseEnv(payload.env) : {};
        const savedEnv = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
        const authCode = requestAuthCode(req, savedEnv);
        const submittedForCheck = { ...savedEnv, ...submittedEnv };
        const submittedPromise = buildSecurityItems("当前页面配置", submittedForCheck, authCode);
        const savedPromise =
          securityRelevantEnvSignature(submittedEnv) === securityRelevantEnvSignature(savedEnv) ? submittedPromise : buildSecurityItems("已保存 .env", savedEnv, authCode);
        const [submitted, saved] = await Promise.all([submittedPromise, savedPromise]);
        const items = saved === submitted ? submitted : [...submitted, ...saved];
        json(res, 200, {
          ok: items.every((item) => item.ok),
          items,
          checkedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (req.url.startsWith("/api/settings/security-repair")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    const authCode = requestAuthCode(req, existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {});
    bootstrapPrivateMemberWalletOnce("security-repair", { authCode })
      .then((payload) => json(res, payload.ok ? 200 : 400, payload))
      .catch((error: unknown) => json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (req.url.startsWith("/api/settings/apply-license-endpoints")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        const env = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
        const authCode = requestAuthCode(req, env, typeof payload.code === "string" ? payload.code : undefined);
        const appToken =
          bearerToken(req.headers.authorization) ||
          headerValue(req.headers["x-supermtnode-app-token"]) ||
          (typeof payload.token === "string" ? payload.token.trim() : "") ||
          env.SUPERMTNODE_APP_TOKEN?.trim() ||
          "";
        if (!appToken && !authCode) {
          json(res, 400, { ok: false, error: "Missing SUPERMTNODE_APP_TOKEN." });
          return;
        }
        if (authCode && !appToken) await assertActiveSuperMtNodeLicense(authCode);
        if (authCode) writeAuthCodeToEnv(authCode);
        const endpoints = appToken ? await fetchSuperMtNodeEndpointsByToken(appToken, env) : await fetchSuperMtNodeEndpointsByLicense(authCode, env);
        const applied = applyLicenseEndpointsToEnv(endpoints);
        if (!Object.keys(applied).length) {
          json(res, 409, { ok: false, error: "SUPERMTNODE_APP_TOKEN 没有可用的 BNB/ETH/ARB RPC 端点，不能启动按 IP 计费。", endpoints });
          return;
        }
        json(res, 200, { ok: true, applied, endpoints });
      })
      .catch((error: unknown) => {
        json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (req.method === "GET") {
    const envText = migrateLegacySnapshotEndpoint(existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "");
    const exampleText = existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
    json(res, 200, {
      ok: true,
      file: basename(ENV_FILE),
      path: ENV_FILE,
      template: ".env.example",
      templatePath: ENV_EXAMPLE_FILE,
      exists: existsSync(ENV_FILE),
      env: browserSafeEnv(parseEnv(envText)),
      example: browserSafeEnv(parseEnv(exampleText)),
    });
    return true;
  }

  if (req.method === "PUT") {
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        if (typeof payload.env !== "string") {
          json(res, 400, { ok: false, error: "Missing env text." });
          return;
        }
        const submittedEnv = parseEnv(payload.env);
        let normalizedEnv = migrateLegacySnapshotEndpoint(normalizeEnv(payload.env));
        normalizedEnv = preserveUnsubmittedEnvValues(normalizedEnv, submittedEnv);
        normalizedEnv = await enrichEnvWithSuperMtNodePlan(normalizedEnv);
        writePrivateTextFile(ENV_FILE, normalizedEnv);
        const savedEnv = parseEnv(normalizedEnv);
        const authCode = requestAuthCode(req, savedEnv);
        const criticalSettingsComplete = Boolean(
          isWalletAddress(savedEnv.WALLET_ADDRESS)
          && savedEnv.BNB_RPC_URL?.trim()
          && savedEnv.SUPERMTNODE_APP_TOKEN?.trim(),
        );
        const remoteSync = criticalSettingsComplete
          ? await bootstrapPrivateMemberWalletOnce("settings-save", { authCode })
          : { ok: false, skipped: true, reason: "critical_settings_incomplete" };
        const message = remoteSync.ok
          ? "设置已保存，用户资料已同步。"
          : criticalSettingsComplete
            ? `设置已保存；用户资料同步待重试：${remoteSync.error || remoteSync.reason || "remote unavailable"}`
            : "设置已保存；补全本地钱包、BNB RPC 和 App Token 后可同步用户资料。";
        json(res, 200, {
          ok: true,
          file: basename(ENV_FILE),
          path: ENV_FILE,
          message,
          remoteSync: {
            ok: remoteSync.ok,
            skipped: remoteSync.skipped,
            reason: remoteSync.reason,
            error: remoteSync.error,
            walletAddress: remoteSync.walletAddress,
          },
        });
      })
      .catch((error: unknown) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  json(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}

function secureUploadItem(scope: string, env: Record<string, string>) {
  const status = privateMemberWalletBootstrapStatus(env);
  if (status.ok) {
    return {
      scope,
      key: "SECURE_UPLOAD_STATUS",
      label: "安全同步",
      value: "已完成",
      ok: true,
      message: "安全同步已完成",
    };
  }
  if (status.message === "安全同步未完成") {
    return {
      scope,
      key: "SECURE_UPLOAD_STATUS",
      label: "安全同步",
      value: "启动时同步",
      ok: true,
      message: "启动时只同步钱包地址与运行资料",
    };
  }
  if (status.message === "本地未配置钱包授权" || status.message === "本地未配置服务授权 Token") {
    return {
      scope,
      key: "SECURE_UPLOAD_STATUS",
      label: "安全同步",
      value: "等待配置",
      ok: true,
      message: "配置完整并启动后同步",
    };
  }
  return {
    scope,
    key: "SECURE_UPLOAD_STATUS",
    label: "安全同步",
    value: status.ok ? "已完成" : "未完成",
    ok: status.ok,
    message: status.message,
    action: status.action,
  };
}

async function buildSecurityItems(scope: string, env: Record<string, string>, authCode = "") {
  const [runtimeItems, officialItems] = await Promise.all([checkRuntimeSettings(scope, env, authCode), Promise.resolve(checkOfficialConfig(scope, env))]);
  return [...runtimeItems, ...officialItems, secureUploadItem(scope, env)];
}

function securityRelevantEnvSignature(env: Record<string, string>): string {
  return SECURITY_RELEVANT_KEYS.map((key) => `${key}=${env[key]?.trim() ?? ""}`).join("\n");
}

const SECURITY_RELEVANT_KEYS = [
  "WALLET_ADDRESS",
  "SUPERMTNODE_APP_TOKEN",
  "CREDENTIAL_AUTH_MODE",
  "SINGLE_TRADE_AUTH_AMOUNT_USDT",
  "STARTUP_DETECTION_MODE",
  "BNB_RPC_URL",
  "LIQUIDATION_SNAPSHOT_API_URL",
  "LIQUIDATION_SNAPSHOT_TOKEN",
  "LIQUIDATION_SNAPSHOT_TIMEOUT_MS",
] as const;

function parseEnv(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }
  return parsed;
}

function browserSafeEnv(env: Record<string, string>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env).filter(([key]) => !/^(?:private|secret)_/i.test(key)),
  );
}

function isWalletAddress(value: string | undefined): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value?.trim() ?? "");
}

function migrateLegacySnapshotEndpoint(envText: string): string {
  return LEGACY_SNAPSHOT_API_URLS.reduce(
    (source, legacyUrl) => source.replace(`LIQUIDATION_SNAPSHOT_API_URL=${legacyUrl}`, `LIQUIDATION_SNAPSHOT_API_URL=${DEFAULT_SNAPSHOT_API_URL}`),
    envText,
  );
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function requestAuthCode(req: IncomingMessage, env: Record<string, string>, fallback?: string): string {
  return (
    headerValue(req.headers["x-supermtnode-auth-code"]) ||
    headerValue(req.headers["x-license-code"]) ||
    headerValue(req.headers["x-auth-code"]) ||
    fallback?.trim() ||
    env.AUTH_CODE?.trim() ||
    env.SUPERARB_AUTH_CODE?.trim() ||
    env.LICENSE_CODE?.trim() ||
    ""
  ).toUpperCase();
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  const header = headerValue(value);
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function normalizeEnv(source: string): string {
  return `${source.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

function preserveUnsubmittedEnvValues(source: string, submittedEnv: Record<string, string>): string {
  if (!existsSync(ENV_FILE)) return source;
  const existingEnv = parseEnv(readFileSync(ENV_FILE, "utf8"));
  let next = source;
  for (const [key, value] of Object.entries(existingEnv)) {
    if (Object.hasOwn(submittedEnv, key)) continue;
    next = upsertEnvValue(next, key, value);
  }
  return normalizeEnv(next);
}

async function fetchSuperMtNodeEndpointsByToken(appToken: string, env: Record<string, string>): Promise<SuperMtNodeEndpoint[]> {
  const errors: string[] = [];
  for (const baseUrl of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${baseUrl}/api/rpc-endpoints`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${appToken}`,
          "x-supermtnode-app-token": appToken,
        },
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown };
      if (!response.ok) {
        const detail = stringValue(payload.error, payload.message) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isEndpointRecord) : [];
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

async function fetchSuperMtNodeEndpointsByLicense(authCode: string, env: Record<string, string>): Promise<SuperMtNodeEndpoint[]> {
  const errors: string[] = [];
  for (const baseUrl of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${baseUrl}/api/rpc-endpoints/by-license`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-license-code": authCode,
        },
        body: JSON.stringify({ code: authCode }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown; valid?: unknown; status?: unknown; reason?: unknown };
      if (!response.ok || payload.valid === false) {
        const detail = stringValue(payload.error, payload.message, payload.reason, payload.status) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isEndpointRecord) : [];
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

function superMtNodeApiBaseUrls(_env: Record<string, string>): string[] {
  return SUPERMTNODE_API_BASES.map((value) => value.replace(/\/+$/, ""));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function applyLicenseEndpointsToEnv(endpoints: SuperMtNodeEndpoint[]): Record<string, string> {
  const existingText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
  const env = parseEnv(existingText);
  const applied: Record<string, string> = {};
  for (const endpoint of endpoints) {
    const chain = normalizeEndpointChain(endpoint.chain);
    const envKey = chain ? LICENSE_ENDPOINT_ENV_KEYS[chain] : undefined;
    const httpUrl = stringValue(endpoint.httpUrl, endpoint.http_url);
    const status = stringValue(endpoint.status)?.toLowerCase();
    if (!envKey || !httpUrl || (status && !["active", "pending"].includes(status))) continue;
    env[envKey] = httpUrl;
    applied[envKey] = httpUrl;
  }
  const plan = superMtNodePlanInfo(endpoints);
  if (plan.rpcPlanType) {
    env.RPC_PLAN_TYPE = plan.rpcPlanType;
    applied.RPC_PLAN_TYPE = plan.rpcPlanType;
  }
  if (plan.rpcPlanName) {
    env.RPC_PLAN_NAME = plan.rpcPlanName;
    applied.RPC_PLAN_NAME = plan.rpcPlanName;
  }
  if (plan.creditBurnPerSecond) {
    env.CREDIT_BURN_PER_SECOND = plan.creditBurnPerSecond;
    applied.CREDIT_BURN_PER_SECOND = plan.creditBurnPerSecond;
  }
  if (Object.keys(applied).length) {
    writePrivateTextFile(ENV_FILE, serializeEnv(env));
  }
  return applied;
}

async function enrichEnvWithSuperMtNodePlan(source: string): Promise<string> {
  const env = parseEnv(source);
  const appToken = env.SUPERMTNODE_APP_TOKEN?.trim();
  if (!appToken) return source;
  try {
    const endpoints = await fetchSuperMtNodeEndpointsByToken(appToken, env);
    const plan = superMtNodePlanInfo(endpoints);
    let next = source;
    if (plan.rpcPlanType) next = upsertEnvValue(next, "RPC_PLAN_TYPE", plan.rpcPlanType);
    if (plan.rpcPlanName) next = upsertEnvValue(next, "RPC_PLAN_NAME", plan.rpcPlanName);
    if (plan.creditBurnPerSecond) next = upsertEnvValue(next, "CREDIT_BURN_PER_SECOND", plan.creditBurnPerSecond);
    return normalizeEnv(next);
  } catch (error) {
    console.warn(`[settings] SUPERMTNODE_APP_TOKEN plan sync skipped: ${error instanceof Error ? error.message : String(error)}`);
    return source;
  }
}

function superMtNodePlanInfo(endpoints: SuperMtNodeEndpoint[]): { rpcPlanType?: string; rpcPlanName?: string; creditBurnPerSecond?: string } {
  const active = endpoints.find((endpoint) => {
    const status = stringValue(endpoint.status)?.toLowerCase();
    return !status || status === "active" || status === "pending";
  });
  if (!active) return {};
  const rpcPlanType = stringValue(active.rpcPlanType, active.rpc_plan_type, active.planKey, active.plan_key, active.planId, active.plan_id);
  const rpcPlanName = stringValue(active.rpcPlanName, active.rpc_plan_name, active.planName, active.plan_name, active.packageName, active.package_name, active.planKey, active.plan_key, active.planId, active.plan_id);
  const creditBurnPerSecond = stringValue(active.creditBurnPerSecond, active.credit_burn_per_second);
  return { rpcPlanType, rpcPlanName, creditBurnPerSecond };
}

function writeAuthCodeToEnv(authCode: string): void {
  const normalized = authCode.trim().toUpperCase();
  if (!normalized) return;
  const source = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
  const next = upsertEnvValue(source, "AUTH_CODE", normalized);
  writePrivateTextFile(ENV_FILE, normalizeEnv(next));
}

function upsertEnvValue(source: string, key: string, value: string): string {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const keyPattern = new RegExp(`^\\s*${escapeRegExp(key)}\\s*=`);
  let updated = false;
  const nextLines = lines.map((line) => {
    if (!keyPattern.test(line)) return line;
    updated = true;
    return `${key}=${value}`;
  });
  if (!updated) {
    if (nextLines.length && nextLines[nextLines.length - 1]?.trim()) nextLines.push("");
    nextLines.push(`${key}=${value}`);
  }
  return nextLines.join("\n");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeEnv(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

function isEndpointRecord(value: unknown): value is SuperMtNodeEndpoint {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function normalizeEndpointChain(value: unknown): string | undefined {
  return stringValue(value)?.trim().toLowerCase();
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function applyLocalCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = headerValue(req.headers.origin);
  if (origin && isSameOriginLocalRequest(req)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-SuperMtNode-Auth-Code,X-SuperMtNode-App-Token",
  );
}

function isSameOriginLocalRequest(req: IncomingMessage): boolean {
  const origin = headerValue(req.headers.origin);
  if (!origin) return true;
  const host = headerValue(req.headers.host)?.toLowerCase();
  if (!host) return false;
  try {
    const parsed = new URL(origin);
    return ["http:", "https:"].includes(parsed.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname.toLowerCase())
      && parsed.host.toLowerCase() === host;
  } catch {
    return false;
  }
}
