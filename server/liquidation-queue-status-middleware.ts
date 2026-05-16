import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const ENV_FILE = resolve(process.cwd(), ".env");
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_QUEUE_STATUS_API_URL = "https://api.supermtnode.io/api/public/liquidations/queue-status";
const BALANCE_OF_SELECTOR = "0x70a08231";

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

type WalletBalances = {
  gas: { symbol: string; formatted: string };
  usdt: { symbol: "USDT"; formatted: string };
  usdc: { symbol: "USDC"; formatted: string };
  updatedAt: string;
};

const chainEnvKeys: Record<ChainKey, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
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

async function registerQueueStatus(req: IncomingMessage) {
  const env = readEnv();
  const body = (await readJson(req)) as QueueRegisterPayload;
  const chain = normalizeChain(stringValue(body.chain) ?? "");
  const walletAddress = privateKeyToAddress(env.PRIVATE_KEY?.trim() ?? "");
  const rpcUrl = env[chainEnvKeys[chain]]?.trim();
  if (!rpcUrl) throw new Error(`${chainEnvKeys[chain]} 未配置，不能启动该链队列。`);

  const market = queueMarket(chain, body);
  const balances = await readWalletBalances(chain, walletAddress, rpcUrl);
  const gasBalance = Number(balances.gas.formatted);
  const endpoint = queueEndpoint("status", chain, env);
  if (!endpoint) throw new Error(`${chainLabel(chain)} 队列服务未配置。`);

  const action = stringValue(body.action)?.toLowerCase() ?? "start";
  const stopping = ["stop", "pause", "logout", "disconnect", "unregister"].includes(action);
  const eligible = !stopping && Number.isFinite(gasBalance) && gasBalance > 0;
  const reason = stopping ? "client stopped" : eligible ? undefined : `${chainLabel(chain)} wallet has no gas.`;
  const payload = {
    source: "liq2-client-start",
    version: "1.2",
    action,
    generatedAt: new Date().toISOString(),
    chain,
    market,
    walletAddress,
    wallet: { address: walletAddress, balances },
    assets: balances,
    endpointSlug: rpcEndpointSlugFromUrl(rpcUrl),
    rpcEnv: chainEnvKeys[chain],
    eligible,
    reason,
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  const remotePayload = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const detail = stringValue(remotePayload.error) ?? `HTTP ${response.status}`;
    throw new Error(`${chainLabel(chain)} 队列上报失败：${detail}`);
  }

  return {
    ok: true,
    source: "liq2-client-start",
    chain,
    chainLabel: chainLabel(chain),
    market,
    walletAddress,
    balances,
    endpoint,
    endpointSlug: payload.endpointSlug,
    eligible,
    reason,
    queue: isRecord(remotePayload.queue) ? remotePayload.queue : null,
    remote: remotePayload,
    updatedAt: new Date().toISOString(),
  };
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

  const headers: Record<string, string> = { accept: "application/json" };
  const token = env.LIQUIDATION_QUEUE_PUBLIC_TOKEN?.trim() || env.LIQUIDATION_SNAPSHOT_TOKEN?.trim();
  if (token) headers.authorization = `Bearer ${token}`;

  const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
  if (authCode) headers["x-supermtnode-auth-code"] = authCode;

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

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确，不能上报启动队列。");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

async function readWalletBalances(chain: ChainKey, walletAddress: string, rpcUrl: string): Promise<WalletBalances> {
  const config = tokenContracts[chain];
  const [gas, usdt, usdc] = await Promise.all([
    rpc<string>(rpcUrl, "eth_getBalance", [walletAddress, "latest"]).then((value) => formatUnits(hexToBigInt(value), 18, 5)),
    readTokenBalance(rpcUrl, config.usdt, walletAddress),
    readTokenBalance(rpcUrl, config.usdc, walletAddress),
  ]);
  return {
    gas: { symbol: config.gasSymbol, formatted: gas },
    usdt: { symbol: "USDT", formatted: usdt },
    usdc: { symbol: "USDC", formatted: usdc },
    updatedAt: new Date().toISOString(),
  };
}

async function readTokenBalance(rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string): Promise<string> {
  const data = `${BALANCE_OF_SELECTOR}${walletAddress.slice(2).padStart(64, "0")}`;
  const value = await rpc<string>(rpcUrl, "eth_call", [{ to: token.address, data }, "latest"]);
  return formatUnits(hexToBigInt(value), token.decimals, 2);
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
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

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQUIDATION_QUEUE_STATUS_TIMEOUT_MS ?? env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
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
