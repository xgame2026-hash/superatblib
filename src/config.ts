import "./env.js";
import { Address } from "viem";
import {
  AAVE_V3_PROTOCOL,
  type ProtocolDescriptor,
  SPARKLEND_PROTOCOL,
} from "./protocols.js";
import {
  defaultExecutionAlertThreshold,
  defaultExecutionChunkSize,
  defaultExecutionLimit,
  defaultExecutionLookbackBlocks,
  defaultExecutionUserBatchSize,
} from "./liquidation/tuning.js";

export type ChainPreset = {
  key: "ethereum" | "bnb" | "arbitrum" | "polygon";
  chainId: number;
  name: string;
  protocol: ProtocolDescriptor;
  poolAddressesProvider: Address;
  pool: Address;
  wrappedNativeToken: Address;
  source: string;
  defaultRpcEnv: string;
};

export type ExecutionMarketPreset = {
  key:
    | "aave-v3-ethereum"
    | "aave-v3-arbitrum"
    | "aave-v3-polygon"
    | "aave-v3-bnb"
    | "spark-ethereum";
  label: string;
  chain: ChainPreset["key"];
  chainId: number;
  protocol: ProtocolDescriptor;
  poolAddressesProvider: Address;
  pool: Address;
  wrappedNativeToken: Address;
  source: string;
  defaultRpcEnv: string;
};

export type FundingMode = "self_funded" | "flash_loan";

export const CHAIN_PRESETS: Record<number, ChainPreset> = {
  1: {
    key: "ethereum",
    chainId: 1,
    name: "Ethereum",
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: "0x2f39d218133AFaB8F2B819B1066c7E434Ad94E9e",
    pool: "0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2",
    wrappedNativeToken: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
    source:
      "https://raw.githubusercontent.com/bgd-labs/aave-address-book/main/src/ts/AaveV3Ethereum.ts",
    defaultRpcEnv: "ETHEREUM_RPC_URL",
  },
  56: {
    key: "bnb",
    chainId: 56,
    name: "BNB Chain",
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: "0xff75B6da14FfbbfD355Daf7a2731456b3562Ba6D",
    pool: "0x6807dc923806fE8Fd134338EABCA509979a7e0cB",
    wrappedNativeToken: "0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c",
    source:
      "https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3BNB.ts",
    defaultRpcEnv: "BNB_RPC_URL",
  },
  42161: {
    key: "arbitrum",
    chainId: 42161,
    name: "Arbitrum",
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    wrappedNativeToken: "0x82af49447d8a07e3bd95bd0d56f35241523fbab1",
    source:
      "https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3Arbitrum.ts",
    defaultRpcEnv: "ARBITRUM_RPC_URL",
  },
  137: {
    key: "polygon",
    chainId: 137,
    name: "Polygon",
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: "0xa97684ead0e402dC232d5A977953DF7ECBaB3CDb",
    pool: "0x794a61358D6845594F94dc1DB02A252b5b4814aD",
    wrappedNativeToken: "0x0d500B1d8E8eF31E21C99d1Db9A6444d3ADf1270",
    source:
      "https://raw.githubusercontent.com/aave-dao/aave-address-book/main/src/ts/AaveV3Polygon.ts",
    defaultRpcEnv: "POLYGON_RPC_URL",
  },
};

export const CHAIN_ALIASES = {
  ethereum: CHAIN_PRESETS[1],
  eth: CHAIN_PRESETS[1],
  mainnet: CHAIN_PRESETS[1],
  bnb: CHAIN_PRESETS[56],
  bsc: CHAIN_PRESETS[56],
  arbitrum: CHAIN_PRESETS[42161],
  arb: CHAIN_PRESETS[42161],
  polygon: CHAIN_PRESETS[137],
  matic: CHAIN_PRESETS[137],
} as const;

export const EXECUTION_MARKET_PRESETS: Record<
  ExecutionMarketPreset["key"],
  ExecutionMarketPreset
> = {
  "aave-v3-ethereum": {
    key: "aave-v3-ethereum",
    label: "Aave V3 / Ethereum",
    chain: "ethereum",
    chainId: 1,
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: CHAIN_PRESETS[1].poolAddressesProvider,
    pool: CHAIN_PRESETS[1].pool,
    wrappedNativeToken: CHAIN_PRESETS[1].wrappedNativeToken,
    source: CHAIN_PRESETS[1].source,
    defaultRpcEnv: CHAIN_PRESETS[1].defaultRpcEnv,
  },
  "aave-v3-arbitrum": {
    key: "aave-v3-arbitrum",
    label: "Aave V3 / Arbitrum",
    chain: "arbitrum",
    chainId: 42161,
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: CHAIN_PRESETS[42161].poolAddressesProvider,
    pool: CHAIN_PRESETS[42161].pool,
    wrappedNativeToken: CHAIN_PRESETS[42161].wrappedNativeToken,
    source: CHAIN_PRESETS[42161].source,
    defaultRpcEnv: CHAIN_PRESETS[42161].defaultRpcEnv,
  },
  "aave-v3-polygon": {
    key: "aave-v3-polygon",
    label: "Aave V3 / Polygon",
    chain: "polygon",
    chainId: 137,
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: CHAIN_PRESETS[137].poolAddressesProvider,
    pool: CHAIN_PRESETS[137].pool,
    wrappedNativeToken: CHAIN_PRESETS[137].wrappedNativeToken,
    source: CHAIN_PRESETS[137].source,
    defaultRpcEnv: CHAIN_PRESETS[137].defaultRpcEnv,
  },
  "aave-v3-bnb": {
    key: "aave-v3-bnb",
    label: "Aave V3 / BNB Chain",
    chain: "bnb",
    chainId: 56,
    protocol: AAVE_V3_PROTOCOL,
    poolAddressesProvider: CHAIN_PRESETS[56].poolAddressesProvider,
    pool: CHAIN_PRESETS[56].pool,
    wrappedNativeToken: CHAIN_PRESETS[56].wrappedNativeToken,
    source: CHAIN_PRESETS[56].source,
    defaultRpcEnv: CHAIN_PRESETS[56].defaultRpcEnv,
  },
  "spark-ethereum": {
    key: "spark-ethereum",
    label: "SparkLend / Ethereum",
    chain: "ethereum",
    chainId: 1,
    protocol: SPARKLEND_PROTOCOL,
    poolAddressesProvider: "0x02C3eA4e34C0cBd694D2adFa2c690EECbC1793eE",
    pool: "0xC13e21B648A5Ee794902342038FF3aDAB66BE987",
    wrappedNativeToken: CHAIN_PRESETS[1].wrappedNativeToken,
    source:
      "https://docs.spark.fi/assets/Chainsecurity-SparkLend-Deployment-Verification.pdf",
    defaultRpcEnv: CHAIN_PRESETS[1].defaultRpcEnv,
  },
};

export const EXECUTION_MARKET_ALIASES = {
  aave: EXECUTION_MARKET_PRESETS["aave-v3-ethereum"],
  "aave-ethereum": EXECUTION_MARKET_PRESETS["aave-v3-ethereum"],
  "aave-v3": EXECUTION_MARKET_PRESETS["aave-v3-ethereum"],
  "aave-v3-ethereum": EXECUTION_MARKET_PRESETS["aave-v3-ethereum"],
  "aave-arbitrum": EXECUTION_MARKET_PRESETS["aave-v3-arbitrum"],
  "aave-v3-arbitrum": EXECUTION_MARKET_PRESETS["aave-v3-arbitrum"],
  "aave-polygon": EXECUTION_MARKET_PRESETS["aave-v3-polygon"],
  "aave-v3-polygon": EXECUTION_MARKET_PRESETS["aave-v3-polygon"],
  "aave-bnb": EXECUTION_MARKET_PRESETS["aave-v3-bnb"],
  "aave-bsc": EXECUTION_MARKET_PRESETS["aave-v3-bnb"],
  "aave-v3-bnb": EXECUTION_MARKET_PRESETS["aave-v3-bnb"],
  spark: EXECUTION_MARKET_PRESETS["spark-ethereum"],
  sparklend: EXECUTION_MARKET_PRESETS["spark-ethereum"],
  "spark-ethereum": EXECUTION_MARKET_PRESETS["spark-ethereum"],
} as const;

export type CliOptions = {
  chain?: ChainPreset;
  market?: ExecutionMarketPreset;
  fundingMode: FundingMode;
  rpcUrl: string;
  executionRpcUrl: string;
  configuredAddressProvider?: Address;
  alertThreshold: number;
  lookbackBlocks: bigint;
  chunkSize: bigint;
  userBatchSize: number;
  limit: number;
  fromBlock?: bigint;
  toBlock?: bigint;
  json: boolean;
};

const DEFAULT_RPC_URL = "https://blissful-wiser-pool.bsc.quiknode.pro/d1a545871254b13042697bed9cefb1339dc65173/";

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function resolveChainPreset(raw: string | undefined): ChainPreset | undefined {
  if (!raw) {
    return undefined;
  }

  const normalized = raw.trim().toLowerCase();
  const preset = CHAIN_ALIASES[normalized as keyof typeof CHAIN_ALIASES];

  if (!preset) {
    const supported = Object.keys(CHAIN_ALIASES).join(", ");
    throw new Error(`Unsupported chain "${raw}". Supported values: ${supported}`);
  }

  return preset;
}

function defaultExecutionMarket(
  chain: ChainPreset | undefined,
): ExecutionMarketPreset | undefined {
  if (!chain) {
    return undefined;
  }
  if (chain.key === "ethereum") {
    return EXECUTION_MARKET_PRESETS["aave-v3-ethereum"];
  }
  if (chain.key === "arbitrum") {
    return EXECUTION_MARKET_PRESETS["aave-v3-arbitrum"];
  }
  if (chain.key === "polygon") {
    return EXECUTION_MARKET_PRESETS["aave-v3-polygon"];
  }
  if (chain.key === "bnb") {
    return EXECUTION_MARKET_PRESETS["aave-v3-bnb"];
  }
  return undefined;
}

function resolveExecutionMarketPreset(
  raw: string | undefined,
  selectedChain: ChainPreset | undefined,
): ExecutionMarketPreset | undefined {
  if (!raw) {
    return defaultExecutionMarket(selectedChain);
  }

  const normalized = raw.trim().toLowerCase();
  const preset =
    EXECUTION_MARKET_ALIASES[
      normalized as keyof typeof EXECUTION_MARKET_ALIASES
    ];

  if (!preset) {
    const supported = Object.keys(EXECUTION_MARKET_ALIASES).join(", ");
    throw new Error(
      `Unsupported market "${raw}". Supported values: ${supported}`,
    );
  }

  if (selectedChain && selectedChain.chainId !== preset.chainId) {
    throw new Error(
      `Market "${raw}" runs on ${preset.chain}, but --chain selected ${selectedChain.key}.`,
    );
  }

  return preset;
}

function readNumber(name: string, envName: string, fallback: number): number {
  const raw = readArg(name) ?? process.env[envName];
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`Invalid number for ${name}: ${raw}`);
  }

  return value;
}

function readBigInt(name: string, envName: string, fallback: bigint): bigint {
  const raw = readArg(name) ?? process.env[envName];
  if (!raw) {
    return fallback;
  }

  try {
    return BigInt(raw);
  } catch {
    throw new Error(`Invalid bigint for ${name}: ${raw}`);
  }
}

function resolveFundingMode(
  raw: string | undefined,
  selectedChain: ChainPreset | undefined,
): FundingMode {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return selectedChain?.key === "ethereum" ? "flash_loan" : "self_funded";
  }
  if (
    normalized === "self_funded" ||
    normalized === "self-funded" ||
    normalized === "self"
  ) {
    return "self_funded";
  }
  if (
    normalized === "flash_loan" ||
    normalized === "flash-loan" ||
    normalized === "flashloan" ||
    normalized === "flash"
  ) {
    return "flash_loan";
  }
  throw new Error(
    `Unsupported funding mode "${raw}". Supported values: self_funded, flash_loan.`,
  );
}

export function loadCliOptions(): CliOptions {
  const requestedChain = resolveChainPreset(
    readArg("chain") ?? process.env.CHAIN,
  );
  const selectedMarket = resolveExecutionMarketPreset(
    readArg("market") ?? process.env.MARKET,
    requestedChain,
  );
  const selectedChain =
    requestedChain ??
    (selectedMarket ? CHAIN_PRESETS[selectedMarket.chainId] : undefined);
  const configuredAddressProvider = (readArg("addressProvider") ??
    process.env.ADDRESS_PROVIDER) as Address | undefined;
  const rpcUrl =
    readArg("rpcUrl") ??
    process.env.CONTROL_RPC_URL ??
    process.env.RPC_URL ??
    (selectedChain ? process.env[selectedChain.defaultRpcEnv] : undefined) ??
    (selectedChain?.key === "bnb" || !selectedChain ? DEFAULT_RPC_URL : undefined);

  if (!rpcUrl) {
    throw new Error(
      `Missing RPC URL. Set CONTROL_RPC_URL, RPC_URL, or ${selectedChain?.defaultRpcEnv ?? "the chain-specific RPC env var"}.`,
    );
  }

  const executionRpcUrl =
    readArg("executionRpcUrl") ??
    process.env.EXECUTION_RPC_URL ??
    rpcUrl;
  const tuningChain = selectedChain?.key;
  const tuningMarket = selectedMarket?.key;

  return {
    chain: selectedChain,
    market: selectedMarket,
    fundingMode: resolveFundingMode(
      readArg("fundingMode") ?? process.env.FUNDING_MODE,
      selectedChain,
    ),
    rpcUrl,
    executionRpcUrl,
    configuredAddressProvider,
    alertThreshold: readNumber(
      "threshold",
      "ALERT_THRESHOLD",
      defaultExecutionAlertThreshold(tuningChain, tuningMarket),
    ),
    lookbackBlocks: readBigInt(
      "lookbackBlocks",
      "LOOKBACK_BLOCKS",
      BigInt(defaultExecutionLookbackBlocks(tuningChain, tuningMarket)),
    ),
    chunkSize: readBigInt(
      "chunkSize",
      "CHUNK_SIZE",
      BigInt(defaultExecutionChunkSize(tuningChain, tuningMarket)),
    ),
    userBatchSize: readNumber(
      "userBatchSize",
      "USER_BATCH_SIZE",
      defaultExecutionUserBatchSize(tuningChain, tuningMarket),
    ),
    limit: readNumber("limit", "LIMIT", defaultExecutionLimit(tuningChain, tuningMarket)),
    fromBlock: readArg("fromBlock")
      ? BigInt(readArg("fromBlock") as string)
      : undefined,
    toBlock: readArg("toBlock") ? BigInt(readArg("toBlock") as string) : undefined,
    json: hasFlag("json"),
  };
}
