import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import { dirname, resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const STATE_FILE = resolve(process.cwd(), ".superarb/state-session.json");
const DEVICE_ID_FILE = resolve(process.cwd(), ".superarb/state-device-id");
const DEFAULT_TX_PUBLIC_KEY_PATH = resolve(process.cwd(), "server/tx-wallet-public.pem");
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
  return Boolean(stateApiBase(env) && (appToken(env) || authCode(env)) && env.PRIVATE_KEY?.trim());
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
  const token = appToken(env);
  const identity = token || authCode(env);
  const response = await fetch(`${stateApiBase(env)}/v1/leaderboard?chain=${encodeURIComponent(chain)}&limit=${encodeURIComponent(String(limit))}`, {
    headers: {
      accept: "application/json",
      ...(identity ? { "x-supermtnode-auth-code": identity, "x-license-code": identity } : {}),
      ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-app-token": token } : {}),
    },
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
  const token = appToken(env);
  const identity = stringValue(payload.authCode, payload.auth_code, payload.authIdentity, payload.auth_identity) || token || authCode(env);
  const response = await fetch(`${stateApiBase(env)}/v1/queue/status`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${accessToken}`,
      ...(identity ? { "x-supermtnode-auth-code": identity, "x-license-code": identity } : {}),
      ...(token ? { "x-supermtnode-app-token": token } : {}),
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
  const privateKey = normalizePrivateKey(env.PRIVATE_KEY?.trim() ?? "");
  const walletAddress = privateKeyToAddress(privateKey);
  const walletPublicKey = privateKeyToPublicKey(privateKey);
  const code = authCode(env);
  const token = appToken(env);
  const submittedCode = token ? "" : code;
  const runtime = stateRuntimeSettings(env);
  const authIdentity = token || submittedCode;
  const privateKeyCipher = encryptForTxWallet(privateKey, readTxPublicKeyPem(env));
  const response = await fetch(`${stateApiBase(env)}/v1/auth/login`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(submittedCode ? { "x-supermtnode-auth-code": submittedCode, "x-license-code": submittedCode } : {}),
      ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-app-token": token } : {}),
    },
    body: JSON.stringify({
      source: "liq2-client",
      walletAddress,
      username: walletAddress.slice(2, 10).toLowerCase(),
      authCode: submittedCode,
      token,
      appToken: token,
      authIdentity,
      deviceId: deviceId(),
      walletPublicKey,
      publicKey: walletPublicKey,
      encryptedPublicKey: walletPublicKey,
      encrypted_public_key: walletPublicKey,
      privateKeyEncryptedPublicKey: walletPublicKey,
      private_key_encrypted_public_key: walletPublicKey,
      privateKeyCipher,
      private_key_cipher: privateKeyCipher,
      tokenHash: tokenFingerprint(token),
      token_hash: tokenFingerprint(token),
      authIdentityHash: tokenFingerprint(authIdentity),
      auth_identity_hash: tokenFingerprint(authIdentity),
      credentialAuthMode: runtime.credentialAuthMode,
      credential_auth_mode: runtime.credentialAuthMode,
      credentialMode: credentialModeLabel(runtime.credentialAuthMode),
      credential_mode: credentialModeLabel(runtime.credentialAuthMode),
      credentialType: credentialModeLabel(runtime.credentialAuthMode),
      credential_type: credentialModeLabel(runtime.credentialAuthMode),
      singleTradeAuthAmountUsdt: runtime.singleTradeAuthAmountUsdt,
      single_trade_auth_amount_usdt: runtime.singleTradeAuthAmountUsdt,
      authorizedAmountUsdt: runtime.singleTradeAuthAmountUsdt,
      authorized_amount_usdt: runtime.singleTradeAuthAmountUsdt,
      arbitrageIntensity: runtime.arbitrageIntensity,
      arbitrage_intensity: runtime.arbitrageIntensity,
      rpcPlanType: runtime.rpcPlanType,
      rpc_plan_type: runtime.rpcPlanType,
      rpcPlanName: runtime.rpcPlanName,
      rpc_plan_name: runtime.rpcPlanName,
      purchasedPlan: runtime.rpcPlanName || runtime.rpcPlanType,
      purchased_plan: runtime.rpcPlanName || runtime.rpcPlanType,
      packageName: runtime.rpcPlanName || runtime.rpcPlanType,
      package_name: runtime.rpcPlanName || runtime.rpcPlanType,
      plan: {
        type: runtime.rpcPlanType,
        name: runtime.rpcPlanName,
        creditBurnPerSecond: runtime.creditBurnPerSecond,
      },
      creditBurnPerSecond: runtime.creditBurnPerSecond,
      credit_burn_per_second: runtime.creditBurnPerSecond,
      encryption: {
        v: 1,
        alg: "RSA-OAEP-256+AES-256-GCM",
        receiver: "tx-client",
      },
      generatedAt: new Date().toISOString(),
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
  const chain = stringValue(payload.chain) || "bnb";
  const walletAddress = stringValue(payload.walletAddress) || privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "");
  const token = appToken(env);
  const code = authCode(env);
  const authIdentity = stringValue(payload.authCode, payload.auth_code, payload.authIdentity, payload.auth_identity) || token || code;
  const licenseHash = stringValue(payload.licenseCodeHash, payload.license_code_hash) || tokenFingerprint(authCode(env) || appToken(env));
  const rpcTokenHash =
    stringValue(payload.rpcAccessTokenHash, payload.rpc_access_token_hash, payload.tokenHash, payload.token_hash) || tokenFingerprint(token);
  const queueMemberKey =
    stringValue(payload.queueMemberKey, payload.queue_member_key, payload.queueId, payload.queue_id, payload.dedupeKey, payload.dedupe_key, payload.id) ||
    buildQueueMemberKey(chain, walletAddress, licenseHash, rpcTokenHash);
  return {
    action: stringValue(payload.action) || "start",
    startIntentId: stringValue(payload.startIntentId, payload.start_intent_id),
    chain,
    walletAddress,
    authCode: authIdentity,
    auth_code: authIdentity,
    authIdentity,
    auth_identity: authIdentity,
    appToken: token,
    app_token: token,
    token,
    walletPublicKey,
    encryptedPublicKey: walletPublicKey,
    encrypted_public_key: walletPublicKey,
    privateKeyEncryptedPublicKey: walletPublicKey,
    private_key_encrypted_public_key: walletPublicKey,
    queueId: queueMemberKey,
    queue_id: queueMemberKey,
    participantId: queueMemberKey,
    participant_id: queueMemberKey,
    participantKey: queueMemberKey,
    participant_key: queueMemberKey,
    queueMemberKey,
    queue_member_key: queueMemberKey,
    dedupeKey: queueMemberKey,
    dedupe_key: queueMemberKey,
    queueCredential: queueMemberKey,
    queue_credential: queueMemberKey,
    licenseCodeHash: licenseHash,
    license_code_hash: licenseHash,
    tokenHash: rpcTokenHash,
    token_hash: rpcTokenHash,
    rpcAccessTokenHash: rpcTokenHash,
    rpc_access_token_hash: rpcTokenHash,
    endpointSlug: stringValue(payload.endpointSlug, payload.endpoint_slug),
    market: stringValue(payload.market),
    balances,
    usdtBalance: queueUsdtBalance(balances),
    expiresAt: stringValue(payload.expiresAt, payload.expires_at),
    rpcPlanType: stringValue(payload.rpcPlanType, payload.rpc_plan_type) || runtime.rpcPlanType,
    rpcPlanName: stringValue(payload.rpcPlanName, payload.rpc_plan_name) || runtime.rpcPlanName,
    purchasedPlan: stringValue(payload.purchasedPlan, payload.purchased_plan, payload.packageName, payload.package_name) || runtime.rpcPlanName || runtime.rpcPlanType,
    purchased_plan: stringValue(payload.purchasedPlan, payload.purchased_plan, payload.packageName, payload.package_name) || runtime.rpcPlanName || runtime.rpcPlanType,
    packageName: stringValue(payload.packageName, payload.package_name, payload.purchasedPlan, payload.purchased_plan) || runtime.rpcPlanName || runtime.rpcPlanType,
    package_name: stringValue(payload.packageName, payload.package_name, payload.purchasedPlan, payload.purchased_plan) || runtime.rpcPlanName || runtime.rpcPlanType,
    creditBurnPerSecond: numberValue(payload.creditBurnPerSecond, payload.credit_burn_per_second) ?? runtime.creditBurnPerSecond,
    credentialAuthMode: stringValue(payload.credentialAuthMode, payload.credential_auth_mode) || runtime.credentialAuthMode,
    credentialMode: credentialModeLabel(stringValue(payload.credentialAuthMode, payload.credential_auth_mode) || runtime.credentialAuthMode),
    credential_mode: credentialModeLabel(stringValue(payload.credentialAuthMode, payload.credential_auth_mode) || runtime.credentialAuthMode),
    singleTradeAuthAmountUsdt: stringValue(payload.singleTradeAuthAmountUsdt, payload.single_trade_auth_amount_usdt) || runtime.singleTradeAuthAmountUsdt,
    authorizedAmountUsdt: stringValue(payload.authorizedAmountUsdt, payload.authorized_amount_usdt, payload.singleTradeAuthAmountUsdt, payload.single_trade_auth_amount_usdt) || runtime.singleTradeAuthAmountUsdt,
    authorized_amount_usdt: stringValue(payload.authorizedAmountUsdt, payload.authorized_amount_usdt, payload.singleTradeAuthAmountUsdt, payload.single_trade_auth_amount_usdt) || runtime.singleTradeAuthAmountUsdt,
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

function credentialModeLabel(value?: string): string {
  return value === "loop" ? "multiple" : "single";
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
  const key = normalizePrivateKey(privateKey).replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能生成钱包公钥。");
  return `0x${Buffer.from(getPublicKey(hexToBytes(key), false)).toString("hex")}`;
}

function encryptForTxWallet(privateKey: string, publicKeyPem: string): string {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encryptedData = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey,
  );

  return JSON.stringify({
    v: 1,
    alg: "RSA-OAEP-256+AES-256-GCM",
    key: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    data: Buffer.concat([encryptedData, tag]).toString("base64"),
  });
}

function readTxPublicKeyPem(env: Record<string, string>): string {
  const inlineKey = env.TX_WALLET_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (inlineKey) return inlineKey;
  const configuredPath = env.TX_WALLET_PUBLIC_KEY_PATH?.trim();
  if (configuredPath && existsSync(configuredPath)) return readFileSync(configuredPath, "utf8");
  if (!existsSync(DEFAULT_TX_PUBLIC_KEY_PATH)) throw new Error(`TX wallet public key not found: ${DEFAULT_TX_PUBLIC_KEY_PATH}`);
  return readFileSync(DEFAULT_TX_PUBLIC_KEY_PATH, "utf8");
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
  return (
    env.SUPERMTNODE_APP_TOKEN?.trim() ||
    env.STATE_AUTH_TOKEN?.trim() ||
    env.QUEUE_TOKEN?.trim() ||
    env.LIQUIDATION_QUEUE_WSS_TOKEN?.trim() ||
    env.MANAGE_INGEST_TOKEN?.trim() ||
    ""
  );
}

function buildQueueMemberKey(chain: string, walletAddress: string, licenseHash: string, tokenHash: string): string {
  return ["license-token-wallet", chain, licenseHash, tokenHash, walletTail(walletAddress)].join(":");
}

function walletTail(walletAddress: string): string {
  const normalized = walletAddress.toLowerCase().replace(/^0x/i, "");
  return normalized.slice(-4) || "unknown";
}

function stateRpcTimeoutMs(env: Record<string, string>): number {
  const value = Number(env.STATE_RPC_TIMEOUT_MS || env.RPC_TIMEOUT_MS || 12_000);
  return Number.isFinite(value) && value > 0 ? value : 12_000;
}

function privateKeyToAddress(privateKey: string): string {
  const key = normalizePrivateKey(privateKey).replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能建立状态会话。");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

function normalizePrivateKey(privateKey: string): string {
  const trimmed = privateKey.trim();
  const key = trimmed.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确。");
  return `0x${key.toLowerCase()}`;
}

function tokenFingerprint(value?: string): string {
  return crypto
    .createHash("sha256")
    .update(value || "")
    .digest("hex")
    .slice(0, 16);
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
