import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { assertOfficialConfig } from "./official-config";
import { encryptPrivateKeyEnvelope } from "./private-key-envelope";
import { writePrivateTextFile } from "./local-secure-storage";
import { ENV_FILE, stateFile } from "./runtime-paths";

const DEFAULT_PRIVATE_MEMBER_API_URL = "https://privateapi.superarb.ai";
const DEFAULT_BOOTSTRAP_PATH = "/bootstrap";
const DEFAULT_TX_PUBLIC_KEY_PATH = resolve(process.cwd(), "server/tx-wallet-public.pem");
const DEFAULT_TIMEOUT_MS = 10_000;
const CLIENT_VERSION = "1.6.9";
const LIQ2_PROTOCOL_VERSION = "liq2-cutover-20260624-v160";
const PRESENCE_HEARTBEAT_INTERVAL_MS = 5 * 60_000;
const PRESENCE_STOP_RETRY_INTERVAL_MS = 10_000;
const PENDING_PRESENCE_LEAVE_FILE = stateFile("pending-presence-leave.json");

type BootstrapResult = {
  ok: boolean;
  skipped: boolean;
  walletAddress?: string;
  endpoint?: string;
  reason?: string;
  error?: string;
};

type BootstrapOptions = {
  authCode?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
};

type HeartbeatResult = {
  ok: boolean;
  skipped?: boolean;
  walletAddress?: string;
  endpoint?: string;
  status?: string;
  heartbeatAt?: string;
  code?: string;
  statusCode?: number;
  error?: string;
};

type UserLeaveAction = "pause" | "logout" | "rpc-expired";

type ExecutionPresence = {
  status: "running" | "stopped";
  chain?: string;
  market?: string;
  leaveAction?: UserLeaveAction;
};

const inFlight = new Map<string, Promise<BootstrapResult>>();
let presenceTimer: ReturnType<typeof setInterval> | undefined;
let presenceStopRetryTimer: ReturnType<typeof setInterval> | undefined;
let presenceInFlight = false;
let presenceRequest: Promise<HeartbeatResult> | undefined;
let presenceFailureCount = 0;
let pendingPresenceLeaveAction: UserLeaveAction = "logout";
// Execution state is deliberately separate from login presence. A signed-in
// client is not an executing client until the market-control UI confirms it.
let executionPresence: ExecutionPresence = { status: "stopped" };

export function bootstrapPrivateMemberWalletOnce(reason = "startup", options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const key = bootstrapInFlightKey(reason, options);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const next = bootstrapPrivateMemberWallet(reason, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, next);
  return next;
}

/** Start the execution-presence heartbeat after a market has entered the queue. */
export async function startPrivateMemberWalletHeartbeat(): Promise<HeartbeatResult> {
  if (executionPresence.status !== "running") {
    return { ok: true, skipped: true, status: "offline", error: "execution_not_running" };
  }
  stopPresenceOfflineRetry();
  clearPendingPresenceLeave();
  if (presenceTimer) return { ok: true, skipped: true, status: "online", error: "already_running" };
  const intervalMs = presenceHeartbeatIntervalMs();
  // The retry loop belongs to the local service, not to the browser window.
  // Install it before the initial request so a transient failure still retries
  // after the page has closed.
  presenceTimer = setInterval(() => {
    void runPrivateMemberWalletHeartbeat("online");
  }, intervalMs);
  await presenceRequest?.catch(() => undefined);
  if (executionPresence.status !== "running") return { ok: true, skipped: true, status: "offline", error: "start_superseded" };
  const result = await runPrivateMemberWalletHeartbeat("online");
  return result.ok
    ? result
    : { ...result, ok: true, skipped: true, error: `background retry scheduled: ${result.error || "initial heartbeat failed"}` };
}

/** Stop online heartbeats and keep retrying until the explicit leave is acknowledged. */
export async function stopPrivateMemberWalletHeartbeat(leaveAction: UserLeaveAction): Promise<HeartbeatResult> {
  if (presenceTimer) clearInterval(presenceTimer);
  presenceTimer = undefined;
  // An explicit stop must be ordered after any older online request.
  pendingPresenceLeaveAction = leaveAction;
  rememberPendingPresenceLeave(leaveAction);
  await presenceRequest?.catch(() => undefined);
  if (executionPresence.status !== "stopped") return { ok: true, skipped: true, status: "online", error: "stop_superseded" };
  const result = await runPrivateMemberWalletHeartbeat("offline", leaveAction);
  if (result.ok && !result.skipped) clearPendingPresenceLeave();
  else startPresenceOfflineRetry();
  return result;
}

export function restorePendingPrivateMemberLeave(): void {
  if (!existsSync(PENDING_PRESENCE_LEAVE_FILE)) return;
  pendingPresenceLeaveAction = readPendingPresenceLeaveAction();
  executionPresence = { status: "stopped" };
  startPresenceOfflineRetry();
  void runPrivateMemberWalletHeartbeat("offline", pendingPresenceLeaveAction).then((result) => {
    if (result.ok && !result.skipped) {
      clearPendingPresenceLeave();
      stopPresenceOfflineRetry();
    }
  });
}

function startPresenceOfflineRetry(): void {
  if (presenceStopRetryTimer || executionPresence.status !== "stopped") return;
  presenceStopRetryTimer = setInterval(() => {
    if (executionPresence.status !== "stopped") {
      stopPresenceOfflineRetry();
      return;
    }
    void runPrivateMemberWalletHeartbeat("offline", pendingPresenceLeaveAction).then((result) => {
      if (result.ok && !result.skipped) {
        clearPendingPresenceLeave();
        stopPresenceOfflineRetry();
      }
    });
  }, PRESENCE_STOP_RETRY_INTERVAL_MS);
}

function stopPresenceOfflineRetry(): void {
  if (presenceStopRetryTimer) clearInterval(presenceStopRetryTimer);
  presenceStopRetryTimer = undefined;
}

function rememberPendingPresenceLeave(leaveAction: UserLeaveAction): void {
  writePrivateTextFile(
    PENDING_PRESENCE_LEAVE_FILE,
    `${JSON.stringify({ pending: true, leaveAction, requestedAt: new Date().toISOString() })}\n`,
  );
}

function readPendingPresenceLeaveAction(): UserLeaveAction {
  try {
    const payload = JSON.parse(readFileSync(PENDING_PRESENCE_LEAVE_FILE, "utf8")) as { leaveAction?: unknown };
    return isUserLeaveAction(payload.leaveAction) ? payload.leaveAction : "logout";
  } catch {
    return "logout";
  }
}

function clearPendingPresenceLeave(): void {
  try {
    unlinkSync(PENDING_PRESENCE_LEAVE_FILE);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

/**
 * Online LIQ2 status starts only after market-control confirms the market has
 * entered the queue. Stopping that market immediately stops its heartbeat.
 */
export async function setPrivateMemberExecutionPresence(input: ExecutionPresence): Promise<HeartbeatResult> {
  if (input.status === "stopped" && !isUserLeaveAction(input.leaveAction)) {
    return { ok: false, status: "offline", code: "LEAVE_ACTION_REQUIRED", error: "Pause, Exit, or RPC expiry is required to stop execution presence." };
  }
  executionPresence = {
    status: input.status === "running" ? "running" : "stopped",
    chain: cleanExecutionValue(input.chain, 32),
    market: cleanExecutionValue(input.market, 160),
  };
  if (executionPresence.status === "stopped") {
    executionPresence.chain = undefined;
    executionPresence.market = undefined;
  }
  return executionPresence.status === "running"
    ? startPrivateMemberWalletHeartbeat()
    : stopPrivateMemberWalletHeartbeat(input.leaveAction as UserLeaveAction);
}

async function runPrivateMemberWalletHeartbeat(status: "online" | "offline", leaveAction?: UserLeaveAction): Promise<HeartbeatResult> {
  if (presenceInFlight) return { ok: true, skipped: true, status, error: "heartbeat_in_flight" };
  presenceInFlight = true;
  try {
    presenceRequest = sendPrivateMemberWalletHeartbeat(status, leaveAction);
    const result = await presenceRequest;
    if (result.ok) {
      presenceFailureCount = 0;
    } else if (!result.skipped) {
      presenceFailureCount += 1;
      if (presenceFailureCount === 1 || presenceFailureCount % 6 === 0) {
        console.warn(`[liq2] privateapi heartbeat failed (${presenceFailureCount}): ${result.error || "unknown error"}`);
      }
    }
    return result;
  } finally {
    presenceRequest = undefined;
    presenceInFlight = false;
  }
}

/**
 * Refresh the remote PrivateARB presence row without uploading the private key.
 * The execution-presence manager calls this every five minutes only while a
 * LIQ2 market is running, and sends offline when that market stops.
 */
export async function sendPrivateMemberWalletHeartbeat(status: "online" | "offline" = "online", leaveAction?: UserLeaveAction): Promise<HeartbeatResult> {
  try {
    const env = readEnv();
    if (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED?.trim() === "false") return { ok: true, skipped: true, status, error: "disabled" };
    const privateKey = env.PRIVATE_KEY?.trim();
    const appToken = usableToken(env.SUPERMTNODE_APP_TOKEN);
    if (!privateKey) return { ok: true, skipped: true, status, error: "missing_private_key" };
    if (!appToken) return { ok: false, status, error: "SUPERMTNODE_APP_TOKEN is required for heartbeat." };
    const chain = defaultChain(env);
    const walletAddress = privateKeyToAddress(normalizePrivateKey(privateKey));
    const endpoint = privateMemberHeartbeatEndpoint(env);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${appToken}`,
        "x-supermtnode-app-token": appToken,
      },
      body: JSON.stringify({
        chain,
        walletAddress,
        systemId: buildSystemId(chain, walletAddress),
        rpcUrl: readRpcUrl(chain, env),
        status,
        clientVersion: CLIENT_VERSION,
        protocolVersion: LIQ2_PROTOCOL_VERSION,
        // A normal login heartbeat carries the most recently confirmed market
        // state, so it cannot overwrite a running market as merely "online".
        executionStatus: status === "offline" ? "stopped" : executionPresence.status,
        executionChain: status === "offline" ? undefined : executionPresence.chain,
        executionMarket: status === "offline" ? undefined : executionPresence.market,
        leaveAction: status === "offline" ? leaveAction : undefined,
      }),
      signal: AbortSignal.timeout(timeoutMs(env)),
    });
    const payload = await parseOptionalJson(response);
    if (!response.ok || payload.ok === false) {
      return {
        ok: false,
        walletAddress,
        endpoint,
        status,
        code: stringValue(payload.code),
        statusCode: response.status,
        error: stringValue(payload.error, payload.message) || `privateapi heartbeat returned HTTP ${response.status}`,
      };
    }
    return {
      ok: true,
      walletAddress,
      endpoint,
      status: stringValue(payload.status) || status,
      heartbeatAt: stringValue(payload.heartbeatAt, payload.heartbeat_at),
    };
  } catch (error) {
    return { ok: false, status, error: error instanceof Error ? error.message : String(error) };
  }
}

function isUserLeaveAction(value: unknown): value is UserLeaveAction {
  return value === "pause" || value === "logout" || value === "rpc-expired";
}

function cleanExecutionValue(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

export function privateMemberWalletBootstrapStatus(env: Record<string, string>): { ok: boolean; message: string; action?: "repair_secure_upload" } {
  try {
    if (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED?.trim() === "false") return { ok: false, message: "安全同步已关闭", action: "repair_secure_upload" };
    const privateKey = env.PRIVATE_KEY?.trim();
    const authIdentity = usableToken(env.SUPERMTNODE_APP_TOKEN);
    if (!privateKey) return { ok: false, message: "本地未配置钱包授权" };
    if (!authIdentity) return { ok: false, message: "本地未配置 SUPERMTNODE_APP_TOKEN" };

    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    privateKeyToAddress(normalizedPrivateKey);
    const chain = defaultChain(env);
    if (chain !== "bnb") return { ok: false, message: "LIQ2 仅支持 BSC/BNB", action: "repair_secure_upload" };
    if (!readRpcUrl(chain, env)) return { ok: false, message: "本地未配置 BNB_RPC_URL", action: "repair_secure_upload" };
    readTxPublicKeyPem();
    return { ok: true, message: "用户数据将在启动时同步" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), action: "repair_secure_upload" };
  }
}

function bootstrapInFlightKey(reason: string, options: BootstrapOptions): string {
  return [
    reason,
    options.authCode?.trim() || "",
  ].join("\n");
}

async function bootstrapPrivateMemberWallet(reason: string, options: BootstrapOptions): Promise<BootstrapResult> {
  try {
    const env = readEnv();
    if (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED?.trim() === "false") {
      return { ok: false, skipped: true, reason: "disabled", error: "用户数据写入已关闭。" };
    }

    const privateKey = env.PRIVATE_KEY?.trim();
    const appToken = usableToken(env.SUPERMTNODE_APP_TOKEN);
    const chain = defaultChain(env);
    if (!privateKey) return { ok: false, skipped: true, reason: "missing_private_key", error: "PRIVATE_KEY is required for user data bootstrap." };
    if (!appToken) return { ok: false, skipped: true, reason: "missing_app_token", error: "SUPERMTNODE_APP_TOKEN is required for secure bootstrap." };
    if (chain !== "bnb") return { ok: false, skipped: true, reason: "unsupported_chain", error: "LIQ2 wallet bootstrap only supports BSC/BNB." };
    if (!readRpcUrl(chain, env)) return { ok: false, skipped: true, reason: "missing_bnb_rpc", error: "BNB_RPC_URL is required for secure bootstrap." };
    assertOfficialConfig("私钥加密提交", env);
    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const walletAddress = privateKeyToAddress(normalizedPrivateKey);
    const rpcUrl = readRpcUrl(chain, env);
    const systemId = buildSystemId(chain, walletAddress);
    const endpoint = privateMemberBootstrapEndpoint(env);
    const rpcToken = appToken || undefined;
    const txPublicKeyPem = readTxPublicKeyPem();
    const rpcPlan =
      options.rpcPlanType && options.rpcPlanName
        ? { rpcPlanType: options.rpcPlanType, rpcPlanName: options.rpcPlanName }
        : readLocalRpcPlanInfo(env);
    const profilePayload = buildProfilePayload(env, {
      reason,
      systemId,
      chain,
      walletAddress,
      rpcUrl,
      rpcToken,
      rpcPlan,
    });
    const privateKeyCipher = encryptPrivateKeyEnvelope(normalizedPrivateKey, txPublicKeyPem);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${appToken}`,
        "x-supermtnode-app-token": appToken,
      },
      body: JSON.stringify({ ...profilePayload, encryptedPrivateKey: privateKeyCipher, credentialUploadVersion: CLIENT_VERSION }),
      signal: AbortSignal.timeout(timeoutMs(env)),
    });
    const payload = await parseOptionalJson(response);
    if (response.status === 404) {
      return { ok: false, skipped: true, walletAddress, endpoint, reason: "remote_bootstrap_endpoint_not_found" };
    }
    const responseMessage = stringValue(payload.error, payload.message, payload.reason, payload.status) || "";
    if (response.status === 409 && /already|exists|duplicate|重复|已存在/i.test(responseMessage)) {
      return { ok: true, skipped: true, walletAddress, endpoint, reason: "already_registered" };
    }
    if (!response.ok || payload.ok === false) {
      const message = responseMessage || `privateapi.superarb.ai returned HTTP ${response.status}`;
      throw new Error(message);
    }

    return { ok: true, skipped: Boolean(payload.skipped), walletAddress, endpoint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[liq2] private member wallet bootstrap skipped: ${message}`);
    return { ok: false, skipped: true, error: message };
  }
}

function privateMemberBootstrapEndpoint(env: Record<string, string>): string {
  return `${privateMemberApiBase(env)}${DEFAULT_BOOTSTRAP_PATH}`;
}

function privateMemberHeartbeatEndpoint(env: Record<string, string>): string {
  return `${privateMemberApiBase(env)}/heartbeat`;
}

function privateMemberApiBase(_env: Record<string, string>): string {
  return DEFAULT_PRIVATE_MEMBER_API_URL;
}

function readTxPublicKeyPem(): string {
  if (!existsSync(DEFAULT_TX_PUBLIC_KEY_PATH)) throw new Error(`TX wallet public key not found: ${DEFAULT_TX_PUBLIC_KEY_PATH}`);
  return readFileSync(DEFAULT_TX_PUBLIC_KEY_PATH, "utf8");
}

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY format is invalid.");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

function normalizePrivateKey(privateKey: string): string {
  const key = privateKey.trim();
  const hex = key.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error("PRIVATE_KEY format is invalid.");
  return `0x${hex}`;
}

function buildProfilePayload(
  env: Record<string, string>,
  input: {
    reason: string;
    systemId: string;
    chain: string;
    walletAddress: string;
    rpcUrl?: string;
    rpcToken?: string;
    authCode?: string;
    rpcPlan: { rpcPlanType: string; rpcPlanName: string };
  },
): Record<string, unknown> {
  const credentialAuthMode = readCredentialAuthMode(env);
  const singleTradeAuthAmountUsdt = normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT);
  const arbitrageIntensity = normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY);
  const walletUsdt = env.WALLET_USDT_BALANCE?.trim() || undefined;
  const nickname = env.LIQ2_NICKNAME?.trim() || env.NICKNAME?.trim() || undefined;
  return {
    clientVersion: CLIENT_VERSION,
    protocolVersion: LIQ2_PROTOCOL_VERSION,
    systemId: input.systemId,
    appToken: input.rpcToken || undefined,
    rpcUrl: input.rpcUrl,
    rpcToken: input.rpcToken,
    chain: input.chain,
    walletAddress: input.walletAddress,
    credentialAuthMode,
    singleTradeAuthAmountUsdt,
    arbitrageIntensity,
    rpcPlanType: input.rpcPlan.rpcPlanType,
    rpcPlanName: input.rpcPlan.rpcPlanName,
    walletUsdt,
    nickname,
    // A successful queue-start is the authoritative online transition. Other
    // bootstrap reasons only refresh profile/credential data and must not
    // change an existing wallet's presence.
    status: input.reason === "queue-start" ? "online" : "offline",
  };
}

function privateMemberAuthCode(env: Record<string, string>): string {
  return (env.AUTH_CODE?.trim() || env.SUPERARB_AUTH_CODE?.trim() || env.LICENSE_CODE?.trim() || "").toUpperCase();
}

function privateMemberAuthIdentity(env: Record<string, string>): string {
  return privateMemberAuthCode(env) || usableToken(env.SUPERMTNODE_APP_TOKEN);
}

function defaultChain(env: Record<string, string>): string {
  const normalized = (env.LIQ2_CHAIN || env.DEFAULT_CHAIN || env.CHAIN || "bnb").trim().toLowerCase();
  if (["bsc", "binance", "bnb"].includes(normalized)) return "bnb";
  if (["eth", "ethereum"].includes(normalized)) return "ethereum";
  if (["arb", "arbitrum"].includes(normalized)) return "arbitrum";
  return normalized || "bnb";
}

function readRpcUrl(chain: string, env: Record<string, string>): string | undefined {
  const normalized = defaultChain({ LIQ2_CHAIN: chain });
  const keys =
    normalized === "bnb"
      ? ["BNB_RPC_URL", "BSC_RPC_URL", "BNB_FALLBACK_RPC_URL"]
      : normalized === "ethereum"
        ? ["ETHEREUM_RPC_URL", "ETH_RPC_URL"]
        : normalized === "arbitrum"
          ? ["ARBITRUM_RPC_URL", "ARB_RPC_URL"]
          : [];
  return keys.map((key) => env[key]?.trim()).find(Boolean);
}

function buildSystemId(chain: string, walletAddress: string): string {
  return `${chain}:${walletAddress.toLowerCase()}`;
}

function readLocalRpcPlanInfo(env: Record<string, string>): { rpcPlanType: string; rpcPlanName: string } {
  const rpcPlanType = normalizeRpcPlanType(env.RPC_PLAN_TYPE) || "unknown";
  return { rpcPlanType, rpcPlanName: env.RPC_PLAN_NAME?.trim() || rpcPlanLabel(rpcPlanType) };
}

function inferRpcPlanInfo(endpoints: Record<string, unknown>[]): { rpcPlanType: string; rpcPlanName: string } {
  const ranked = endpoints
    .map((endpoint) => rpcPlanTypeFromEndpoint(endpoint))
    .filter((plan): plan is string => Boolean(plan))
    .sort((left, right) => rpcPlanRank(right) - rpcPlanRank(left));
  const rpcPlanType = ranked[0] ?? "unknown";
  return { rpcPlanType, rpcPlanName: rpcPlanLabel(rpcPlanType) };
}

function rpcPlanTypeFromEndpoint(endpoint: Record<string, unknown>): string | undefined {
  const explicit = stringValue(endpoint.planId, endpoint.plan_id, endpoint.planKey, endpoint.plan_key, endpoint.subscriptionPlanId, endpoint.subscription_plan_id);
  const normalized = normalizeRpcPlanType(explicit);
  if (normalized) return normalized;

  const burn = numberValue(endpoint.creditBurnPerSecond, endpoint.credit_burn_per_second);
  if (burn === 25) return "build";
  if (burn === 50) return "accelerate";
  if (burn === 75) return "scale";
  if (burn === 500) return "business";

  const limit = numberValue(endpoint.requestLimit, endpoint.request_limit);
  if (limit === 80_000_000) return "build";
  if (limit === 450_000_000) return "accelerate";
  if (limit === 950_000_000) return "scale";
  if (limit === 2_000_000_000) return "business";
  return undefined;
}

function normalizeRpcPlanType(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["build", "189"].includes(normalized)) return "build";
  if (["accelerate", "489"].includes(normalized)) return "accelerate";
  if (["scale", "899"].includes(normalized)) return "scale";
  if (["business", "2999"].includes(normalized)) return "business";
  return undefined;
}

function rpcPlanRank(plan: string): number {
  return { build: 1, accelerate: 2, scale: 3, business: 4 }[plan as "build" | "accelerate" | "scale" | "business"] ?? 0;
}

function rpcPlanLabel(plan: string): string {
  return { build: "Build / 189", accelerate: "Accelerate / 489", scale: "Scale / 899", business: "Business / 2999" }[plan as "build" | "accelerate" | "scale" | "business"] ?? "Unknown";
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function readTradeSettings(env: Record<string, string>): { arbitrageIntensity: string; singleTradeAuthAmountUsdt: string; credentialAuthMode: string } {
  const intensity = normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY);
  const amount = normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT);
  return {
    arbitrageIntensity: intensity,
    singleTradeAuthAmountUsdt: amount,
    credentialAuthMode: readCredentialAuthMode(env),
  };
}

function readCredentialAuthMode(env: Record<string, string>): string {
  const normalized = (env.CREDENTIAL_AUTH_MODE || "").trim().toLowerCase();
  if (["loop", "multi", "multiple", "多次", "多次循环"].includes(normalized)) return "loop";
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

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = parseEnvValue(line.slice(separator + 1));
  }
  return parsed;
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function parseOptionalJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!body || !contentType.toLowerCase().includes("application/json")) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value.replace(/[,\s]/g, ""));
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return null;
}

function usableToken(value?: string): string {
  const token = value?.trim() ?? "";
  if (!token) return "";
  const expiry = jwtExpiry(token);
  return expiry && expiry.getTime() <= Date.now() ? "" : token;
}

function jwtExpiry(token: string): Date | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const exp = numberValue(payload.exp);
    return exp ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function presenceHeartbeatIntervalMs(): number {
  return PRESENCE_HEARTBEAT_INTERVAL_MS;
}
