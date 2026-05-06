import type { ChainPreset, ExecutionMarketPreset } from "../config.js";

export type ExecutionTuning = {
  alertThreshold: number;
  lookbackBlocks: number;
  chunkSize: number;
  userBatchSize: number;
  limit: number;
  minNetProfit: string;
};

const EXECUTION_TUNING_BY_CHAIN: Record<ChainPreset["key"], ExecutionTuning> = {
  ethereum: {
    alertThreshold: 1.05,
    lookbackBlocks: 2_000,
    chunkSize: 5_000,
    userBatchSize: 100,
    limit: 8,
    minNetProfit: "100",
  },
  arbitrum: {
    alertThreshold: 1.045,
    lookbackBlocks: 8_000,
    chunkSize: 4_000,
    userBatchSize: 50,
    limit: 12,
    minNetProfit: "20",
  },
  polygon: {
    alertThreshold: 1.05,
    lookbackBlocks: 12_000,
    chunkSize: 4_000,
    userBatchSize: 50,
    limit: 10,
    minNetProfit: "50",
  },
  bnb: {
    alertThreshold: 1.04,
    lookbackBlocks: 30_000,
    chunkSize: 3_000,
    userBatchSize: 40,
    limit: 12,
    minNetProfit: "75",
  },
};

const EXECUTION_TUNING_BY_MARKET: Partial<
  Record<ExecutionMarketPreset["key"], Partial<ExecutionTuning>>
> = {
  "aave-v3-ethereum": {
    alertThreshold: 1.05,
    lookbackBlocks: 2_000,
    chunkSize: 5_000,
    userBatchSize: 100,
    limit: 8,
    minNetProfit: "100",
  },
  "spark-ethereum": {
    alertThreshold: 1.02,
    lookbackBlocks: 1_500,
    chunkSize: 3_000,
    userBatchSize: 80,
    limit: 6,
    minNetProfit: "150",
  },
  "aave-v3-arbitrum": {
    alertThreshold: 1.045,
    lookbackBlocks: 8_000,
    chunkSize: 4_000,
    userBatchSize: 50,
    limit: 12,
    minNetProfit: "20",
  },
  "aave-v3-polygon": {
    alertThreshold: 1.05,
    lookbackBlocks: 12_000,
    chunkSize: 4_000,
    userBatchSize: 50,
    limit: 10,
    minNetProfit: "50",
  },
  "aave-v3-bnb": {
    alertThreshold: 1.04,
    lookbackBlocks: 30_000,
    chunkSize: 3_000,
    userBatchSize: 40,
    limit: 12,
    minNetProfit: "75",
  },
};

export function executionTuningForChain(
  chain: ChainPreset["key"] | undefined,
): ExecutionTuning {
  return EXECUTION_TUNING_BY_CHAIN[chain ?? "ethereum"];
}

export function executionTuningForMarket(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): ExecutionTuning {
  const chainDefaults = executionTuningForChain(chain);
  if (!market) {
    return chainDefaults;
  }
  return {
    ...chainDefaults,
    ...(EXECUTION_TUNING_BY_MARKET[market] ?? {}),
  };
}

export function defaultExecutionAlertThreshold(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): number {
  return executionTuningForMarket(chain, market).alertThreshold;
}

export function defaultExecutionLookbackBlocks(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): number {
  return executionTuningForMarket(chain, market).lookbackBlocks;
}

export function defaultExecutionChunkSize(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): number {
  return executionTuningForMarket(chain, market).chunkSize;
}

export function defaultExecutionUserBatchSize(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): number {
  return executionTuningForMarket(chain, market).userBatchSize;
}

export function defaultExecutionLimit(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): number {
  return executionTuningForMarket(chain, market).limit;
}

export function defaultExecutionMinNetProfit(
  chain: ChainPreset["key"] | undefined,
  market?: ExecutionMarketPreset["key"] | null,
): string {
  return executionTuningForMarket(chain, market).minNetProfit;
}
