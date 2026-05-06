import type { Address } from "viem";

export type MorphoBlueMarketId = `0x${string}`;

export type MorphoBlueRegistryEntry = {
  priority: number;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  protocol: "morpho-blue";
  marketId: MorphoBlueMarketId;
  label: string;
  loanAsset: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  collateralAsset: {
    address: Address;
    symbol: string;
    decimals: number;
  };
  lltvBps: number;
  oracleAddress: Address;
  irmAddress: Address;
  snapshot: {
    asOf: string;
    supplyAssetsUsd: number;
    borrowAssetsUsd: number;
    utilization: number;
    source: "https://blue-api.morpho.org/graphql";
  };
  notes: string[];
};

// Curated from Morpho Blue official API on April 13, 2026.
export const MORPHO_BLUE_ETHEREUM_STARTER_MARKETS: MorphoBlueRegistryEntry[] = [
  {
    priority: 1,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0x64d65c9a2d91c36d56fbc42d69e979335320169b3df63bf92789e2c8883fcc64",
    label: "Morpho Blue / Ethereum / USDC -> cbBTC",
    loanAsset: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
    },
    collateralAsset: {
      address: "0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf",
      symbol: "cbBTC",
      decimals: 8,
    },
    lltvBps: 8600,
    oracleAddress: "0xA6D6950c9F177F1De7f7757FB33539e3Ec60182a",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 310533856.9169632,
      borrowAssetsUsd: 267245550.79915664,
      utilization: 0.860600365616874,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "Large BTC-backed USD borrow market suitable for first read-only health checks.",
      "Close-factor style lending surface, but isolated from Aave reserve semantics.",
    ],
  },
  {
    priority: 2,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0xe7e9694b754c4d4f7e21faf7223f6fa71abaeb10296a4c43a54a7977149687d2",
    label: "Morpho Blue / Ethereum / USDT -> wstETH",
    loanAsset: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
    },
    collateralAsset: {
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      symbol: "wstETH",
      decimals: 18,
    },
    lltvBps: 8600,
    oracleAddress: "0x95DB30fAb9A3754e42423000DF27732CB2396992",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 167676595.86967438,
      borrowAssetsUsd: 153264793.32050723,
      utilization: 0.9140500051636984,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "wstETH collateral market with meaningful size and high utilization.",
      "Good candidate for the first ETH-collateral Morpho adapter pass.",
    ],
  },
  {
    priority: 3,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0x3a85e619751152991742810df6ec69ce473daef99e28a64ab2340d7b7ccfee49",
    label: "Morpho Blue / Ethereum / USDC -> WBTC",
    loanAsset: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
    },
    collateralAsset: {
      address: "0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599",
      symbol: "WBTC",
      decimals: 8,
    },
    lltvBps: 8600,
    oracleAddress: "0xDddd770BADd886dF3864029e4B377B5F6a2B6b83",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 105896799.2995777,
      borrowAssetsUsd: 90972002.63842441,
      utilization: 0.8590628162525323,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "Canonical WBTC variant alongside cbBTC for early BTC-collateral coverage.",
    ],
  },
  {
    priority: 4,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0xb8fc70e82bc5bb53e773626fcc6a23f7eefa036918d7ef216ecfb1950a94a85e",
    label: "Morpho Blue / Ethereum / WETH -> wstETH",
    loanAsset: {
      address: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
      symbol: "WETH",
      decimals: 18,
    },
    collateralAsset: {
      address: "0x7f39C581F595B53c5cb19bD0b3f8dA6c935E2Ca0",
      symbol: "wstETH",
      decimals: 18,
    },
    lltvBps: 9650,
    oracleAddress: "0xbD60A6770b27E084E8617335ddE769241B0e71D8",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 102225044.2380803,
      borrowAssetsUsd: 91978290.65837035,
      utilization: 0.8997627865452869,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "Native ETH pair with high LLTV, useful for validating Morpho-specific liquidation math.",
    ],
  },
  {
    priority: 5,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0x3274643db77a064abd3bc851de77556a4ad2e2f502f4f0c80845fa8f909ecf0b",
    label: "Morpho Blue / Ethereum / USDT -> sUSDS",
    loanAsset: {
      address: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      symbol: "USDT",
      decimals: 6,
    },
    collateralAsset: {
      address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
      symbol: "sUSDS",
      decimals: 18,
    },
    lltvBps: 9650,
    oracleAddress: "0x0C426d174FC88B7A25d59945Ab2F7274Bf7B4C79",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 202312524.26781029,
      borrowAssetsUsd: 185153225.2343036,
      utilization: 0.9151841978364516,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "Large stable collateral market worth tracking once the first adapter pass is in place.",
    ],
  },
  {
    priority: 6,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0x90ef0c5a0dc7c4de4ad4585002d44e9d411d212d2f6258e94948beecf8b4c0d5",
    label: "Morpho Blue / Ethereum / PYUSD -> sUSDe",
    loanAsset: {
      address: "0x6c3ea9036406852006290770BEdFcAbA0e23A0e8",
      symbol: "PYUSD",
      decimals: 6,
    },
    collateralAsset: {
      address: "0x9D39A5DE30e57443BfF2A8307A4256c8797A3497",
      symbol: "sUSDe",
      decimals: 18,
    },
    lltvBps: 9150,
    oracleAddress: "0xE6212D05cB5aF3C821Fef1C1A233a678724F9E7E",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 170898955.33781126,
      borrowAssetsUsd: 146749647.16553745,
      utilization: 0.8586924763551741,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "Adds a large stable/stable venue to the starter set without duplicating Aave-style pool assumptions.",
    ],
  },
  {
    priority: 7,
    chain: "ethereum",
    chainId: 1,
    protocol: "morpho-blue",
    marketId: "0x8eaf7b29f02ba8d8c1d7aeb587403dcb16e2e943e4e2f5f94b0963c2386406c9",
    label: "Morpho Blue / Ethereum / USDC -> PAXG",
    loanAsset: {
      address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      symbol: "USDC",
      decimals: 6,
    },
    collateralAsset: {
      address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78",
      symbol: "PAXG",
      decimals: 18,
    },
    lltvBps: 9150,
    oracleAddress: "0xDd1778F71a4a1C6A0eFebd8AE9f8848634CE1101",
    irmAddress: "0x870aC11D48B15DB9a138Cf899d20F13F79Ba00BC",
    snapshot: {
      asOf: "2026-04-13",
      supplyAssetsUsd: 382550456.95089704,
      borrowAssetsUsd: 382550456.95089704,
      utilization: 1,
      source: "https://blue-api.morpho.org/graphql",
    },
    notes: [
      "High-liquidity alternative collateral profile that broadens the first Morpho watchlist beyond BTC and ETH.",
    ],
  },
];

export function morphoBlueEthereumRegistrySummary(): {
  protocol: "morpho-blue";
  chain: "ethereum";
  chainId: 1;
  asOf: "2026-04-13";
  marketCount: number;
  markets: MorphoBlueRegistryEntry[];
} {
  return {
    protocol: "morpho-blue",
    chain: "ethereum",
    chainId: 1,
    asOf: "2026-04-13",
    marketCount: MORPHO_BLUE_ETHEREUM_STARTER_MARKETS.length,
    markets: MORPHO_BLUE_ETHEREUM_STARTER_MARKETS.map((market) => ({ ...market })),
  };
}

export function findMorphoBlueEthereumRegistryEntry(
  marketId: string | undefined,
): MorphoBlueRegistryEntry | null {
  if (!marketId) {
    return null;
  }

  return (
    MORPHO_BLUE_ETHEREUM_STARTER_MARKETS.find(
      (entry) => entry.marketId.toLowerCase() === marketId.toLowerCase(),
    ) ?? null
  );
}

export function morphoBlueLltvWadFromBps(lltvBps: number): string {
  return (BigInt(lltvBps) * 10n ** 14n).toString();
}
