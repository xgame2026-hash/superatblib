const BSC_USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const TRADE_ORDER_TYPES = ["buy_xbch", "sell_xbch", "legacy_trade"] as const;
const REWARD_ORDER_TYPES = ["reward", "rewards", "profit", "paid_profit", "payout", "rebate"] as const;
const MAX_TRACKED_EVENTS = 2_000;

type TradeOrderType = (typeof TRADE_ORDER_TYPES)[number];
type OrderStatusGroup = "active" | "completed" | "failed" | "cancelled" | "unknown";

export type SlotOrderRecord = {
  id: string;
  orderNo: string;
  orderType: string;
  statusGroup: OrderStatusGroup;
  chain: string;
  chainId: number | null;
  tokenAddress: string;
  rewardUsdt: string;
  rewardVerified: boolean;
  rewardProofId: string;
  rewardRequestId: string;
  rewardRecordSource: string;
  rewardPipelineSource: string;
  rewardDirection: string;
  rewardCounterparty: string;
  txHash: string;
  createdAt: string;
  orderedAt: string;
  paidAt: string;
  updatedAt: string;
};

export type SlotOrdersSnapshot = {
  ok: true;
  walletAddress: string;
  orders: SlotOrderRecord[];
  updatedAt: string;
  truncated?: boolean;
};

export type SlotOrderNotification =
  | {
      kind: "slotAnchored";
      occurrenceId: string;
      occurredAt: string;
      source: "order_created";
      orderId: string;
      orderType: TradeOrderType;
      operation: "created";
    }
  | {
      kind: "rewardReceived";
      occurrenceId: string;
      occurredAt: string;
      source: "tx2";
      rewardProofId: string;
      transactionHash: string;
      amount: string;
      transferVerified: true;
      payoutEventVerified: true;
    };

export type SlotOrderSummary = {
  orderCount: number;
  active: number;
  completed: number;
  failed: number;
  cancelled: number;
  verifiedRewardCount: number;
  verifiedRewardUsdt: string;
  unverifiedRewardCount: number;
};

export type SlotOrderProcessResult = {
  baselineCreated: boolean;
  notifications: SlotOrderNotification[];
  orders: SlotOrderRecord[];
  summary: SlotOrderSummary;
  updatedAt: string;
  truncated: boolean;
};

export type SlotOrderPersistedState = {
  initialized: boolean;
  walletAddress: string;
  seenOrderIds: string[];
  verifiedRewardProofIds: string[];
  pendingNotifications: SlotOrderNotification[];
};

export type SlotOrderStateStore = {
  load: () => SlotOrderPersistedState | undefined;
  save: (state: SlotOrderPersistedState) => void;
};

export type SlotOrderManager = {
  processSnapshot: (snapshot: SlotOrdersSnapshot) => SlotOrderProcessResult;
  acknowledge: (occurrenceIds: string[]) => void;
  getPendingNotifications: () => SlotOrderNotification[];
  resetForWallet: (walletAddress: string) => void;
};

/**
 * Converts authoritative slot snapshots into verified business events. It does
 * not play audio; consumers acknowledge an event only after delivery succeeds.
 */
export function createSlotOrderManager(options: {
  walletAddress: string;
  store?: SlotOrderStateStore;
}): SlotOrderManager {
  let walletAddress = normalizeWallet(options.walletAddress);
  let state = sanitizeState(options.store?.load(), walletAddress);

  function processSnapshot(snapshot: SlotOrdersSnapshot): SlotOrderProcessResult {
    validateSnapshot(snapshot, walletAddress);
    const baselineCreated = !state.initialized;
    const tradeOrders = snapshot.orders.filter(isTradeOrder);
    const verifiedRewards = snapshot.orders.filter(isVerifiedTx2Reward);
    const rewardRecords = snapshot.orders.filter(isRewardOrder);

    if (baselineCreated) {
      state.initialized = true;
      state.seenOrderIds = uniqueTail(tradeOrders.map(orderIdentifier));
      state.verifiedRewardProofIds = uniqueTail(verifiedRewards.map((order) => order.rewardProofId));
    } else {
      const seenOrders = new Set(state.seenOrderIds);
      const verifiedProofs = new Set(state.verifiedRewardProofIds);
      const pendingIds = new Set(state.pendingNotifications.map((item) => item.occurrenceId));

      for (const order of tradeOrders) {
        const orderId = orderIdentifier(order);
        const occurrenceId = slotOccurrenceId(walletAddress, orderId);
        if (!seenOrders.has(orderId) && !pendingIds.has(occurrenceId)) {
          state.pendingNotifications.push({
            kind: "slotAnchored",
            occurrenceId,
            occurredAt: orderDate(order, snapshot.updatedAt),
            source: "order_created",
            orderId,
            orderType: order.orderType as TradeOrderType,
            operation: "created",
          });
          pendingIds.add(occurrenceId);
        }
        seenOrders.add(orderId);
      }

      for (const reward of verifiedRewards) {
        const occurrenceId = reward.rewardProofId;
        if (!verifiedProofs.has(reward.rewardProofId) && !pendingIds.has(occurrenceId)) {
          state.pendingNotifications.push({
            kind: "rewardReceived",
            occurrenceId,
            occurredAt: rewardDate(reward, snapshot.updatedAt),
            source: "tx2",
            rewardProofId: reward.rewardProofId,
            transactionHash: reward.txHash,
            amount: normalizeDecimal(reward.rewardUsdt),
            // rewardVerified is produced server-side only after both checks pass.
            transferVerified: true,
            payoutEventVerified: true,
          });
          pendingIds.add(occurrenceId);
        }
        verifiedProofs.add(reward.rewardProofId);
      }
      state.seenOrderIds = uniqueTail([...seenOrders]);
      state.verifiedRewardProofIds = uniqueTail([...verifiedProofs]);
      state.pendingNotifications = uniqueNotifications(state.pendingNotifications);
    }

    persist();
    return {
      baselineCreated,
      notifications: [...state.pendingNotifications],
      orders: [...tradeOrders].sort((left, right) => timestamp(right) - timestamp(left)),
      summary: summarize(tradeOrders, verifiedRewards, rewardRecords),
      updatedAt: new Date(snapshot.updatedAt).toISOString(),
      truncated: snapshot.truncated === true,
    };
  }

  function acknowledge(occurrenceIds: string[]): void {
    const acknowledged = new Set(occurrenceIds.map(cleanId).filter(Boolean));
    state.pendingNotifications = state.pendingNotifications.filter((item) => !acknowledged.has(item.occurrenceId));
    persist();
  }

  function resetForWallet(nextWalletAddress: string): void {
    walletAddress = normalizeWallet(nextWalletAddress);
    state = emptyState(walletAddress);
    persist();
  }

  function persist(): void {
    options.store?.save(structuredClone(state));
  }

  return {
    processSnapshot,
    acknowledge,
    getPendingNotifications: () => structuredClone(state.pendingNotifications),
    resetForWallet,
  };
}

export function isVerifiedTx2Reward(order: SlotOrderRecord): boolean {
  return isRewardOrder(order)
    && order.rewardVerified === true
    && order.rewardRecordSource === "tx2"
    && order.rewardPipelineSource === "treasury-compensation-relayer"
    && order.rewardDirection === "in"
    && (order.chainId === 56 || ["bnb", "bsc"].includes(order.chain.toLowerCase()))
    && order.tokenAddress.toLowerCase() === BSC_USDT_ADDRESS
    && /^0x[a-fA-F0-9]{40}$/.test(order.rewardCounterparty)
    && /^0x[a-fA-F0-9]{64}$/.test(order.rewardRequestId)
    && order.rewardProofId === `tx2:${order.rewardRequestId}`
    && /^0x[a-fA-F0-9]{64}$/.test(order.txHash)
    && positiveDecimal(order.rewardUsdt);
}

function validateSnapshot(snapshot: SlotOrdersSnapshot, walletAddress: string): void {
  if (!snapshot || snapshot.ok !== true || !Array.isArray(snapshot.orders)) throw new Error("卡槽订单快照无效。");
  if (normalizeWallet(snapshot.walletAddress) !== walletAddress) throw new Error("卡槽订单快照钱包不匹配。");
  if (!validDate(snapshot.updatedAt)) throw new Error("卡槽订单快照时间无效。");
}

function isTradeOrder(order: SlotOrderRecord): boolean {
  return Boolean(orderIdentifier(order)) && TRADE_ORDER_TYPES.includes(order.orderType as TradeOrderType);
}

function isRewardOrder(order: SlotOrderRecord): boolean {
  return REWARD_ORDER_TYPES.includes(order.orderType as (typeof REWARD_ORDER_TYPES)[number]);
}

function orderIdentifier(order: SlotOrderRecord): string {
  return cleanId(order.orderNo) || cleanId(order.id);
}

function slotOccurrenceId(walletAddress: string, orderId: string): string {
  return `slot:${walletAddress}:${orderId}`;
}

function orderDate(order: SlotOrderRecord, fallback: string): string {
  return firstDate(order.createdAt, order.orderedAt, order.updatedAt, fallback);
}

function rewardDate(order: SlotOrderRecord, fallback: string): string {
  return firstDate(order.paidAt, order.createdAt, order.updatedAt, fallback);
}

function firstDate(...values: string[]): string {
  const value = values.find(validDate);
  return new Date(value!).toISOString();
}

function timestamp(order: SlotOrderRecord): number {
  return new Date(firstDate(order.createdAt, order.orderedAt, order.updatedAt, "1970-01-01T00:00:00.000Z")).getTime();
}

function summarize(trades: SlotOrderRecord[], verifiedRewards: SlotOrderRecord[], allRewards: SlotOrderRecord[]): SlotOrderSummary {
  return {
    orderCount: trades.length,
    active: trades.filter((item) => item.statusGroup === "active").length,
    completed: trades.filter((item) => item.statusGroup === "completed").length,
    failed: trades.filter((item) => item.statusGroup === "failed").length,
    cancelled: trades.filter((item) => item.statusGroup === "cancelled").length,
    verifiedRewardCount: verifiedRewards.length,
    verifiedRewardUsdt: addDecimals(verifiedRewards.map((item) => item.rewardUsdt)),
    unverifiedRewardCount: Math.max(0, allRewards.length - verifiedRewards.length),
  };
}

function sanitizeState(value: SlotOrderPersistedState | undefined, walletAddress: string): SlotOrderPersistedState {
  if (!value || value.walletAddress?.toLowerCase() !== walletAddress) return emptyState(walletAddress);
  return {
    initialized: value.initialized === true,
    walletAddress,
    seenOrderIds: uniqueTail(Array.isArray(value.seenOrderIds) ? value.seenOrderIds : []),
    verifiedRewardProofIds: uniqueTail(Array.isArray(value.verifiedRewardProofIds) ? value.verifiedRewardProofIds : []),
    pendingNotifications: uniqueNotifications(Array.isArray(value.pendingNotifications) ? value.pendingNotifications : []),
  };
}

function emptyState(walletAddress: string): SlotOrderPersistedState {
  return { initialized: false, walletAddress, seenOrderIds: [], verifiedRewardProofIds: [], pendingNotifications: [] };
}

function uniqueTail(values: string[]): string[] {
  return [...new Set(values.map(cleanId).filter(Boolean))].slice(-MAX_TRACKED_EVENTS);
}

function uniqueNotifications(values: SlotOrderNotification[]): SlotOrderNotification[] {
  const byId = new Map<string, SlotOrderNotification>();
  for (const value of values) {
    if (value && ["slotAnchored", "rewardReceived"].includes(value.kind) && cleanId(value.occurrenceId)) byId.set(value.occurrenceId, value);
  }
  return [...byId.values()].slice(-MAX_TRACKED_EVENTS);
}

function normalizeWallet(value: string): string {
  const wallet = String(value ?? "").trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new Error("卡槽钱包地址无效。");
  return wallet;
}

function normalizeDecimal(value: string): string {
  const text = String(value ?? "").trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return "0";
  const [whole, fraction = ""] = text.split(".");
  const normalizedFraction = fraction.slice(0, 18).replace(/0+$/, "");
  return normalizedFraction ? `${BigInt(whole)}.${normalizedFraction}` : BigInt(whole).toString();
}

function positiveDecimal(value: string): boolean {
  return decimalUnits(value) > 0n;
}

function addDecimals(values: string[]): string {
  const total = values.reduce((sum, value) => sum + decimalUnits(value), 0n);
  const base = 10n ** 18n;
  const fraction = (total % base).toString().padStart(18, "0").replace(/0+$/, "");
  return fraction ? `${total / base}.${fraction}` : (total / base).toString();
}

function decimalUnits(value: string): bigint {
  const match = String(value ?? "").trim().match(/^(\d+)(?:\.(\d+))?$/);
  if (!match) return 0n;
  return BigInt(match[1]) * 10n ** 18n + BigInt((match[2] ?? "").slice(0, 18).padEnd(18, "0"));
}

function validDate(value: string): boolean {
  return typeof value === "string" && Number.isFinite(new Date(value).getTime());
}

function cleanId(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 256) : "";
}
