import type { CexExchangeKey } from "./strategies.js";

export type CexBestBidAsk = {
  exchange: CexExchangeKey;
  symbol: string;
  bidPrice: number;
  askPrice: number;
  bidSize: number;
  askSize: number;
  fetchedAt: string;
};

export type CexExchangeConnector = {
  key: CexExchangeKey;
  label: string;
  fetchBestBidAsk(symbol: string): Promise<CexBestBidAsk>;
};

export type CexSpreadOpportunity = {
  symbol: string;
  buyExchange: CexExchangeKey;
  sellExchange: CexExchangeKey;
  buyPrice: number;
  sellPrice: number;
  buyPriceDisplay: string;
  sellPriceDisplay: string;
  grossSpreadUsd: number;
  netSpreadUsd: number;
  grossSpreadDisplay: string;
  netSpreadDisplay: string;
  feeEstimateUsd: number;
  feeEstimateDisplay: string;
  availableNotionalUsd: number;
  availableNotionalDisplay: string;
  executable: boolean;
  signal: "net-open" | "spread-forming" | "watch";
  state: "paper-ready" | "inventory-blocked" | "needs-depth" | "watch";
  action: "paper-buy-sell" | "top-up-inventory" | "wait-depth" | "watch";
};
