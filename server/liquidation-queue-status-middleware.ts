import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import crypto from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { dirname, resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import WebSocket from "ws";
import { assertOfficialConfig } from "./official-config";
import { bootstrapPrivateMemberWalletOnce } from "./private-member-wallet-bootstrap";
import { queueWssToken } from "./queue-token";

const ENV_FILE = resolve(process.cwd(), ".env");
const LOCAL_QUEUE_STATE_FILE = resolve(process.cwd(), ".superarb/liquidation-queue-client.json");
const LOCAL_QUEUE_STOP_FILE = resolve(process.cwd(), ".superarb/liquidation-queue-stops.json");
const CLIENT_INSTANCE_FILE = resolve(process.cwd(), ".superarb/client-instance-id");
const TX_CREDENTIAL_SYNC_STATE_FILE = resolve(process.cwd(), ".superarb/tx-credential-sync.json");
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
const DEFAULT_QUEUE_STATUS_API_URL = "https://private.superarb.ai/api/liq2/leaderboard";
const DEFAULT_PRIVATE_MEMBER_BOOTSTRAP_URL = "https://private.superarb.ai/api/internal/liq2-wallet/bootstrap";
const DEFAULT_QUEUE_WSS_URL = "wss://private.superarb.ai/ws/liquidation-queue-v2";
const BALANCE_OF_SELECTOR = "0x70a08231";
const STOP_ACTIONS = ["stop", "pause", "logout", "disconnect", "unregister"];
const ENABLED_QUEUE_CHAINS: ChainKey[] = ["bnb"];
const CLIENT_VERSION = "1.6.2";
const LIQ2_PROTOCOL_VERSION = "liq2-cutover-20260624-v160";

type ChainKey = "ethereum" | "bnb" | "arbitrum";

type QueueStatusRow = {
  chain: ChainKey;
  chainLabel: string;
  inQueue: boolean;
  eligible: boolean;
  position: number | null;
  participantCount: number;
  active: boolean;
  cursorIndex: number | null;
  nextEligibleAt: string;
  status: string;
  updatedAt: string;
};

type QueueStatusPayload = {
  ok?: unknown;
  data?: unknown;
  rows?: unknown;
  chains?: unknown;
  queue?: unknown;
  queues?: unknown;
  queuedWallets?: unknown;
  queued_wallets?: unknown;
  rotation?: unknown;
  rotationPolicy?: unknown;
  rotation_policy?: unknown;
  source?: unknown;
  queueTransport?: unknown;
  queue_transport?: unknown;
  queueParticipantCount?: unknown;
  queue_participant_count?: unknown;
  participantCount?: unknown;
  participant_count?: unknown;
  members?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
};

type QueueRegisterPayload = {
  chain?: unknown;
  market?: unknown;
  strategyId?: unknown;
  protocol?: unknown;
  action?: unknown;
  startIntentId?: unknown;
  start_intent_id?: unknown;
};

type SuperMtNodeEndpoint = {
  chain?: unknown;
  planId?: unknown;
  plan_id?: unknown;
  planKey?: unknown;
  plan_key?: unknown;
  subscriptionPlanId?: unknown;
  subscription_plan_id?: unknown;
  endpointSlug?: unknown;
  endpoint_slug?: unknown;
  httpUrl?: unknown;
  http_url?: unknown;
  token?: unknown;
  appToken?: unknown;
  app_token?: unknown;
  accessToken?: unknown;
  access_token?: unknown;
  tokenHash?: unknown;
  token_hash?: unknown;
  rpcTokenHash?: unknown;
  rpc_token_hash?: unknown;
  status?: unknown;
  requestCount?: unknown;
  request_count?: unknown;
  requestLimit?: unknown;
  request_limit?: unknown;
  creditBurnPerSecond?: unknown;
  credit_burn_per_second?: unknown;
  creditsRemaining?: unknown;
  credits_remaining?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  validUntil?: unknown;
  valid_until?: unknown;
  licenseExpiresAt?: unknown;
  license_expires_at?: unknown;
  tokenExpiresAt?: unknown;
  token_expires_at?: unknown;
  subscriptionExpiresAt?: unknown;
  subscription_expires_at?: unknown;
};

type RpcAccessInfo = {
  rpcPlanType: string;
  rpcPlanName: string;
  creditBurnPerSecond: number | null;
  rpcAccessTokenHash: string;
};

type WalletBalances = {
  gas: { symbol: string; formatted: string };
  updatedAt: string;
};

type LocalQueueState = {
  items: Record<string, unknown>[];
  updatedAt: string;
};

type LocalQueueStopState = {
  stops: Record<string, string>;
  updatedAt: string;
};

type QueueTransportResult = {
  endpoint: string;
  transport: "wss" | "http";
  payload: Record<string, unknown>;
};

type QueueWssIdentity = {
  chain?: string;
  market?: string;
  walletAddress?: string;
  endpointSlug?: string;
  participantId?: string;
};

type ActiveQueueWssSession = {
  endpoint: string;
  ws: WebSocket;
  authAcked: boolean;
  authMessageId: string;
  queueIdentities: QueueWssIdentity[];
  pending?: {
    eventMessageId: string;
    eventSent: boolean;
    resolve: (payload: Record<string, unknown>) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
    closeAfterAck: boolean;
  };
  leaseTimer?: ReturnType<typeof setTimeout>;
};

type BackgroundQueueSession = {
  timer: ReturnType<typeof setInterval>;
  endpoint: string;
  intervalMs: number;
  payload: Parameters<typeof privateQueuePayload>[0];
  lastOkAt?: string;
  lastError?: string;
  failureCount: number;
  inFlight: boolean;
};

const chainEnvKeys: Record<ChainKey, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
};

const superMtNodeChainKeys: Record<ChainKey, string> = {
  ethereum: "eth",
  bnb: "bnb",
  arbitrum: "arb",
};

const SUPERMTNODE_API_BASES = ["https://supermtnode.io", "https://api.supermtnode.io"];

const defaultFallbackRpcUrls: Partial<Record<ChainKey, string>> = {};

const publicRpcUrls: Record<ChainKey, string[]> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  bnb: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
};

const activeQueueWssSessions = new Map<string, ActiveQueueWssSession>();
const backgroundQueueSessions = new Map<string, BackgroundQueueSession>();

const viteHot = (import.meta as ImportMeta & { hot?: { dispose(callback: () => void): void } }).hot;
viteHot?.dispose(() => {
  for (const session of backgroundQueueSessions.values()) clearInterval(session.timer);
  backgroundQueueSessions.clear();
});

const tokenContracts: Record<ChainKey, { gasSymbol: string; usdt: { address: string; decimals: number }; usdc: { address: string; decimals: number } }> = {
  ethereum: {
    gasSymbol: "ETH",
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
  },
  bnb: {
    gasSymbol: "BNB",
    usdt: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
    usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
  },
  arbitrum: {
    gasSymbol: "ETH",
    usdt: { address: "0xFd086bC7CD5C481DCC9C85EBE478A1C0b69FCbb9", decimals: 6 },
    usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
  },
};

export function handleLiquidationQueueStatusRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (req.url?.startsWith("/api/liquidation-queue/rpc-burn")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    burnRunningRpc(req)
      .then((payload) => json(res, 200, payload))
      .catch((error: unknown) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (!req.url?.startsWith("/api/liquidation-queue/status")) return false;

  if (req.method === "POST") {
    registerQueueStatus(req)
      .then((payload) => json(res, 200, payload))
      .catch((error: unknown) => {
        json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchQueueStatus(req)
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 200, emptyQueueStatus(error instanceof Error ? error.message : String(error)));
    });

  return true;
}

export function restoreLocalQueueHeartbeats(): void {
  const env = readEnv();
  if (!queueAutoRestoreEnabled(env)) return;
  if (!allowQueueHttpFallback(env)) return;
  const authCode = normalizeAuthCode(env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE);
  if (!authCode || !existsSync(LOCAL_QUEUE_STATE_FILE)) return;
  try {
    const parsed = JSON.parse(readFileSync(LOCAL_QUEUE_STATE_FILE, "utf8")) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return;
    for (const item of parsed.items) {
      if (!isRecord(item) || item.online === false) continue;
      const status = stringValue(item.status)?.toLowerCase() ?? "";
      if (STOP_ACTIONS.includes(status) || status === "stopped" || status === "offline") continue;
      const walletAddress = stringValue(item.walletAddress, item.wallet_address, item.wallet);
      const chain = normalizeChain(stringValue(item.chain) ?? "");
      if (!walletAddress || !ENABLED_QUEUE_CHAINS.includes(chain)) continue;
      const lastSeenAt = new Date(stringValue(item.lastSeenAt, item.last_seen_at, item.updatedAt, item.updated_at) ?? "").getTime();
      if (Number.isFinite(lastSeenAt) && Date.now() - lastSeenAt > 30 * 60 * 1000) continue;
      const rpcAccessTokenHash =
        stringValue(item.rpcAccessTokenHash, item.rpc_access_token_hash) ??
        readLocalQueueRpcAccessTokenHash(chain, walletAddress, authCode, env[chainEnvKeys[chain]]?.trim() ?? "") ??
        "no-token";
      const runtime = readLocalQueueRuntimeSettings(chain, walletAddress, authCode, rpcAccessTokenHash);
      const payload = {
        ...item,
        action: "heartbeat",
        chain,
        authCode,
        walletAddress,
        rpcAccessTokenHash,
        market: stringValue(item.market) ?? "BNB / Aave V3",
        clientInstanceId: stringValue(item.clientInstanceId, item.client_instance_id) ?? readClientInstanceId(),
        billable: true,
        online: true,
        billingStatus: "online",
        ...runtime,
      } as Parameters<typeof privateQueuePayload>[0];
      const endpoint = privateMemberBootstrapUrl(env);
      startBackgroundQueueHeartbeat(env, endpoint, payload);
      void sendBackgroundQueueHeartbeat(backgroundQueueKey(payload), env, endpoint);
    }
  } catch (error) {
    console.warn(`[queue-background] restore failed: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function burnRunningRpc(req: IncomingMessage) {
  const env = readEnv();
  const body = (await readJson(req)) as QueueRegisterPayload;
  const chain = normalizeChain(stringValue(body.chain) ?? "");
  assertQueueChainEnabled(chain);
  const authCode = requestAuthCode(req, env);
  assertQueueAuthIdentityConfigured(queueAuthIdentity(env, authCode));
  assertOfficialConfig("RPC 运行扣费", env);
  const rpcUrls = meteredRpcUrls(chain, env);
  if (!rpcUrls.length) throw new Error(`${chainEnvKeys[chain]} 未配置，不能扣费。`);
  const rpcAccess = await assertSuperMtNodeRpcCanStart(chain, env, authCode);
  const rpcBurn = await burnConnectedRpcUsage(chain, rpcUrls, env, rpcBurnRequestCount(env, rpcAccess.creditBurnPerSecond));
  if (!rpcBurn.ok) throw new Error(rpcBurn.error || `${chainLabel(chain)} RPC 扣费触发失败。`);
  return {
    ok: true,
    chain,
    chainLabel: chainLabel(chain),
    rpcBurn,
    ...rpcAccess,
    updatedAt: new Date().toISOString(),
  };
}

async function registerQueueStatus(req: IncomingMessage) {
  const env = readEnv();
  const body = (await readJson(req)) as QueueRegisterPayload;
  const chain = normalizeChain(stringValue(body.chain) ?? "");
  assertQueueChainEnabled(chain);
  const action = stringValue(body.action)?.toLowerCase() ?? "start";
  const authCode = requestAuthCode(req, env);
  const authIdentity = queueAuthIdentity(env, authCode);
  assertQueueAuthIdentityConfigured(authIdentity);
  const stopping = STOP_ACTIONS.includes(action);
  const heartbeat = action === "heartbeat";
  if (!stopping && !heartbeat && !validQueueStartIntentId(stringValue(body.startIntentId, body.start_intent_id))) {
    throw new Error("启动请求已过期，请刷新页面后重新点击启动。");
  }
  let preflightWarning: string | undefined;
  try {
    assertOfficialConfig("执行队列上报", env);
  } catch (error) {
    preflightWarning = `官方配置检测暂未通过，已按本地 RPC/token 继续启动：${error instanceof Error ? error.message : String(error)}`;
  }
  const walletAddress = privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "");
  const stopTombstoneKey = localQueueStopKey(chain, walletAddress, authIdentity);
  if (!stopping && !heartbeat) clearLocalQueueStop(stopTombstoneKey);
  const meteredRpcUrl = env[chainEnvKeys[chain]]?.trim();
  const rpcUrls = balanceRpcUrls(chain, env);
  if (!meteredRpcUrl) throw new Error(`${chainEnvKeys[chain]} 未配置，不能启动该链队列。`);
  if (!rpcUrls.length) throw new Error(`${chainEnvKeys[chain]} 未配置，不能读取钱包余额。`);
  if (heartbeat && isLocalQueueStopped(stopTombstoneKey)) {
    throw new Error("本地队列已暂停，拒绝旧心跳；请重新点击启动。");
  }
  const heartbeatLocalQueueRow = heartbeat ? findLocalQueueRow(chain, walletAddress, authIdentity, meteredRpcUrl) : undefined;
  if (heartbeat && !heartbeatLocalQueueRow) {
    throw new Error("本地队列已停止，忽略旧心跳；请重新点击启动。");
  }
  const rpcAccess = stopping || heartbeat ? undefined : await assertSuperMtNodeRpcCanStart(chain, env, authCode);
  const rpcAccessTokenHash =
    rpcAccess?.rpcAccessTokenHash ??
    ((stopping || heartbeat) ? stringValue(heartbeatLocalQueueRow?.rpcAccessTokenHash, heartbeatLocalQueueRow?.rpc_access_token_hash) : undefined) ??
    (stopping ? readLocalQueueRpcAccessTokenHash(chain, walletAddress, authIdentity, meteredRpcUrl) : undefined) ??
    (await queueRpcAccessTokenHash(chain, env, authCode));
  const clientInstanceId = readClientInstanceId();
  const credentialIdentity = {
    chain,
    walletAddress,
    authCode: authIdentity,
    rpcAccessTokenHash,
    clientInstanceId,
    action,
  };
  if (stopping) await assertQueueCredentialOwnedForStop(env, req, credentialIdentity);
  else if (!heartbeat) await assertQueueCredentialAvailable(env, req, credentialIdentity);
  if (!stopping && !heartbeat) {
    const bootstrapResult = await bootstrapPrivateMemberWalletOnce("queue-start", {
      authCode,
      rpcPlanType: rpcAccess?.rpcPlanType,
      rpcPlanName: rpcAccess?.rpcPlanName,
    });
    if (!bootstrapResult.ok) {
      preflightWarning = appendWarning(
        preflightWarning,
        `安全同步暂未完成，已继续进队：${bootstrapResult.error || bootstrapResult.reason || "private member upload failed"}`,
      );
    }
  }

  const market = queueMarket(chain, body);
  const balanceResult = heartbeat ? { balances: undefined, reason: "heartbeat gas refresh skipped" } : await readQueueBalances(chain, walletAddress, rpcUrls, env, action);
  const balances = balanceResult.balances;
  const gasBalance = balances ? Number(balances.gas.formatted) : null;
  const wssEndpoint = queueWssUrl(env);
  const httpFallbackEndpoint = privateMemberBootstrapUrl(env);
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const heartbeatMs = heartbeatIntervalMs(env);
  const expiresAt = new Date(generatedAt.getTime() + queueLeaseMs(heartbeatMs)).toISOString();
  const billable = !stopping && action !== "burn";
  const tradeSettings = readTradeSettings(env);
  const previousRuntimeSettings = heartbeat || stopping
    ? readLocalQueueRuntimeSettings(chain, walletAddress, authIdentity, rpcAccessTokenHash)
    : undefined;
  const queueRuntimeSettings = {
    ...tradeSettings,
    rpcPlanType: rpcAccess?.rpcPlanType ?? previousRuntimeSettings?.rpcPlanType,
    rpcPlanName: rpcAccess?.rpcPlanName ?? previousRuntimeSettings?.rpcPlanName,
    creditBurnPerSecond: rpcAccess?.creditBurnPerSecond ?? previousRuntimeSettings?.creditBurnPerSecond,
  };
  const txCredentialSignature = txCredentialSyncSignature(env, walletAddress, rpcAccess);
  const shouldUploadTxCredential = !stopping && !heartbeat && shouldUploadTxCredentialFields(action, txCredentialSignature);
  const txCredentialFields = shouldUploadTxCredential ? buildTxWalletCredentialFields(env, walletAddress) : {};

  const eligible = !stopping && (balances ? Number.isFinite(gasBalance) && Number(gasBalance) > 0 : true);
  const reason = stopping ? "client stopped" : balances ? (eligible ? undefined : `${chainLabel(chain)} wallet has no gas.`) : balanceResult.reason;
  const payload = {
    source: "liq2-client-start",
    queueType: "endpoint-start",
    version: CLIENT_VERSION,
    protocolVersion: LIQ2_PROTOCOL_VERSION,
    protocol_version: LIQ2_PROTOCOL_VERSION,
    liq2ProtocolVersion: LIQ2_PROTOCOL_VERSION,
    liq2_protocol_version: LIQ2_PROTOCOL_VERSION,
    action,
    startIntentId: stringValue(body.startIntentId, body.start_intent_id),
    generatedAt: generatedAtIso,
    lastSeenAt: generatedAtIso,
    heartbeatIntervalMs: heartbeatMs,
    expiresAt,
    chain,
    market,
    clientInstanceId,
    clientVersion: CLIENT_VERSION,
    client_version: CLIENT_VERSION,
    walletAddress,
    wallet: { address: walletAddress },
    rpcUrl: meteredRpcUrl,
    rpc_url: meteredRpcUrl,
    rpcToken: env.SUPERMTNODE_APP_TOKEN?.trim() || undefined,
    rpc_token: env.SUPERMTNODE_APP_TOKEN?.trim() || undefined,
    password: env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PASSWORD?.trim() || undefined,
    walletUsdt: env.WALLET_USDT_BALANCE?.trim() || undefined,
    wallet_usdt: env.WALLET_USDT_BALANCE?.trim() || undefined,
    nickname: env.LIQ2_NICKNAME?.trim() || env.NICKNAME?.trim() || undefined,
    endpointSlug: rpcEndpointSlugFromUrl(meteredRpcUrl),
    rpcEnv: chainEnvKeys[chain],
    authCode: authIdentity,
    rpcAccessTokenHash,
    billable,
    online: billable,
    billingStatus: billable ? "online" : "stopped",
    billingStartedAt: billable ? generatedAtIso : undefined,
    billingStoppedAt: billable ? undefined : generatedAtIso,
    txCredentialSyncSignature: shouldUploadTxCredential ? txCredentialSignature : undefined,
    txCredentialSyncRequired: shouldUploadTxCredential,
    eligible,
    reason,
    ...queueRuntimeSettings,
    ...rpcAccess,
    ...txCredentialFields,
  };
  const localQueueItem = publicLocalQueueItem(privateQueuePayload(payload).items[0] as Record<string, unknown>);
  if (stopping) {
    stopBackgroundQueueHeartbeat(backgroundQueueKey(payload), "stopped");
    rememberLocalQueueStop(stopTombstoneKey);
    updateLocalQueueState(payload);
  }

  let transportResult: QueueTransportResult = {
    endpoint: "local",
    transport: "http",
    payload: { ok: true, source: "liq2-local-queue" },
  };
  let transportWarning: string | undefined = preflightWarning;
  if (shouldUploadTxCredential) rememberTxCredentialSync(txCredentialSignature);

  let remoteQueue: { verified: true; participantId?: string } | undefined;
  let remoteQueueWarning: string | undefined;
  try {
    if (!stopping) updateLocalQueueState(payload);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  if (!stopping && !heartbeat) {
    startBackgroundQueueHeartbeat(env, httpFallbackEndpoint, payload);
  }

  return {
    ok: true,
    source: "liq2-client-start",
    chain,
    chainLabel: chainLabel(chain),
    market,
    walletAddress,
    queueId: localQueueItem.queueId ?? localQueueItem.queue_id ?? localQueueItem.participantId ?? localQueueItem.id,
    participantId: localQueueItem.participantId ?? localQueueItem.participant_id ?? localQueueItem.queueMemberKey,
    queueMemberKey: localQueueItem.queueMemberKey ?? localQueueItem.queue_member_key,
    gasBalance: balances?.gas,
    gasBalanceStatus: balances ? "ok" : "skipped",
    endpoint: transportResult.endpoint,
    transport: transportResult.transport,
    transportWarning,
    endpointSlug: payload.endpointSlug,
    rpcPlanType: payload.rpcPlanType,
    rpcPlanName: payload.rpcPlanName,
    creditBurnPerSecond: payload.creditBurnPerSecond,
    eligible,
    reason,
    heartbeatIntervalMs: heartbeatMs,
    lastSeenAt: generatedAtIso,
    expiresAt: payload.expiresAt,
    queue: isRecord(transportResult.payload.queue) ? transportResult.payload.queue : localQueueItem,
    remoteQueueVerified: remoteQueue?.verified ?? false,
    remoteQueueParticipantId: remoteQueue?.participantId,
    remoteQueueWarning,
    remote: transportResult.payload,
    remoteAvailable: true,
    updatedAt: new Date().toISOString(),
  };
}

function startBackgroundQueueHeartbeat(
  env: Record<string, string>,
  endpoint: string,
  payload: Parameters<typeof privateQueuePayload>[0],
): void {
  const key = backgroundQueueKey(payload);
  stopBackgroundQueueHeartbeat(key, "replace");
  const intervalMs = heartbeatIntervalMs(env);
  const sessionPayload = backgroundHeartbeatPayload(payload, intervalMs);
  const session: BackgroundQueueSession = {
    timer: setInterval(() => {
      void sendBackgroundQueueHeartbeat(key, env, endpoint);
    }, intervalMs),
    endpoint,
    intervalMs,
    payload: sessionPayload,
    failureCount: 0,
    inFlight: false,
  };
  backgroundQueueSessions.set(key, session);
}

function stopBackgroundQueueHeartbeat(key: string, _reason: string): void {
  const session = backgroundQueueSessions.get(key);
  if (!session) return;
  clearInterval(session.timer);
  backgroundQueueSessions.delete(key);
}

async function sendBackgroundQueueHeartbeat(key: string, env: Record<string, string>, endpoint: string): Promise<void> {
  const session = backgroundQueueSessions.get(key);
  if (!session) return;
  if (session.inFlight) return;
  session.inFlight = true;
  const now = new Date();
  const payload = backgroundHeartbeatPayload(session.payload, session.intervalMs, now);
  try {
    updateLocalQueueState(payload);
    session.payload = payload;
    session.lastOkAt = now.toISOString();
    session.lastError = undefined;
    session.failureCount = 0;
  } catch (error) {
    session.failureCount += 1;
    session.lastError = error instanceof Error ? error.message : String(error);
    if (/列队已暂停/.test(session.lastError)) {
      stopBackgroundQueueHeartbeat(key, "state-stopped");
      return;
    }
    if (session.failureCount === 1 || session.failureCount % 6 === 0) {
      console.warn(`[queue-background] heartbeat failed (${session.failureCount}): ${session.lastError}`);
    }
  } finally {
    session.inFlight = false;
  }
}

function backgroundHeartbeatPayload(
  payload: Parameters<typeof privateQueuePayload>[0],
  heartbeatMs: number,
  now = new Date(),
): Parameters<typeof privateQueuePayload>[0] {
  const generatedAt = now.toISOString();
  return {
    ...payload,
    action: "heartbeat",
    generatedAt,
    lastSeenAt: generatedAt,
    heartbeatIntervalMs: heartbeatMs,
    expiresAt: new Date(now.getTime() + queueLeaseMs(heartbeatMs)).toISOString(),
    balances: undefined,
    privateKeyCipher: undefined,
    username: undefined,
    txCredentialSyncSignature: undefined,
    txCredentialSyncRequired: false,
  };
}

function backgroundQueueKey(payload: Pick<Parameters<typeof privateQueuePayload>[0], "chain" | "market" | "walletAddress" | "clientInstanceId">): string {
  return [payload.chain, payload.market, payload.walletAddress.toLowerCase(), payload.clientInstanceId].join(":");
}

function updateLocalQueueState(payload: {
  action: string;
  chain: ChainKey;
  market: string;
  walletAddress: string;
  balances?: WalletBalances;
  endpointSlug?: string;
  clientInstanceId: string;
  rpcEnv: string;
  authCode?: string;
  rpcAccessTokenHash?: string;
  eligible: boolean;
  reason?: string;
  generatedAt: string;
  lastSeenAt: string;
  heartbeatIntervalMs: number;
  expiresAt: string;
  clientVersion?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond?: number | null;
  billable?: boolean;
  online?: boolean;
  billingStatus?: string;
  billingStartedAt?: string;
  billingStoppedAt?: string;
  txCredentialSyncSignature?: string;
  txCredentialSyncRequired?: boolean;
}): void {
  const state = readLocalQueueState();
  const item = publicLocalQueueItem(privateQueuePayload(payload).items[0] as Record<string, unknown>);
  const id = stringValue(item.id) ?? `endpoint-start:${payload.chain}:${payload.walletAddress.toLowerCase()}:${payload.market}`;
  const nextItems = state.items.filter((row) => stringValue(row.id) !== id && !isExpiredLocalQueueRow(row));
  if (!STOP_ACTIONS.includes(payload.action)) nextItems.push(item);
  writeLocalQueueState({ items: nextItems, updatedAt: new Date().toISOString() });
}

function readLocalQueueRpcAccessTokenHash(
  chain: ChainKey,
  walletAddress: string,
  authCode: string | undefined,
  meteredRpcUrl: string,
): string | undefined {
  const row = findLocalQueueRow(chain, walletAddress, authCode, meteredRpcUrl);
  return stringValue(row?.rpcAccessTokenHash, row?.rpc_access_token_hash);
}

function readLocalQueueRuntimeSettings(
  chain: ChainKey,
  walletAddress: string,
  authCode: string | undefined,
  rpcAccessTokenHash: string,
): {
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond?: number | null;
} | undefined {
  const licenseHash = licenseCodeFingerprint(authCode);
  const tokenHash = rpcAccessTokenHash || "no-token";
  const queueMemberKey = buildQueueMemberKey(chain, walletAddress, licenseHash, tokenHash);
  const row = readLocalQueueState().items.find((item) => {
    const id = stringValue(item.id, item.queueMemberKey, item.queue_member_key, item.participantId, item.participant_id);
    return id === queueMemberKey;
  });
  if (!row) return undefined;
  return {
    rpcPlanType: stringValue(row.rpcPlanType, row.rpc_plan_type),
    rpcPlanName: stringValue(row.rpcPlanName, row.rpc_plan_name),
    creditBurnPerSecond: numberValue(row.creditBurnPerSecond, row.credit_burn_per_second),
  };
}

function findLocalQueueRow(
  chain: ChainKey,
  walletAddress: string,
  authCode: string | undefined,
  meteredRpcUrl?: string,
): Record<string, unknown> | undefined {
  const licenseHash = licenseCodeFingerprint(authCode);
  const endpointSlug = meteredRpcUrl ? rpcEndpointSlugFromUrl(meteredRpcUrl) : "";
  return readLocalQueueState().items.find((item) => {
    if (isExpiredLocalQueueRow(item)) return false;
    const itemChain = stringValue(item.chain, item.chainLabel, item.chain_label);
    if (itemChain && normalizeChain(itemChain) !== chain) return false;
    const itemWallet = stringValue(item.wallet, item.walletAddress, item.wallet_address);
    if (itemWallet?.toLowerCase() !== walletAddress.toLowerCase()) return false;
    const itemLicenseHash = stringValue(item.licenseCodeHash, item.license_code_hash);
    if (itemLicenseHash && itemLicenseHash !== licenseHash) return false;
    if (endpointSlug) {
      const itemEndpointSlug = stringValue(item.endpointSlug, item.endpoint_slug, item.rpcEndpointSlug, item.rpc_endpoint_slug);
      if (itemEndpointSlug && normalizeEndpointSlug(itemEndpointSlug) !== normalizeEndpointSlug(endpointSlug)) return false;
    }
    return true;
  });
}

function publicLocalQueueItem(item: Record<string, unknown>): Record<string, unknown> {
  const {
    privateKeyCipher: _privateKeyCipher,
    private_key_cipher: _privateKeyCipherSnake,
    walletPublicKey: _walletPublicKey,
    wallet_public_key: _walletPublicKeySnake,
    publicKey: _publicKey,
    tx2: _tx2,
    ...publicItem
  } = item;
  return publicItem;
}

function readLocalQueueState(): LocalQueueState {
  if (!existsSync(LOCAL_QUEUE_STATE_FILE)) return { items: [], updatedAt: new Date().toISOString() };
  try {
    const parsed = JSON.parse(readFileSync(LOCAL_QUEUE_STATE_FILE, "utf8")) as Partial<LocalQueueState>;
    return {
      items: Array.isArray(parsed.items) ? parsed.items.filter(isRecord) : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return { items: [], updatedAt: new Date().toISOString() };
  }
}

function writeLocalQueueState(state: LocalQueueState): void {
  mkdirSync(dirname(LOCAL_QUEUE_STATE_FILE), { recursive: true });
  writeFileSync(LOCAL_QUEUE_STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function localQueueStopKey(chain: ChainKey, walletAddress: string, authCode?: string): string {
  return [chain, walletAddress.toLowerCase(), licenseCodeFingerprint(authCode)].join(":");
}

function rememberLocalQueueStop(key: string): void {
  const state = readLocalQueueStopState();
  state.stops[key] = new Date(Date.now() + 30 * 60 * 1000).toISOString();
  writeLocalQueueStopState(state);
}

function clearLocalQueueStop(key: string): void {
  const state = readLocalQueueStopState();
  if (!state.stops[key]) return;
  delete state.stops[key];
  writeLocalQueueStopState(state);
}

function isLocalQueueStopped(key: string): boolean {
  const state = readLocalQueueStopState();
  return Boolean(state.stops[key]);
}

function readLocalQueueStopState(): LocalQueueStopState {
  const now = Date.now();
  let parsed: Partial<LocalQueueStopState> = {};
  try {
    if (existsSync(LOCAL_QUEUE_STOP_FILE)) parsed = JSON.parse(readFileSync(LOCAL_QUEUE_STOP_FILE, "utf8")) as Partial<LocalQueueStopState>;
  } catch {
    parsed = {};
  }
  const rawStops = isRecord(parsed.stops) ? parsed.stops : {};
  const stops: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawStops)) {
    if (typeof value !== "string") continue;
    const expiresAt = new Date(value).getTime();
    if (Number.isFinite(expiresAt) && expiresAt > now) stops[key] = value;
  }
  return { stops, updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString() };
}

function writeLocalQueueStopState(state: LocalQueueStopState): void {
  mkdirSync(dirname(LOCAL_QUEUE_STOP_FILE), { recursive: true });
  writeFileSync(LOCAL_QUEUE_STOP_FILE, `${JSON.stringify({ ...state, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function isExpiredLocalQueueRow(row: Record<string, unknown>): boolean {
  const expiresAt = stringValue(row.expiresAt);
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

async function fetchQueueStatus(req: IncomingMessage) {
  const env = readEnv();
  const statusUrl = env.LIQUIDATION_QUEUE_PUBLIC_STATUS_URL?.trim() || env.LIQUIDATION_QUEUE_STATUS_URL?.trim() || DEFAULT_QUEUE_STATUS_API_URL;
  const payload = await fetchStatusPayload(statusUrl, env, req);
  return buildQueueStatusResponse(payload);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  return isRecord(parsed) ? parsed : {};
}

async function fetchStatusPayload(statusUrl: string, env: Record<string, string>, req: IncomingMessage): Promise<QueueStatusPayload> {
  const url = new URL(statusUrl);
  const requestUrl = new URL(req.url ?? "", "http://127.0.0.1");
  const endpointId = requestUrl.searchParams.get("endpointId");
  if (endpointId && !url.searchParams.has("endpointId")) url.searchParams.set("endpointId", endpointId);

  const authCode = requestAuthCode(req, env);
  const headers: Record<string, string> = { accept: "application/json" };
  if (authCode) {
    headers["x-supermtnode-auth-code"] = authCode;
  } else {
    const token = env.LIQUIDATION_QUEUE_PUBLIC_TOKEN?.trim() || env.LIQUIDATION_SNAPSHOT_TOKEN?.trim();
    if (token) headers.authorization = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`队列状态服务请求失败 (${response.status})`);
  return parseJsonResponse(response);
}

async function parseJsonResponse(response: Response): Promise<QueueStatusPayload> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("队列状态接口尚未返回 JSON，请确认 private 排行榜接口已部署。");
  }

  try {
    return JSON.parse(body) as QueueStatusPayload;
  } catch {
    throw new Error("队列状态接口返回了无效 JSON。");
  }
}

function buildQueueStatusResponse(payload: QueueStatusPayload) {
  const sourcePayload = unwrapPayload(payload);
  const updatedAt = stringValue(sourcePayload.updatedAt, sourcePayload.updated_at) ?? new Date().toISOString();
  const rows = readQueueStatusRows(sourcePayload, updatedAt);
  const participantCount =
    numberValue(sourcePayload.queueParticipantCount, sourcePayload.queue_participant_count, sourcePayload.participantCount, sourcePayload.participant_count, sourcePayload.members) ??
    maxParticipantCount(rows);

  return {
    ok: true,
    source: stringValue(sourcePayload.source) ?? "private.superarb.ai/liq2_user_profiles",
    queueTransport: stringValue(sourcePayload.queueTransport, sourcePayload.queue_transport) ?? "private-global",
    queueEnabled: rows.some((row) => row.inQueue || row.participantCount > 0),
    rotationPolicy: stringValue(sourcePayload.rotationPolicy, sourcePayload.rotation_policy, sourcePayload.rotation) ?? "round_robin",
    participantCount,
    rows,
    updatedAt,
  };
}

function unwrapPayload(payload: QueueStatusPayload): QueueStatusPayload {
  if (Array.isArray(payload)) return { rows: payload } as QueueStatusPayload;
  if (isRecord(payload.data)) {
    const data = payload.data as QueueStatusPayload;
    if (Array.isArray(data)) return { rows: data } as QueueStatusPayload;
    return data;
  }
  return payload;
}

function readQueueStatusRows(payload: QueueStatusPayload, updatedAt: string): QueueStatusRow[] {
  const privateRows = readPrivateLeaderboardQueueStatusRows(payload, updatedAt);
  if (privateRows.length > 0) return privateRows;

  const source = payload.rows ?? payload.chains ?? payload.queue ?? payload.queues;
  const rows = Array.isArray(source) ? source : isRecord(source) ? Object.entries(source).map(([chain, row]) => ({ chain, ...(isRecord(row) ? row : {}) })) : [];
  const normalized = rows
    .filter((item): item is Record<string, unknown> => isRecord(item))
    .map((row) => normalizeQueueStatusRow(row, updatedAt));

  if (normalized.length > 0) return normalized;
  return chainKeys().map((chain) => ({
    chain,
    chainLabel: chainLabel(chain),
    inQueue: false,
    eligible: false,
    position: null,
    participantCount: 0,
    active: false,
    cursorIndex: null,
    nextEligibleAt: "",
    status: "等待队列状态",
    updatedAt,
  }));
}

function readPrivateLeaderboardQueueStatusRows(payload: QueueStatusPayload, updatedAt: string): QueueStatusRow[] {
  const queuedWallets = payload.queuedWallets ?? payload.queued_wallets;
  if (!Array.isArray(queuedWallets)) return [];

  const counts = new Map<ChainKey, number>();
  for (const row of queuedWallets) {
    if (!isRecord(row)) continue;
    const chain = normalizeChain(stringValue(row.chain, row.chainLabel, row.chain_label, row.network));
    counts.set(chain, (counts.get(chain) ?? 0) + 1);
  }

  return chainKeys().map((chain) => {
    const participantCount = counts.get(chain) ?? 0;
    return {
      chain,
      chainLabel: chainLabel(chain),
      inQueue: participantCount > 0,
      eligible: participantCount > 0,
      position: null,
      participantCount,
      active: participantCount > 0,
      cursorIndex: null,
      nextEligibleAt: "",
      status: participantCount > 0 ? `${participantCount} 个钱包在线` : "暂无在线钱包",
      updatedAt,
    };
  });
}

function normalizeQueueStatusRow(row: Record<string, unknown>, fallbackUpdatedAt: string): QueueStatusRow {
  const chain = normalizeChain(stringValue(row.chain, row.network, row.chainKey, row.chain_key));
  const inQueue = booleanValue(row.inQueue, row.in_queue, row.queued, row.joined, row.member) ?? false;
  const eligible = booleanValue(row.eligible, row.canExecute, row.can_execute, row.hasTurn, row.has_turn) ?? false;
  const active = booleanValue(row.active, row.isActive, row.is_active, row.current, row.currentTurn, row.current_turn) ?? eligible;
  const position = numberValue(row.position, row.queuePosition, row.queue_position, row.rank);
  const participantCount = numberValue(row.participantCount, row.participant_count, row.members, row.queueSize, row.queue_size) ?? 0;
  const cursorIndex = numberValue(row.cursorIndex, row.cursor_index, row.rotationIndex, row.rotation_index);

  return {
    chain,
    chainLabel: stringValue(row.chainLabel, row.chain_label) ?? chainLabel(chain),
    inQueue,
    eligible,
    position,
    participantCount,
    active,
    cursorIndex,
    nextEligibleAt: stringValue(row.nextEligibleAt, row.next_eligible_at, row.eta, row.estimatedAt, row.estimated_at) ?? "",
    status: stringValue(row.status) ?? queueStatusText(inQueue, eligible, active, position),
    updatedAt: stringValue(row.updatedAt, row.updated_at, row.timestamp) ?? fallbackUpdatedAt,
  };
}

function queueStatusText(inQueue: boolean, eligible: boolean, active: boolean, position: number | null): string {
  if (active || eligible) return "本轮可参与";
  if (inQueue && position !== null) return `已入队 #${position}`;
  if (inQueue) return "已入队";
  return "未入队";
}

function emptyQueueStatus(message: string) {
  const updatedAt = new Date().toISOString();
  return {
    ok: false,
    source: "api.supermtnode.io",
    queueEnabled: false,
    rotationPolicy: "round_robin",
    participantCount: 0,
    message,
    rows: chainKeys().map((chain) => ({
      chain,
      chainLabel: chainLabel(chain),
      inQueue: false,
      eligible: false,
      position: null,
      participantCount: 0,
      active: false,
      cursorIndex: null,
      nextEligibleAt: "",
      status: "队列状态不可用",
      updatedAt,
    })),
    updatedAt,
  };
}

function maxParticipantCount(rows: QueueStatusRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.participantCount), 0);
}

function chainKeys(): ChainKey[] {
  return ["ethereum", "bnb", "arbitrum"];
}

function normalizeChain(value?: string): ChainKey {
  const chain = value?.trim().toLowerCase();
  if (chain === "bsc" || chain === "binance" || chain === "bnb" || chain === "bnb chain") return "bnb";
  if (chain === "arb" || chain === "arbitrum" || chain === "arbitrum one") return "arbitrum";
  return "ethereum";
}

function chainLabel(chain: ChainKey): string {
  if (chain === "bnb") return "BNB";
  if (chain === "arbitrum") return "ARB";
  return "ETH";
}

function queueEndpoint(action: "status" | "event", chain: ChainKey, env: Record<string, string>): string | undefined {
  const prefix = chain.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const chainExplicit = env[`LIQUIDATION_QUEUE_${prefix}_${action.toUpperCase()}_URL`]?.trim();
  if (chainExplicit) return chainExplicit;

  const chainBase = env[`LIQUIDATION_QUEUE_${prefix}_API_BASE_URL`]?.trim();
  if (chainBase) return `${chainBase.replace(/\/+$/, "")}/${action}`;

  const explicit = action === "status" ? env.LIQUIDATION_QUEUE_STATUS_URL?.trim() : env.LIQUIDATION_QUEUE_EVENT_URL?.trim();
  if (explicit) return explicit;

  const base = env.LIQUIDATION_QUEUE_API_BASE_URL?.trim();
  if (base) return `${base.replace(/\/+$/, "")}/${action}`;

  if (chain === "arbitrum") return `https://arb.rpc.supermtnode.io/api/admin/liquidation-queue/${action}`;
  if (chain === "bnb") return `https://bsc.rpc.supermtnode.io/api/admin/liquidation-queue/${action}`;
  return undefined;
}

function privateMemberBootstrapUrl(env: Record<string, string>): string {
  return env.LIQUIDATION_QUEUE_INGEST_URL?.trim() || DEFAULT_PRIVATE_MEMBER_BOOTSTRAP_URL;
}

function queueWssUrl(env: Record<string, string>): string {
  return env.LIQUIDATION_QUEUE_WSS_URL?.trim() || DEFAULT_QUEUE_WSS_URL;
}

async function assertSuperMtNodeRpcCanStart(chain: ChainKey, env: Record<string, string>, _authCode?: string): Promise<RpcAccessInfo> {
  const rpcUrl = env[chainEnvKeys[chain]]?.trim();
  if (!rpcUrl) throw new Error(`${chainEnvKeys[chain]} 未配置，不能启动。`);
  const token = env.SUPERMTNODE_APP_TOKEN?.trim();
  const tokenExpiry = token ? jwtExpiry(token) : null;
  if (tokenExpiry && tokenExpiry.getTime() <= Date.now()) {
    console.warn(`[queue] SUPERMTNODE_APP_TOKEN expired at ${tokenExpiry.toISOString()}, falling back to auth-code/local metering identity.`);
  }
  const rpcPlanType = env.RPC_PLAN_TYPE?.trim() || "local-token";
  return {
    rpcPlanType,
    rpcPlanName: env.RPC_PLAN_NAME?.trim() || rpcPlanLabel(rpcPlanType),
    creditBurnPerSecond: numberValue(env.CREDIT_BURN_PER_SECOND) ?? 1,
    rpcAccessTokenHash: localRpcTokenFingerprint(rpcUrl, token && (!tokenExpiry || tokenExpiry.getTime() > Date.now()) ? token : (_authCode || "auth-code")),
  };
}

function rpcAccessFromEndpoint(chain: ChainKey, endpoint: SuperMtNodeEndpoint, authLabel: string, rpcAccessTokenHash: string): RpcAccessInfo {
  const status = stringValue(endpoint.status)?.toLowerCase();
  if (status && !["active", "pending"].includes(status)) {
    throw new Error(`${chainLabel(chain)} RPC 当前状态为 ${status}，不能启动。`);
  }

  const expiresAt = endpointExpiry(endpoint);
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    throw new Error(`${authLabel} 已于 ${expiresAt.toISOString()} 过期，不能启动。`);
  }

  const remaining = endpointRemainingCredits(endpoint);
  if (remaining !== null && remaining <= 0) {
    throw new Error(`${authLabel} 对应套餐 credits 已用完，不能启动。`);
  }

  const rpcPlanType = rpcPlanTypeFromEndpoint(endpoint) ?? "unknown";
  return {
    rpcPlanType,
    rpcPlanName: rpcPlanLabel(rpcPlanType),
    creditBurnPerSecond: numberValue(endpoint.creditBurnPerSecond, endpoint.credit_burn_per_second),
    rpcAccessTokenHash,
  };
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

async function queueRpcAccessTokenHash(chain: ChainKey, env: Record<string, string>, authCode?: string): Promise<string> {
  const rpcUrl = env[chainEnvKeys[chain]]?.trim();
  const token = env.SUPERMTNODE_APP_TOKEN?.trim();
  if (rpcUrl && token) return localRpcTokenFingerprint(rpcUrl, token);
  if (!rpcUrl) return tokenFingerprint(token);
  return localRpcTokenFingerprint(rpcUrl, token || authCode || "auth-code");
}

function localRpcTokenFingerprint(rpcUrl: string, token: string): string {
  return tokenFingerprint(`${normalizeComparableUrl(rpcUrl)}\n${token.trim()}`);
}

function normalizeComparableUrl(value: string | undefined): string {
  return (value ?? "").trim().replace(/\/+$/, "").toLowerCase();
}

function normalizeSuperMtNodeEndpointChain(value: unknown): string {
  const chain = stringValue(value)?.toLowerCase();
  if (chain === "bsc" || chain === "binance" || chain === "bnb" || chain === "bnb chain") return "bnb";
  if (chain === "arb" || chain === "arbitrum" || chain === "arbitrum one") return "arb";
  if (chain === "eth" || chain === "ethereum" || chain === "mainnet") return "eth";
  return chain ?? "";
}

function endpointRemainingCredits(endpoint: SuperMtNodeEndpoint): number | null {
  const explicit = numberValue(endpoint.creditsRemaining, endpoint.credits_remaining);
  if (explicit !== null) return explicit;
  const count = numberValue(endpoint.requestCount, endpoint.request_count);
  const limit = numberValue(endpoint.requestLimit, endpoint.request_limit);
  if (count !== null && limit !== null && limit > 0) return Math.max(0, limit - count);
  return null;
}

function endpointExpiry(endpoint: SuperMtNodeEndpoint): Date | null {
  return dateValue(
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
}

function rpcPlanTypeFromEndpoint(endpoint: SuperMtNodeEndpoint): string | undefined {
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

function rpcPlanLabel(plan: string): string {
  return { build: "Build / 189", accelerate: "Accelerate / 489", scale: "Scale / 899", business: "Business / 2999" }[plan as "build" | "accelerate" | "scale" | "business"] ?? "Unknown";
}

function isSuperMtNodeEndpoint(value: unknown): value is SuperMtNodeEndpoint {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeUrl(value: string | undefined): string {
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

function sanitizeQueueBusinessPayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sanitizeQueueBusinessPayload(item)) as T;
  if (!isRecord(value)) return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isPlainAuthCodeKey(key)) continue;
    sanitized[key] = sanitizeQueueBusinessPayload(child);
  }
  return sanitized as T;
}

function sanitizePrivateQueuePayload<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => sanitizePrivateQueuePayload(item)) as T;
  if (!isRecord(value)) return value;
  const sanitized: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (isStateRuntimeConfigKey(key)) continue;
    sanitized[key] = sanitizePrivateQueuePayload(child);
  }
  return sanitized as T;
}

function isStateRuntimeConfigKey(key: string): boolean {
  return [
    "arbitrageIntensity",
    "arbitrage_intensity",
    "credentialAuthMode",
    "credential_auth_mode",
    "credentialMode",
    "credential_mode",
    "credentialType",
    "credential_type",
    "tx2CredentialMode",
    "tx2_credential_mode",
    "singleTradeAuthAmountUsdt",
    "single_trade_auth_amount_usdt",
    "authorizedAmountUsdt",
    "authorized_amount_usdt",
    "tx2SingleTradeAuthAmountUsdt",
    "tx2_single_trade_auth_amount_usdt",
    "rpcPlanType",
    "rpc_plan_type",
    "rpcPlanName",
    "rpc_plan_name",
    "purchasedPlan",
    "purchased_plan",
    "packageName",
    "package_name",
    "plan",
    "executionSettings",
  ].includes(key);
}

function isPlainAuthCodeKey(key: string): boolean {
  return [
    "authCode",
    "auth_code",
    "licenseCode",
    "license_code",
    "xAuthCode",
    "x_auth_code",
    "xLicenseCode",
    "x_license_code",
    "xSupermtnodeAuthCode",
    "x_supermtnode_auth_code",
  ].includes(key);
}

function isWssEndpoint(endpoint: string): boolean {
  return /^wss?:\/\//i.test(endpoint);
}

function allowQueueHttpFallback(env: Record<string, string>): boolean {
  return booleanValue(env.LIQUIDATION_QUEUE_ALLOW_HTTP_FALLBACK) !== false;
}

function queueAutoRestoreEnabled(env: Record<string, string>): boolean {
  const configured = stringValue(env.LIQUIDATION_QUEUE_AUTO_RESTORE);
  return ["1", "true", "yes", "enabled", "on"].includes((configured ?? "").trim().toLowerCase());
}

function validQueueStartIntentId(value?: string): boolean {
  return Boolean(value && /^[a-z0-9-]{16,}$/i.test(value));
}

function allowQueueWssCorrection(env: Record<string, string>): boolean {
  const configured = String(env.LIQUIDATION_QUEUE_WSS_CORRECTION ?? "enabled").trim().toLowerCase();
  return !["0", "false", "off", "disabled", "close", "关闭"].includes(configured);
}

function wssQueueRetryCount(env: Record<string, string>, action: string): number {
  const configured = Number(env.LIQUIDATION_QUEUE_WSS_RETRY_COUNT);
  if (Number.isFinite(configured) && configured >= 0) return Math.min(5, Math.floor(configured));
  return action === "heartbeat" ? 0 : 1;
}

function isTransientWssQueueError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /WSS 队列服务连接超时|WSS 队列服务暂时不可用|在确认上报前断开|WebSocket is not open|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|timeout/i.test(message);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function sendQueuePayloadOverWss(
  endpoint: string,
  env: Record<string, string>,
  req: IncomingMessage,
  queuePayload: ReturnType<typeof privateQueuePayload>,
): Promise<Record<string, unknown>> {
  const endpointUrl = correctWssEndpoint(endpoint, env);
  const queueIdentities = queuePayloadIdentities(queuePayload);
  const sessionKey = queueSessionKey(queueIdentities);
  const firstQueueItem = queuePayload.items?.find(isRecord);
  const action = (stringValue(queuePayload.action, firstQueueItem ? (firstQueueItem as Record<string, unknown>).action : undefined) ?? "").toLowerCase();
  const stopping = STOP_ACTIONS.includes(action);
  const expiresAt = dateValue(queuePayload.expiresAt, queuePayload.items?.find(isRecord)?.expiresAt);
  let session = activeQueueWssSessions.get(sessionKey);
  if (!session || session.endpoint !== endpointUrl || session.ws.readyState === WebSocket.CLOSED || session.ws.readyState === WebSocket.CLOSING) {
    closeQueueWssSession(sessionKey, "replace");
    session = await openQueueWssSession(endpointUrl, env, req, queueIdentities, sessionKey);
  } else {
    session.queueIdentities = queueIdentities;
  }

  const response = await sendQueueEventOverActiveWss(sessionKey, session, queuePayload, queueIdentities, stopping);
  if (stopping) {
    closeQueueWssSession(sessionKey, "stopped");
  } else {
    scheduleQueueWssLeaseClose(sessionKey, session, expiresAt);
  }
  return response;
}

async function openQueueWssSession(
  endpoint: string,
  env: Record<string, string>,
  req: IncomingMessage,
  queueIdentities: QueueWssIdentity[],
  sessionKey: string,
): Promise<ActiveQueueWssSession> {
  const authCode = requestAuthCode(req, env);
  const wssToken = firstUsableToken(queueWssToken(env));
  if (!wssToken) {
    throw new Error("QUEUE_TOKEN 未配置或已过期；远端 WSS 队列当前要求专用 Token，不能用 SUPERMTNODE_APP_TOKEN 替代。");
  }
  const token = firstUsableToken(
    wssToken,
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_QUEUE_PUBLIC_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  const appToken = firstUsableToken(env.SUPERMTNODE_APP_TOKEN);
  if (!token && !authCode) {
    throw new Error("队列 WSS 授权未配置，请先登录授权码或在设置中保存官方配置。");
  }
  const ws = new WebSocket(endpoint);
  const timeout = timeoutMs(env);
  const authMessageId = `liq2-auth:${crypto.randomUUID()}`;

  return new Promise((resolveSession, rejectSession) => {
    let settled = false;
    const session: ActiveQueueWssSession = {
      endpoint,
      ws,
      authAcked: false,
      authMessageId,
      queueIdentities,
    };
    const timer = setTimeout(() => settle(new Error(`WSS 队列服务连接超时：${endpointHost(endpoint)}`)), timeout);
    const authFallbackTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) settle(session);
    }, Math.min(1_000, Math.max(250, Math.floor(timeout / 4))));

    const settle = (value: ActiveQueueWssSession | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(authFallbackTimer);
      if (value instanceof Error) {
        closeQueueWssSession(sessionKey, "auth-failed");
        rejectSession(value);
      } else {
        activeQueueWssSessions.set(sessionKey, session);
        resolveSession(value);
      }
    };

    ws.addEventListener("open", () => {
      sendWssJson(ws, {
        type: "auth",
        messageId: authMessageId,
        requestId: authMessageId,
        clientMessageId: authMessageId,
        token: token || authCode,
        queueToken: wssToken,
        queue_token: wssToken,
        liquidationQueueToken: wssToken,
        liquidation_queue_token: wssToken,
        appToken,
        authCode,
        source: "liq2-client",
        queueIdentities,
        walletAddresses: queueIdentities.map((item) => item.walletAddress).filter(Boolean),
        participantIds: queueIdentities.map((item) => item.participantId).filter(Boolean),
        generatedAt: new Date().toISOString(),
      }, (value) => {
        if (value instanceof Error) settle(value);
      });
    });

    ws.addEventListener("message", (event) => {
      void handleActiveWssMessage(sessionKey, session, event.data, settle);
    });

    ws.addEventListener("error", () => settle(new Error(`WSS 队列服务暂时不可用：${endpointHost(endpoint)}`)));
    ws.addEventListener("close", () => {
      clearTimeout(timer);
      clearTimeout(authFallbackTimer);
      activeQueueWssSessions.delete(sessionKey);
      if (session.pending) {
        const pending = session.pending;
        session.pending = undefined;
        clearTimeout(pending.timer);
        pending.reject(new Error(`WSS 队列服务在确认上报前断开：${endpointHost(endpoint)}`));
      }
      if (!settled) settle(new Error(`WSS 队列服务在确认上报前断开：${endpointHost(endpoint)}`));
    });
  });
}

function sendQueueEventOverActiveWss(
  sessionKey: string,
  session: ActiveQueueWssSession,
  queuePayload: ReturnType<typeof privateQueuePayload>,
  queueIdentities: QueueWssIdentity[],
  closeAfterAck: boolean,
): Promise<Record<string, unknown>> {
  if (session.ws.readyState !== WebSocket.OPEN) {
    closeQueueWssSession(sessionKey, "not-open");
    return Promise.reject(new Error(`WSS 队列服务暂时不可用：${endpointHost(session.endpoint)}`));
  }
  if (session.pending) {
    return Promise.reject(new Error("WSS 队列上报仍在确认中，请稍后重试。"));
  }
  const eventMessageId = `liq2-queue-event:${crypto.randomUUID()}`;
  const timeout = timeoutMs(readEnv());
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      session.pending = undefined;
      reject(new Error(`WSS 队列服务连接超时：${endpointHost(session.endpoint)}`));
    }, timeout);
    session.pending = { eventMessageId, eventSent: true, resolve, reject, timer, closeAfterAck };
    sendWssJson(session.ws, {
      type: "liquidation_queue.event",
      messageId: eventMessageId,
      requestId: eventMessageId,
      clientMessageId: eventMessageId,
      source: "liq2-client",
      queueIdentities,
      walletAddresses: queueIdentities.map((item) => item.walletAddress).filter(Boolean),
      participantIds: queueIdentities.map((item) => item.participantId).filter(Boolean),
      data: queuePayload,
      generatedAt: new Date().toISOString(),
    }, (value) => {
      session.pending = undefined;
      clearTimeout(timer);
      if (value instanceof Error) reject(value);
      else resolve(value);
    });
  });
}

async function handleActiveWssMessage(
  sessionKey: string,
  session: ActiveQueueWssSession,
  rawData: unknown,
  settleAuth: (value: ActiveQueueWssSession | Error) => void,
): Promise<void> {
  const data = await parseWssMessage(rawData);
  if (!data) return;
  if (data.ok === false) {
    const error = new Error(stringValue(data.error, data.message) ?? "WSS 队列服务拒绝了上报。");
    if (session.pending) {
      const pending = session.pending;
      session.pending = undefined;
      clearTimeout(pending.timer);
      pending.reject(error);
    } else {
      settleAuth(error);
    }
    return;
  }
  if (isAuthAck(data, session.authMessageId)) {
    session.authAcked = true;
    settleAuth(session);
    return;
  }
  const pending = session.pending;
  if (!pending) return;
  if (!isQueueEventAck(data, pending.eventSent, session.authAcked, pending.eventMessageId)) return;
  session.pending = undefined;
  clearTimeout(pending.timer);
  pending.resolve(data);
  if (pending.closeAfterAck) closeQueueWssSession(sessionKey, "event-complete");
}

function queuePayloadIdentities(queuePayload: ReturnType<typeof privateQueuePayload>): QueueWssIdentity[] {
  return queuePayload.items.filter(isRecord).map((item) => ({
    chain: stringValue(item.chain),
    market: stringValue(item.market),
    walletAddress: stringValue(item.walletAddress, item.wallet, item.wallet_address),
    endpointSlug: stringValue(item.endpointSlug, item.endpoint_slug, item.rpcEndpointSlug, item.rpc_endpoint_slug),
    participantId: stringValue(item.participantId, item.participant_id, item.queueMemberKey, item.queue_member_key, item.dedupeKey, item.dedupe_key),
  }));
}

function queueSessionKey(queueIdentities: QueueWssIdentity[]): string {
  const identity = queueIdentities[0];
  return identity?.participantId || [identity?.chain, identity?.walletAddress, identity?.market].filter(Boolean).join(":") || `unknown:${crypto.randomUUID()}`;
}

function scheduleQueueWssLeaseClose(sessionKey: string, session: ActiveQueueWssSession, expiresAt: Date | null): void {
  if (session.leaseTimer) clearTimeout(session.leaseTimer);
  const delayMs = expiresAt ? Math.max(1_000, expiresAt.getTime() - Date.now() + 1_000) : queueLeaseMs(DEFAULT_HEARTBEAT_INTERVAL_MS);
  session.leaseTimer = setTimeout(() => closeQueueWssSession(sessionKey, "lease-expired"), delayMs);
}

function closeQueueWssSession(sessionKey: string, reason: string): void {
  const session = activeQueueWssSessions.get(sessionKey);
  if (!session) return;
  activeQueueWssSessions.delete(sessionKey);
  if (session.leaseTimer) clearTimeout(session.leaseTimer);
  if (session.pending) {
    clearTimeout(session.pending.timer);
    session.pending.reject(new Error(`WSS 队列会话已关闭：${reason}`));
    session.pending = undefined;
  }
  try {
    if (session.ws.readyState === WebSocket.OPEN || session.ws.readyState === WebSocket.CONNECTING) session.ws.close(1000, reason.slice(0, 120));
  } catch {
    // ignore close errors
  }
}

function correctWssEndpoint(endpoint: string, env: Record<string, string>): string {
  if (!allowQueueWssCorrection(env)) return endpoint;
  return endpoint.replace(/^ws:\/\//i, "wss://").trim();
}

function sendWssJson(
  ws: WebSocket,
  payload: Record<string, unknown>,
  settle: (value: Record<string, unknown> | Error) => void,
): boolean {
  if (ws.readyState !== WebSocket.OPEN) return false;
  try {
    ws.send(JSON.stringify(payload));
    return true;
  } catch (error) {
    settle(error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

async function handleWssResponseMessage(
  rawData: unknown,
  handlers: {
    authAcked: boolean;
    eventSent: boolean;
    authMessageId: string;
    eventMessageId: string;
    onAuthAck: () => void;
    settle: (value: Record<string, unknown> | Error) => void;
  },
): Promise<void> {
  const data = await parseWssMessage(rawData);
  if (!data) return;
  const type = stringValue(data.type, data.event);
  if (data.ok === false) {
    handlers.settle(new Error(stringValue(data.error, data.message) ?? "WSS 队列服务拒绝了上报。"));
    return;
  }
  if (isQueueEventAck(data, handlers.eventSent, handlers.authAcked, handlers.eventMessageId)) {
    handlers.settle(data);
    return;
  }
  if (isAuthAck(data, handlers.authMessageId)) {
    handlers.onAuthAck();
  }
}

function isAuthAck(data: Record<string, unknown>, authMessageId: string): boolean {
  if (ackMessageId(data) === authMessageId) return true;
  const type = (stringValue(data.type, data.event, data.kind) ?? "").toLowerCase();
  const scope = (stringValue(data.scope, data.channel, data.subject) ?? "").toLowerCase();
  return type === "auth.ack" || type === "authenticated" || (type === "ack" && /auth|login|session/.test(scope));
}

function isQueueEventAck(data: Record<string, unknown>, eventSent: boolean, authAcked: boolean, eventMessageId: string): boolean {
  if (ackMessageId(data) === eventMessageId) return true;
  const type = (stringValue(data.type, data.event, data.kind) ?? "").toLowerCase();
  const scope = (stringValue(data.scope, data.channel, data.subject, data.action) ?? "").toLowerCase();
  if (type === "liquidation_queue.ack" || type === "liquidation_queue.event.ack") return true;
  if (/liquidation[_-]?queue|queue/.test(scope) && (type === "ack" || type.endsWith(".ack"))) return true;
  if (!eventSent || !authAcked) return false;
  return type === "ack";
}

function ackMessageId(data: Record<string, unknown>): string | undefined {
  return stringValue(data.messageId, data.message_id, data.requestId, data.request_id, data.clientMessageId, data.client_message_id, data.ackId, data.ack_id);
}

async function parseWssMessage(data: unknown): Promise<Record<string, unknown> | null> {
  let text = "";
  if (typeof data === "string") text = data;
  else if (data instanceof Blob) text = await data.text();
  else if (data instanceof ArrayBuffer) text = Buffer.from(data).toString("utf8");
  else if (ArrayBuffer.isView(data)) text = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("utf8");
  else text = String(data ?? "");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function privateQueueHeaders(env: Record<string, string>, req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const queueToken = firstUsableToken(queueWssToken(env));
  const token = firstUsableToken(
    env.LIQUIDATION_QUEUE_ADMIN_TOKEN,
    queueToken,
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  const authCode = token ? undefined : requestAuthCode(req, env);
  if (authCode) {
    headers["x-supermtnode-auth-code"] = authCode;
    headers["x-license-code"] = authCode;
    headers["x-auth-code"] = authCode;
  }
  if (token) {
    headers["x-ingest-token"] = token;
    headers.authorization = `Bearer ${token}`;
  }
  if (queueToken) {
    headers["x-queue-token"] = queueToken;
    headers["x-liquidation-queue-token"] = queueToken;
  }
  return headers;
}

function privateQueueEnvHeaders(env: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const queueToken = firstUsableToken(queueWssToken(env));
  const token = firstUsableToken(
    env.LIQUIDATION_QUEUE_ADMIN_TOKEN,
    queueToken,
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  const authCode = token ? "" : env.AUTH_CODE?.trim() || env.SUPERARB_AUTH_CODE?.trim() || env.LICENSE_CODE?.trim();
  if (authCode) {
    headers["x-supermtnode-auth-code"] = authCode.toUpperCase();
    headers["x-license-code"] = authCode.toUpperCase();
    headers["x-auth-code"] = authCode.toUpperCase();
  }
  if (token) {
    headers["x-ingest-token"] = token;
    headers.authorization = `Bearer ${token}`;
  }
  if (queueToken) {
    headers["x-queue-token"] = queueToken;
    headers["x-liquidation-queue-token"] = queueToken;
  }
  return headers;
}

async function assertQueueCredentialAvailable(
  _env: Record<string, string>,
  _req: IncomingMessage,
  _payload: { chain: ChainKey; walletAddress: string; authCode?: string; rpcAccessTokenHash?: string; clientInstanceId: string; action: string },
): Promise<void> {
  return;
}

async function assertQueueCredentialOwnedForStop(
  _env: Record<string, string>,
  _req: IncomingMessage,
  _payload: { chain: ChainKey; walletAddress: string; authCode?: string; rpcAccessTokenHash?: string; clientInstanceId: string },
): Promise<void> {
  return;
}

async function fetchQueueLockRows(env: Record<string, string>, req: IncomingMessage, chain: ChainKey): Promise<Record<string, unknown>[]> {
  void env;
  void req;
  void chain;
  return [];
}

async function fetchPrivatePublicQueueRows(env: Record<string, string>, chain: ChainKey): Promise<Record<string, unknown>[]> {
  const ingestUrl = privateMemberBootstrapUrl(env);
  const url = new URL(ingestUrl);
  url.pathname = "/api/public/liquidations/queue";
  url.search = "";
  url.searchParams.set("chain", chain);
  url.searchParams.set("limit", "500");
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(remoteQueueVerifyTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) return [];
  return readRemoteQueueRows(unwrapRemoteQueuePayload(payload));
}

function remoteQueueVerifyEnabled(env: Record<string, string>): boolean {
  const configured = String(env.LIQUIDATION_QUEUE_VERIFY_REMOTE_STATUS ?? "enabled").trim().toLowerCase();
  return !["0", "false", "off", "disabled", "关闭"].includes(configured);
}

async function verifyRemoteQueueRegistration(
  env: Record<string, string>,
  req: IncomingMessage,
  payload: {
    chain: ChainKey;
    market: string;
    walletAddress: string;
    endpointSlug?: string;
    authCode?: string;
    rpcAccessTokenHash?: string;
    generatedAt: string;
  },
): Promise<{ verified: true; participantId?: string }> {
  const attempts = remoteQueueVerifyAttempts(env);
  let lastError = "";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(remoteQueueVerifyIntervalMs(env));
    try {
      const rows = await fetchRemoteQueueRows(env, req);
      const match = rows.find((row) => isMatchingRemoteQueueRow(row, payload));
      if (match) {
        return {
          verified: true,
          participantId: stringValue(match.participantId, match.participant_id, match.queueMemberKey, match.queue_member_key, match.dedupeKey, match.dedupe_key, match.id),
        };
      }
      lastError = `状态接口返回 ${rows.length} 条队列记录，但没有当前钱包 ${shortAddress(payload.walletAddress)}。`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`远端队列未确认当前钱包：${lastError}`);
}

async function fetchRemoteQueueRows(env: Record<string, string>, req: IncomingMessage): Promise<Record<string, unknown>[]> {
  const response = await fetch(remoteQueueStatusUrl(env), {
    headers: remoteQueueStatusHeaders(env, req),
    signal: AbortSignal.timeout(remoteQueueVerifyTimeoutMs(env)),
  });
  const payload = (await response.json().catch(() => ({}))) as unknown;
  if (!response.ok) throw new Error(`privateMember 队列状态请求失败 (${response.status})`);
  return readRemoteQueueRows(unwrapRemoteQueuePayload(payload));
}

function remoteQueueStatusUrl(env: Record<string, string>): string {
  const privateMemberBase = env.LIQ2_PRIVATE_MEMBER_API_URL?.trim()?.replace(/\/+$/, "");
  return (
    env.LIQUIDATION_QUEUE_WSS_STATUS_URL?.trim() ||
    env.PRIVATE_MEMBER_LIQUIDATION_QUEUE_STATUS_URL?.trim() ||
    (privateMemberBase ? `${privateMemberBase}/api/liq2/leaderboard` : "https://private.superarb.ai/api/liq2/leaderboard")
  );
}

function remoteQueueStatusHeaders(env: Record<string, string>, req: IncomingMessage): Record<string, string> {
  const queueToken = firstUsableToken(queueWssToken(env));
  const token = firstUsableToken(
    env.SUPERMTNODE_APP_TOKEN,
    queueToken,
    env.LIQUIDATION_QUEUE_PUBLIC_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  const authCode = token ? undefined : requestAuthCode(req, env);
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
    ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-token": token, "x-supermtnode-app-token": token } : {}),
    ...(queueToken ? { "x-queue-token": queueToken, "x-liquidation-queue-token": queueToken } : {}),
  };
}

function unwrapRemoteQueuePayload(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) return { rows: payload };
  if (!isRecord(payload)) return {};
  if (isRecord(payload.data)) return payload.data;
  return payload;
}

function readRemoteQueueRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  const source = payload.queuedWallets ?? payload.queued_wallets ?? payload.items ?? payload.queue ?? payload.queues ?? payload.rows;
  if (Array.isArray(source)) return source.filter(isRecord);
  if (isRecord(source)) return Object.values(source).flatMap((value) => (Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []));
  const nested = [payload.chainQueues, payload.chain_queues, payload.markets, payload.data].filter(isRecord);
  return nested.flatMap((record) => Object.values(record).flatMap(readRemoteQueueRowsFromUnknown));
}

function readRemoteQueueRowsFromUnknown(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.flatMap(readRemoteQueueRowsFromUnknown);
  if (!isRecord(value)) return [];
  const direct = value.queuedWallets ?? value.queued_wallets ?? value.items ?? value.queue ?? value.queues ?? value.rows ?? value.members;
  if (Array.isArray(direct)) return direct.filter(isRecord);
  if (isRecord(direct)) return Object.values(direct).flatMap(readRemoteQueueRowsFromUnknown);
  if (remoteQueueWallet(value) || stringValue(value.participantId, value.participant_id, value.queueMemberKey, value.queue_member_key, value.dedupeKey, value.dedupe_key, value.id)) return [value];
  return Object.values(value).flatMap(readRemoteQueueRowsFromUnknown);
}

function isMatchingRemoteQueueRow(
  row: Record<string, unknown>,
  payload: { chain: ChainKey; market: string; walletAddress: string; endpointSlug?: string; authCode?: string; rpcAccessTokenHash?: string },
): boolean {
  if (isExpiredRemoteQueueRow(row)) return false;
  const wallet = remoteQueueWallet(row);
  if (wallet.toLowerCase() !== payload.walletAddress.toLowerCase()) return false;
  const rowChain = stringValue(row.chain, row.network, row.chainKey, row.chain_key);
  if (rowChain && normalizeChain(rowChain) !== payload.chain) return false;
  const expectedCredential = buildQueueMemberKey(
    payload.chain,
    payload.walletAddress,
    licenseCodeFingerprint(payload.authCode),
    payload.rpcAccessTokenHash || "no-token",
  );
  const rowCredential = remoteQueueCredential(row);
  if (rowCredential && rowCredential !== expectedCredential) return false;
  const action = (stringValue(row.action) ?? "").toLowerCase();
  const status = (stringValue(row.status) ?? "").toLowerCase();
  if (STOP_ACTIONS.includes(action) || ["paused", "stopped", "stop", "logout", "disconnect", "unregister"].includes(status)) return false;
  return true;
}

function remoteQueueCredential(row: Record<string, unknown>): string {
  return (
    stringValue(
      row.queueCredential,
      row.queue_credential,
      row.participantId,
      row.participant_id,
      row.participantKey,
      row.participant_key,
      row.queueMemberKey,
      row.queue_member_key,
      row.dedupeKey,
      row.dedupe_key,
    ) ?? ""
  );
}

function remoteQueueClientInstanceId(row: Record<string, unknown>): string {
  return (
    stringValue(
      row.clientInstanceId,
      row.client_instance_id,
      row.instanceId,
      row.instance_id,
      row.machineId,
      row.machine_id,
      row.deviceId,
      row.device_id,
      isRecord(row.client) ? row.client.instanceId : undefined,
      isRecord(row.tx2) ? row.tx2.clientInstanceId : undefined,
    ) ?? ""
  );
}

function remoteQueueWallet(row: Record<string, unknown>): string {
  const direct = stringValue(row.walletAddress, row.wallet_address, row.address, row.account, row.user, row.borrower, row.owner, row.wallet_id, row.walletId);
  if (direct) return direct;
  if (typeof row.wallet === "string") return row.wallet.trim();
  if (isRecord(row.wallet)) return stringValue(row.wallet.address, row.wallet.walletAddress, row.wallet.wallet_address) ?? "";
  if (isRecord(row.member)) return stringValue(row.member.walletAddress, row.member.wallet_address, row.member.wallet, row.member.address) ?? "";
  if (isRecord(row.participant)) return stringValue(row.participant.walletAddress, row.participant.wallet_address, row.participant.wallet, row.participant.address) ?? "";
  return "";
}

function isExpiredRemoteQueueRow(row: Record<string, unknown>): boolean {
  const expiresAt = stringValue(row.expiresAt, row.expires_at);
  if (!expiresAt) return false;
  const timestamp = new Date(expiresAt).getTime();
  return Number.isFinite(timestamp) && timestamp <= Date.now();
}

function remoteQueueVerifyAttempts(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_VERIFY_ATTEMPTS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(10, Math.floor(parsed)) : 5;
}

function remoteQueueVerifyIntervalMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_VERIFY_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 100 ? Math.min(3_000, Math.floor(parsed)) : 700;
}

function remoteQueueVerifyTimeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_VERIFY_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(8_000, Math.floor(parsed)) : Math.min(timeoutMs(env), 3_000);
}

function balanceRpcUrls(chain: ChainKey, env: Record<string, string>): string[] {
  const configured = env[chainEnvKeys[chain]]?.trim();
  const fallback = fallbackRpcUrlForChain(chain, env);
  const urls = [configured, fallback, ...(publicRpcUrls[chain] ?? [])];
  return [...new Set(urls.filter((url): url is string => Boolean(url)))];
}

function meteredRpcUrls(chain: ChainKey, env: Record<string, string>): string[] {
  const configured = env[chainEnvKeys[chain]]?.trim();
  return configured ? [configured] : [];
}

function fallbackRpcUrlForChain(chain: ChainKey, env: Record<string, string>): string | undefined {
  if (chain === "ethereum") return env.ETHEREUM_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.ethereum;
  if (chain === "arbitrum") return env.ARBITRUM_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.arbitrum;
  if (chain === "bnb") return env.BNB_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.bnb;
  return undefined;
}

function privateQueuePayload(payload: {
  action: string;
  chain: ChainKey;
  market: string;
  walletAddress: string;
  balances?: WalletBalances;
  endpointSlug?: string;
  clientInstanceId: string;
  rpcEnv: string;
  eligible: boolean;
  reason?: string;
  generatedAt: string;
  lastSeenAt: string;
  heartbeatIntervalMs: number;
  expiresAt: string;
  clientVersion?: string;
  privateKeyCipher?: string;
  username?: string;
  rpcUrl?: string;
  rpcToken?: string;
  password?: string;
  walletUsdt?: string;
  nickname?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  authCode?: string;
  rpcAccessTokenHash?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond?: number | null;
  billable?: boolean;
  online?: boolean;
  billingStatus?: string;
  billingStartedAt?: string;
  billingStoppedAt?: string;
  txCredentialSyncSignature?: string;
  txCredentialSyncRequired?: boolean;
}) {
  const stopping = STOP_ACTIONS.includes(payload.action);
  const status = stopping ? "paused" : payload.eligible ? "queued" : "waiting";
  const licenseHash = licenseCodeFingerprint(payload.authCode);
  const tokenHash = payload.rpcAccessTokenHash || "no-token";
  const queueMemberKey = buildQueueMemberKey(payload.chain, payload.walletAddress, licenseHash, tokenHash);
  const rpcQuotaKey = buildRpcQuotaKey(payload.chain, licenseHash, tokenHash);
  const billingAccountKey = buildBillingAccountKey(payload.chain, payload.walletAddress, licenseHash, tokenHash);
  const queueItemId = queueMemberKey;
  const billable = payload.billable ?? (!stopping && payload.eligible);
  const online = payload.online ?? billable;
  const billingStatus = payload.billingStatus ?? (billable ? "online" : "stopped");
  return {
    chain: payload.chain,
    source: `${chainLabel(payload.chain).toLowerCase()}-rpc-queue`,
    action: payload.action,
    version: payload.clientVersion ?? CLIENT_VERSION,
    clientVersion: payload.clientVersion ?? CLIENT_VERSION,
    client_version: payload.clientVersion ?? CLIENT_VERSION,
    protocolVersion: LIQ2_PROTOCOL_VERSION,
    protocol_version: LIQ2_PROTOCOL_VERSION,
    liq2ProtocolVersion: LIQ2_PROTOCOL_VERSION,
    liq2_protocol_version: LIQ2_PROTOCOL_VERSION,
    market: payload.market,
    wallet: payload.walletAddress,
    walletAddress: payload.walletAddress,
    rpcUrl: payload.rpcUrl,
    rpc_url: payload.rpcUrl,
    rpcToken: payload.rpcToken,
    rpc_token: payload.rpcToken,
    password: payload.password,
    walletUsdt: payload.walletUsdt,
    wallet_usdt: payload.walletUsdt,
    nickname: payload.nickname,
    clientInstanceId: payload.clientInstanceId,
    client_instance_id: payload.clientInstanceId,
    endpointSlug: payload.endpointSlug,
    participantId: queueMemberKey,
    participantKey: queueMemberKey,
    queueMemberKey,
    queue_member_key: queueMemberKey,
    dedupeKey: queueMemberKey,
    dedupe_key: queueMemberKey,
    queueCredential: queueMemberKey,
    queue_credential: queueMemberKey,
    licenseCodeHash: licenseHash,
    license_code_hash: licenseHash,
    rpcAccessTokenHash: tokenHash,
    rpc_access_token_hash: tokenHash,
    rpcQuotaKey,
    rpc_quota_key: rpcQuotaKey,
    billingAccountKey,
    billing_account_key: billingAccountKey,
    billable,
    billingStatus,
    billing_status: billingStatus,
    billingStartedAt: payload.billingStartedAt,
    billing_started_at: payload.billingStartedAt,
    billingStoppedAt: payload.billingStoppedAt,
    billing_stopped_at: payload.billingStoppedAt,
    txCredentialSyncSignature: payload.txCredentialSyncSignature,
    tx_credential_sync_signature: payload.txCredentialSyncSignature,
    txCredentialSyncRequired: payload.txCredentialSyncRequired,
    tx_credential_sync_required: payload.txCredentialSyncRequired,
    online,
    isOnline: online,
    is_online: online,
    metering: meteringSettings(payload, billable, online, billingStatus, rpcQuotaKey, billingAccountKey),
    rpc: payload.rpcEnv,
    username: payload.username,
    privateKeyCipher: payload.privateKeyCipher,
    private_key_cipher: payload.privateKeyCipher,
    credentialAuthMode: payload.credentialAuthMode,
    credential_auth_mode: payload.credentialAuthMode,
    credentialMode: credentialModeLabel(payload.credentialAuthMode),
    credential_mode: credentialModeLabel(payload.credentialAuthMode),
    credentialType: credentialModeLabel(payload.credentialAuthMode),
    credential_type: credentialModeLabel(payload.credentialAuthMode),
    tx2CredentialMode: payload.credentialAuthMode,
    tx2_credential_mode: payload.credentialAuthMode,
    singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
    single_trade_auth_amount_usdt: payload.singleTradeAuthAmountUsdt,
    authorizedAmountUsdt: payload.singleTradeAuthAmountUsdt,
    authorized_amount_usdt: payload.singleTradeAuthAmountUsdt,
    tx2SingleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
    tx2_single_trade_auth_amount_usdt: payload.singleTradeAuthAmountUsdt,
    arbitrageIntensity: payload.arbitrageIntensity,
    arbitrage_intensity: payload.arbitrageIntensity,
    purchasedPlan: payload.rpcPlanName || payload.rpcPlanType,
    purchased_plan: payload.rpcPlanName || payload.rpcPlanType,
    packageName: payload.rpcPlanName || payload.rpcPlanType,
    package_name: payload.rpcPlanName || payload.rpcPlanType,
    plan: {
      type: payload.rpcPlanType,
      name: payload.rpcPlanName,
      creditBurnPerSecond: payload.creditBurnPerSecond,
    },
    executionSettings: executionSettings(payload),
    tx2: tx2Settings(payload, queueMemberKey),
    updatedAt: payload.generatedAt,
    lastSeenAt: payload.lastSeenAt,
    heartbeatIntervalMs: payload.heartbeatIntervalMs,
    expiresAt: payload.expiresAt,
    items: [
      {
        id: queueItemId,
        queueId: queueItemId,
        queue_id: queueItemId,
        participantId: queueMemberKey,
        participant_id: queueMemberKey,
        participantKey: queueMemberKey,
        participant_key: queueMemberKey,
        queueMemberKey,
        queue_member_key: queueMemberKey,
        dedupeKey: queueMemberKey,
        dedupe_key: queueMemberKey,
        source: `${chainLabel(payload.chain).toLowerCase()}-rpc-queue`,
        queueType: "endpoint-start",
        version: payload.clientVersion ?? CLIENT_VERSION,
        clientVersion: payload.clientVersion ?? CLIENT_VERSION,
        client_version: payload.clientVersion ?? CLIENT_VERSION,
        protocolVersion: LIQ2_PROTOCOL_VERSION,
        protocol_version: LIQ2_PROTOCOL_VERSION,
        liq2ProtocolVersion: LIQ2_PROTOCOL_VERSION,
        liq2_protocol_version: LIQ2_PROTOCOL_VERSION,
        chain: payload.chain,
        wallet: payload.walletAddress,
        walletAddress: payload.walletAddress,
        wallet_address: payload.walletAddress,
        rpcUrl: payload.rpcUrl,
        rpc_url: payload.rpcUrl,
        rpcToken: payload.rpcToken,
        rpc_token: payload.rpcToken,
        password: payload.password,
        walletUsdt: payload.walletUsdt,
        wallet_usdt: payload.walletUsdt,
        nickname: payload.nickname,
        clientInstanceId: payload.clientInstanceId,
        client_instance_id: payload.clientInstanceId,
        username: payload.username,
        privateKeyCipher: payload.privateKeyCipher,
        private_key_cipher: payload.privateKeyCipher,
        arbitrageIntensity: payload.arbitrageIntensity,
        arbitrage_intensity: payload.arbitrageIntensity,
        credentialAuthMode: payload.credentialAuthMode,
        credential_auth_mode: payload.credentialAuthMode,
        credentialMode: credentialModeLabel(payload.credentialAuthMode),
        credential_mode: credentialModeLabel(payload.credentialAuthMode),
        credentialType: credentialModeLabel(payload.credentialAuthMode),
        credential_type: credentialModeLabel(payload.credentialAuthMode),
        tx2CredentialMode: payload.credentialAuthMode,
        tx2_credential_mode: payload.credentialAuthMode,
        singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
        single_trade_auth_amount_usdt: payload.singleTradeAuthAmountUsdt,
        authorizedAmountUsdt: payload.singleTradeAuthAmountUsdt,
        authorized_amount_usdt: payload.singleTradeAuthAmountUsdt,
        tx2SingleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
        tx2_single_trade_auth_amount_usdt: payload.singleTradeAuthAmountUsdt,
        rpcPlanType: payload.rpcPlanType,
        rpc_plan_type: payload.rpcPlanType,
        rpcPlanName: payload.rpcPlanName,
        rpc_plan_name: payload.rpcPlanName,
        purchasedPlan: payload.rpcPlanName || payload.rpcPlanType,
        purchased_plan: payload.rpcPlanName || payload.rpcPlanType,
        packageName: payload.rpcPlanName || payload.rpcPlanType,
        package_name: payload.rpcPlanName || payload.rpcPlanType,
        plan: {
          type: payload.rpcPlanType,
          name: payload.rpcPlanName,
          creditBurnPerSecond: payload.creditBurnPerSecond,
        },
        licenseCodeHash: licenseHash,
        license_code_hash: licenseHash,
        rpcAccessTokenHash: tokenHash,
        rpc_access_token_hash: tokenHash,
        rpcQuotaKey,
        rpc_quota_key: rpcQuotaKey,
        billingAccountKey,
        billing_account_key: billingAccountKey,
        queueCredential: queueMemberKey,
        queue_credential: queueMemberKey,
        billable,
        billingStatus,
        billing_status: billingStatus,
        billingStartedAt: payload.billingStartedAt,
        billing_started_at: payload.billingStartedAt,
        billingStoppedAt: payload.billingStoppedAt,
        billing_stopped_at: payload.billingStoppedAt,
        txCredentialSyncSignature: payload.txCredentialSyncSignature,
        tx_credential_sync_signature: payload.txCredentialSyncSignature,
        txCredentialSyncRequired: payload.txCredentialSyncRequired,
        tx_credential_sync_required: payload.txCredentialSyncRequired,
        online,
        isOnline: online,
        is_online: online,
        creditBurnPerSecond: payload.creditBurnPerSecond,
        credit_burn_per_second: payload.creditBurnPerSecond,
        metering: meteringSettings(payload, billable, online, billingStatus, rpcQuotaKey, billingAccountKey),
        executionSettings: executionSettings(payload),
        tx2: tx2Settings(payload, queueMemberKey),
        asset: `${tokenContracts[payload.chain].gasSymbol} / USDT / USDC`,
        protocol: protocolLabelFromMarket(payload.market),
        market: payload.market,
        rpc: payload.rpcEnv,
        endpointSlug: payload.endpointSlug,
        endpoint_slug: payload.endpointSlug,
        endpointId: queueMemberKey,
        endpoint_id: queueMemberKey,
        rpcEndpointSlug: payload.endpointSlug,
        rpc_endpoint_slug: payload.endpointSlug,
        status,
        startedAt: payload.generatedAt,
        joinedAt: stopping ? "" : payload.generatedAt,
        updatedAt: payload.generatedAt,
        lastSeenAt: payload.lastSeenAt,
        heartbeatIntervalMs: payload.heartbeatIntervalMs,
        expiresAt: payload.expiresAt,
        reason: payload.reason,
      },
    ],
  };
}

function executionSettings(payload: {
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond?: number | null;
}) {
  return {
    arbitrageIntensity: payload.arbitrageIntensity,
    credentialAuthMode: payload.credentialAuthMode,
    credentialMode: credentialModeLabel(payload.credentialAuthMode),
    singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
    authorizedAmountUsdt: payload.singleTradeAuthAmountUsdt,
    rpcPlanType: payload.rpcPlanType,
    rpcPlanName: payload.rpcPlanName,
    purchasedPlan: payload.rpcPlanName || payload.rpcPlanType,
    creditBurnPerSecond: payload.creditBurnPerSecond,
  };
}

function meteringSettings(
  payload: {
    chain: ChainKey;
    walletAddress: string;
    endpointSlug?: string;
    rpcAccessTokenHash?: string;
    rpcPlanType?: string;
    rpcPlanName?: string;
    creditBurnPerSecond?: number | null;
    heartbeatIntervalMs: number;
    expiresAt: string;
  },
  billable: boolean,
  online: boolean,
  billingStatus: string,
  rpcQuotaKey: string,
  billingAccountKey: string,
) {
  return {
    model: "server_online_wallet_per_second",
    quotaModel: "shared_rpc_token_quota",
    quota_model: "shared_rpc_token_quota",
    billingModel: "per_private_key_wallet",
    billing_model: "per_private_key_wallet",
    billable,
    online,
    billingStatus,
    billing_status: billingStatus,
    chain: payload.chain,
    walletAddress: payload.walletAddress,
    wallet_address: payload.walletAddress,
    endpointSlug: payload.endpointSlug,
    endpoint_slug: payload.endpointSlug,
    rpcAccessTokenHash: payload.rpcAccessTokenHash,
    rpc_access_token_hash: payload.rpcAccessTokenHash,
    rpcQuotaKey,
    rpc_quota_key: rpcQuotaKey,
    billingAccountKey,
    billing_account_key: billingAccountKey,
    rpcPlanType: payload.rpcPlanType,
    rpc_plan_type: payload.rpcPlanType,
    rpcPlanName: payload.rpcPlanName,
    rpc_plan_name: payload.rpcPlanName,
    creditBurnPerSecond: payload.creditBurnPerSecond,
    credit_burn_per_second: payload.creditBurnPerSecond,
    heartbeatIntervalMs: payload.heartbeatIntervalMs,
    heartbeat_interval_ms: payload.heartbeatIntervalMs,
    expiresAt: payload.expiresAt,
    expires_at: payload.expiresAt,
  };
}

function tx2Settings(payload: {
  privateKeyCipher?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  arbitrageIntensity?: string;
}, queueCredential: string) {
  return {
    queueCredential,
    privateKeyCipher: payload.privateKeyCipher,
    credentialAuthMode: payload.credentialAuthMode,
    credentialMode: credentialModeLabel(payload.credentialAuthMode),
    singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
    authorizedAmountUsdt: payload.singleTradeAuthAmountUsdt,
    arbitrageIntensity: payload.arbitrageIntensity,
  };
}

function credentialModeLabel(value?: string): string {
  return value === "loop" ? "multiple" : "single";
}

function protocolLabelFromMarket(market: string): string {
  if (market.includes("liquity")) return "Liquity V2";
  if (market.includes("compound")) return market.includes("v2") ? "Compound V2 Fork" : "Compound V3";
  if (market.includes("venus")) return "Venus";
  return "Aave V3";
}

function buildQueueMemberKey(chain: ChainKey, walletAddress: string, _licenseHash: string, tokenHash: string): string {
  return ["license-token-wallet", chain, tokenHash, walletTail(walletAddress)].join(":");
}

function buildRpcQuotaKey(chain: ChainKey, licenseHash: string, tokenHash: string): string {
  return ["license-token-quota", chain, licenseHash, tokenHash].join(":");
}

function buildBillingAccountKey(chain: ChainKey, walletAddress: string, licenseHash: string, tokenHash: string): string {
  return ["license-token-wallet-billing", chain, licenseHash, tokenHash, walletTail(walletAddress)].join(":");
}

function walletTail(walletAddress: string): string {
  const normalized = walletAddress.toLowerCase().replace(/^0x/i, "");
  return normalized.slice(-4) || "unknown";
}

function readClientInstanceId(): string {
  try {
    if (existsSync(CLIENT_INSTANCE_FILE)) {
      const existing = readFileSync(CLIENT_INSTANCE_FILE, "utf8").trim();
      if (/^liq2-[a-f0-9-]{16,}$/i.test(existing)) return existing;
    }
    mkdirSync(dirname(CLIENT_INSTANCE_FILE), { recursive: true });
    const generated = `liq2-${crypto.randomUUID()}`;
    writeFileSync(CLIENT_INSTANCE_FILE, `${generated}\n`, { mode: 0o600 });
    return generated;
  } catch {
    return `liq2-${crypto.randomUUID()}`;
  }
}

function buildTxWalletCredentialFields(env: Record<string, string>, walletAddress: string): {
  username: string;
  privateKeyCipher: string;
} {
  const privateKey = normalizePrivateKey(env.PRIVATE_KEY?.trim() ?? "");
  const derivedAddress = privateKeyToAddress(privateKey);
  if (derivedAddress.toLowerCase() !== walletAddress.toLowerCase()) throw new Error("PRIVATE_KEY 与当前钱包地址不匹配，不能提交 tx2 凭证。");
  return {
    username: walletAddress.slice(2, 10).toLowerCase(),
    privateKeyCipher: encryptForTxWallet(privateKey, readTxPublicKeyPem()),
  };
}

function shouldUploadTxCredentialFields(action: string, signature: string): boolean {
  if (STOP_ACTIONS.includes(action)) return false;
  if (action === "start") return true;
  return readTxCredentialSyncSignature() !== signature;
}

function txCredentialSyncSignature(env: Record<string, string>, walletAddress: string, rpcAccess?: RpcAccessInfo): string {
  const tradeSettings = readTradeSettings(env);
  const payload = {
    version: 1,
    walletAddress: walletAddress.toLowerCase(),
    privateKeyHash: tokenFingerprint(normalizePrivateKey(env.PRIVATE_KEY?.trim() ?? "")),
    credentialAuthMode: tradeSettings.credentialAuthMode,
    singleTradeAuthAmountUsdt: tradeSettings.singleTradeAuthAmountUsdt,
    arbitrageIntensity: tradeSettings.arbitrageIntensity,
    rpcAccessTokenHash: rpcAccess?.rpcAccessTokenHash ?? "",
    rpcPlanType: rpcAccess?.rpcPlanType ?? "",
    rpcPlanName: rpcAccess?.rpcPlanName ?? "",
    creditBurnPerSecond: rpcAccess?.creditBurnPerSecond ?? null,
  };
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function readTxCredentialSyncSignature(): string {
  if (!existsSync(TX_CREDENTIAL_SYNC_STATE_FILE)) return "";
  try {
    const parsed = JSON.parse(readFileSync(TX_CREDENTIAL_SYNC_STATE_FILE, "utf8")) as { signature?: unknown };
    return typeof parsed.signature === "string" ? parsed.signature : "";
  } catch {
    return "";
  }
}

function rememberTxCredentialSync(signature: string): void {
  mkdirSync(dirname(TX_CREDENTIAL_SYNC_STATE_FILE), { recursive: true });
  writeFileSync(TX_CREDENTIAL_SYNC_STATE_FILE, `${JSON.stringify({ signature, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
}

function readTradeSettings(env: Record<string, string>): { arbitrageIntensity: string; credentialAuthMode: string; singleTradeAuthAmountUsdt: string } {
  return {
    arbitrageIntensity: normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY),
    credentialAuthMode: readCredentialAuthMode(env),
    singleTradeAuthAmountUsdt: normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT),
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

function readTxPublicKeyPem(): string {
  const defaultPath = resolve(process.cwd(), "server/tx-wallet-public.pem");
  if (!existsSync(defaultPath)) throw new Error(`TX wallet public key not found: ${defaultPath}`);
  return readFileSync(defaultPath, "utf8");
}

async function parseOptionalJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!body || !contentType.toLowerCase().includes("application/json")) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function queueRegisterFailureMessage(chain: ChainKey, endpoint: string, status: number, remotePayload: Record<string, unknown>): string {
  const remoteError = stringValue(remotePayload.error, remotePayload.message);
  if (remoteError) return `${chainLabel(chain)} 队列上报失败：${remoteError}`;
  return `${chainLabel(chain)} 队列服务暂时不可用（${endpointHost(endpoint)} 返回 HTTP ${status}）`;
}

function endpointHost(endpoint: string): string {
  try {
    return new URL(endpoint).host;
  } catch {
    return endpoint;
  }
}

function queueMarket(chain: ChainKey, body: QueueRegisterPayload): string {
  const provided = stringValue(body.market);
  if (provided) return provided;
  const strategyId = stringValue(body.strategyId)?.toLowerCase() ?? "";
  const protocol = stringValue(body.protocol)?.toLowerCase() ?? "";
  if (strategyId.includes("liquity") || protocol.includes("liquity")) return `liquity-v2-${chain}`;
  if (strategyId.includes("compound") || protocol.includes("compound")) return `compound-${chain}`;
  if (strategyId.includes("venus") || protocol.includes("venus")) return `venus-${chain}`;
  return chain === "arbitrum" ? "aave-v3-arbitrum" : `aave-v3-${chain}`;
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

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能上报启动队列。");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

function normalizePrivateKey(privateKey: string): string {
  const hex = privateKey.trim().replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error("PRIVATE_KEY 格式不正确，不能加密提交。");
  return `0x${hex}`;
}

async function readWalletBalances(chain: ChainKey, walletAddress: string, rpcUrl: string, env: Record<string, string>): Promise<WalletBalances> {
  const config = tokenContracts[chain];
  const gas = await rpc<string>(rpcUrl, "eth_getBalance", [walletAddress, "latest"], env).then((value) => formatUnits(hexToBigInt(value), 18, 5));
  return {
    gas: { symbol: config.gasSymbol, formatted: gas },
    updatedAt: new Date().toISOString(),
  };
}

async function readQueueBalances(
  chain: ChainKey,
  walletAddress: string,
  rpcUrls: string[],
  env: Record<string, string>,
  action: string,
): Promise<{ balances?: WalletBalances; rpcUrl?: string; reason?: string }> {
  try {
    return await readWalletBalancesWithFallback(chain, walletAddress, rpcUrls, env);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { rpcUrl: rpcUrls[0], reason: `${chainLabel(chain)} balance check skipped during ${action}: ${message}` };
  }
}

async function readWalletBalancesWithFallback(
  chain: ChainKey,
  walletAddress: string,
  rpcUrls: string[],
  env: Record<string, string>,
): Promise<{ balances: WalletBalances; rpcUrl: string }> {
  let lastError: unknown;
  for (const rpcUrl of rpcUrls) {
    try {
      return { balances: await readWalletBalances(chain, walletAddress, rpcUrl, env), rpcUrl };
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${chainLabel(chain)} 钱包余额查询失败：${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function readTokenBalance(rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string, env: Record<string, string>): Promise<string> {
  const data = `${BALANCE_OF_SELECTOR}${walletAddress.slice(2).padStart(64, "0")}`;
  const value = await rpc<string>(rpcUrl, "eth_call", [{ to: token.address, data }, "latest"], env);
  return formatUnits(hexToBigInt(value), token.decimals, 2);
}

async function readOptionalTokenBalance(rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string, env: Record<string, string>): Promise<string> {
  try {
    return await readTokenBalance(rpcUrl, token, walletAddress, env);
  } catch {
    return "--";
  }
}

async function burnConnectedRpcUsage(
  chain: ChainKey,
  rpcUrls: string[],
  env: Record<string, string>,
  requestCount: number,
): Promise<{ chain: ChainKey; rpcUrl?: string; requestCount: number; ok: boolean; error?: string }> {
  let lastError: unknown;
  for (const rpcUrl of rpcUrls) {
    let completed = 0;
    try {
      completed = await burnRpcRequests(rpcUrl, requestCount, env);
      return { chain, rpcUrl, requestCount: completed, ok: true };
    } catch (error) {
      lastError = normalizeRpcBurnError(chain, error);
      if (completed > 0) return { chain, rpcUrl, requestCount: completed, ok: true };
    }
  }
  return {
    chain,
    rpcUrl: rpcUrls[0],
    requestCount: 0,
    ok: false,
    error: lastError instanceof Error ? lastError.message : String(lastError),
  };
}

async function burnRpcRequests(rpcUrl: string, requestCount: number, env: Record<string, string>): Promise<number> {
  const concurrency = rpcBurnConcurrency(env);
  let completed = 0;
  for (let offset = 0; offset < requestCount; offset += concurrency) {
    const batchSize = Math.min(concurrency, requestCount - offset);
    const results = await Promise.allSettled(Array.from({ length: batchSize }, () => rpc<string>(rpcUrl, "eth_blockNumber", [], env)));
    completed += results.filter((result) => result.status === "fulfilled").length;
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === "rejected");
    if (firstError) {
      if (completed > 0) return completed;
      throw firstError.reason;
    }
  }
  return completed;
}

function normalizeRpcBurnError(chain: ChainKey, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted/i.test(message)) return `${chainLabel(chain)} RPC 请求超时，请检查 ${chainEnvKeys[chain]} 或 RPC 服务可用性。`;
  if (/fetch failed|ECONN|ENOTFOUND|EAI_AGAIN|network/i.test(message)) {
    return `${chainLabel(chain)} RPC 连接失败，请检查 ${chainEnvKeys[chain]} 或 RPC 服务可用性。`;
  }
  return message;
}

function assertQueueChainEnabled(chain: ChainKey) {
  if (ENABLED_QUEUE_CHAINS.includes(chain)) return;
  throw new Error(`当前版本只运行 BNB 队列，已忽略 ${chainLabel(chain)} 队列请求。`);
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[], env: Record<string, string>): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(rpcTimeoutMs(env)),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC request failed.");
  return payload.result as T;
}

function chainFromRpcUrl(rpcUrl: string, env: Record<string, string>): ChainKey | undefined {
  const normalized = normalizeUrl(rpcUrl);
  for (const chain of Object.keys(chainEnvKeys) as ChainKey[]) {
    if (normalized && normalized === normalizeUrl(env[chainEnvKeys[chain]]?.trim() ?? "")) return chain;
  }
  return undefined;
}

function hexToBigInt(value?: string): bigint {
  if (!value || value === "0x") return 0n;
  return BigInt(value);
}

function formatUnits(value: bigint, decimals: number, fractionDigits: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  const scaled = (fraction * 10n ** BigInt(fractionDigits)) / base;
  const fractionText = scaled.toString().padStart(fractionDigits, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function booleanValue(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string" && value.trim()) {
      const normalized = value.trim().toLowerCase();
      if (["true", "yes", "1", "active", "ready", "queued", "joined"].includes(normalized)) return true;
      if (["false", "no", "0", "inactive", "missing"].includes(normalized)) return false;
    }
    if (typeof value === "number" && Number.isFinite(value)) return value > 0;
  }
  return null;
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

function dateValue(...values: unknown[]): Date | null {
  for (const value of values) {
    if (value instanceof Date && Number.isFinite(value.getTime())) return value;
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
      const timestamp = value > 1_000_000_000_000 ? value : value * 1000;
      const date = new Date(timestamp);
      if (Number.isFinite(date.getTime())) return date;
    }
    if (typeof value === "string" && value.trim()) {
      const trimmed = value.trim();
      const numeric = Number(trimmed);
      if (Number.isFinite(numeric) && numeric > 0) {
        const timestamp = numeric > 1_000_000_000_000 ? numeric : numeric * 1000;
        const date = new Date(timestamp);
        if (Number.isFinite(date.getTime())) return date;
      }
      const date = new Date(trimmed);
      if (Number.isFinite(date.getTime())) return date;
    }
  }
  return null;
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return value.toString();
  }
  return undefined;
}

function shortAddress(value: string): string {
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function requestAuthCode(req: IncomingMessage, env: Record<string, string>): string | undefined {
  return normalizeAuthCode(
    headerValue(req.headers["x-supermtnode-auth-code"]) ||
      headerValue(req.headers["x-license-code"]) ||
      headerValue(req.headers["x-auth-code"]) ||
      env.AUTH_CODE ||
      env.SUPERARB_AUTH_CODE ||
      env.LICENSE_CODE,
  );
}

function queueAuthIdentity(env: Record<string, string>, authCode?: string): string | undefined {
  return firstUsableToken(env.SUPERMTNODE_APP_TOKEN, env.QUEUE_TOKEN, env.LIQUIDATION_QUEUE_WSS_TOKEN) || authCode;
}

function normalizeAuthCode(value?: string): string | undefined {
  const normalized = value?.trim().toUpperCase();
  return normalized || undefined;
}

function assertQueueAuthIdentityConfigured(authIdentity?: string): asserts authIdentity is string {
  if (!authIdentity) {
    throw new Error("授权码未配置，不能启动队列。请先登录并保存授权码。");
  }
}

function appendWarning(current: string | undefined, next: string): string {
  return current ? `${current}；${next}` : next;
}

function firstUsableToken(...values: Array<string | undefined>): string {
  for (const value of values) {
    const token = value?.trim();
    if (!token) continue;
    const expiry = jwtExpiry(token);
    if (expiry && expiry.getTime() <= Date.now()) continue;
    return token;
  }
  return "";
}

function licenseCodeFingerprint(value?: string): string {
  return credentialFingerprint(value, "no-license");
}

function tokenFingerprint(value?: string): string {
  return credentialFingerprint(value, "no-token");
}

function credentialFingerprint(value: string | undefined, fallback: string): string {
  const normalized = value?.trim();
  if (!normalized) return fallback;
  return crypto.createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_STATUS_TIMEOUT_MS ?? env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function rpcTimeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_RPC_TIMEOUT_MS ?? env.WALLET_ASSET_RPC_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

function rpcBurnRequestCount(env: Record<string, string>, creditBurnPerSecond?: number | null): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_RPC_BURN_COUNT ?? env.RPC_KEEPALIVE_BURN_COUNT);
  if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed);
  const burn = Number(creditBurnPerSecond);
  return Number.isFinite(burn) && burn > 0 ? Math.floor(burn) : 1;
}

function rpcBurnConcurrency(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_RPC_BURN_CONCURRENCY);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(500, Math.floor(parsed)) : 100;
}

function heartbeatIntervalMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_HEARTBEAT_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 3_000 ? Math.min(parsed, 30_000) : DEFAULT_HEARTBEAT_INTERVAL_MS;
}

function queueLeaseMs(heartbeatMs: number): number {
  return Math.max(heartbeatMs * 12, 60_000);
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return parsed;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
