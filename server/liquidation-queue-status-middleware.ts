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

const ENV_FILE = resolve(process.cwd(), ".env");
const LOCAL_QUEUE_STATE_FILE = resolve(process.cwd(), ".superarb/liquidation-queue-client.json");
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 10_000;
const DEFAULT_QUEUE_STATUS_API_URL = "https://api.supermtnode.io/api/public/liquidations/queue-status";
const DEFAULT_MANAGE_QUEUE_INGEST_URL = "https://manage.supermtnode.io/api/ingest/liquidation-queue";
const BALANCE_OF_SELECTOR = "0x70a08231";
const STOP_ACTIONS = ["stop", "pause", "logout", "disconnect", "unregister"];
const ENABLED_QUEUE_CHAINS: ChainKey[] = ["bnb"];
const CLIENT_VERSION = "1.4.4";

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
  rotation?: unknown;
  rotationPolicy?: unknown;
  rotation_policy?: unknown;
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
  status?: unknown;
  requestCount?: unknown;
  request_count?: unknown;
  requestLimit?: unknown;
  request_limit?: unknown;
  creditBurnPerSecond?: unknown;
  credit_burn_per_second?: unknown;
  creditsRemaining?: unknown;
  credits_remaining?: unknown;
};

type RpcAccessInfo = {
  rpcPlanType: string;
  rpcPlanName: string;
  creditBurnPerSecond: number | null;
};

type WalletBalances = {
  gas: { symbol: string; formatted: string };
  usdt: { symbol: "USDT"; formatted: string };
  usdc: { symbol: "USDC"; formatted: string };
  updatedAt: string;
};

type LocalQueueState = {
  items: Record<string, unknown>[];
  updatedAt: string;
};

type QueueTransportResult = {
  endpoint: string;
  transport: "wss" | "http";
  payload: Record<string, unknown>;
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

async function burnRunningRpc(req: IncomingMessage) {
  const env = readEnv();
  const body = (await readJson(req)) as QueueRegisterPayload;
  const chain = normalizeChain(stringValue(body.chain) ?? "");
  assertQueueChainEnabled(chain);
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  assertOfficialConfig("RPC 运行扣费", env);
  const rpcUrls = meteredRpcUrls(chain, env);
  if (!rpcUrls.length) throw new Error(`${chainEnvKeys[chain]} 未配置，不能扣费。`);
  const rpcAccess = await assertSuperMtNodeRpcCanStart(chain, env, authCode);
  const rpcBurn = await burnConnectedRpcUsage(chain, rpcUrls, env);
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
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const stopping = STOP_ACTIONS.includes(action);
  assertOfficialConfig("执行队列上报", env);
  const walletAddress = privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "");
  const meteredRpcUrl = env[chainEnvKeys[chain]]?.trim();
  const rpcUrls = balanceRpcUrls(chain, env);
  if (!meteredRpcUrl) throw new Error(`${chainEnvKeys[chain]} 未配置，不能启动该链队列。`);
  if (!rpcUrls.length) throw new Error(`${chainEnvKeys[chain]} 未配置，不能读取钱包余额。`);
  const rpcAccess = stopping ? undefined : await assertSuperMtNodeRpcCanStart(chain, env, authCode);
  if (!stopping) {
    await bootstrapPrivateMemberWalletOnce("queue-start", { authCode });
  }

  const market = queueMarket(chain, body);
  const balanceResult = await readQueueBalances(chain, walletAddress, rpcUrls, env, action);
  const balances = balanceResult.balances;
  const gasBalance = balances ? Number(balances.gas.formatted) : null;
  const wssEndpoint = queueWssUrl(env);
  const httpFallbackEndpoint = manageQueueIngestUrl(env);
  const endpoint = wssEndpoint || httpFallbackEndpoint;
  const generatedAt = new Date();
  const generatedAtIso = generatedAt.toISOString();
  const heartbeatMs = heartbeatIntervalMs(env);

  const eligible = !stopping && (balances ? Number.isFinite(gasBalance) && Number(gasBalance) > 0 : true);
  const reason = stopping ? "client stopped" : balances ? (eligible ? undefined : `${chainLabel(chain)} wallet has no gas.`) : balanceResult.reason;
  const payload = {
    source: "liq2-client-start",
    queueType: "endpoint-start",
    version: CLIENT_VERSION,
    action,
    generatedAt: generatedAtIso,
    lastSeenAt: generatedAtIso,
    heartbeatIntervalMs: heartbeatMs,
    expiresAt: new Date(generatedAt.getTime() + heartbeatMs * 3).toISOString(),
    chain,
    market,
    walletAddress,
    wallet: { address: walletAddress, balances },
    balances,
    assets: balances,
    endpointSlug: rpcEndpointSlugFromUrl(meteredRpcUrl),
    rpcEnv: chainEnvKeys[chain],
    eligible,
    reason,
    ...rpcAccess,
    ...readTradeSettings(env),
    ...(!stopping ? buildTxWalletCredentialFields(env, walletAddress) : {}),
  };
  if (stopping) updateLocalQueueState(payload);

  let transportResult: QueueTransportResult;
  let transportWarning: string | undefined;
  const wssCorrectionEnabled = allowQueueWssCorrection(env);

  try {
    transportResult = await sendManageQueuePayload(endpoint, env, req, payload);
  } catch (error) {
    if (!wssEndpoint || endpoint !== wssEndpoint || (!allowQueueHttpFallback(env) && !wssCorrectionEnabled)) {
      throw new Error(error instanceof Error ? error.message : String(error));
    }
    transportWarning = wssCorrectionEnabled ? undefined : error instanceof Error ? error.message : String(error);
    transportResult = await sendManageQueuePayload(httpFallbackEndpoint, env, req, payload);
  }

  const remoteQueue = !stopping && remoteQueueVerifyEnabled(env) ? await verifyRemoteQueueRegistration(env, req, payload) : undefined;

  try {
    if (!stopping) updateLocalQueueState(payload);
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : String(error));
  }

  return {
    ok: true,
    source: "liq2-client-start",
    chain,
    chainLabel: chainLabel(chain),
    market,
    walletAddress,
    balances,
    balanceStatus: balances ? "ok" : "skipped",
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
    queue: isRecord(transportResult.payload.queue) ? transportResult.payload.queue : null,
    remoteQueueVerified: remoteQueue?.verified ?? false,
    remoteQueueParticipantId: remoteQueue?.participantId,
    remote: transportResult.payload,
    remoteAvailable: true,
    updatedAt: new Date().toISOString(),
  };
}

function updateLocalQueueState(payload: {
  action: string;
  chain: ChainKey;
  market: string;
  walletAddress: string;
  balances?: WalletBalances;
  endpointSlug?: string;
  rpcEnv: string;
  eligible: boolean;
  reason?: string;
  generatedAt: string;
  lastSeenAt: string;
  heartbeatIntervalMs: number;
  expiresAt: string;
}): void {
  const state = readLocalQueueState();
  const item = publicLocalQueueItem(manageQueuePayload(payload).items[0] as Record<string, unknown>);
  const id = stringValue(item.id) ?? `endpoint-start:${payload.chain}:${payload.walletAddress.toLowerCase()}:${payload.market}`;
  const nextItems = state.items.filter((row) => stringValue(row.id) !== id && !isExpiredLocalQueueRow(row));
  if (!STOP_ACTIONS.includes(payload.action)) nextItems.push(item);
  writeLocalQueueState({ items: nextItems, updatedAt: new Date().toISOString() });
}

function publicLocalQueueItem(item: Record<string, unknown>): Record<string, unknown> {
  const {
    privateKeyCipher: _privateKeyCipher,
    private_key_cipher: _privateKeyCipherSnake,
    walletPublicKey: _walletPublicKey,
    publicKey: _publicKey,
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

  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
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
    throw new Error("api.supermtnode.io 队列状态接口尚未返回 JSON，请确认 /api/public/liquidations/queue-status 已部署。");
  }

  try {
    return JSON.parse(body) as QueueStatusPayload;
  } catch {
    throw new Error("api.supermtnode.io 队列状态接口返回了无效 JSON。");
  }
}

function buildQueueStatusResponse(payload: QueueStatusPayload) {
  const sourcePayload = unwrapPayload(payload);
  const updatedAt = stringValue(sourcePayload.updatedAt, sourcePayload.updated_at) ?? new Date().toISOString();
  const rows = readQueueStatusRows(sourcePayload, updatedAt);
  const participantCount = numberValue(sourcePayload.participantCount, sourcePayload.participant_count, sourcePayload.members) ?? maxParticipantCount(rows);

  return {
    ok: true,
    source: "api.supermtnode.io",
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

function manageQueueIngestUrl(env: Record<string, string>): string {
  return env.MANAGE_LIQUIDATION_QUEUE_INGEST_URL?.trim() || env.LIQUIDATION_QUEUE_INGEST_URL?.trim() || DEFAULT_MANAGE_QUEUE_INGEST_URL;
}

function queueWssUrl(env: Record<string, string>): string {
  return env.LIQUIDATION_QUEUE_WSS_URL?.trim() || env.MANAGE_LIQUIDATION_QUEUE_WSS_URL?.trim() || "";
}

async function assertSuperMtNodeRpcCanStart(chain: ChainKey, env: Record<string, string>, authCode?: string): Promise<RpcAccessInfo> {
  const rpcUrl = env[chainEnvKeys[chain]]?.trim();
  if (!rpcUrl) throw new Error(`${chainEnvKeys[chain]} 未配置，不能启动。`);

  if (authCode) {
    const endpoints = await fetchSuperMtNodeEndpointsByLicense(env, authCode);
    const endpoint = endpoints.find((item) => matchSuperMtNodeEndpoint(item, chain, rpcUrl));
    if (!endpoint) {
      throw new Error(`${chainLabel(chain)} RPC 未绑定到当前授权码，不能启动。`);
    }
    return rpcAccessFromEndpoint(chain, endpoint, "授权码");
  }

  const token = env.SUPERMTNODE_APP_TOKEN?.trim();
  if (!token) throw new Error("SUPERMTNODE_APP_TOKEN 未配置，不能启动。");
  const tokenExpiry = jwtExpiry(token);
  if (tokenExpiry && tokenExpiry.getTime() <= Date.now()) {
    throw new Error(`SUPERMTNODE_APP_TOKEN 已于 ${tokenExpiry.toISOString()} 过期，请在 supermtnode.io 更换 token 后再启动。`);
  }

  const endpoints = await fetchSuperMtNodeEndpoints(env, token);
  const endpoint = endpoints.find((item) => matchSuperMtNodeEndpoint(item, chain, rpcUrl));
  if (!endpoint) {
    throw new Error(`${chainLabel(chain)} RPC 未绑定到当前 SUPERMTNODE_APP_TOKEN，不能启动。`);
  }

  return rpcAccessFromEndpoint(chain, endpoint, "SUPERMTNODE_APP_TOKEN");
}

function rpcAccessFromEndpoint(chain: ChainKey, endpoint: SuperMtNodeEndpoint, authLabel: string): RpcAccessInfo {
  const status = stringValue(endpoint.status)?.toLowerCase();
  if (status && !["active", "pending"].includes(status)) {
    throw new Error(`${chainLabel(chain)} RPC 当前状态为 ${status}，不能启动。`);
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
  };
}

async function fetchSuperMtNodeEndpoints(env: Record<string, string>, token: string): Promise<SuperMtNodeEndpoint[]> {
  const errors: string[] = [];
  for (const apiBase of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${apiBase}/api/rpc-endpoints`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "x-supermtnode-app-token": token,
        },
        signal: AbortSignal.timeout(timeoutMs(env)),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown };
      if (!response.ok) {
        const detail = stringValue(payload.error, payload.message) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isSuperMtNodeEndpoint) : [];
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`SUPERMTNODE_APP_TOKEN 校验失败：${errors.join("; ")}`);
}

async function fetchSuperMtNodeEndpointsByLicense(env: Record<string, string>, authCode: string): Promise<SuperMtNodeEndpoint[]> {
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
        signal: AbortSignal.timeout(timeoutMs(env)),
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
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isSuperMtNodeEndpoint) : [];
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(`授权码校验失败：${errors.join("; ")}`);
}

function superMtNodeApiBaseUrls(env: Record<string, string>): string[] {
  return uniqueStrings([env.SUPERMTNODE_API_BASE_URL?.trim(), ...SUPERMTNODE_API_BASES]).map((value) => value.replace(/\/+$/, ""));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function matchSuperMtNodeEndpoint(endpoint: SuperMtNodeEndpoint, chain: ChainKey, rpcUrl: string): boolean {
  const endpointChain = normalizeSuperMtNodeEndpointChain(endpoint.chain);
  if (endpointChain !== superMtNodeChainKeys[chain]) return false;
  const endpointUrl = normalizeUrl(stringValue(endpoint.httpUrl, endpoint.http_url));
  const configuredUrl = normalizeUrl(rpcUrl);
  const configuredSlug = normalizeEndpointSlug(rpcEndpointSlugFromUrl(rpcUrl));
  const endpointSlug = normalizeEndpointSlug(stringValue(endpoint.endpointSlug, endpoint.endpoint_slug));
  return endpointUrl === configuredUrl || (Boolean(configuredSlug) && endpointSlug === configuredSlug);
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

async function sendManageQueuePayload(
  endpoint: string,
  env: Record<string, string>,
  req: IncomingMessage,
  payload: Parameters<typeof manageQueuePayload>[0],
): Promise<QueueTransportResult> {
  const queuePayload = manageQueuePayload(payload);
  if (isWssEndpoint(endpoint)) {
    const responsePayload = await sendQueuePayloadOverWss(endpoint, env, req, queuePayload);
    return { endpoint, transport: "wss", payload: responsePayload };
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: manageQueueHeaders(env, req),
    body: JSON.stringify(queuePayload),
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  const remotePayload = await parseOptionalJson(response);
  if (!response.ok) {
    throw new Error(queueRegisterFailureMessage(payload.chain, endpoint, response.status, remotePayload));
  }
  return { endpoint, transport: "http", payload: remotePayload };
}

function isWssEndpoint(endpoint: string): boolean {
  return /^wss?:\/\//i.test(endpoint);
}

function allowQueueHttpFallback(env: Record<string, string>): boolean {
  return booleanValue(env.LIQUIDATION_QUEUE_ALLOW_HTTP_FALLBACK, env.MANAGE_LIQUIDATION_QUEUE_ALLOW_HTTP_FALLBACK) === true;
}

function allowQueueWssCorrection(env: Record<string, string>): boolean {
  const configured = String(env.LIQUIDATION_QUEUE_WSS_CORRECTION ?? env.MANAGE_LIQUIDATION_QUEUE_WSS_CORRECTION ?? "enabled").trim().toLowerCase();
  return !["0", "false", "off", "disabled", "close", "关闭"].includes(configured);
}

async function sendQueuePayloadOverWss(
  endpoint: string,
  env: Record<string, string>,
  req: IncomingMessage,
  queuePayload: ReturnType<typeof manageQueuePayload>,
): Promise<Record<string, unknown>> {
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const token = env.LIQUIDATION_QUEUE_WSS_TOKEN?.trim();
  if (!token) {
    throw new Error("队列 WSS Token 本地未配置，请先在设置中保存官方配置。");
  }
  const ws = new WebSocket(correctWssEndpoint(endpoint, env));
  const timeout = timeoutMs(env);

  return new Promise((resolvePayload, rejectPayload) => {
    let settled = false;
    let eventSent = false;
    let authAcked = false;
    const authMessageId = `liq2-auth:${crypto.randomUUID()}`;
    const eventMessageId = `liq2-queue-event:${crypto.randomUUID()}`;
    const timer = setTimeout(() => settle(new Error(`WSS 队列服务连接超时：${endpointHost(endpoint)}`)), timeout);
    const authFallbackTimer = setTimeout(() => sendQueueEvent(), Math.min(1_000, Math.max(250, Math.floor(timeout / 4))));
    const queueIdentities = queuePayload.items.filter(isRecord).map((item) => ({
      chain: stringValue(item.chain),
      market: stringValue(item.market),
      walletAddress: stringValue(item.walletAddress, item.wallet, item.wallet_address),
      endpointSlug: stringValue(item.endpointSlug, item.endpoint_slug, item.rpcEndpointSlug, item.rpc_endpoint_slug),
      participantId: stringValue(item.participantId, item.participant_id, item.queueMemberKey, item.queue_member_key, item.dedupeKey, item.dedupe_key),
    }));

    const settle = (value: Record<string, unknown> | Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(authFallbackTimer);
      try {
        ws.close();
      } catch {
        // ignore close errors
      }
      if (value instanceof Error) rejectPayload(value);
      else resolvePayload(value);
    };

    const sendQueueEvent = () => {
      if (eventSent || settled) return;
      eventSent = true;
      ws.send(JSON.stringify({
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
      }));
    };

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({
        type: "auth",
        messageId: authMessageId,
        requestId: authMessageId,
        clientMessageId: authMessageId,
        token,
        authCode,
        source: "liq2-client",
        queueIdentities,
        walletAddresses: queueIdentities.map((item) => item.walletAddress).filter(Boolean),
        participantIds: queueIdentities.map((item) => item.participantId).filter(Boolean),
        generatedAt: new Date().toISOString(),
      }));
    });

    ws.addEventListener("message", (event) => {
      void handleWssResponseMessage(event.data, {
        authAcked,
        eventSent,
        authMessageId,
        eventMessageId,
        onAuthAck: () => {
          authAcked = true;
          sendQueueEvent();
        },
        settle,
      });
    });

    ws.addEventListener("error", () => settle(new Error(`WSS 队列服务暂时不可用：${endpointHost(endpoint)}`)));
    ws.addEventListener("close", () => {
      if (!settled) settle(new Error(`WSS 队列服务在确认上报前断开：${endpointHost(endpoint)}`));
    });
  });
}

function correctWssEndpoint(endpoint: string, env: Record<string, string>): string {
  if (!allowQueueWssCorrection(env)) return endpoint;
  return endpoint.replace(/^ws:\/\//i, "wss://").trim();
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

function manageQueueHeaders(env: Record<string, string>, req: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  if (authCode) {
    headers["x-supermtnode-auth-code"] = authCode;
    headers["x-license-code"] = authCode;
    headers["x-auth-code"] = authCode;
  }
  const token = firstUsableToken(
    env.MANAGE_INGEST_TOKEN,
    env.LIQUIDATION_QUEUE_ADMIN_TOKEN,
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
  );
  if (token) {
    headers["x-ingest-token"] = token;
    headers.authorization = `Bearer ${token}`;
  }
  return headers;
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
    (privateMemberBase ? `${privateMemberBase}/api/liquidation-queue/status` : "https://private.superarb.ai/api/liquidation-queue/status")
  );
}

function remoteQueueStatusHeaders(env: Record<string, string>, req: IncomingMessage): Record<string, string> {
  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  const token = firstUsableToken(
    env.LIQUIDATION_QUEUE_WSS_TOKEN,
    env.SUPERMTNODE_APP_TOKEN,
    env.LIQUIDATION_QUEUE_PUBLIC_TOKEN,
    env.LIQUIDATION_SNAPSHOT_TOKEN,
    env.MANAGE_INGEST_TOKEN,
  );
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
    ...(token ? { authorization: `Bearer ${token}`, "x-supermtnode-token": token, "x-supermtnode-app-token": token } : {}),
  };
}

function unwrapRemoteQueuePayload(payload: unknown): Record<string, unknown> {
  if (Array.isArray(payload)) return { rows: payload };
  if (!isRecord(payload)) return {};
  if (isRecord(payload.data)) return payload.data;
  return payload;
}

function readRemoteQueueRows(payload: Record<string, unknown>): Record<string, unknown>[] {
  const source = payload.items ?? payload.queue ?? payload.queues ?? payload.rows;
  if (Array.isArray(source)) return source.filter(isRecord);
  if (isRecord(source)) return Object.values(source).flatMap((value) => (Array.isArray(value) ? value.filter(isRecord) : isRecord(value) ? [value] : []));
  return [];
}

function isMatchingRemoteQueueRow(row: Record<string, unknown>, payload: { chain: ChainKey; market: string; walletAddress: string; endpointSlug?: string }): boolean {
  if (isExpiredRemoteQueueRow(row)) return false;
  const wallet = remoteQueueWallet(row);
  if (wallet.toLowerCase() !== payload.walletAddress.toLowerCase()) return false;
  const rowChain = stringValue(row.chain, row.network, row.chainKey, row.chain_key);
  if (rowChain && normalizeChain(rowChain) !== payload.chain) return false;
  const action = (stringValue(row.action) ?? "").toLowerCase();
  const status = (stringValue(row.status) ?? "").toLowerCase();
  if (STOP_ACTIONS.includes(action) || ["paused", "stopped", "stop", "logout", "disconnect", "unregister"].includes(status)) return false;
  return true;
}

function remoteQueueWallet(row: Record<string, unknown>): string {
  const direct = stringValue(row.walletAddress, row.wallet_address, row.address, row.account, row.user, row.borrower);
  if (direct) return direct;
  if (typeof row.wallet === "string") return row.wallet.trim();
  if (isRecord(row.wallet)) return stringValue(row.wallet.address, row.wallet.walletAddress, row.wallet.wallet_address) ?? "";
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

function manageQueuePayload(payload: {
  action: string;
  chain: ChainKey;
  market: string;
  walletAddress: string;
  balances?: WalletBalances;
  endpointSlug?: string;
  rpcEnv: string;
  eligible: boolean;
  reason?: string;
  generatedAt: string;
  lastSeenAt: string;
  heartbeatIntervalMs: number;
  expiresAt: string;
  privateKeyCipher?: string;
  walletPublicKey?: string;
  username?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  creditBurnPerSecond?: number | null;
}) {
  const stopping = STOP_ACTIONS.includes(payload.action);
  const status = stopping ? "paused" : payload.eligible ? "queued" : "waiting";
  const queueMemberKey = buildQueueMemberKey(payload.chain, payload.walletAddress, payload.market, payload.endpointSlug);
  const queueItemId = `endpoint-start:${payload.chain}:${payload.walletAddress.toLowerCase()}:${payload.market}`;
  return {
    chain: payload.chain,
    source: `${chainLabel(payload.chain).toLowerCase()}-rpc-queue`,
    action: payload.action,
    market: payload.market,
    wallet: payload.walletAddress,
    walletAddress: payload.walletAddress,
    endpointSlug: payload.endpointSlug,
    participantId: queueMemberKey,
    participantKey: queueMemberKey,
    queueMemberKey,
    queue_member_key: queueMemberKey,
    dedupeKey: queueMemberKey,
    dedupe_key: queueMemberKey,
    rpc: payload.rpcEnv,
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
        chain: payload.chain,
        wallet: payload.walletAddress,
        walletAddress: payload.walletAddress,
        wallet_address: payload.walletAddress,
        username: payload.username,
        privateKeyCipher: payload.privateKeyCipher,
        walletPublicKey: payload.walletPublicKey,
        publicKey: payload.walletPublicKey,
        arbitrageIntensity: payload.arbitrageIntensity,
        arbitrage_intensity: payload.arbitrageIntensity,
        credentialAuthMode: payload.credentialAuthMode,
        credential_auth_mode: payload.credentialAuthMode,
        singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
        single_trade_auth_amount_usdt: payload.singleTradeAuthAmountUsdt,
        rpcPlanType: payload.rpcPlanType,
        rpc_plan_type: payload.rpcPlanType,
        rpcPlanName: payload.rpcPlanName,
        rpc_plan_name: payload.rpcPlanName,
        creditBurnPerSecond: payload.creditBurnPerSecond,
        credit_burn_per_second: payload.creditBurnPerSecond,
        executionSettings: {
          arbitrageIntensity: payload.arbitrageIntensity,
          credentialAuthMode: payload.credentialAuthMode,
          singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
          rpcPlanType: payload.rpcPlanType,
          rpcPlanName: payload.rpcPlanName,
          creditBurnPerSecond: payload.creditBurnPerSecond,
        },
        asset: `${tokenContracts[payload.chain].gasSymbol} / USDT / USDC`,
        balances: payload.balances,
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

function protocolLabelFromMarket(market: string): string {
  if (market.includes("liquity")) return "Liquity V2";
  if (market.includes("compound")) return market.includes("v2") ? "Compound V2 Fork" : "Compound V3";
  if (market.includes("venus")) return "Venus";
  return "Aave V3";
}

function buildQueueMemberKey(chain: ChainKey, walletAddress: string, market: string, endpointSlug?: string): string {
  return [
    "endpoint-start",
    chain,
    (endpointSlug || "rpc").toLowerCase(),
    walletAddress.toLowerCase(),
    market.toLowerCase(),
  ].join(":");
}

function buildTxWalletCredentialFields(env: Record<string, string>, walletAddress: string): {
  username: string;
  walletPublicKey: string;
  privateKeyCipher: string;
} {
  const privateKey = normalizePrivateKey(env.PRIVATE_KEY?.trim() ?? "");
  const walletPublicKey = privateKeyToPublicKey(privateKey);
  return {
    username: walletAddress.slice(2, 10).toLowerCase(),
    walletPublicKey,
    privateKeyCipher: encryptForTxWallet(privateKey, readTxPublicKeyPem(env)),
  };
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

function readTxPublicKeyPem(env: Record<string, string>): string {
  const inlineKey = env.TX_WALLET_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (inlineKey) return inlineKey;
  const configuredPath = env.TX_WALLET_PUBLIC_KEY_PATH?.trim();
  if (configuredPath && existsSync(configuredPath)) return readFileSync(configuredPath, "utf8");
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

function privateKeyToPublicKey(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能生成钱包公钥。");
  return `0x${Buffer.from(getPublicKey(hexToBytes(key), false)).toString("hex")}`;
}

function normalizePrivateKey(privateKey: string): string {
  const hex = privateKey.trim().replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error("PRIVATE_KEY 格式不正确，不能加密提交。");
  return `0x${hex}`;
}

async function readWalletBalances(chain: ChainKey, walletAddress: string, rpcUrl: string, env: Record<string, string>): Promise<WalletBalances> {
  const config = tokenContracts[chain];
  const gas = await rpc<string>(rpcUrl, "eth_getBalance", [walletAddress, "latest"], env).then((value) => formatUnits(hexToBigInt(value), 18, 5));
  const [usdt, usdc] = await Promise.all([
    readOptionalTokenBalance(rpcUrl, config.usdt, walletAddress, env),
    readOptionalTokenBalance(rpcUrl, config.usdc, walletAddress, env),
  ]);
  return {
    gas: { symbol: config.gasSymbol, formatted: gas },
    usdt: { symbol: "USDT", formatted: usdt },
    usdc: { symbol: "USDC", formatted: usdc },
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
    if (action === "start") throw error;
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
): Promise<{ chain: ChainKey; rpcUrl?: string; requestCount: number; ok: boolean; error?: string }> {
  const requestCount = rpcBurnRequestCount(env);
  let lastError: unknown;
  for (const rpcUrl of rpcUrls) {
    let completed = 0;
    try {
      for (let index = 0; index < requestCount; index += 1) {
        await rpc<string>(rpcUrl, "eth_blockNumber", [], env);
        completed += 1;
      }
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

function rpcBurnRequestCount(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_RPC_BURN_COUNT ?? env.RPC_KEEPALIVE_BURN_COUNT);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(3, Math.floor(parsed)) : 1;
}

function heartbeatIntervalMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_HEARTBEAT_INTERVAL_MS);
  return Number.isFinite(parsed) && parsed >= 5_000 ? Math.min(parsed, 60_000) : DEFAULT_HEARTBEAT_INTERVAL_MS;
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
