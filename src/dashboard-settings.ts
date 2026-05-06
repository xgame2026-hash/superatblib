import "./env.js";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

import {
  EXECUTION_MARKET_PRESETS,
  type ChainPreset,
  type ExecutionMarketPreset,
} from "./config.js";
import {
  defaultExecutionLimit,
  defaultExecutionLookbackBlocks,
  defaultExecutionMinNetProfit,
} from "./liquidation/tuning.js";

const MANAGED_KEYS = [
  "PRIVATE_KEY",
  "CHAIN",
  "MARKET",
  "DASHBOARD_LANGUAGE",
  "BITQUERY_API_KEY",
  "ZEROX_API_KEY",
  "QUICKNODE_ADMIN_API_KEY",
  "FUNDING_MODE",
  "CONTROL_RPC_URL",
  "ETHEREUM_RPC_URL",
  "BASE_RPC_URL",
  "EXECUTION_RPC_URL",
  "FLASHBOTS_RELAY_URL",
  "FLASHBOTS_AUTH_PRIVATE_KEY",
  "BROADCAST_TRANSPORT",
  "POLYGON_RPC_URL",
  "ARBITRUM_RPC_URL",
  "BNB_RPC_URL",
  "ETHEREUM_LIQUIDATOR_CONTRACT",
  "AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT",
  "SPARK_ETHEREUM_LIQUIDATOR_CONTRACT",
  "POLYGON_LIQUIDATOR_CONTRACT",
  "ARBITRUM_LIQUIDATOR_CONTRACT",
  "BNB_LIQUIDATOR_CONTRACT",
  "LIQUIDATOR_CONTRACT",
  "LOOKBACK_BLOCKS",
  "LIMIT",
  "MIN_NET_PROFIT",
  "MORPHO_MARKET_ID",
  "MORPHO_SIGNAL",
  "MORPHO_HF_MAX",
  "MORPHO_ETHEREUM_RPC_URL",
  "MORPHO_BASE_RPC_URL",
  "MORPHO_PRIVATE_RELAY_URL",
  "ARBITRAGE_VENUES",
  "BINANCE_API_KEY",
  "BINANCE_SECRET_KEY",
  "OKX_API_KEY",
  "OKX_SECRET_KEY",
  "BITGET_API_KEY",
  "BITGET_SECRET_KEY",
  "MEXC_API_KEY",
  "MEXC_SECRET_KEY",
  "GATE_API_KEY",
  "GATE_SECRET_KEY",
] as const;

type ManagedKey = (typeof MANAGED_KEYS)[number];

export type DashboardSettings = {
  privateKey: string;
  chain: string;
  market: ExecutionMarketPreset["key"];
  language: string;
  bitqueryApiKey: string;
  zeroExApiKey: string;
  quicknodeAdminApiKey: string;
  fundingMode: string;
  controlRpcUrl: string;
  executionRpcUrl: string;
  flashbotsRelayUrl: string;
  flashbotsAuthPrivateKey: string;
  broadcastTransport: string;
  lookbackBlocks: string;
  limit: string;
  minNetProfit: string;
  morpho: {
    marketId: string;
    signal: string;
    hfMax: string;
    ethereumRpcUrl: string;
    baseRpcUrl: string;
    privateRelayUrl: string;
  };
  arbitrageVenues: string;
  exchanges: {
    binance: { apiKey: string; secretKey: string };
    okx: { apiKey: string; secretKey: string };
    bitget: { apiKey: string; secretKey: string };
    mexc: { apiKey: string; secretKey: string };
    gate: { apiKey: string; secretKey: string };
  };
  ethereumRpcUrl: string;
  baseRpcUrl: string;
  chains: Record<
    ChainPreset["key"],
    {
      rpcUrl: string;
      liquidatorContract: string;
    }
  >;
  markets: Record<
    ExecutionMarketPreset["key"],
    {
      liquidatorContract: string;
    }
  >;
};

type DashboardSettingsPatch = Partial<{
  privateKey: string;
  chain: string;
  market: ExecutionMarketPreset["key"];
  language: string;
  bitqueryApiKey: string;
  zeroExApiKey: string;
  quicknodeAdminApiKey: string;
  fundingMode: string;
  controlRpcUrl: string;
  executionRpcUrl: string;
  flashbotsRelayUrl: string;
  flashbotsAuthPrivateKey: string;
  broadcastTransport: string;
  lookbackBlocks: string;
  limit: string;
  minNetProfit: string;
  morpho: Partial<{
    marketId: string;
    signal: string;
    hfMax: string;
    ethereumRpcUrl: string;
    baseRpcUrl: string;
    privateRelayUrl: string;
  }>;
  arbitrageVenues: string;
  exchanges: Partial<{
    binance: Partial<{ apiKey: string; secretKey: string }>;
    okx: Partial<{ apiKey: string; secretKey: string }>;
    bitget: Partial<{ apiKey: string; secretKey: string }>;
    mexc: Partial<{ apiKey: string; secretKey: string }>;
    gate: Partial<{ apiKey: string; secretKey: string }>;
  }>;
  ethereumRpcUrl: string;
  baseRpcUrl: string;
  chains: Partial<
    Record<
      ChainPreset["key"],
      Partial<{
        rpcUrl: string;
        liquidatorContract: string;
      }>
    >
  >;
  markets: Partial<
    Record<
      ExecutionMarketPreset["key"],
      Partial<{
        liquidatorContract: string;
      }>
    >
  >;
}>;

function envLocalPath(): string {
  return path.resolve(process.cwd(), ".env");
}

function ensureDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed: Record<string, string> = {};
  for (const rawLine of readFileSync(filePath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const separator = line.indexOf("=");
    if (separator <= 0) {
      continue;
    }
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    parsed[key] = value;
  }

  return parsed;
}

function managedEnvSnapshot(): Record<ManagedKey, string> {
  return {
    PRIVATE_KEY: process.env.PRIVATE_KEY ?? "",
    CHAIN: process.env.CHAIN ?? "ethereum",
    MARKET:
      (process.env.MARKET as ExecutionMarketPreset["key"] | undefined) ??
      "aave-v3-ethereum",
    DASHBOARD_LANGUAGE: process.env.DASHBOARD_LANGUAGE ?? "en",
    BITQUERY_API_KEY: process.env.BITQUERY_API_KEY ?? "",
    ZEROX_API_KEY: process.env.ZEROX_API_KEY ?? "",
    QUICKNODE_ADMIN_API_KEY: process.env.QUICKNODE_ADMIN_API_KEY ?? "",
    FUNDING_MODE: process.env.FUNDING_MODE ?? "flash_loan",
    CONTROL_RPC_URL: process.env.CONTROL_RPC_URL ?? "",
    ETHEREUM_RPC_URL: process.env.ETHEREUM_RPC_URL ?? "",
    BASE_RPC_URL: process.env.BASE_RPC_URL ?? "",
    EXECUTION_RPC_URL: process.env.EXECUTION_RPC_URL ?? "",
    FLASHBOTS_RELAY_URL: process.env.FLASHBOTS_RELAY_URL ?? "",
    FLASHBOTS_AUTH_PRIVATE_KEY:
      process.env.FLASHBOTS_AUTH_PRIVATE_KEY ?? "",
    BROADCAST_TRANSPORT: process.env.BROADCAST_TRANSPORT ?? "flashbots_bundle",
    POLYGON_RPC_URL: process.env.POLYGON_RPC_URL ?? "",
    ARBITRUM_RPC_URL: process.env.ARBITRUM_RPC_URL ?? "",
    BNB_RPC_URL: process.env.BNB_RPC_URL ?? "",
    ETHEREUM_LIQUIDATOR_CONTRACT:
      process.env.ETHEREUM_LIQUIDATOR_CONTRACT ?? "",
    AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT:
      process.env.AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT ?? "",
    SPARK_ETHEREUM_LIQUIDATOR_CONTRACT:
      process.env.SPARK_ETHEREUM_LIQUIDATOR_CONTRACT ?? "",
    POLYGON_LIQUIDATOR_CONTRACT: process.env.POLYGON_LIQUIDATOR_CONTRACT ?? "",
    ARBITRUM_LIQUIDATOR_CONTRACT: process.env.ARBITRUM_LIQUIDATOR_CONTRACT ?? "",
    BNB_LIQUIDATOR_CONTRACT: process.env.BNB_LIQUIDATOR_CONTRACT ?? "",
    LIQUIDATOR_CONTRACT: process.env.LIQUIDATOR_CONTRACT ?? "",
    LOOKBACK_BLOCKS: process.env.LOOKBACK_BLOCKS ?? "30000",
    LIMIT: process.env.LIMIT ?? "8",
    MIN_NET_PROFIT: process.env.MIN_NET_PROFIT ?? "100",
    MORPHO_MARKET_ID: process.env.MORPHO_MARKET_ID ?? "",
    MORPHO_SIGNAL: process.env.MORPHO_SIGNAL ?? "",
    MORPHO_HF_MAX: process.env.MORPHO_HF_MAX ?? "1.05",
    MORPHO_ETHEREUM_RPC_URL: process.env.MORPHO_ETHEREUM_RPC_URL ?? "",
    MORPHO_BASE_RPC_URL: process.env.MORPHO_BASE_RPC_URL ?? "",
    MORPHO_PRIVATE_RELAY_URL: process.env.MORPHO_PRIVATE_RELAY_URL ?? "",
    ARBITRAGE_VENUES: process.env.ARBITRAGE_VENUES ?? "binance,okx,bitget,mexc,gate",
    BINANCE_API_KEY: process.env.BINANCE_API_KEY ?? "",
    BINANCE_SECRET_KEY: process.env.BINANCE_SECRET_KEY ?? "",
    OKX_API_KEY: process.env.OKX_API_KEY ?? "",
    OKX_SECRET_KEY: process.env.OKX_SECRET_KEY ?? "",
    BITGET_API_KEY: process.env.BITGET_API_KEY ?? "",
    BITGET_SECRET_KEY: process.env.BITGET_SECRET_KEY ?? "",
    MEXC_API_KEY: process.env.MEXC_API_KEY ?? "",
    MEXC_SECRET_KEY: process.env.MEXC_SECRET_KEY ?? "",
    GATE_API_KEY: process.env.GATE_API_KEY ?? "",
    GATE_SECRET_KEY: process.env.GATE_SECRET_KEY ?? "",
  };
}

export function resolveConfiguredLiquidatorContract(
  chain: ChainPreset["key"],
  fallback?: string,
  marketKey?: ExecutionMarketPreset["key"],
): string {
  if (marketKey === "aave-v3-ethereum") {
    return (
      process.env.AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT ||
      process.env.ETHEREUM_LIQUIDATOR_CONTRACT ||
      fallback ||
      ""
    );
  }
  if (marketKey === "spark-ethereum") {
    return (
      process.env.SPARK_ETHEREUM_LIQUIDATOR_CONTRACT ||
      fallback ||
      ""
    );
  }

  const envKey =
    chain === "ethereum"
      ? "ETHEREUM_LIQUIDATOR_CONTRACT"
      : chain === "polygon"
      ? "POLYGON_LIQUIDATOR_CONTRACT"
      : chain === "arbitrum"
        ? "ARBITRUM_LIQUIDATOR_CONTRACT"
        : "BNB_LIQUIDATOR_CONTRACT";

  return process.env[envKey] || process.env.LIQUIDATOR_CONTRACT || fallback || "";
}

function loadExecutionMarketSettings(): DashboardSettings["markets"] {
  return Object.fromEntries(
    Object.values(EXECUTION_MARKET_PRESETS).map((market) => [
      market.key,
      {
        liquidatorContract: resolveConfiguredLiquidatorContract(
          market.chain,
          undefined,
          market.key,
        ),
      },
    ]),
  ) as DashboardSettings["markets"];
}

export function loadDashboardSettings(): DashboardSettings {
  const selectedMarket =
    (process.env.MARKET as ExecutionMarketPreset["key"] | undefined) ??
    "aave-v3-ethereum";
  const selectedChain =
    process.env.CHAIN ??
    EXECUTION_MARKET_PRESETS[selectedMarket].chain ??
    "ethereum";

  return {
    privateKey: process.env.PRIVATE_KEY ?? "",
    chain: selectedChain,
    market: selectedMarket,
    language: process.env.DASHBOARD_LANGUAGE ?? "en",
    bitqueryApiKey: process.env.BITQUERY_API_KEY ?? "",
    zeroExApiKey: process.env.ZEROX_API_KEY ?? "",
    quicknodeAdminApiKey: process.env.QUICKNODE_ADMIN_API_KEY ?? "",
    fundingMode: process.env.FUNDING_MODE ?? "flash_loan",
    controlRpcUrl: process.env.CONTROL_RPC_URL ?? "",
    executionRpcUrl: process.env.EXECUTION_RPC_URL ?? "",
    flashbotsRelayUrl: process.env.FLASHBOTS_RELAY_URL ?? "",
    flashbotsAuthPrivateKey: process.env.FLASHBOTS_AUTH_PRIVATE_KEY ?? "",
    broadcastTransport: process.env.BROADCAST_TRANSPORT ?? "flashbots_bundle",
    lookbackBlocks:
      process.env.LOOKBACK_BLOCKS ??
      String(
        defaultExecutionLookbackBlocks(
          selectedChain as ChainPreset["key"],
          selectedMarket,
        ),
      ),
    limit:
      process.env.LIMIT ??
      String(
        defaultExecutionLimit(
          selectedChain as ChainPreset["key"],
          selectedMarket,
        ),
      ),
    minNetProfit:
      process.env.MIN_NET_PROFIT ??
      defaultExecutionMinNetProfit(selectedChain as ChainPreset["key"], selectedMarket),
    morpho: {
      marketId: process.env.MORPHO_MARKET_ID ?? "",
      signal: process.env.MORPHO_SIGNAL ?? "",
      hfMax: process.env.MORPHO_HF_MAX ?? "1.05",
      ethereumRpcUrl: process.env.MORPHO_ETHEREUM_RPC_URL ?? "",
      baseRpcUrl: process.env.MORPHO_BASE_RPC_URL ?? "",
      privateRelayUrl: process.env.MORPHO_PRIVATE_RELAY_URL ?? "",
    },
    arbitrageVenues:
      process.env.ARBITRAGE_VENUES ?? "binance,okx,bitget,mexc,gate",
    exchanges: {
      binance: {
        apiKey: process.env.BINANCE_API_KEY ?? "",
        secretKey: process.env.BINANCE_SECRET_KEY ?? "",
      },
      okx: {
        apiKey: process.env.OKX_API_KEY ?? "",
        secretKey: process.env.OKX_SECRET_KEY ?? "",
      },
      bitget: {
        apiKey: process.env.BITGET_API_KEY ?? "",
        secretKey: process.env.BITGET_SECRET_KEY ?? "",
      },
      mexc: {
        apiKey: process.env.MEXC_API_KEY ?? "",
        secretKey: process.env.MEXC_SECRET_KEY ?? "",
      },
      gate: {
        apiKey: process.env.GATE_API_KEY ?? "",
        secretKey: process.env.GATE_SECRET_KEY ?? "",
      },
    },
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL ?? "",
    baseRpcUrl: process.env.BASE_RPC_URL ?? "",
    chains: {
      ethereum: {
        rpcUrl: process.env.ETHEREUM_RPC_URL ?? "",
        liquidatorContract: resolveConfiguredLiquidatorContract("ethereum"),
      },
      polygon: {
        rpcUrl: process.env.POLYGON_RPC_URL ?? "",
        liquidatorContract: resolveConfiguredLiquidatorContract("polygon"),
      },
      arbitrum: {
        rpcUrl: process.env.ARBITRUM_RPC_URL ?? "",
        liquidatorContract: resolveConfiguredLiquidatorContract("arbitrum"),
      },
      bnb: {
        rpcUrl: process.env.BNB_RPC_URL ?? "",
        liquidatorContract: resolveConfiguredLiquidatorContract("bnb"),
      },
    },
    markets: loadExecutionMarketSettings(),
  };
}

function serializeManagedEnv(env: Record<ManagedKey, string>): string {
  const lines = [
    "# Client RPC configuration",
    `ETHEREUM_RPC_URL=${env.ETHEREUM_RPC_URL}`,
    `BNB_RPC_URL=${env.BNB_RPC_URL}`,
    `ARBITRUM_RPC_URL=${env.ARBITRUM_RPC_URL}`,
    `BASE_RPC_URL=${env.BASE_RPC_URL}`,
    `POLYGON_RPC_URL=${env.POLYGON_RPC_URL}`,
  ];

  const optionalGroups: Array<{
    title: string;
    entries: Array<[ManagedKey, string]>;
  }> = [
    {
      title: "# Advanced execution overrides",
      entries: [
        ["PRIVATE_KEY", ""],
        ["CHAIN", "ethereum"],
        ["MARKET", "aave-v3-ethereum"],
        ["DASHBOARD_LANGUAGE", "en"],
        ["FUNDING_MODE", "flash_loan"],
        ["CONTROL_RPC_URL", ""],
        ["EXECUTION_RPC_URL", ""],
        ["FLASHBOTS_RELAY_URL", ""],
        ["FLASHBOTS_AUTH_PRIVATE_KEY", ""],
        ["BROADCAST_TRANSPORT", "flashbots_bundle"],
        ["LOOKBACK_BLOCKS", "30000"],
        ["LIMIT", "8"],
        ["MIN_NET_PROFIT", "100"],
      ],
    },
    {
      title: "# Advanced contracts",
      entries: [
        ["ETHEREUM_LIQUIDATOR_CONTRACT", ""],
        ["AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT", ""],
        ["SPARK_ETHEREUM_LIQUIDATOR_CONTRACT", ""],
        ["POLYGON_LIQUIDATOR_CONTRACT", ""],
        ["ARBITRUM_LIQUIDATOR_CONTRACT", ""],
        ["BNB_LIQUIDATOR_CONTRACT", ""],
        ["LIQUIDATOR_CONTRACT", ""],
      ],
    },
    {
      title: "# Optional data and Morpho providers",
      entries: [
        ["BITQUERY_API_KEY", ""],
        ["ZEROX_API_KEY", ""],
        ["QUICKNODE_ADMIN_API_KEY", ""],
        ["MORPHO_MARKET_ID", ""],
        ["MORPHO_SIGNAL", ""],
        ["MORPHO_HF_MAX", "1.05"],
        ["MORPHO_ETHEREUM_RPC_URL", ""],
        ["MORPHO_BASE_RPC_URL", ""],
        ["MORPHO_PRIVATE_RELAY_URL", ""],
        ["ARBITRAGE_VENUES", "binance,okx,bitget,mexc,gate"],
      ],
    },
    {
      title: "# Optional arbitrage exchange API keys",
      entries: [
        ["BINANCE_API_KEY", ""],
        ["BINANCE_SECRET_KEY", ""],
        ["OKX_API_KEY", ""],
        ["OKX_SECRET_KEY", ""],
        ["BITGET_API_KEY", ""],
        ["BITGET_SECRET_KEY", ""],
        ["MEXC_API_KEY", ""],
        ["MEXC_SECRET_KEY", ""],
        ["GATE_API_KEY", ""],
        ["GATE_SECRET_KEY", ""],
      ],
    },
  ];

  for (const group of optionalGroups) {
    const visibleEntries = group.entries.filter(([key, defaultValue]) => {
      const value = env[key].trim();
      return value.length > 0 && value !== defaultValue;
    });
    if (visibleEntries.length === 0) {
      continue;
    }
    lines.push("", group.title);
    for (const [key] of visibleEntries) {
      lines.push(`${key}=${env[key]}`);
    }
  }

  return `${lines.join("\n")}\n`;
}

export function saveDashboardSettings(
  patch: DashboardSettingsPatch,
): DashboardSettings {
  const filePath = envLocalPath();
  ensureDirectory(filePath);

  const current = managedEnvSnapshot();
  const currentLocal = parseEnvFile(filePath);

  const next: Record<ManagedKey, string> = {
    ...current,
    ...Object.fromEntries(
      Object.entries(currentLocal).filter(([key]) =>
        (MANAGED_KEYS as readonly string[]).includes(key),
      ),
    ),
  } as Record<ManagedKey, string>;

  if (patch.privateKey !== undefined) {
    next.PRIVATE_KEY = patch.privateKey;
  }
  if (patch.chain !== undefined) {
    next.CHAIN = patch.chain;
  }
  if (patch.market !== undefined) {
    next.MARKET = patch.market;
  }
  if (patch.language !== undefined) {
    next.DASHBOARD_LANGUAGE = patch.language;
  }
  if (patch.bitqueryApiKey !== undefined) {
    next.BITQUERY_API_KEY = patch.bitqueryApiKey;
  }
  if (patch.zeroExApiKey !== undefined) {
    next.ZEROX_API_KEY = patch.zeroExApiKey;
  }
  if (patch.quicknodeAdminApiKey !== undefined) {
    next.QUICKNODE_ADMIN_API_KEY = patch.quicknodeAdminApiKey;
  }
  if (patch.fundingMode !== undefined) {
    next.FUNDING_MODE = patch.fundingMode;
  }
  if (patch.controlRpcUrl !== undefined) {
    next.CONTROL_RPC_URL = patch.controlRpcUrl;
  }
  if (patch.executionRpcUrl !== undefined) {
    next.EXECUTION_RPC_URL = patch.executionRpcUrl;
  }
  if (patch.flashbotsRelayUrl !== undefined) {
    next.FLASHBOTS_RELAY_URL = patch.flashbotsRelayUrl;
  }
  if (patch.flashbotsAuthPrivateKey !== undefined) {
    next.FLASHBOTS_AUTH_PRIVATE_KEY = patch.flashbotsAuthPrivateKey;
  }
  if (patch.broadcastTransport !== undefined) {
    next.BROADCAST_TRANSPORT = patch.broadcastTransport;
  }
  if (patch.ethereumRpcUrl !== undefined) {
    next.ETHEREUM_RPC_URL = patch.ethereumRpcUrl;
  }
  if (patch.baseRpcUrl !== undefined) {
    next.BASE_RPC_URL = patch.baseRpcUrl;
  }
  if (patch.lookbackBlocks !== undefined) {
    next.LOOKBACK_BLOCKS = patch.lookbackBlocks;
  }
  if (patch.limit !== undefined) {
    next.LIMIT = patch.limit;
  }
  if (patch.minNetProfit !== undefined) {
    next.MIN_NET_PROFIT = patch.minNetProfit;
  }
  if (patch.morpho?.marketId !== undefined) {
    next.MORPHO_MARKET_ID = patch.morpho.marketId;
  }
  if (patch.morpho?.signal !== undefined) {
    next.MORPHO_SIGNAL = patch.morpho.signal;
  }
  if (patch.morpho?.hfMax !== undefined) {
    next.MORPHO_HF_MAX = patch.morpho.hfMax;
  }
  if (patch.morpho?.ethereumRpcUrl !== undefined) {
    next.MORPHO_ETHEREUM_RPC_URL = patch.morpho.ethereumRpcUrl;
  }
  if (patch.morpho?.baseRpcUrl !== undefined) {
    next.MORPHO_BASE_RPC_URL = patch.morpho.baseRpcUrl;
  }
  if (patch.morpho?.privateRelayUrl !== undefined) {
    next.MORPHO_PRIVATE_RELAY_URL = patch.morpho.privateRelayUrl;
  }
  if (patch.arbitrageVenues !== undefined) {
    next.ARBITRAGE_VENUES = patch.arbitrageVenues;
  }
  if (patch.exchanges?.binance?.apiKey !== undefined) {
    next.BINANCE_API_KEY = patch.exchanges.binance.apiKey;
  }
  if (patch.exchanges?.binance?.secretKey !== undefined) {
    next.BINANCE_SECRET_KEY = patch.exchanges.binance.secretKey;
  }
  if (patch.exchanges?.okx?.apiKey !== undefined) {
    next.OKX_API_KEY = patch.exchanges.okx.apiKey;
  }
  if (patch.exchanges?.okx?.secretKey !== undefined) {
    next.OKX_SECRET_KEY = patch.exchanges.okx.secretKey;
  }
  if (patch.exchanges?.bitget?.apiKey !== undefined) {
    next.BITGET_API_KEY = patch.exchanges.bitget.apiKey;
  }
  if (patch.exchanges?.bitget?.secretKey !== undefined) {
    next.BITGET_SECRET_KEY = patch.exchanges.bitget.secretKey;
  }
  if (patch.exchanges?.mexc?.apiKey !== undefined) {
    next.MEXC_API_KEY = patch.exchanges.mexc.apiKey;
  }
  if (patch.exchanges?.mexc?.secretKey !== undefined) {
    next.MEXC_SECRET_KEY = patch.exchanges.mexc.secretKey;
  }
  if (patch.exchanges?.gate?.apiKey !== undefined) {
    next.GATE_API_KEY = patch.exchanges.gate.apiKey;
  }
  if (patch.exchanges?.gate?.secretKey !== undefined) {
    next.GATE_SECRET_KEY = patch.exchanges.gate.secretKey;
  }

  if (patch.chains?.ethereum?.rpcUrl !== undefined) {
    next.ETHEREUM_RPC_URL = patch.chains.ethereum.rpcUrl;
  }
  if (patch.chains?.polygon?.rpcUrl !== undefined) {
    next.POLYGON_RPC_URL = patch.chains.polygon.rpcUrl;
  }
  if (patch.chains?.arbitrum?.rpcUrl !== undefined) {
    next.ARBITRUM_RPC_URL = patch.chains.arbitrum.rpcUrl;
  }
  if (patch.chains?.bnb?.rpcUrl !== undefined) {
    next.BNB_RPC_URL = patch.chains.bnb.rpcUrl;
  }
  if (patch.chains?.ethereum?.liquidatorContract !== undefined) {
    next.ETHEREUM_LIQUIDATOR_CONTRACT =
      patch.chains.ethereum.liquidatorContract;
  }
  if (patch.chains?.polygon?.liquidatorContract !== undefined) {
    next.POLYGON_LIQUIDATOR_CONTRACT = patch.chains.polygon.liquidatorContract;
  }
  if (patch.chains?.arbitrum?.liquidatorContract !== undefined) {
    next.ARBITRUM_LIQUIDATOR_CONTRACT = patch.chains.arbitrum.liquidatorContract;
  }
  if (patch.chains?.bnb?.liquidatorContract !== undefined) {
    next.BNB_LIQUIDATOR_CONTRACT = patch.chains.bnb.liquidatorContract;
  }
  if (patch.markets?.["aave-v3-ethereum"]?.liquidatorContract !== undefined) {
    next.AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT =
      patch.markets["aave-v3-ethereum"].liquidatorContract;
  }
  if (patch.markets?.["spark-ethereum"]?.liquidatorContract !== undefined) {
    next.SPARK_ETHEREUM_LIQUIDATOR_CONTRACT =
      patch.markets["spark-ethereum"].liquidatorContract;
  }

  if (!next.LIQUIDATOR_CONTRACT) {
    next.LIQUIDATOR_CONTRACT =
      next.AAVE_V3_ETHEREUM_LIQUIDATOR_CONTRACT ||
      next.SPARK_ETHEREUM_LIQUIDATOR_CONTRACT ||
      next.ETHEREUM_LIQUIDATOR_CONTRACT ||
      next.POLYGON_LIQUIDATOR_CONTRACT ||
      next.ARBITRUM_LIQUIDATOR_CONTRACT ||
      next.BNB_LIQUIDATOR_CONTRACT;
  }

  writeFileSync(filePath, serializeManagedEnv(next), "utf8");

  for (const key of MANAGED_KEYS) {
    process.env[key] = next[key];
  }

  return loadDashboardSettings();
}

export function dashboardSettingsFilePath(): string {
  return envLocalPath();
}
