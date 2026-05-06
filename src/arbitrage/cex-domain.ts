import type { CexExchangeKey } from "./strategies.js";

export type CexOpportunityRecord = {
  id: string;
  symbol: string;
  buyExchange: CexExchangeKey;
  sellExchange: CexExchangeKey;
  buyPriceDisplay: string;
  sellPriceDisplay: string;
  grossSpreadDisplay: string;
  netSpreadDisplay: string;
  feeEstimateDisplay: string;
  availableNotionalDisplay: string;
  executable: boolean;
  state:
    | "paper-ready"
    | "inventory-blocked"
    | "needs-depth"
    | "watch";
  action:
    | "paper-buy-sell"
    | "top-up-inventory"
    | "wait-depth"
    | "watch";
};

export type CexInventoryAssetSnapshot = {
  symbol: string;
  unitsDisplay: string;
  usdValueDisplay: string;
  targetUsdDisplay: string;
  shortfallUsdDisplay: string;
};

export type CexInventorySnapshot = {
  exchange: CexExchangeKey;
  quoteSymbol: "USDT";
  quoteBalanceDisplay: string;
  quoteTargetDisplay: string;
  quoteShortfallDisplay: string;
  assets: CexInventoryAssetSnapshot[];
};

export type CexRebalanceSuggestion = {
  exchange: CexExchangeKey;
  symbol: string;
  side: "top-up-usdt" | "top-up-asset";
  reason: string;
  shortfallDisplay: string;
};

export type CexOrderLeg = {
  exchange: CexExchangeKey;
  symbol: string;
  side: "buy" | "sell";
  priceDisplay: string;
};

export type CexOrderPair = {
  id: string;
  mode: "paper";
  status:
    | "paper-ready"
    | "inventory-blocked"
    | "depth-blocked"
    | "watch";
  reason: string;
  buyLeg: CexOrderLeg;
  sellLeg: CexOrderLeg;
};
