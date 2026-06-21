import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { dirname, resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const STATE_FILE = resolve(process.cwd(), ".superarb/state-session.json");
const DEVICE_ID_FILE = resolve(process.cwd(), ".superarb/state-device-id");
const DEFAULT_STATE_API_BASE = "https://state.supermtaccess.com";
const DEFAULT_LEASE_SAFETY_MS = 15_000;

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type StateSessionFile = {
  accessToken: string;
  sessionId: string;
  licenseId: string;
  walletAddress: string;
  credentialHash: string;
  leaseExpiresAt: string;
  heartbeatSeconds: number;
  updatedAt: string;
};

type StateLoginPayload = {
  ok?: unknown;
  accessToken?: unknown;
  sessionId?: unknown;
  licenseId?: unknown;
  leaseExpiresAt?: unknown;
  heartbeatSeconds?: unknown;
};

type JsonRpcPayload<T> = {
  result?: T;
  error?: { code?: unknown; message?: unknown; data?: unknown };
};

type StateQueuePayload = Record<string, unknown> & {
  action?: string;
  chain?: string;
  walletAddress?: string;
  wallet?: unknown;
  balances?: unknown;
};

let sessionPromise: Promise<StateSessionFile> | null = null;

export function stateRpcEnabled(env: Record<string, string>): boolean {
  return Boolean(stateApiBase(env) && authCode(env) && appToken(env) && env.PRIVATE_KEY?.trim());
}

export function stateRpcEnabledForChain(chain: ChainKey, env: Record<string, string>): boolean {
  if (!stateRpcEnabled(env)) return false;
  return stateRpcChains(env).includes(chain);
}

export async function stateRpc<T>(
  chain: ChainKey,
  env: Record<string, string>,
  method: string,
  params: unknown[],
): Promise<T> {
  const session = await ensureStateSession(env);
  try {
    return await requestStateRpc<T>(chain, env, method, params, session.accessToken);
  } catch (error) {
    if (!isAuthSessionError(error)) throw error;
    clearStateSession();
    const retrySession = await loginStateSession(env);
    return await requestStateRpc<T>(chain, env, method, params, retrySession.accessToken);
  }
}

export async function stateQueueStatus(env: Record<string, string>, payload: StateQueuePayload): Promise<Record<string, unknown>> {
  if (!stateRpcEnabled(env)) throw new Error("State session credentials are not configured.");
  const session = await ensureStateSession(env);
  try {
    return await requestStateQueueStatus(env, session.accessToken, payload);
  } catch (error) {
    if (!isAuthSessionError(error)) throw error;
    clearStateSession();
    const retrySession = await loginStateSession(env);
    return await requestStateQueueStatus(env, retrySession.accessToken, payload);
  }
}

export async function stateLogout(env: Record<string, string>): Promise<void> {
  const cached = readSessionFile();
  if (!cached?.accessToken) return;
  const response = await fetch(`${stateApiBase(env)}/v1/auth/logout`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${cached.accessToken}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  clearStateSession();
  if (!response.ok && response.status !== 401) throw stateHttpError("State logout", response.status);
}

export async function stateLeaderboard(env: Record<string, string>, chain: ChainKey = "bnb", limit = 50): Promise<Record<string, unknown>> {
  const response = await fetch(`${stateApiBase(env)}/v1/leaderboard?chain=${encodeURIComponent(chain)}&limit=${encodeURIComponent(String(limit))}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw stateHttpError("State leaderboard", response.status, stringValue(payload.message, payload.error, payload.code));
  }
  return payload;
}

async function requestStateQueueStatus(
  env: Record<string, string>,
  accessToken: string,
  payload: StateQueuePayload,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${stateApiBase(env)}/v1/queue/status`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(stateQueuePayload(env, payload)),
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  const responsePayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    throw stateHttpError("State queue", response.status, stringValue(responsePayload.message, responsePayload.error, responsePayload.code));
  }
  return responsePayload;
}

async function requestStateRpc<T>(
  chain: ChainKey,
  env: Record<string, string>,
  method: string,
  params: unknown[],
  accessToken: string,
): Promise<T> {
  const response = await fetch(`${stateApiBase(env)}/v1/rpc?network=${encodeURIComponent(stateNetwork(chain, env))}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRpcPayload<T> & { code?: unknown; message?: unknown };
  if (!response.ok || payload.error) {
    const message = stringValue(payload.error?.message, payload.message, payload.code) || `State RPC HTTP ${response.status}`;
    if (!response.ok) throw stateHttpError("State RPC", response.status, message);
    throw new Error(message);
  }
  return payload.result as T;
}

export async function ensureStateSession(env: Record<string, string>): Promise<StateSessionFile> {
  if (!stateRpcEnabled(env)) throw new Error("State session credentials are not configured.");
  if (sessionPromise) return sessionPromise;

  sessionPromise = (async () => {
    const cached = readSessionFile();
    const currentCredentialHash = stateCredentialHash(env);
    if (cached && cached.credentialHash === currentCredentialHash) {
      const leaseExpiresAt = new Date(cached.leaseExpiresAt).getTime();
      if (Number.isFinite(leaseExpiresAt) && leaseExpiresAt > Date.now() + DEFAULT_LEASE_SAFETY_MS) {
        return cached;
      }
      try {
        await heartbeat(env, cached.accessToken);
        return readSessionFile() ?? cached;
      } catch {
        clearStateSession();
      }
    }

    const next = await loginStateSession(env);
    return next;
  })().finally(() => {
    sessionPromise = null;
  });

  return sessionPromise;
}

export function clearStateSession(): void {
  if (existsSync(STATE_FILE)) writeFileSync(STATE_FILE, "", "utf8");
}

async function heartbeat(env: Record<string, string>, accessToken: string): Promise<void> {
  const response = await fetch(`${stateApiBase(env)}/v1/auth/heartbeat`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
    },
    body: "{}",
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as { leaseExpiresAt?: unknown; heartbeatSeconds?: unknown };
  if (!response.ok) throw stateHttpError("State heartbeat", response.status);
  const cached = readSessionFile();
  if (cached && typeof payload.leaseExpiresAt === "string") {
    writeSessionFile({
      ...cached,
      leaseExpiresAt: payload.leaseExpiresAt,
      heartbeatSeconds: numberValue(payload.heartbeatSeconds) ?? cached.heartbeatSeconds,
      updatedAt: new Date().toISOString(),
    });
  }
}

async function loginStateSession(env: Record<string, string>): Promise<StateSessionFile> {
  const walletAddress = privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "");
  const response = await fetch(`${stateApiBase(env)}/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      walletAddress,
      authCode: authCode(env),
      token: appToken(env),
      deviceId: deviceId(),
      encryptedPublicKey: privateKeyToPublicKey(env.PRIVATE_KEY?.trim() ?? ""),
      ...stateRuntimeSettings(env),
    }),
    signal: AbortSignal.timeout(stateRpcTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as StateLoginPayload & { code?: unknown; message?: unknown };
  if (!response.ok || !payload.accessToken) {
    const message = stringValue(payload.message, payload.code) || `State login HTTP ${response.status}`;
    throw new Error(message);
  }
  const session: StateSessionFile = {
    accessToken: String(payload.accessToken),
    sessionId: String(payload.sessionId ?? ""),
    licenseId: String(payload.licenseId ?? ""),
    walletAddress,
    credentialHash: stateCredentialHash(env),
    leaseExpiresAt: String(payload.leaseExpiresAt ?? ""),
    heartbeatSeconds: numberValue(payload.heartbeatSeconds) ?? 15,
    updatedAt: new Date().toISOString(),
  };
  writeSessionFile(session);
  return session;
}

function isAuthSessionError(error: unknown): boolean {
  return error instanceof StateSessionHttpError && [401, 402, 409].includes(error.status);
}

function stateHttpError(prefix: string, status: number, message?: string): StateSessionHttpError {
  return new StateSessionHttpError(status, message ? `${prefix} HTTP ${status}: ${message}` : `${prefix} HTTP ${status}`);
}

class StateSessionHttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function readSessionFile(): StateSessionFile | null {
  try {
    if (!existsSync(STATE_FILE)) return null;
    const raw = readFileSync(STATE_FILE, "utf8").trim();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StateSessionFile>;
    if (!parsed.accessToken || !parsed.walletAddress) return null;
    return {
      accessToken: parsed.accessToken,
      sessionId: parsed.sessionId ?? "",
      licenseId: parsed.licenseId ?? "",
      walletAddress: parsed.walletAddress,
      credentialHash: parsed.credentialHash ?? "",
      leaseExpiresAt: parsed.leaseExpiresAt ?? "",
      heartbeatSeconds: Number(parsed.heartbeatSeconds || 15),
      updatedAt: parsed.updatedAt ?? "",
    };
  } catch {
    return null;
  }
}

function writeSessionFile(session: StateSessionFile): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(session, null, 2)}\n`, "utf8");
}

function deviceId(): string {
  if (existsSync(DEVICE_ID_FILE)) {
    const existing = readFileSync(DEVICE_ID_FILE, "utf8").trim();
    if (existing) return existing;
  }
  const generated = `liq2-${crypto.randomUUID()}`;
  mkdirSync(dirname(DEVICE_ID_FILE), { recursive: true });
  writeFileSync(DEVICE_ID_FILE, `${generated}\n`, "utf8");
  return generated;
}

function stateApiBase(env: Record<string, string>): string {
  return (env.STATE_API_BASE_URL?.trim() || env.SUPERMT_STATE_API_BASE_URL?.trim() || DEFAULT_STATE_API_BASE).replace(/\/+$/, "");
}

function stateCredentialHash(env: Record<string, string>): string {
  let wallet = "";
  try {
    wallet = privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "").toLowerCase();
  } catch {
    wallet = "";
  }
  return crypto
    .createHash("sha256")
    .update([stateApiBase(env), authCode(env), appToken(env), wallet].join("\n"))
    .digest("hex");
}

function stateNetwork(chain: ChainKey, env: Record<string, string>): string {
  const override = env.STATE_RPC_NETWORK?.trim();
  if (override) return override;
  if (chain === "arbitrum") return "arbitrum";
  if (chain === "ethereum") return "ethereum";
  return "bnb";
}

function stateQueuePayload(env: Record<string, string>, payload: StateQueuePayload): Record<string, unknown> {
  const runtime = stateRuntimeSettings(env);
  const walletPublicKey = privateKeyToPublicKey(env.PRIVATE_KEY?.trim() ?? "");
  const balances = isRecord(payload.balances) ? payload.balances : isRecord(payload.wallet) && isRecord(payload.wallet.balances) ? payload.wallet.balances : undefined;
  return {
    action: stringValue(payload.action) || "start",
    chain: stringValue(payload.chain) || "bnb",
    walletAddress: stringValue(payload.walletAddress) || privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? ""),
    walletPublicKey,
    encryptedPublicKey: walletPublicKey,
    queueId: stringValue(payload.queueId, payload.queue_id, payload.queueMemberKey, payload.queue_member_key, payload.dedupeKey, payload.dedupe_key, payload.id),
    participantId: stringValue(payload.participantId, payload.participant_id, payload.participantKey, payload.participant_key),
    endpointSlug: stringValue(payload.endpointSlug, payload.endpoint_slug),
    market: stringValue(payload.market),
    balances,
    usdtBalance: queueUsdtBalance(balances),
    expiresAt: stringValue(payload.expiresAt, payload.expires_at),
    rpcPlanType: stringValue(payload.rpcPlanType, payload.rpc_plan_type) || runtime.rpcPlanType,
    rpcPlanName: stringValue(payload.rpcPlanName, payload.rpc_plan_name) || runtime.rpcPlanName,
    creditBurnPerSecond: numberValue(payload.creditBurnPerSecond, payload.credit_burn_per_second) ?? runtime.creditBurnPerSecond,
    credentialAuthMode: stringValue(payload.credentialAuthMode, payload.credential_auth_mode) || runtime.credentialAuthMode,
    singleTradeAuthAmountUsdt: stringValue(payload.singleTradeAuthAmountUsdt, payload.single_trade_auth_amount_usdt) || runtime.singleTradeAuthAmountUsdt,
    arbitrageIntensity: stringValue(payload.arbitrageIntensity, payload.arbitrage_intensity) || runtime.arbitrageIntensity,
    version: stringValue(payload.version, payload.clientVersion, payload.client_version),
  };
}

function stateRuntimeSettings(env: Record<string, string>): {
  credentialAuthMode: string;
  singleTradeAuthAmountUsdt: string;
  arbitrageIntensity: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond: number;
} {
  return {
    credentialAuthMode: readCredentialAuthMode(env),
    singleTradeAuthAmountUsdt: normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT),
    arbitrageIntensity: normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY),
    rpcPlanType: env.RPC_PLAN_TYPE?.trim() || undefined,
    rpcPlanName: env.RPC_PLAN_NAME?.trim() || undefined,
    creditBurnPerSecond: numberValue(env.CREDIT_BURN_PER_SECOND) ?? 0,
  };
}

function readCredentialAuthMode(env: Record<string, string>): string {
  const normalized = (env.CREDENTIAL_AUTH_MODE || "").trim().toLowerCase();
  if (["loop", "multi", "multiple", "repeat", "cycle", "多次", "多次循环"].includes(normalized)) return "loop";
  return "single";
}

function normalizeArbitrageIntensity(value?: string): string {
  const normalized = (value || "").trim().toLowerCase();
  if (["conservative", "safe", "保守"].includes(normalized)) return "conservative";
  if (["enhanced", "boost", "加强"].includes(normalized)) return "enhanced";
  if (["aggressive", "激进"].includes(normalized)) return "aggressive";
  return "conservative";
}

function normalizeUsdtAmount(value?: string): string {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "100";
  return numeric.toString();
}

function privateKeyToPublicKey(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能生成钱包公钥。");
  return `0x${Buffer.from(getPublicKey(hexToBytes(key), false)).toString("hex")}`;
}

function queueUsdtBalance(balances: unknown): string | undefined {
  if (!isRecord(balances)) return undefined;
  const usdt = balances.usdt ?? balances.USDT;
  if (isRecord(usdt)) return stringValue(usdt.formatted, usdt.value);
  return stringValue(usdt, balances.usdtBalance, balances.usdt_balance, balances.usdtAmount, balances.usdt_amount);
}

function stateRpcChains(env: Record<string, string>): ChainKey[] {
  const configured = env.STATE_RPC_CHAINS?.trim();
  const values = configured ? configured.split(/[,\s]+/) : ["bnb"];
  const chains = values
    .map((value) => value.trim().toLowerCase())
    .filter((value): value is ChainKey => value === "ethereum" || value === "bnb" || value === "arbitrum");
  return chains.length ? chains : ["bnb"];
}

function authCode(env: Record<string, string>): string {
  return (env.AUTH_CODE?.trim() || env.SUPERARB_AUTH_CODE?.trim() || env.LICENSE_CODE?.trim() || "").toUpperCase();
}

function appToken(env: Record<string, string>): string {
  return env.SUPERMTNODE_APP_TOKEN?.trim() || env.STATE_AUTH_TOKEN?.trim() || "";
}

function stateRpcTimeoutMs(env: Record<string, string>): number {
  const value = Number(env.STATE_RPC_TIMEOUT_MS || env.RPC_TIMEOUT_MS || 12_000);
  return Number.isFinite(value) && value > 0 ? value : 12_000;
}

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能建立状态会话。");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function numberValue(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const parsed = Number(value.replace(/,/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
