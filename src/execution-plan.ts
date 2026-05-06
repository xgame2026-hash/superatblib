import { Address, PublicClient, encodeFunctionData } from "viem";

import { addressProviderAbi, oracleAbi, poolAbi } from "./abi.js";
import { CliOptions, FundingMode } from "./config.js";
import {
  analyzeUsers,
  formatAssetAmount,
  formatBaseAmount,
  loadReserveMetadata,
  ReserveMetadata,
} from "./liquidation-analysis.js";
import {
  collectCandidateUsers,
  loadAccountSnapshots,
  resolveMarket,
  sortRiskySnapshots,
  toHealthFactorWad,
} from "./market.js";
import { describeProtocolForOutput } from "./protocols.js";

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

export type PreparedExecution = {
  chainId: number;
  chainName: string;
  marketId?: string;
  executionMarketKey?: string;
  executionMarketLabel?: string;
  protocol: ReturnType<typeof describeProtocolForOutput>;
  pool: Address;
  selectedUser: Address;
  liquidatable: boolean;
  healthFactor: string;
  selection: {
    method: "rough_net_profit" | "gross_profit";
    scoreBase: string;
    scoreDisplay: string;
    roughGasPriceWei?: string;
    roughTotalGas?: string;
    roughGasCostBase?: string;
    roughRoutingCostBps?: string;
    roughRoutingCostBase?: string;
    roughFlashLoanPremiumBps?: string;
    roughFlashLoanPremiumBase?: string;
  };
  approve: {
    token: Address;
    symbol: string;
    spender: Address;
    amount: bigint;
    amountDisplay: string;
    calldata: `0x${string}`;
  };
  liquidationCall: {
    pool: Address;
    collateralAsset: Address;
    collateralSymbol: string;
    collateralDecimals: bigint;
    debtAsset: Address;
    debtSymbol: string;
    debtDecimals: bigint;
    user: Address;
    debtToCover: bigint;
    debtToCoverDisplay: string;
    expectedCollateralToReceive: bigint;
    expectedCollateralToReceiveDisplay: string;
    expectedGrossProfitBase: bigint;
    expectedGrossProfitDisplay: string;
    expectedNetProfitBase?: string;
    expectedNetProfitDisplay?: string;
    receiveAToken: boolean;
    calldata: `0x${string}`;
  };
  notes: string[];
};

export type PrepareSelectionOptions = {
  targetUser?: Address;
  allowRisky: boolean;
  receiveAToken: boolean;
};

const ROUGH_APPROVE_GAS = 55_000n;
const ROUGH_LIQUIDATION_GAS = 450_000n;

const STABLE_SYMBOLS = new Set([
  "USDC",
  "USDT",
  "DAI",
  "USDS",
  "USDE",
  "SUSDE",
  "EUSDE",
  "EURC",
]);

const MAJOR_SYMBOLS = new Set(["WETH", "WBTC", "CBBTC"]);
const LST_SYMBOLS = new Set(["WSTETH", "WEETH", "RETH", "EZETH"]);

type RoughSelectionPricing = {
  baseCurrency: Address;
  baseCurrencyUnit: bigint;
  gasPriceWei: bigint;
  totalGas: bigint;
  gasCostBase: bigint;
  flashLoanPremiumBps?: bigint;
};

function classifyAssetLiquidity(symbol: string): "stable" | "major" | "lst" | "other" {
  const normalized = symbol.trim().toUpperCase();
  if (STABLE_SYMBOLS.has(normalized)) {
    return "stable";
  }
  if (MAJOR_SYMBOLS.has(normalized)) {
    return "major";
  }
  if (LST_SYMBOLS.has(normalized)) {
    return "lst";
  }
  return "other";
}

function estimateRoughRoutingCostBps(params: {
  debtSymbol: string;
  collateralSymbol: string;
}): bigint {
  const debtClass = classifyAssetLiquidity(params.debtSymbol);
  const collateralClass = classifyAssetLiquidity(params.collateralSymbol);

  if (debtClass === "stable" && collateralClass === "stable") {
    return 8n;
  }
  if (
    (debtClass === "stable" && collateralClass === "major") ||
    (debtClass === "major" && collateralClass === "stable")
  ) {
    return 18n;
  }
  if (debtClass === "major" && collateralClass === "major") {
    return 20n;
  }
  if (
    (debtClass === "stable" && collateralClass === "lst") ||
    (debtClass === "lst" && collateralClass === "stable")
  ) {
    return 30n;
  }
  if (
    (debtClass === "major" && collateralClass === "lst") ||
    (debtClass === "lst" && collateralClass === "major")
  ) {
    return 28n;
  }
  if (debtClass === "lst" && collateralClass === "lst") {
    return 32n;
  }
  return 45n;
}

export function readArg(name: string): string | undefined {
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

export function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function findReserve(
  reserves: ReserveMetadata[],
  asset: Address,
): ReserveMetadata | undefined {
  return reserves.find((reserve) => reserve.asset === asset);
}

async function loadRoughSelectionPricing(
  client: PublicClient,
  market: Awaited<ReturnType<typeof resolveMarket>>,
  fundingMode: FundingMode,
): Promise<RoughSelectionPricing | undefined> {
  if (!market.wrappedNativeToken) {
    return undefined;
  }

  try {
    const oracle = await client.readContract({
      address: market.poolAddressesProvider,
      abi: addressProviderAbi,
      functionName: "getPriceOracle",
    });

    const [baseCurrency, baseCurrencyUnit, nativePrice, gasPriceWei, flashLoanPremiumBps] =
      await Promise.all([
        client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "BASE_CURRENCY",
        }),
        client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "BASE_CURRENCY_UNIT",
        }),
        client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [market.wrappedNativeToken],
        }),
        client.getGasPrice(),
        fundingMode === "flash_loan"
          ? client.readContract({
              address: market.pool,
              abi: poolAbi,
              functionName: "FLASHLOAN_PREMIUM_TOTAL",
            })
          : Promise.resolve(undefined),
      ]);

    if (nativePrice === 0n) {
      return undefined;
    }

    const totalGas = ROUGH_APPROVE_GAS + ROUGH_LIQUIDATION_GAS;
    const gasCostBase = (totalGas * gasPriceWei * nativePrice) / 10n ** 18n;

    return {
      baseCurrency,
      baseCurrencyUnit,
      gasPriceWei,
      totalGas,
      gasCostBase,
      flashLoanPremiumBps,
    };
  } catch {
    return undefined;
  }
}

function toPreparedExecution(
  selected: Awaited<ReturnType<typeof analyzeUsers>>[number],
  market: Awaited<ReturnType<typeof resolveMarket>>,
  reserveState: {
    baseCurrency: Address;
    baseCurrencyUnit: bigint;
    reserves: ReserveMetadata[];
  },
  selection: PrepareSelectionOptions,
  roughPricing: RoughSelectionPricing | undefined,
  fundingMode: FundingMode,
): PreparedExecution {
  if (!selected.bestPair) {
    throw new Error("No liquidation pair could be derived for the selected candidate.");
  }

  const debtReserve = findReserve(reserveState.reserves, selected.bestPair.debtAsset);
  const collateralReserve = findReserve(
    reserveState.reserves,
    selected.bestPair.collateralAsset,
  );

  if (!debtReserve || !collateralReserve) {
    throw new Error("Selected pair assets were not found in reserve metadata.");
  }

  const approveData = encodeFunctionData({
    abi: erc20Abi,
    functionName: "approve",
    args: [market.pool, selected.bestPair.debtToCover],
  });

  const liquidationCallData = encodeFunctionData({
    abi: poolAbi,
    functionName: "liquidationCall",
    args: [
      selected.bestPair.collateralAsset,
      selected.bestPair.debtAsset,
      selected.user,
      selected.bestPair.debtToCover,
      selection.receiveAToken,
    ],
  });

  const roughRoutingCostBps = estimateRoughRoutingCostBps({
    debtSymbol: selected.bestPair.debtSymbol,
    collateralSymbol: selected.bestPair.collateralSymbol,
  });
  const roughRoutingCostBase =
    (selected.bestPair.collateralValueBase * roughRoutingCostBps) / 10_000n;
  const roughFlashLoanPremiumBase =
    fundingMode === "flash_loan" && roughPricing?.flashLoanPremiumBps !== undefined
      ? (selected.bestPair.debtValueBase * roughPricing.flashLoanPremiumBps) / 10_000n
      : 0n;

  const expectedNetProfitBase =
    roughPricing !== undefined
      ? selected.bestPair.grossProfitBase -
        roughPricing.gasCostBase -
        roughRoutingCostBase -
        roughFlashLoanPremiumBase
      : undefined;
  const selectionScoreBase =
    expectedNetProfitBase ?? selected.bestPair.grossProfitBase;

  return {
    chainId: market.chainId,
    chainName: market.chainName,
    marketId: market.marketId,
    executionMarketKey: market.executionMarketKey,
    executionMarketLabel: market.executionMarketLabel,
    protocol: describeProtocolForOutput(market.protocol),
    pool: market.pool,
    selectedUser: selected.user,
    liquidatable: selected.liquidatable,
    healthFactor: selected.snapshot.healthFactor.toString(),
    selection: {
      method: roughPricing ? "rough_net_profit" : "gross_profit",
      scoreBase: selectionScoreBase.toString(),
      scoreDisplay: formatBaseAmount(
        selectionScoreBase,
        reserveState.baseCurrencyUnit,
        reserveState.baseCurrency,
      ),
      roughGasPriceWei: roughPricing?.gasPriceWei.toString(),
      roughTotalGas: roughPricing?.totalGas.toString(),
      roughGasCostBase: roughPricing?.gasCostBase.toString(),
      roughRoutingCostBps: roughRoutingCostBps.toString(),
      roughRoutingCostBase: roughRoutingCostBase.toString(),
      ...(roughPricing?.flashLoanPremiumBps !== undefined
        ? {
            roughFlashLoanPremiumBps:
              roughPricing.flashLoanPremiumBps.toString(),
            roughFlashLoanPremiumBase: roughFlashLoanPremiumBase.toString(),
          }
        : {}),
    },
    approve: {
      token: selected.bestPair.debtAsset,
      symbol: selected.bestPair.debtSymbol,
      spender: market.pool,
      amount: selected.bestPair.debtToCover,
      amountDisplay: formatAssetAmount(
        selected.bestPair.debtToCover,
        debtReserve.decimals,
      ),
      calldata: approveData,
    },
    liquidationCall: {
      pool: market.pool,
      collateralAsset: selected.bestPair.collateralAsset,
      collateralSymbol: selected.bestPair.collateralSymbol,
      collateralDecimals: collateralReserve.decimals,
      debtAsset: selected.bestPair.debtAsset,
      debtSymbol: selected.bestPair.debtSymbol,
      debtDecimals: debtReserve.decimals,
      user: selected.user,
      debtToCover: selected.bestPair.debtToCover,
      debtToCoverDisplay: formatAssetAmount(
        selected.bestPair.debtToCover,
        debtReserve.decimals,
      ),
      expectedCollateralToReceive: selected.bestPair.collateralToReceive,
      expectedCollateralToReceiveDisplay: formatAssetAmount(
        selected.bestPair.collateralToReceive,
        collateralReserve.decimals,
      ),
      expectedGrossProfitBase: selected.bestPair.grossProfitBase,
      expectedGrossProfitDisplay: formatBaseAmount(
        selected.bestPair.grossProfitBase,
        reserveState.baseCurrencyUnit,
        reserveState.baseCurrency,
      ),
      expectedNetProfitBase: expectedNetProfitBase?.toString(),
      expectedNetProfitDisplay:
        expectedNetProfitBase !== undefined
          ? formatBaseAmount(
              expectedNetProfitBase,
              reserveState.baseCurrencyUnit,
              reserveState.baseCurrency,
            )
          : undefined,
      receiveAToken: selection.receiveAToken,
      calldata: liquidationCallData,
    },
    notes: [
      "This payload does not send a transaction.",
      `Prepared against ${market.protocol.label}.`,
      "Rough gross profit includes liquidation bonus and protocol fee only.",
      roughPricing
        ? fundingMode === "flash_loan"
          ? "Selection score uses rough net profit after gas, route haircut, and flash-loan premium deductions."
          : "Selection score uses rough net profit after conservative gas and route haircut deductions."
        : "Selection fell back to gross profit because rough gas pricing was unavailable.",
      `Route haircut uses a conservative ${roughRoutingCostBps.toString()} bps estimate for ${selected.bestPair.collateralSymbol} -> ${selected.bestPair.debtSymbol}.`,
      fundingMode === "flash_loan" && roughPricing?.flashLoanPremiumBps === 0n
        ? "Flash-loan premium resolved to 0 bps from the pool at current state."
        : fundingMode === "flash_loan"
          ? "Flash-loan premium is deducted from rough net profit."
          : "Flash-loan premium is not applicable in self-funded mode.",
    ],
  };
}

export async function rankPreparedExecutionCandidates(
  client: PublicClient,
  market: Awaited<ReturnType<typeof resolveMarket>>,
  reserveState: {
    baseCurrency: Address;
    baseCurrencyUnit: bigint;
    reserves: ReserveMetadata[];
  },
  analyses: Awaited<ReturnType<typeof analyzeUsers>>,
  selection: PrepareSelectionOptions,
  fundingMode: FundingMode,
): Promise<PreparedExecution[]> {
  const roughPricing = await loadRoughSelectionPricing(client, market, fundingMode);
  const actionable = analyses
    .filter((analysis) => analysis.bestPair)
    .map((analysis) =>
      toPreparedExecution(
        analysis,
        market,
        reserveState,
        selection,
        roughPricing,
        fundingMode,
      ),
    )
    .sort((left, right) => {
      const leftScore = BigInt(left.selection.scoreBase);
      const rightScore = BigInt(right.selection.scoreBase);
      if (leftScore === rightScore) {
        const leftGross = left.liquidationCall.expectedGrossProfitBase;
        const rightGross = right.liquidationCall.expectedGrossProfitBase;
        if (leftGross === rightGross) {
          return 0;
        }

        return leftGross > rightGross ? -1 : 1;
      }

      return leftScore > rightScore ? -1 : 1;
    });

  if (actionable.length === 0) {
    throw new Error("No liquidation pair could be derived for the current candidates.");
  }

  return actionable;
}

export async function buildPreparedExecutionCandidates(
  client: PublicClient,
  cliOptions: CliOptions,
  selection: PrepareSelectionOptions,
): Promise<PreparedExecution[]> {
  const market = await resolveMarket(
    client,
    cliOptions.chain,
    cliOptions.market,
    cliOptions.configuredAddressProvider,
  );
  const candidateSnapshots = selection.targetUser
    ? await loadAccountSnapshots(client, market.pool, [selection.targetUser], 1).then(
        (snapshots) =>
          snapshots.filter(
            (snapshot) =>
              snapshot.healthFactor < toHealthFactorWad(cliOptions.alertThreshold),
          ),
      )
    : await (async () => {
        const latestBlock = cliOptions.toBlock ?? (await client.getBlockNumber());
        const fromBlock =
          cliOptions.fromBlock ??
          (latestBlock > cliOptions.lookbackBlocks
            ? latestBlock - cliOptions.lookbackBlocks
            : 0n);

        const candidateUsers = await collectCandidateUsers(
          client,
          market.pool,
          fromBlock,
          latestBlock,
          cliOptions.chunkSize,
        );
        const snapshots = await loadAccountSnapshots(
          client,
          market.pool,
          [...candidateUsers],
          cliOptions.userBatchSize,
        );
        const { risky, liquidatable } = sortRiskySnapshots(
          snapshots,
          cliOptions.alertThreshold,
        );

        return (selection.allowRisky ? risky : liquidatable).slice(0, cliOptions.limit);
      })();

  if (candidateSnapshots.length === 0) {
    throw new Error(
      selection.targetUser
        ? `No risky snapshot found for user ${selection.targetUser}.`
        : "No actionable users found. Pass --allowRisky to prepare non-liquidatable watchlist targets.",
    );
  }

  const reserveState = await loadReserveMetadata(
    client,
    market.poolAddressesProvider,
  );

  const analyses = await analyzeUsers(
    client,
    market.pool,
    reserveState.dataProvider,
    reserveState.reserves,
    candidateSnapshots,
  );

  return rankPreparedExecutionCandidates(
    client,
    market,
    {
      baseCurrency: reserveState.baseCurrency,
      baseCurrencyUnit: reserveState.baseCurrencyUnit,
      reserves: reserveState.reserves,
    },
    analyses,
    selection,
    cliOptions.fundingMode,
  );
}

export async function buildPreparedExecution(
  client: PublicClient,
  cliOptions: CliOptions,
  selection: PrepareSelectionOptions,
): Promise<PreparedExecution> {
  const candidates = await buildPreparedExecutionCandidates(
    client,
    cliOptions,
    selection,
  );
  return candidates[0];
}
