import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ENV_FILE } from "./runtime-paths";
import { SLOT_UNIT_PRICE_USDT, slotPurchasePolicy } from "./slot-purchase-policy";

const PRIVATE_ARB_WALLET_ACTIVITY_URL = "https://privateapi.superarb.ai/wallet-activity";
const LIQ2_SLOT_ORDERS_URL = "https://privateapi.superarb.ai/v1/liq2/slot-orders";
const DEFAULT_TX2_TREASURY_CONFIG_PATH = "/api/private-member/treasury-compensation-config";
const UPSTREAM_PAGE_SIZE = 200;
const MAX_ORDERS = 2_000;
const REQUEST_TIMEOUT_MS = 12_000;
const BSC_USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const ERC20_TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const COMPENSATION_PAID_OUT_TOPIC = "0x600fc69be5582278ca13137bc99851a3ae6d747d578dbf1d7147057ebd1b51f7";
const BSC_PUBLIC_RPC_URL = "https://bsc-dataseed.binance.org";
const BSC_SLOT_SALE_RPC_URL = "https://rpc.bscpro.supermtglobal.com";
const BSC_XBCH_ADDRESS = "0xf4471c699c4b85f6eb804e7e4f200b05750670fd";
const BSC_SLOT_SALE_ADDRESS = "0xdad780fe35145b7df68e63abb17a8118d1bdc5a0";
const BSC_PANCAKE_V2_ROUTER_ADDRESS = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const BSC_APPROVE_SELECTOR = "0x095ea7b3";
const BSC_BALANCE_OF_SELECTOR = "0x70a08231";
const BSC_QUOTE_BUY_SELECTOR = "0x4beb394c";
const BSC_BUY_SELECTOR = "0x8945257c";
const BSC_GET_AMOUNTS_OUT_SELECTOR = "0xd06ca61f";
const BSC_SWAP_EXACT_TOKENS_SELECTOR = "0x38ed1739";
const BSC_CHAIN_ID_HEX = "0x38";
const DEFAULT_PURCHASE_SLIPPAGE_BPS = 100n;
const MIN_PURCHASE_SLIPPAGE_BPS = 10n;
const MAX_PURCHASE_SLIPPAGE_BPS = 500n;
const PURCHASE_BPS_DENOMINATOR = 10_000n;
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
  slotCount: number;
};

type Liq2Profile = {
  rpcPlanType: string;
  rpcPlanName: string;
};

type RpcLog = {
  address?: string;
  topics?: unknown[];
  data?: string;
  blockTimestamp?: string;
};

type RpcReceipt = {
  status?: string;
  blockNumber?: string;
  logs?: RpcLog[];
} | null;

type SwapDirection = "usdt_to_xbch" | "xbch_to_usdt";

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
  if (!["/api/slots/orders", "/api/slots/purchase-quote", "/api/slots/purchase-confirm", "/api/swap/quote", "/api/swap/confirm", "/api/swap/balances"].includes(pathname)) return false;

  if (pathname === "/api/slots/orders" && req.method === "GET") {
    void loadSlotsOrders(req)
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  if (pathname === "/api/slots/purchase-quote" && req.method === "POST") {
    void readRequestJson(req)
      .then((body) => quoteSlotPurchase(body))
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  if (pathname === "/api/slots/purchase-confirm" && req.method === "POST") {
    void readRequestJson(req)
      .then((body) => confirmSlotPurchase(body))
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  if (pathname === "/api/swap/quote" && req.method === "POST") {
    void readRequestJson(req)
      .then((body) => quoteXbchSwap(body))
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  if (pathname === "/api/swap/confirm" && req.method === "POST") {
    void readRequestJson(req)
      .then((body) => confirmXbchSwap(body))
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  if (pathname === "/api/swap/balances" && req.method === "GET") {
    void loadSwapBalances()
      .then((payload) => sendJson(res, 200, payload))
      .catch((error: unknown) => sendError(res, error));
    return true;
  }
  {
    sendJson(res, 405, { ok: false, code: "METHOD_NOT_ALLOWED", error: "Method not allowed." });
    return true;
  }
}

async function loadSlotsOrders(req: IncomingMessage) {
  const requestUrl = new URL(req.url || "/api/slots/orders", "http://127.0.0.1");
  if (requestUrl.searchParams.has("walletAddress") || requestUrl.searchParams.has("username")) {
    throw new SlotsApiError(400, "WALLET_OVERRIDE_FORBIDDEN", "钱包地址由系统自动读取，不能从页面指定。");
  }

  const env = readEnv();
  const walletAddress = localWalletAddress(env);
  const [result, profile] = await Promise.all([
    fetchLiq2SlotOrders(walletAddress, env),
    fetchLiq2Profile(walletAddress, env),
  ]);
  const allSorted = [...result.orders].sort((left, right) => orderTimestamp(right) - orderTimestamp(left));
  const sorted = allSorted.slice(0, MAX_ORDERS);
  await enrichBscOrderAmounts(sorted, walletAddress, env);
  await enrichBscRewardProofs(sorted, walletAddress, env);
  linkRewardsToOrders(sorted);

  return {
    ok: true,
    source: privateArbActivitySource(),
    walletAddress,
    summary: summarizeOrders(sorted),
    purchase: slotPurchasePolicy({
      ...env,
      RPC_PLAN_TYPE: profile.rpcPlanType,
      RPC_PLAN_NAME: profile.rpcPlanName,
    }, purchasedSlotCount(allSorted)),
    rpcPlan: profile,
    orders: sorted,
    truncated: result.truncated || allSorted.length > MAX_ORDERS,
    updatedAt: new Date().toISOString(),
  };
}

async function quoteSlotPurchase(body: JsonRecord) {
  const quantity = positiveInteger(body.quantity);
  if (quantity < 1 || quantity > 100) throw new SlotsApiError(400, "INVALID_SLOT_QUANTITY", "购买数量必须是 1 到 100 的整数。");
  const slippageBps = purchaseSlippageBps(body.slippageBps);
  const env = readEnv();
  const walletAddress = localWalletAddress(env).toLowerCase();
  const [ordersResult, profile] = await Promise.all([
    fetchLiq2SlotOrders(walletAddress, env),
    fetchLiq2Profile(walletAddress, env),
  ]);
  const policy = slotPurchasePolicy({ ...env, RPC_PLAN_TYPE: profile.rpcPlanType, RPC_PLAN_NAME: profile.rpcPlanName }, purchasedSlotCount(ordersResult.orders));
  if (policy.maxSlots < 1 || quantity > policy.remainingSlots) {
    throw new SlotsApiError(409, "SLOT_PLAN_LIMIT_REACHED", `当前 ${policy.planName} 套餐还可购买 ${policy.remainingSlots} 个卡槽。`);
  }
  const paymentRaw = BigInt(quantity) * BigInt(SLOT_UNIT_PRICE_USDT) * 10n ** 18n;
  const quoteRaw = hexTokenAmount(await rpcRequest<string>(BSC_SLOT_SALE_RPC_URL, "eth_call", [{
    to: BSC_SLOT_SALE_ADDRESS,
    data: `${BSC_QUOTE_BUY_SELECTOR}${encodeUint256(paymentRaw)}`,
  }, "latest"]));
  if (quoteRaw <= 0n) throw new SlotsApiError(502, "SLOT_PURCHASE_QUOTE_UNAVAILABLE", "暂时无法获取 xBCH 链上报价。");
  const minXbchRaw = quoteRaw * (PURCHASE_BPS_DENOMINATOR - slippageBps) / PURCHASE_BPS_DENOMINATOR;
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  return {
    ok: true,
    walletAddress,
    chainId: BSC_CHAIN_ID_HEX,
    policy,
    purchase: {
      quantity,
      usdtAmount: formatTokenAmount(paymentRaw, 18),
      usdtAmountRaw: `0x${paymentRaw.toString(16)}`,
      expectedXbch: formatTokenAmount(quoteRaw, 18),
      minXbch: formatTokenAmount(minXbchRaw, 18),
      slippageBps: Number(slippageBps),
      saleAddress: BSC_SLOT_SALE_ADDRESS,
      usdtAddress: BSC_USDT_ADDRESS,
      xbchAddress: BSC_XBCH_ADDRESS,
      approvalData: `${BSC_APPROVE_SELECTOR}${encodeAddress(BSC_SLOT_SALE_ADDRESS)}${encodeUint256(paymentRaw)}`,
      buyData: `${BSC_BUY_SELECTOR}${encodeUint256(paymentRaw)}${encodeUint256(minXbchRaw)}${encodeAddress(walletAddress)}${encodeUint256(BigInt(deadline))}`,
      deadline,
    },
  };
}

function purchaseSlippageBps(value: unknown): bigint {
  if (value === undefined || value === null || value === "") return DEFAULT_PURCHASE_SLIPPAGE_BPS;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed) || parsed < Number(MIN_PURCHASE_SLIPPAGE_BPS) || parsed > Number(MAX_PURCHASE_SLIPPAGE_BPS)) {
    throw new SlotsApiError(400, "INVALID_PURCHASE_SLIPPAGE", "最大滑点仅支持 0.1% 到 5%。");
  }
  return BigInt(parsed);
}

async function quoteXbchSwap(body: JsonRecord) {
  const direction = swapDirection(body.direction);
  const paymentRaw = swapPaymentRaw(body.amount);
  const slippageBps = purchaseSlippageBps(body.slippageBps);
  const env = readEnv();
  const walletAddress = localWalletAddress(env).toLowerCase();
  const sellingXbch = direction === "xbch_to_usdt";
  const fromAddress = sellingXbch ? BSC_XBCH_ADDRESS : BSC_USDT_ADDRESS;
  const toAddress = sellingXbch ? BSC_USDT_ADDRESS : BSC_XBCH_ADDRESS;
  const fromSymbol = sellingXbch ? "xBCH" : "USDT";
  const toSymbol = sellingXbch ? "USDT" : "xBCH";
  const quoteRaw = sellingXbch
    ? await pancakeAmountsOut(paymentRaw)
    : hexTokenAmount(await rpcRequest<string>(BSC_SLOT_SALE_RPC_URL, "eth_call", [{
      to: BSC_SLOT_SALE_ADDRESS,
      data: `${BSC_QUOTE_BUY_SELECTOR}${encodeUint256(paymentRaw)}`,
    }, "latest"]));
  if (quoteRaw <= 0n) throw new SlotsApiError(502, "SWAP_QUOTE_UNAVAILABLE", `暂时无法获取 ${toSymbol} 链上报价。`);
  const minXbchRaw = quoteRaw * (PURCHASE_BPS_DENOMINATOR - slippageBps) / PURCHASE_BPS_DENOMINATOR;
  const deadline = Math.floor(Date.now() / 1000) + 20 * 60;
  const router = sellingXbch ? BSC_PANCAKE_V2_ROUTER_ADDRESS : BSC_SLOT_SALE_ADDRESS;
  const executionData = sellingXbch
    ? `${BSC_SWAP_EXACT_TOKENS_SELECTOR}${encodeUint256(paymentRaw)}${encodeUint256(minXbchRaw)}${encodeUint256(160n)}${encodeAddress(walletAddress)}${encodeUint256(BigInt(deadline))}${encodeUint256(2n)}${encodeAddress(BSC_XBCH_ADDRESS)}${encodeAddress(BSC_USDT_ADDRESS)}`
    : `${BSC_BUY_SELECTOR}${encodeUint256(paymentRaw)}${encodeUint256(minXbchRaw)}${encodeAddress(walletAddress)}${encodeUint256(BigInt(deadline))}`;
  return {
    ok: true,
    walletAddress,
    chainId: BSC_CHAIN_ID_HEX,
    swap: {
      direction,
      fromSymbol,
      toSymbol,
      amountIn: formatTokenAmount(paymentRaw, 18),
      expectedReceive: formatTokenAmount(quoteRaw, 18),
      minReceive: formatTokenAmount(minXbchRaw, 18),
      slippageBps: Number(slippageBps),
      router,
      inputTokenAddress: fromAddress,
      outputTokenAddress: toAddress,
      xbchAddress: BSC_XBCH_ADDRESS,
      approvalData: `${BSC_APPROVE_SELECTOR}${encodeAddress(router)}${encodeUint256(paymentRaw)}`,
      executionData,
      deadline,
    },
  };
}

async function loadSwapBalances() {
  const walletAddress = localWalletAddress(readEnv()).toLowerCase();
  const [usdtRaw, xbchRaw] = await Promise.all([
    tokenBalanceOf(BSC_USDT_ADDRESS, walletAddress),
    tokenBalanceOf(BSC_XBCH_ADDRESS, walletAddress),
  ]);
  return {
    ok: true,
    walletAddress,
    usdt: formatTokenAmount(usdtRaw, 18),
    xbch: formatTokenAmount(xbchRaw, 18),
  };
}

async function tokenBalanceOf(tokenAddress: string, walletAddress: string): Promise<bigint> {
  const raw = await rpcRequest<string>(BSC_SLOT_SALE_RPC_URL, "eth_call", [{
    to: tokenAddress,
    data: `${BSC_BALANCE_OF_SELECTOR}${encodeAddress(walletAddress)}`,
  }, "latest"]);
  return hexTokenAmount(raw);
}

async function confirmXbchSwap(body: JsonRecord) {
  const direction = swapDirection(body.direction);
  const txHash = txHashValue(body.txHash);
  if (!txHash) throw new SlotsApiError(400, "INVALID_TRANSACTION_HASH", "兑换交易哈希无效。");
  const env = readEnv();
  const walletAddress = localWalletAddress(env).toLowerCase();
  const receipt = await rpcRequest<RpcReceipt>(BSC_SLOT_SALE_RPC_URL, "eth_getTransactionReceipt", [txHash]);
  if (!receipt || receipt.status !== "0x1") throw new SlotsApiError(409, "SWAP_NOT_CONFIRMED", "兑换交易尚未确认或已失败。");
  const walletTopic = `0x${walletAddress.slice(2).padStart(64, "0")}`;
  const saleTopic = `0x${BSC_SLOT_SALE_ADDRESS.slice(2).padStart(64, "0")}`;
  const logs = receipt.logs || [];
  const outgoingUsdtRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_USDT_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[1] || "").toLowerCase() === walletTopic
    && String(log.topics?.[2] || "").toLowerCase() === saleTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const incomingXbchRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_XBCH_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[1] || "").toLowerCase() === saleTopic
    && String(log.topics?.[2] || "").toLowerCase() === walletTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const outgoingXbchRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_XBCH_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[1] || "").toLowerCase() === walletTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const incomingUsdtRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_USDT_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[2] || "").toLowerCase() === walletTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const amountIn = direction === "xbch_to_usdt" ? outgoingXbchRaw : outgoingUsdtRaw;
  const amountOut = direction === "xbch_to_usdt" ? incomingUsdtRaw : incomingXbchRaw;
  if (amountIn <= 0n || amountOut <= 0n) throw new SlotsApiError(409, "SWAP_RECEIPT_INVALID", "该交易不是有效的兑换交易。");
  return {
    ok: true,
    txHash: txHash.toLowerCase(),
    direction,
    amountIn: formatTokenAmount(amountIn, 18),
    amountOut: formatTokenAmount(amountOut, 18),
  };
}

async function pancakeAmountsOut(amountIn: bigint): Promise<bigint> {
  const raw = await rpcRequest<string>(BSC_SLOT_SALE_RPC_URL, "eth_call", [{
    to: BSC_PANCAKE_V2_ROUTER_ADDRESS,
    data: `${BSC_GET_AMOUNTS_OUT_SELECTOR}${encodeUint256(amountIn)}${encodeUint256(64n)}${encodeUint256(2n)}${encodeAddress(BSC_XBCH_ADDRESS)}${encodeAddress(BSC_USDT_ADDRESS)}`,
  }, "latest"]);
  const normalized = String(raw).replace(/^0x/, "");
  if (!/^[0-9a-f]+$/i.test(normalized) || normalized.length < 192) throw new SlotsApiError(502, "SWAP_QUOTE_UNAVAILABLE", "PancakeSwap 未返回有效报价。");
  return BigInt(`0x${normalized.slice(-64)}`);
}

function swapDirection(value: unknown): SwapDirection {
  if (value === "xbch_to_usdt") return value;
  if (value === "usdt_to_xbch" || value === undefined || value === null || value === "") return "usdt_to_xbch";
  throw new SlotsApiError(400, "INVALID_SWAP_DIRECTION", "仅支持 USDT 与 xBCH 之间的兑换。");
}

function swapPaymentRaw(value: unknown): bigint {
  const amount = typeof value === "number" || typeof value === "string" ? String(value).trim() : "";
  if (!/^\d+(?:\.\d{1,18})?$/.test(amount)) throw new SlotsApiError(400, "INVALID_SWAP_AMOUNT", "请输入有效的兑换金额。");
  const raw = parseTokenUnits(amount);
  if (raw < 10n ** 18n) throw new SlotsApiError(400, "SWAP_AMOUNT_TOO_SMALL", "单次兑换金额至少为 1 个代币。");
  return raw;
}

async function confirmSlotPurchase(body: JsonRecord) {
  const txHash = txHashValue(body.txHash);
  if (!txHash) throw new SlotsApiError(400, "INVALID_TRANSACTION_HASH", "购买交易哈希无效。");
  const env = readEnv();
  const walletAddress = localWalletAddress(env).toLowerCase();
  const receipt = await rpcRequest<RpcReceipt>(BSC_SLOT_SALE_RPC_URL, "eth_getTransactionReceipt", [txHash]);
  if (!receipt || receipt.status !== "0x1") throw new SlotsApiError(409, "SLOT_PURCHASE_NOT_CONFIRMED", "购买交易尚未确认或已失败。");
  const walletTopic = `0x${walletAddress.slice(2).padStart(64, "0")}`;
  const saleTopic = `0x${BSC_SLOT_SALE_ADDRESS.slice(2).padStart(64, "0")}`;
  const logs = receipt.logs || [];
  const usdtRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_USDT_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[1] || "").toLowerCase() === walletTopic
    && String(log.topics?.[2] || "").toLowerCase() === saleTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const xbchRaw = logs.filter((log) => log.address?.toLowerCase() === BSC_XBCH_ADDRESS
    && String(log.topics?.[0] || "").toLowerCase() === ERC20_TRANSFER_TOPIC
    && String(log.topics?.[1] || "").toLowerCase() === saleTopic
    && String(log.topics?.[2] || "").toLowerCase() === walletTopic)
    .reduce((total, log) => total + hexTokenAmount(log.data), 0n);
  const slotUnit = BigInt(SLOT_UNIT_PRICE_USDT) * 10n ** 18n;
  if (usdtRaw < slotUnit || usdtRaw % slotUnit !== 0n || xbchRaw <= 0n) {
    throw new SlotsApiError(409, "SLOT_PURCHASE_RECEIPT_INVALID", "该交易不是有效的标准卡槽购买交易。");
  }
  const blockNumber = Number(BigInt(receipt.blockNumber || "0x0"));
  const blockTimestamp = String(logs[0]?.blockTimestamp || "");
  const purchasedAt = /^0x[0-9a-f]+$/i.test(blockTimestamp)
    ? new Date(Number(BigInt(blockTimestamp)) * 1000).toISOString()
    : new Date().toISOString();
  const importResponse = await fetch(new URL("/v1/liq2/slot-orders/import", LIQ2_SLOT_ORDERS_URL), {
    method: "POST",
    headers: { ...privateArbActivityHeaders(env, ""), "content-type": "application/json" },
    body: JSON.stringify({ orders: [{
      txHash: txHash.toLowerCase(), walletAddress, settlementContract: BSC_SLOT_SALE_ADDRESS,
      usdtAmount: formatTokenAmount(usdtRaw, 18), xbchAmount: formatTokenAmount(xbchRaw, 18),
      slotCount: Number(usdtRaw / slotUnit), blockNumber, purchasedAt,
    }] }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const imported = (await importResponse.json().catch(() => ({}))) as JsonRecord;
  if (!importResponse.ok || imported.ok === false) {
    throw new SlotsApiError(502, "SLOT_PURCHASE_CACHE_FAILED", "链上购买已确认，但订单缓存同步失败；请点击刷新记录重试。");
  }
  return { ok: true, txHash: txHash.toLowerCase(), slotCount: Number(usdtRaw / slotUnit), xbchAmount: formatTokenAmount(xbchRaw, 18) };
}

async function fetchLiq2Profile(walletAddress: string, env: Record<string, string>): Promise<Liq2Profile> {
  const endpoint = new URL("/v1/liq2/profile", "https://privateapi.superarb.ai");
  endpoint.searchParams.set("walletAddress", walletAddress);
  const response = await fetch(endpoint, {
    headers: privateArbActivityHeaders(env, ""),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  const rpcPlanType = stringValue(payload.rpcPlanType, payload.rpc_plan_type);
  const rpcPlanName = stringValue(payload.rpcPlanName, payload.rpc_plan_name);
  if (!response.ok || payload.ok === false || !rpcPlanType || !rpcPlanName) {
    throw new SlotsApiError(502, "LIQ2_PROFILE_UNAVAILABLE", `LIQ2 1.7 RPC 套餐读取失败（HTTP ${response.status}）。`);
  }
  return { rpcPlanType, rpcPlanName };
}

export async function readSlotPurchaseUsage(env: Record<string, string>): Promise<number> {
  const walletAddress = localWalletAddress(env);
  const result = await fetchLiq2SlotOrders(walletAddress, env);
  return purchasedSlotCount(result.orders);
}

/** LIQ2 1.7 slots are the immutable xBCH purchase ledger, not the retired tx2 order tables. */
async function fetchLiq2SlotOrders(
  walletAddress: string,
  env: Record<string, string>,
): Promise<{ orders: SlotOrder[]; truncated: boolean }> {
  const endpoint = new URL(LIQ2_SLOT_ORDERS_URL);
  endpoint.searchParams.set("walletAddress", walletAddress);
  const response = await fetch(endpoint, {
    headers: privateArbActivityHeaders(env, ""),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as JsonRecord;
  if (!response.ok || payload.ok === false) {
    throw new SlotsApiError(502, "LIQ2_SLOT_ORDERS_UNAVAILABLE", `LIQ2 1.7 卡槽订单读取失败（HTTP ${response.status}）。`);
  }
  const rows = arrayValue(payload.orders);
  if (!rows) throw new SlotsApiError(502, "LIQ2_SLOT_ORDERS_INVALID_RESPONSE", "LIQ2 1.7 卡槽订单返回格式不正确。");
  const byId = new Map<string, SlotOrder>();
  mergeOrderRows(byId, rows, walletAddress);
  return { orders: [...byId.values()], truncated: false };
}

async function fetchAllOrders(
  walletAddress: string,
  env: Record<string, string>,
  retryOnHeadChange = true,
): Promise<{ orders: SlotOrder[]; truncated: boolean }> {
  const byId = new Map<string, SlotOrder>();
  let initialHeadSignature = "";
  for (let offset = 0; offset < MAX_ORDERS; offset += UPSTREAM_PAGE_SIZE) {
    const rows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, offset, env);
    if (offset === 0) initialHeadSignature = orderPageSignature(rows);
    mergeOrderRows(byId, rows, walletAddress);
    if (rows.length < UPSTREAM_PAGE_SIZE) {
      if (offset > 0) {
        const latestRows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, 0, env);
        if (retryOnHeadChange && orderPageSignature(latestRows) !== initialHeadSignature) {
          return fetchAllOrders(walletAddress, env, false);
        }
        mergeOrderRows(byId, latestRows, walletAddress);
      }
      return { orders: [...byId.values()], truncated: false };
    }
  }
  const remaining = await fetchActivityPage(walletAddress, 1, MAX_ORDERS, env);
  const latestRows = await fetchActivityPage(walletAddress, UPSTREAM_PAGE_SIZE, 0, env);
  if (retryOnHeadChange && orderPageSignature(latestRows) !== initialHeadSignature) {
    return fetchAllOrders(walletAddress, env, false);
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
  const activityUrl = new URL(privateArbActivityEndpoint());
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
): Promise<unknown[]> {
  const endpoint = privateArbActivityEndpoint();
  const url = new URL(endpoint);
  url.searchParams.set("walletAddress", walletAddress);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("offset", String(offset));
  const response = await fetch(url, {
    // Wallet activity is authenticated by the application token. A user's
    // login/license code is intentionally never forwarded to this read API.
    headers: privateArbActivityHeaders(env, ""),
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

function privateArbActivityEndpoint(): string {
  return PRIVATE_ARB_WALLET_ACTIVITY_URL;
}

function privateArbActivitySource(): string {
  try {
    return new URL(privateArbActivityEndpoint()).host;
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
    slotCount: positiveInteger(row.slotCount, row.slot_count) || 0,
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
  const slotTotal = tradeOrders.reduce((total, order) => total + slotQuantity(order), 0);
  const completed = tradeOrders.filter((order) => order.statusGroup === "completed").reduce((total, order) => total + slotQuantity(order), 0);
  const active = tradeOrders.filter((order) => order.statusGroup === "active").reduce((total, order) => total + slotQuantity(order), 0);
  const failed = tradeOrders.filter((order) => order.statusGroup === "failed").reduce((total, order) => total + slotQuantity(order), 0);
  const cancelled = tradeOrders.filter((order) => order.statusGroup === "cancelled").reduce((total, order) => total + slotQuantity(order), 0);
  const totalUsdt = tradeOrders
    .reduce((total, order) => addDecimalStrings(total, order.effectiveUsdtAmount || order.usdtAmount), "0");
  const rewardUsdt = rewardOrders
    .reduce((total, order) => addDecimalStrings(total, order.rewardUsdt), "0");
  const xbchTotal = tradeOrders
    .reduce((total, order) => addDecimalStrings(total, order.xbchAmount), "0");
  return {
    total: slotTotal,
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

function purchasedSlotCount(orders: SlotOrder[]): number {
  const unitPriceRaw = parseTokenUnits(String(SLOT_UNIT_PRICE_USDT));
  const slots = orders.reduce((total, order) => {
    if (order.orderType !== "buy_xbch" || order.statusGroup === "failed" || order.statusGroup === "cancelled") return total;
    if (order.slotCount > 0) return total + order.slotCount;
    const amount = order.usdtAmount || order.effectiveUsdtAmount;
    try {
      return total + Math.max(1, Number(parseTokenUnits(amount) / unitPriceRaw));
    } catch {
      return total;
    }
  }, 0);
  return Number.isSafeInteger(slots) ? slots : Number.MAX_SAFE_INTEGER;
}

function slotQuantity(order: SlotOrder): number {
  if (order.slotCount > 0) return order.slotCount;
  if (order.orderType !== "buy_xbch" || order.statusGroup === "failed" || order.statusGroup === "cancelled") return 0;
  try {
    return Math.max(1, Number(parseTokenUnits(order.usdtAmount || order.effectiveUsdtAmount) / parseTokenUnits(String(SLOT_UNIT_PRICE_USDT))));
  } catch {
    return 0;
  }
}

function parseTokenUnits(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) throw new Error("invalid token amount");
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.slice(0, 18).padEnd(18, "0"));
}

function encodeUint256(value: bigint): string {
  if (value < 0n) throw new Error("uint256 cannot be negative");
  return value.toString(16).padStart(64, "0");
}

function encodeAddress(value: string): string {
  const normalized = value.toLowerCase().replace(/^0x/, "");
  if (!/^[0-9a-f]{40}$/.test(normalized)) throw new Error("invalid EVM address");
  return normalized.padStart(64, "0");
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

function localWalletAddress(env: Record<string, string>): string {
  const configuredAddress = env.WALLET_ADDRESS?.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(configuredAddress || "")) return configuredAddress as string;
  throw new SlotsApiError(400, "WALLET_NOT_CONFIGURED", "系统暂未读取到钱包地址。");
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

function positiveInteger(...values: unknown[]): number {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isSafeInteger(parsed) && parsed > 0) return parsed;
  }
  return 0;
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

function requestPathname(value?: string): string {
  try {
    return new URL(value || "", "http://127.0.0.1").pathname;
  } catch {
    return "";
  }
}

function readRequestJson(req: IncomingMessage): Promise<JsonRecord> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 32 * 1024) {
        reject(new SlotsApiError(413, "REQUEST_TOO_LARGE", "请求体过大。"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        const parsed = raw ? JSON.parse(raw) : {};
        if (!isRecord(parsed)) throw new Error("invalid JSON object");
        resolve(parsed);
      } catch {
        reject(new SlotsApiError(400, "INVALID_REQUEST_BODY", "请求数据格式错误。"));
      }
    });
    req.on("error", reject);
  });
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
