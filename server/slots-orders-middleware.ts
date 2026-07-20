import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Wallet, id } from "ethers";
import { ENV_FILE } from "./runtime-paths";

const DEFAULT_PRIVATE_ARB_API_URL = "https://privateapi.superarb.ai";
const DEFAULT_PRIVATE_ARB_WALLET_ACTIVITY_PATH = "/wallet-activity";
const DEFAULT_TX2_TREASURY_CONFIG_PATH = "/api/private-member/treasury-compensation-config";
const UPSTREAM_PAGE_SIZE = 200;
const MAX_ORDERS = 2_000;
const REQUEST_TIMEOUT_MS = 12_000;
const BSC_USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const COMPENSATION_PAID_OUT_TOPIC = id("CompensationPaidOut(bytes32,address,uint256,address)").toLowerCase();
const BSC_PUBLIC_RPC_URL = "https://bsc-dataseed.binance.org";
const ON_CHAIN_AMOUNT_CONCURRENCY = 5;
const TREASURY_POOL_CACHE_MS = 5 * 60_000;

type JsonRecord = Record<string, unknown>;
type OrderStatusGroup = "active" | "completed" | "failed" | "cancelled" | "unknown";

type SlotOrder = {
  id: string;
  orderNo: string;
  legacyTradeId: string;
  chain: string;
  chainId: number | null;
  orderType: string;
  mode: string;
  status: string;
  statusGroup: OrderStatusGroup;
  symbol: string;
  tokenAddress: string;
  usdtAmount: string;
  effectiveUsdtAmount: string;
  rewardUsdt: string;
  rewardVerified: boolean;
  rewardProofId: string;
  rewardRequestId: string;
  rewardRecordSource: string;
  rewardPipelineSource: string;
  rewardDirection: string;
  rewardCounterparty: string;
  parentOrderId: string;
  parentOrderNo: string;
  rewardCount: number;
  linkedRewardUsdt: string;
  xbchAmount: string;
  xbchPriceUsdt: string;
  priceSource: string;
  poolContractId: string;
  paymentTxHash: string;
  executionTxHash: string;
  approveTxHash: string;
  txHash: string;
  router: string;
  slippageBps: number | null;
  blockNumber: string;
  error: string;
  orderedAt: string;
  paidAt: string;
  executedAt: string;
  createdAt: string;
  updatedAt: string;
  explorerUrl: string;
};

type RpcLog = {
  address?: string;
  topics?: unknown;
  data?: string;
};

type RpcReceipt = {
  status?: string;
  logs?: RpcLog[];
} | null;

const onChainOrderAmountCache = new Map<string, string>();
const rewardProofCache = new Map<string, { verified: boolean; checkedAt: number }>();
const treasuryPoolCache = new Map<string, { addresses: Set<string>; checkedAt: number }>();

class SlotsApiError extends Error {
  constructor(readonly statusCode: number, readonly code: string, message: string) {
    super(message);
    this.name = "SlotsApiError";
  }
}

export function handleSlotsOrdersRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (pathname !== "/api/slots/orders") return false;

  if (req.method !== "GET") {
    sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
    return true;
  }

  void loadSlotsOrders(req)
    .then((payload) => sendJson(res, 200, payload))
    .catch((error: unknown) => sendError(res, error));
  return true;
}

async function loadSlotsOrders(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/api/slots/orders", "http://127.0.0.1");
  if (requestUrl.searchParams.has("walletAddress") || requestUrl.searchParams.has("username")) {
    throw new SlotsApiError(400, "WALLET_OVERRIDE_FORBIDDEN", "钱包由本地 PRIVATE_KEY 确定，不能从页面指定。");
  }

  const env = readEnv();
  requireAuthorizedReadRequest(req, env);
  const walletAddress = walletAddressFromPrivateKey(env.PRIVATE_KEY);
  const result = await fetchAllOrders(walletAddress, env, requestAuthCode(req));
  const allSorted = [...result.orders].sort((left, right) => orderTimestamp(right) - orderTimestamp(left));
  const sorted = allSorted.slice(0, MAX_ORDERS);
  await enrichBscOrderAmounts(sorted, walletAddress, env);
  await enrichBscRewardProofs(sorted, walletAddress, env);
  linkRewardsToOrders(sorted);

  return {
    ok: true,
    source: privateArbActivitySource(env),
    walletAddress,
    summary: summarizeOrders(sorted),
    orders: sorted,
    truncated: result.truncated || allSorted.length > MAX_ORDERS,
    updatedAt: new Date().toISOString(),
  };
}

async function fetchAllOrders(
  walletAddress: string,
  env: Record<string, string>,
  authCode: string,
  retryOnHeadChange = true,
): Promise<{ orders: SlotOrder[]; truncated: boolean }> {
  const byId = new Map<string, SlotOrder>();
  let initialHeadSignature = "";
  for (let offset = 0; offset < MAX_ORDERS; offset += UPSTREAM_PAGE_SIZE) {
    const rows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, offset, env, authCode);
    if (offset === 0) initialHeadSignature = orderPageSignature(rows);
    mergeOrderRows(byId, rows, walletAddress);
    if (rows.length < UPSTREAM_PAGE_SIZE) {
      if (offset > 0) {
        const latestRows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, 0, env, authCode);
        if (retryOnHeadChange && orderPageSignature(latestRows) !== initialHeadSignature) {
          return fetchAllOrders(walletAddress, env, authCode, false);
        }
        mergeOrderRows(byId, latestRows, walletAddress);
      }
      return { orders: [...byId.values()], truncated: false };
    }
  }
  const remaining = await fetchActivityPage(walletAddress, 1, MAX_ORDERS, env, authCode);
  const latestRows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, 0, env, authCode);
  if (retryOnHeadChange && orderPageSignature(latestRows) !== initialHeadSignature) {
    return fetchAllOrders(walletAddress, env, authCode, false);
  }
  mergeOrderRows(byId, latestRows, walletAddress);
  return { orders: [...byId.values()], truncated: remaining.length > 0 };
}

function orderPageSignature(rows: unknown[]): string {
  return rows.map((item) => {
    if (!isRecord(item)) return "";
    return [
      stringValue(item.orderNo, item.order_no, item.id),
      stringValue(item.status),
      stringValue(item.updatedAt, item.updated_at, item.createdAt, item.created_at),
    ].join(":");
  }).join("|");
}

function mergeOrderRows(byId: Map<string, SlotOrder>, rows: unknown[], walletAddress: string): void {
  for (const item of rows) {
    if (!isRecord(item)) continue;
    const orderWallet = stringValue(item.walletAddress, item.wallet_address, item.wallet);
    // The privateARB endpoint has already authenticated the signed wallet request.
    // It may omit walletAddress from every row; if present, it still must match.
    if (orderWallet && orderWallet.toLowerCase() !== walletAddress.toLowerCase()) continue;
    const order = normalizeOrder(item);
    if (order) byId.set(order.orderNo || order.id, order);
  }
}

async function enrichBscOrderAmounts(orders: SlotOrder[], walletAddress: string, env: Record<string, string>): Promise<void> {
  const candidates = orders.filter((order) => (
    isTradeOrderType(order.orderType)
    && (order.chainId === 56 || order.chain === "bnb" || order.chain === "bsc")
    && Boolean(order.txHash)
  ));

  await forEachWithConcurrency(candidates, ON_CHAIN_AMOUNT_CONCURRENCY, async (order) => {
    const amount = await bscOrderAmountFromReceipt(order.txHash, walletAddress, env).catch(() => "");
    if (amount) order.usdtAmount = amount;
  });
}

async function bscOrderAmountFromReceipt(txHash: string, walletAddress: string, env: Record<string, string>): Promise<string> {
  const cacheKey = txHash.toLowerCase();
  const cached = onChainOrderAmountCache.get(cacheKey);
  if (cached !== undefined) return cached;

  const rpcUrl = env.BNB_RPC_URL?.trim() || env.BSC_RPC_URL?.trim() || BSC_PUBLIC_RPC_URL;
  const receipt = await rpcRequest<RpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  const walletTopic = `0x${walletAddress.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
  const amount = (receipt?.logs || [])
    .filter((log) => (
      log.address?.toLowerCase() === BSC_USDT_ADDRESS
      && Array.isArray(log.topics)
      && String(log.topics[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
      && String(log.topics[1] || "").toLowerCase() === walletTopic
    ))
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const formatted = amount > 0n ? formatTokenAmount(amount, 18) : "";
  onChainOrderAmountCache.set(cacheKey, formatted);
  return formatted;
}

async function enrichBscRewardProofs(orders: SlotOrder[], walletAddress: string, env: Record<string, string>): Promise<void> {
  const treasuryPool = await readTx2TreasuryPool(env).catch(() => new Set<string>());
  const candidates = orders.filter((order) => (
    isStrictTx2RewardCandidate(order)
    && treasuryPool.has(order.rewardCounterparty.toLowerCase())
  ));
  await forEachWithConcurrency(candidates, ON_CHAIN_AMOUNT_CONCURRENCY, async (order) => {
    order.rewardVerified = await verifyTx2RewardOnChain(order, walletAddress, env).catch(() => false);
  });
}

async function readTx2TreasuryPool(env: Record<string, string>): Promise<Set<string>> {
  const endpoint = tx2TreasuryConfigEndpoint(env);
  const cached = treasuryPoolCache.get(endpoint);
  if (cached && Date.now() - cached.checkedAt < TREASURY_POOL_CACHE_MS) return cached.addresses;

  const response = await fetch(endpoint, {
    headers: privateArbActivityHeaders(env, ""),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || payload.ok === false || !Array.isArray(payload.addresses)) {
    throw new Error(`tx2 treasury config unavailable (HTTP ${response.status})`);
  }
  const addresses = new Set(
    payload.addresses
      .map((address) => String(address || "").trim().toLowerCase())
      .filter((address) => /^0x[a-f0-9]{40}$/.test(address)),
  );
  if (addresses.size === 0) throw new Error("tx2 treasury config returned an empty contract pool");
  treasuryPoolCache.set(endpoint, { addresses, checkedAt: Date.now() });
  return addresses;
}

function tx2TreasuryConfigEndpoint(env: Record<string, string>): string {
  const configured = env.TX2_TREASURY_COMPENSATION_CONFIG_URL?.trim();
  if (configured) return configured;
  const activityUrl = new URL(privateArbActivityEndpoint(env));
  activityUrl.pathname = DEFAULT_TX2_TREASURY_CONFIG_PATH;
  activityUrl.search = "";
  activityUrl.hash = "";
  return activityUrl.toString();
}

function isStrictTx2RewardCandidate(order: SlotOrder): boolean {
  return isRewardOrderType(order.orderType)
    && order.rewardRecordSource === "tx2"
    && order.rewardPipelineSource === "treasury-compensation-relayer"
    && order.rewardDirection === "in"
    && (order.chainId === 56 || order.chain === "bnb" || order.chain === "bsc")
    && order.tokenAddress.toLowerCase() === BSC_USDT_ADDRESS
    && /^0x[a-fA-F0-9]{40}$/.test(order.rewardCounterparty)
    && /^0x[a-fA-F0-9]{64}$/.test(order.rewardRequestId)
    && /^0x[a-fA-F0-9]{64}$/.test(order.txHash)
    && decimalToTokenAmount(order.rewardUsdt, 18) > 0n;
}

async function verifyTx2RewardOnChain(order: SlotOrder, walletAddress: string, env: Record<string, string>): Promise<boolean> {
  const expectedAmount = decimalToTokenAmount(order.rewardUsdt, 18);
  const cacheKey = [order.txHash, walletAddress, order.rewardCounterparty, order.rewardRequestId, expectedAmount].join(":").toLowerCase();
  const cached = rewardProofCache.get(cacheKey);
  if (cached && (cached.verified || Date.now() - cached.checkedAt < 15_000)) return cached.verified;

  const rpcUrl = env.BNB_RPC_URL?.trim() || env.BSC_RPC_URL?.trim() || BSC_PUBLIC_RPC_URL;
  const receipt = await rpcRequest<RpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [order.txHash]);
  const treasury = order.rewardCounterparty.toLowerCase();
  const walletTopic = addressTopic(walletAddress);
  const treasuryTopic = addressTopic(treasury);
  const tokenTopic = addressTopic(BSC_USDT_ADDRESS);
  const requestTopic = order.rewardRequestId.toLowerCase();
  let transferVerified = false;
  let payoutEventVerified = false;

  if (receipt?.status === "0x1") {
    for (const log of receipt.logs || []) {
      const topics = Array.isArray(log.topics) ? log.topics.map((topic) => String(topic).toLowerCase()) : [];
      const amount = hexTokenAmount(log.data);
      if (
        log.address?.toLowerCase() === BSC_USDT_ADDRESS
        && topics[0] === ERC20_TRANSFER_TOPIC
        && topics[1] === treasuryTopic
        && topics[2] === walletTopic
        && amount === expectedAmount
      ) transferVerified = true;
      if (
        log.address?.toLowerCase() === treasury
        && topics[0] === COMPENSATION_PAID_OUT_TOPIC
        && topics[1] === requestTopic
        && topics[2] === walletTopic
        && topics[3] === tokenTopic
        && amount === expectedAmount
      ) payoutEventVerified = true;
    }
  }

  const verified = transferVerified && payoutEventVerified;
  rewardProofCache.set(cacheKey, { verified, checkedAt: Date.now() });
  return verified;
}

function addressTopic(address: string): string {
  return `0x${address.toLowerCase().replace(/^0x/, "").padStart(64, "0")}`;
}

function decimalToTokenAmount(value: string, decimals: number): bigint {
  const match = value.trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  return BigInt(match[1]) * 10n ** BigInt(decimals) + BigInt((match[2] || "").slice(0, decimals).padEnd(decimals, "0"));
}

async function forEachWithConcurrency<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  const worker = async () => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

async function rpcRequest<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as { result?: T; error?: { message?: string } };
  if (!response.ok || payload.error || payload.result === undefined) {
    throw new Error(payload.error?.message || `RPC ${response.status}`);
  }
  return payload.result;
}

function hexTokenAmount(value: unknown): bigint {
  const hex = typeof value === "string" ? value : "";
  return /^0x[0-9a-f]+$/i.test(hex) ? BigInt(hex) : 0n;
}

function formatTokenAmount(value: bigint, decimals: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = (value % base).toString().padStart(decimals, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

async function fetchActivityPage(
  walletAddress: string,
  limit: number,
  offset: number,
  env: Record<string, string>,
  authCode: string,
): Promise<unknown[]> {
  const endpoint = privateArbActivityEndpoint(env);
  const url = new URL(endpoint);
  url.searchParams.set("walletAddress", walletAddress);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, {
    headers: privateArbActivityHeaders(env, authCode),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  // privateARB uses 404 when a wallet does not have any activity yet.
  // Treat that as an empty ledger so the Slots page can render its empty state.
  if (response.status === 404) return [];
  if (!response.ok || payload.ok === false) {
    throw new SlotsApiError(502, "PRIVATE_ARB_ACTIVITY_UNAVAILABLE", `privateARB 钱包活动服务暂不可用（HTTP ${response.status}）。`);
  }
  const rows = arrayValue(payload.records, payload.activities, payload.events, payload.orders, payload.items, payload.rows);
  if (!rows) {
    throw new SlotsApiError(502, "PRIVATE_ARB_ACTIVITY_INVALID_RESPONSE", "privateARB 钱包活动服务返回格式不正确。");
  }
  return rows;
}

function privateArbActivityEndpoint(env: Record<string, string>): string {
  const configured = env.PRIVATE_ARB_WALLET_ACTIVITY_URL?.trim();
  if (configured) return configured;
  const base = (env.LIQ2_PRIVATE_MEMBER_API_URL?.trim() || DEFAULT_PRIVATE_ARB_API_URL).replace(/\/+$/, "");
  return `${base}${DEFAULT_PRIVATE_ARB_WALLET_ACTIVITY_PATH}`;
}

function privateArbActivitySource(env: Record<string, string>): string {
  try {
    return new URL(privateArbActivityEndpoint(env)).host;
  } catch {
    return "privateARB wallet activity";
  }
}

function privateArbActivityHeaders(env: Record<string, string>, authCode: string): Record<string, string> {
  const appToken = (env.SUPERMTNODE_APP_TOKEN || "").trim();
  return {
    accept: "application/json",
    ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
    ...(appToken ? { "x-supermtnode-app-token": appToken } : {}),
  };
}

function normalizeOrder(row: JsonRecord): SlotOrder | null {
  const id = safeLabel(row.id ?? row.recordId ?? row.record_id ?? row.eventId ?? row.event_id, "", 80);
  const orderNo = safeLabel(row.orderNo ?? row.order_no ?? row.recordNo ?? row.record_no, "", 120);
  if (!id && !orderNo) return null;

  const chain = normalizeIdentifier(stringValue(row.chain), "unknown");
  const chainId = nullableInteger(row.chainId, row.chain_id);
  const orderType = normalizeIdentifier(stringValue(row.orderType, row.order_type, row.recordType, row.record_type, row.activityType, row.activity_type, row.type), "unknown");
  const status = normalizeIdentifier(stringValue(row.status), "unknown");
  const executionTxHash = txHashValue(row.executionTxHash, row.execution_tx_hash, row.txHash, row.tx_hash, row.transactionHash, row.transaction_hash);
  const paymentTxHash = txHashValue(row.paymentTxHash, row.payment_tx_hash);
  const approveTxHash = txHashValue(row.approveTxHash, row.approve_tx_hash);
  const rewardTxHash = txHashValue(row.rewardTxHash, row.reward_tx_hash, row.payoutTxHash, row.payout_tx_hash);
  const txHash = executionTxHash || paymentTxHash || approveTxHash || rewardTxHash;
  const detail = recordValue(row.detail, row.metadata);
  const rewardRequestId = txHashValue(row.requestId, row.request_id, detail.requestId, detail.request_id);

  return {
    id: id || orderNo,
    orderNo: orderNo || `order-${id}`,
    legacyTradeId: safeLabel(row.legacyTradeId ?? row.legacy_trade_id, "", 80),
    chain,
    chainId,
    orderType,
    mode: normalizeIdentifier(stringValue(row.mode), "unknown"),
    status,
    statusGroup: statusGroup(status),
    symbol: safeLabel(row.symbol, "--", 24),
    tokenAddress: addressValue(row.tokenAddress, row.token_address),
    usdtAmount: decimalValue(row.usdtAmount, row.usdt_amount),
    effectiveUsdtAmount: decimalValue(row.effectiveUsdtAmount, row.effective_usdt_amount),
    rewardUsdt: decimalValue(
      row.rewardUsdt,
      row.reward_usdt,
      row.rewardAmountUsdt,
      row.reward_amount_usdt,
      row.payoutUsdt,
      row.payout_usdt,
      row.amountUsdt,
      row.amount_usdt,
      isRewardOrderType(orderType) ? row.usdtAmount : undefined,
      isRewardOrderType(orderType) ? row.usdt_amount : undefined,
    ),
    rewardVerified: false,
    rewardProofId: rewardRequestId ? `tx2:${rewardRequestId}` : "",
    rewardRequestId,
    rewardRecordSource: normalizeIdentifier(stringValue(row.source), ""),
    rewardPipelineSource: normalizeIdentifier(stringValue(detail.source), ""),
    rewardDirection: normalizeIdentifier(stringValue(row.direction), ""),
    rewardCounterparty: addressValue(row.counterparty, detail.treasuryAddress, detail.treasury_address),
    parentOrderId: safeLabel(
      row.parentOrderId ?? row.parent_order_id ?? row.sourceOrderId ?? row.source_order_id ?? row.slotOrderId ?? row.slot_order_id,
      "",
      120,
    ),
    parentOrderNo: safeLabel(
      row.parentOrderNo ?? row.parent_order_no ?? row.sourceOrderNo ?? row.source_order_no ?? row.slotOrderNo ?? row.slot_order_no,
      "",
      120,
    ),
    rewardCount: 0,
    linkedRewardUsdt: "0",
    xbchAmount: decimalValue(row.xbchAmount, row.xbch_amount),
    xbchPriceUsdt: decimalValue(row.xbchPriceUsdt, row.xbch_price_usdt),
    priceSource: safeLabel(row.priceSource ?? row.price_source, "", 80),
    poolContractId: safeLabel(row.poolContractId ?? row.pool_contract_id, "", 100),
    paymentTxHash,
    executionTxHash,
    approveTxHash,
    txHash,
    router: addressValue(row.router),
    slippageBps: nullableInteger(row.slippageBps, row.slippage_bps),
    blockNumber: unsignedIntegerString(row.blockNumber, row.block_number),
    error: safeLabel(row.error, "", 500),
    orderedAt: dateString(row.orderedAt, row.ordered_at, row.occurredAt, row.occurred_at),
    paidAt: dateString(row.paidAt, row.paid_at),
    executedAt: dateString(row.executedAt, row.executed_at),
    createdAt: dateString(row.createdAt, row.created_at),
    updatedAt: dateString(row.updatedAt, row.updated_at),
    explorerUrl: txHash ? explorerTxUrl(chainId, chain, txHash) : "",
  };
}

/** Associate reward events with the order that created the slot. */
function linkRewardsToOrders(orders: SlotOrder[]): void {
  const ordersByReference = new Map<string, SlotOrder>();
  for (const order of orders) {
    if (!isTradeOrderType(order.orderType)) continue;
    if (order.id) ordersByReference.set(order.id, order);
    if (order.orderNo) ordersByReference.set(order.orderNo, order);
  }

  for (const reward of orders) {
    if (!isRewardOrderType(reward.orderType)) continue;
    const parent = ordersByReference.get(reward.parentOrderId) || ordersByReference.get(reward.parentOrderNo);
    if (!parent) continue;
    parent.rewardCount += 1;
    parent.linkedRewardUsdt = addDecimalStrings(parent.linkedRewardUsdt, reward.rewardUsdt);
  }
}

function summarizeOrders(orders: SlotOrder[]) {
  const tradeOrders = orders.filter((order) => isTradeOrderType(order.orderType));
  const rewardOrders = orders.filter((order) => isRewardOrderType(order.orderType));
  const completed = tradeOrders.filter((order) => order.statusGroup === "completed").length;
  const active = tradeOrders.filter((order) => order.statusGroup === "active").length;
  const failed = tradeOrders.filter((order) => order.statusGroup === "failed").length;
  const cancelled = tradeOrders.filter((order) => order.statusGroup === "cancelled").length;
  const totalUsdt = tradeOrders
    .reduce((total, order) => addDecimalStrings(total, order.effectiveUsdtAmount || order.usdtAmount), "0");
  const rewardUsdt = rewardOrders
    .reduce((total, order) => addDecimalStrings(total, order.rewardUsdt), "0");
  const xbchTotal = tradeOrders
    .reduce((total, order) => addDecimalStrings(total, order.xbchAmount), "0");
  return {
    total: tradeOrders.length,
    recordTotal: orders.length,
    operationTotal: orders.length - tradeOrders.length,
    active,
    completed,
    failed,
    cancelled,
    totalUsdt,
    rewardTotal: rewardOrders.length,
    rewardUsdt,
    xbchTotal,
  };
}

function statusGroup(status: string): OrderStatusGroup {
  if (["pending", "paid", "ordered", "queued", "running", "executing", "processing", "submitted", "created"].includes(status)) return "active";
  if (["success", "fulfilled", "completed"].includes(status)) return "completed";
  if (["failed", "blocked", "error", "reverted"].includes(status)) return "failed";
  if (["cancelled", "canceled"].includes(status)) return "cancelled";
  return "unknown";
}

function isTradeOrderType(orderType: string): boolean {
  return ["buy_xbch", "sell_xbch", "legacy_trade"].includes(orderType);
}

function isRewardOrderType(orderType: string): boolean {
  return ["reward", "rewards", "profit", "paid_profit", "payout", "rebate"].includes(orderType);
}

function addDecimalStrings(left: string, right: string): string {
  const scale = 18;
  const parse = (value: string) => {
    if (!/^\d+(?:\.\d+)?$/.test(value)) return 0n;
    const [whole, fraction = ""] = value.split(".");
    return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.slice(0, scale).padEnd(scale, "0"));
  };
  const total = parse(left) + parse(right);
  const base = 10n ** BigInt(scale);
  const fraction = (total % base).toString().padStart(scale, "0").replace(/0+$/, "");
  return fraction ? `${total / base}.${fraction}` : (total / base).toString();
}

function requireAuthorizedReadRequest(req: IncomingMessage, env: Record<string, string>): void {
  const expected = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!expected) throw new SlotsApiError(503, "AUTH_CODE_NOT_CONFIGURED", "请先登录并在 .env 保存 AUTH_CODE。");
  const provided = requestAuthCode(req).toUpperCase();
  if (!provided || !safeEqual(provided, expected)) throw new SlotsApiError(401, "UNAUTHORIZED", "授权码无效。");

  const originValue = headerValue(req.headers.origin);
  if (!originValue) return;
  const hostValue = headerValue(req.headers.host).toLowerCase();
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new SlotsApiError(403, "UNTRUSTED_ORIGIN", "订单请求来源无效。");
  }
  const local = origin.hostname === "localhost" || origin.hostname === "127.0.0.1";
  if (!local || !hostValue || origin.host.toLowerCase() !== hostValue) {
    throw new SlotsApiError(403, "UNTRUSTED_ORIGIN", "订单请求必须来自当前本地面板。");
  }
}

function requestAuthCode(req: IncomingMessage): string {
  return headerValue(req.headers["x-supermtnode-auth-code"]);
}

function walletAddressFromPrivateKey(value?: string): string {
  const privateKey = value?.trim() || "";
  if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(privateKey)) {
    throw new SlotsApiError(400, "INVALID_PRIVATE_KEY", "请先在设置中配置有效的 PRIVATE_KEY。");
  }
  return new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`).address;
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

function orderTimestamp(order: SlotOrder): number {
  for (const value of [order.orderedAt, order.executedAt, order.createdAt, order.updatedAt]) {
    const timestamp = Date.parse(value);
    if (Number.isFinite(timestamp)) return timestamp;
  }
  return 0;
}

function explorerTxUrl(chainId: number | null, chain: string, hash: string): string {
  if (chainId === 56 || chain === "bnb" || chain === "bsc") return `https://bscscan.com/tx/${hash}`;
  if (chainId === 42161 || chain === "arbitrum") return `https://arbiscan.io/tx/${hash}`;
  if (chainId === 1 || chain === "ethereum") return `https://etherscan.io/tx/${hash}`;
  return "";
}

function decimalValue(...values: unknown[]): string {
  const value = stringValue(...values).replace(/,/g, "");
  return /^\d+(?:\.\d+)?$/.test(value) ? value : "";
}

function unsignedIntegerString(...values: unknown[]): string {
  const value = stringValue(...values);
  return /^\d+$/.test(value) ? value : "";
}

function nullableInteger(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === null || value === undefined || value === "") continue;
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed >= 0) return parsed;
  }
  return null;
}

function normalizeIdentifier(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_-]{1,48}$/.test(normalized) ? normalized : fallback;
}

function addressValue(...values: unknown[]): string {
  const value = stringValue(...values);
  return /^0x[a-fA-F0-9]{40}$/.test(value) ? value : "";
}

function txHashValue(...values: unknown[]): string {
  const value = stringValue(...values);
  return /^0x[a-fA-F0-9]{64}$/.test(value) ? value : "";
}

function dateString(...values: unknown[]): string {
  const value = stringValue(...values);
  if (!value) return "";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : "";
}

function safeLabel(value: unknown, fallback: string, maxLength: number): string {
  const text = typeof value === "string" || typeof value === "number" ? String(value).trim() : "";
  return (text || fallback).replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, maxLength);
}

function stringValue(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function arrayValue(...values: unknown[]): unknown[] | null {
  for (const value of values) {
    if (Array.isArray(value)) return value;
  }
  return null;
}

function recordValue(...values: unknown[]): JsonRecord {
  for (const value of values) {
    if (isRecord(value)) return value;
    if (typeof value === "string" && value.trim()) {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (isRecord(parsed)) return parsed;
      } catch {
        // Ignore malformed upstream metadata; it can never verify a reward.
      }
    }
  }
  return {};
}

function headerValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim() || "";
  return value?.trim() || "";
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requestPathname(value?: string): string {
  try {
    return new URL(value || "", "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof SlotsApiError) {
    sendJson(res, error.statusCode, { ok: false, code: error.code, error: error.message });
    return;
  }
  const message = error instanceof Error && error.name === "TimeoutError" ? "privateARB 钱包活动服务请求超时。" : "privateARB 钱包活动读取失败，请稍后重试。";
  sendJson(res, 502, { ok: false, code: "SLOTS_ACTIVITY_ERROR", error: message });
}
