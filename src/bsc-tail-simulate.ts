import {
  formatUnits,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";

export type BscTailRiskInput = {
  user: Address;
  status: "shortfall" | "near" | "healthy";
};

export type BscTailAssetPosition = {
  vToken: Address;
  underlying: Address | "native";
  vSymbol: string;
  symbol: string;
  decimals: number;
  borrowBalance: bigint;
  exchangeRate: bigint;
  collateralUnderlying: bigint;
  priceMantissa: bigint;
  collateralValueUsd: bigint;
  borrowValueUsd: bigint;
};

export type BscTailSimulationRoute = {
  user: Address;
  status: BscTailRiskInput["status"];
  repayVToken: Address;
  repaySymbol: string;
  collateralVToken: Address;
  collateralSymbol: string;
  repayAmount: string;
  repayUsd: string;
  seizeAmount: string;
  seizeUsd: string;
  grossProfitUsd: string;
  exitCostUsd: string;
  gasCostUsd: string;
  netProfitUsd: string;
  exitPath: string;
  executable: boolean;
  reason: string;
};

export type BscTailAccountSimulation = {
  user: Address;
  status: BscTailRiskInput["status"];
  liquidityUsd: string;
  shortfallUsd: string;
  route?: BscTailSimulationRoute;
  positions: BscTailAssetPosition[];
};

const USD_DECIMALS = 18n;
const DEFAULT_EXIT_SLIPPAGE_BPS = 70n;
const DEFAULT_GAS_USD = 0.35;

const COMPTROLLER_SIM_ABI = parseAbi([
  "function getAssetsIn(address account) view returns (address[])",
  "function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)",
  "function closeFactorMantissa() view returns (uint256)",
  "function liquidationIncentiveMantissa() view returns (uint256)",
  "function oracle() view returns (address)",
  "function liquidateCalculateSeizeTokens(address vTokenBorrowed, address vTokenCollateral, uint256 actualRepayAmount) view returns (uint256, uint256)",
]);

const VTOKEN_SIM_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function underlying() view returns (address)",
  "function borrowBalanceStored(address account) view returns (uint256)",
  "function balanceOf(address account) view returns (uint256)",
  "function exchangeRateStored() view returns (uint256)",
]);

const ERC20_SIM_ABI = parseAbi([
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
]);

const PRICE_ORACLE_SIM_ABI = parseAbi([
  "function getUnderlyingPrice(address vToken) view returns (uint256)",
]);

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function usdValueMantissa(amount: bigint, priceMantissa: bigint): bigint {
  return (amount * priceMantissa) / 10n ** USD_DECIMALS;
}

function formatTokenAmount(value: bigint, decimals: number): string {
  const numeric = Number(formatUnits(value, decimals));
  if (!Number.isFinite(numeric)) return formatUnits(value, decimals);
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 1 ? 4 : 8,
  }).format(numeric);
}

function formatUsd(value: bigint | number): string {
  const numeric = typeof value === "bigint" ? Number(formatUnits(value, 18)) : value;
  if (!Number.isFinite(numeric)) return "--";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

async function readUnderlyingMeta(
  client: PublicClient,
  vToken: Address,
  vSymbol: string,
): Promise<{ underlying: Address | "native"; symbol: string; decimals: number }> {
  try {
    const underlying = await client.readContract({
      address: vToken,
      abi: VTOKEN_SIM_ABI,
      functionName: "underlying",
    }) as Address;
    const [symbol, decimals] = await Promise.all([
      client.readContract({ address: underlying, abi: ERC20_SIM_ABI, functionName: "symbol" }),
      client.readContract({ address: underlying, abi: ERC20_SIM_ABI, functionName: "decimals" }),
    ]);
    return { underlying, symbol: String(symbol), decimals: Number(decimals) };
  } catch {
    return {
      underlying: "native",
      symbol: vSymbol.toUpperCase().includes("BNB") ? "BNB" : vSymbol.replace(/^v/i, ""),
      decimals: 18,
    };
  }
}

async function readPosition(params: {
  client: PublicClient;
  oracle: Address;
  user: Address;
  vToken: Address;
}): Promise<BscTailAssetPosition | null> {
  const { client, oracle, user, vToken } = params;
  const [vSymbolResult, vDecimalsResult, borrowResult, balanceResult, exchangeRateResult, priceResult] = await Promise.allSettled([
    client.readContract({ address: vToken, abi: VTOKEN_SIM_ABI, functionName: "symbol" }),
    client.readContract({ address: vToken, abi: VTOKEN_SIM_ABI, functionName: "decimals" }),
    client.readContract({ address: vToken, abi: VTOKEN_SIM_ABI, functionName: "borrowBalanceStored", args: [user] }),
    client.readContract({ address: vToken, abi: VTOKEN_SIM_ABI, functionName: "balanceOf", args: [user] }),
    client.readContract({ address: vToken, abi: VTOKEN_SIM_ABI, functionName: "exchangeRateStored" }),
    client.readContract({ address: oracle, abi: PRICE_ORACLE_SIM_ABI, functionName: "getUnderlyingPrice", args: [vToken] }),
  ]);
  if (
    borrowResult.status !== "fulfilled" ||
    balanceResult.status !== "fulfilled" ||
    exchangeRateResult.status !== "fulfilled" ||
    priceResult.status !== "fulfilled"
  ) {
    return null;
  }
  const vSymbol = vSymbolResult.status === "fulfilled" ? String(vSymbolResult.value) : "vToken";
  const vDecimals = vDecimalsResult.status === "fulfilled" ? Number(vDecimalsResult.value) : 8;
  const meta = await readUnderlyingMeta(client, vToken, vSymbol);
  const borrowBalance = borrowResult.value as bigint;
  const vTokenBalance = balanceResult.value as bigint;
  const exchangeRate = exchangeRateResult.value as bigint;
  const priceMantissa = priceResult.value as bigint;
  const collateralUnderlying = (vTokenBalance * exchangeRate) / 10n ** 18n;
  return {
    vToken,
    underlying: meta.underlying,
    vSymbol,
    symbol: meta.symbol,
    decimals: meta.decimals,
    borrowBalance,
    exchangeRate,
    collateralUnderlying,
    priceMantissa,
    collateralValueUsd: usdValueMantissa(collateralUnderlying, priceMantissa),
    borrowValueUsd: usdValueMantissa(borrowBalance, priceMantissa),
  };
}

function exitPathFor(debt: BscTailAssetPosition, collateral: BscTailAssetPosition): string {
  if (debt.underlying === collateral.underlying) return "无需换币";
  if (debt.symbol === "USDT" || debt.symbol === "USDC") {
    return `${collateral.symbol} -> ${debt.symbol} / PancakeSwap`;
  }
  if (collateral.symbol === "USDT" || collateral.symbol === "USDC") {
    return `${collateral.symbol} -> ${debt.symbol} / PancakeSwap`;
  }
  return `${collateral.symbol} -> USDT -> ${debt.symbol} / PancakeSwap`;
}

async function buildBestRoute(params: {
  client: PublicClient;
  comptroller: Address;
  account: BscTailRiskInput;
  closeFactorMantissa: bigint;
  gasCostUsd: number;
  exitSlippageBps: bigint;
  positions: BscTailAssetPosition[];
}): Promise<BscTailSimulationRoute | undefined> {
  const debts = params.positions.filter((position) => position.borrowBalance > 0n);
  const collaterals = params.positions.filter((position) => position.collateralUnderlying > 0n);
  const routes = await Promise.all(debts.flatMap((debt) =>
    collaterals.map(async (collateral) => {
      if (debt.vToken === collateral.vToken) return null;
      const repayAmount = minBigInt(debt.borrowBalance, (debt.borrowBalance * params.closeFactorMantissa) / 10n ** 18n);
      if (repayAmount <= 0n) return null;
      const seizeResult = await params.client.readContract({
        address: params.comptroller,
        abi: COMPTROLLER_SIM_ABI,
        functionName: "liquidateCalculateSeizeTokens",
        args: [debt.vToken, collateral.vToken, repayAmount],
      }) as readonly [bigint, bigint];
      const [errorCode, seizeTokens] = seizeResult;
      if (errorCode !== 0n || seizeTokens <= 0n) return null;
      const seizedUnderlying = (seizeTokens * collateral.exchangeRate) / 10n ** 18n;
      const repayUsd = usdValueMantissa(repayAmount, debt.priceMantissa);
      const seizeUsd = usdValueMantissa(seizedUnderlying, collateral.priceMantissa);
      const grossProfitUsd = seizeUsd - repayUsd;
      const exitCostUsd = (seizeUsd * params.exitSlippageBps) / 10_000n;
      const gasCostMantissa = BigInt(Math.ceil(params.gasCostUsd * 1e6)) * 10n ** 12n;
      const netProfitUsd = grossProfitUsd - exitCostUsd - gasCostMantissa;
      const executable = params.account.status === "shortfall" && netProfitUsd > 0n;
      return {
        user: params.account.user,
        status: params.account.status,
        repayVToken: debt.vToken,
        repaySymbol: debt.symbol,
        collateralVToken: collateral.vToken,
        collateralSymbol: collateral.symbol,
        repayAmount: formatTokenAmount(repayAmount, debt.decimals),
        repayUsd: formatUsd(repayUsd),
        seizeAmount: formatTokenAmount(seizedUnderlying, collateral.decimals),
        seizeUsd: formatUsd(seizeUsd),
        grossProfitUsd: formatUsd(grossProfitUsd),
        exitCostUsd: formatUsd(exitCostUsd),
        gasCostUsd: formatUsd(params.gasCostUsd),
        netProfitUsd: formatUsd(netProfitUsd),
        exitPath: exitPathFor(debt, collateral),
        executable,
        reason: executable
          ? "shortfall + positive estimated net"
          : params.account.status !== "shortfall"
            ? "not in shortfall, monitor only"
            : "net profit not positive after exit/gas estimate",
      } satisfies BscTailSimulationRoute;
    }),
  ));
  return routes
    .filter((route): route is BscTailSimulationRoute => Boolean(route))
    .sort((left, right) => Number(right.netProfitUsd.replace(/[$,]/g, "")) - Number(left.netProfitUsd.replace(/[$,]/g, "")))[0];
}

export async function simulateBscTailAccounts(params: {
  client: PublicClient;
  comptroller: Address;
  accounts: BscTailRiskInput[];
  maxAccounts?: number;
  gasCostUsd?: number;
  exitSlippageBps?: number;
}): Promise<BscTailAccountSimulation[]> {
  const accounts = params.accounts.slice(0, params.maxAccounts ?? 20);
  const [oracle, closeFactor] = await Promise.all([
    params.client.readContract({
      address: params.comptroller,
      abi: COMPTROLLER_SIM_ABI,
      functionName: "oracle",
    }) as Promise<Address>,
    params.client.readContract({
      address: params.comptroller,
      abi: COMPTROLLER_SIM_ABI,
      functionName: "closeFactorMantissa",
    }) as Promise<bigint>,
  ]);

  return Promise.all(accounts.map(async (account) => {
    const [liquidityResult, assetsInResult] = await Promise.all([
      params.client.readContract({
        address: params.comptroller,
        abi: COMPTROLLER_SIM_ABI,
        functionName: "getAccountLiquidity",
        args: [account.user],
      }) as Promise<readonly [bigint, bigint, bigint]>,
      params.client.readContract({
        address: params.comptroller,
        abi: COMPTROLLER_SIM_ABI,
        functionName: "getAssetsIn",
        args: [account.user],
      }) as Promise<Address[]>,
    ]);
    const [, liquidity, shortfall] = liquidityResult;
    const positions = (await Promise.all(
      assetsInResult.map((vToken) => readPosition({
        client: params.client,
        oracle,
        user: account.user,
        vToken,
      })),
    )).filter((position): position is BscTailAssetPosition => Boolean(position));
    const route = await buildBestRoute({
      client: params.client,
      comptroller: params.comptroller,
      account,
      closeFactorMantissa: closeFactor,
      gasCostUsd: params.gasCostUsd ?? DEFAULT_GAS_USD,
      exitSlippageBps: BigInt(params.exitSlippageBps ?? Number(DEFAULT_EXIT_SLIPPAGE_BPS)),
      positions,
    });
    return {
      user: account.user,
      status: account.status,
      liquidityUsd: formatUsd(liquidity),
      shortfallUsd: formatUsd(shortfall),
      route,
      positions,
    };
  }));
}
