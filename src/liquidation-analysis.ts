import {
  Address,
  PublicClient,
  formatUnits,
  getAddress,
  zeroAddress,
} from "viem";

import { addressProviderAbi, oracleAbi, poolAbi, poolDataProviderAbi } from "./abi.js";
import {
  AccountSnapshot,
  LIQUIDATABLE_HEALTH_FACTOR,
  formatHealthFactor,
  loadAccountSnapshots,
} from "./market.js";

export const DEFAULT_LIQUIDATION_CLOSE_FACTOR = 5_000n;
export const MAX_LIQUIDATION_CLOSE_FACTOR = 10_000n;
export const CLOSE_FACTOR_HF_THRESHOLD = 95n * 10n ** 16n;
export const BPS_DENOMINATOR = 10_000n;

export type ReserveMetadata = {
  asset: Address;
  symbol: string;
  decimals: bigint;
  ltv: bigint;
  liquidationThreshold: bigint;
  liquidationBonus: bigint;
  liquidationProtocolFee: bigint;
  eModeCategory: bigint;
  price: bigint;
};

export type UserReservePosition = {
  reserve: ReserveMetadata;
  currentATokenBalance: bigint;
  currentStableDebt: bigint;
  currentVariableDebt: bigint;
  totalDebt: bigint;
  usageAsCollateralEnabled: boolean;
  collateralValueBase: bigint;
  debtValueBase: bigint;
};

export type PairEstimate = {
  debtAsset: Address;
  debtSymbol: string;
  collateralAsset: Address;
  collateralSymbol: string;
  closeFactorBps: bigint;
  liquidationBonusBps: bigint;
  liquidationProtocolFeeBps: bigint;
  maxDebtToCover: bigint;
  debtToCover: bigint;
  collateralToReceive: bigint;
  protocolFeeCollateral: bigint;
  debtValueBase: bigint;
  collateralValueBase: bigint;
  grossProfitBase: bigint;
};

export type UserAnalysis = {
  user: Address;
  shortUser: string;
  healthFactor: string;
  healthFactorWad: string;
  liquidatable: boolean;
  userEMode: string;
  totalDebtBase: string;
  totalCollateralBase: string;
  topDebtAssets: Array<{
    symbol: string;
    asset: Address;
    amount: string;
    valueBase: string;
  }>;
  topCollateralAssets: Array<{
    symbol: string;
    asset: Address;
    amount: string;
    valueBase: string;
    useAsCollateral: boolean;
  }>;
  bestPair?: {
    debtSymbol: string;
    debtAsset: Address;
    collateralSymbol: string;
    collateralAsset: Address;
    closeFactorBps: string;
    liquidationBonusBps: string;
    liquidationProtocolFeeBps: string;
    debtToCover: string;
    collateralToReceive: string;
    debtValueBase: string;
    collateralValueBase: string;
    grossProfitBase: string;
    grossProfitDisplay: string;
  };
};

export type DetailedUserAnalysis = {
  snapshot: AccountSnapshot;
  user: Address;
  shortUser: string;
  liquidatable: boolean;
  userEMode: bigint;
  topDebtPositions: UserReservePosition[];
  topCollateralPositions: UserReservePosition[];
  pairCandidates: PairEstimate[];
  bestPair?: PairEstimate;
};

export function percentMul(value: bigint, bps: bigint): bigint {
  return (value * bps) / BPS_DENOMINATOR;
}

export function percentDiv(value: bigint, bps: bigint): bigint {
  return (value * BPS_DENOMINATOR) / bps;
}

export function assetUnits(decimals: bigint): bigint {
  return 10n ** decimals;
}

export function formatAssetAmount(amount: bigint, decimals: bigint): string {
  const asNumber = Number(formatUnits(amount, Number(decimals)));
  if (Number.isFinite(asNumber)) {
    return asNumber.toFixed(asNumber >= 1 ? 4 : 6);
  }

  return formatUnits(amount, Number(decimals));
}

export function baseCurrencyLabel(baseCurrency: Address): string {
  return baseCurrency === zeroAddress ? "USD" : "BASE";
}

export function formatBaseAmount(
  amount: bigint,
  baseCurrencyUnit: bigint,
  baseCurrency: Address,
): string {
  const decimals = baseCurrencyUnit.toString().length - 1;
  const value = Number(formatUnits(amount, decimals));
  const label = baseCurrencyLabel(baseCurrency);
  if (Number.isFinite(value)) {
    return `${value.toFixed(value >= 1000 ? 2 : 4)} ${label}`;
  }

  return `${formatUnits(amount, decimals)} ${label}`;
}

export function sortByValueDesc<T>(
  items: T[],
  getValue: (item: T) => bigint,
): T[] {
  return [...items].sort((left, right) => {
    const leftValue = getValue(left);
    const rightValue = getValue(right);
    if (leftValue === rightValue) {
      return 0;
    }

    return leftValue > rightValue ? -1 : 1;
  });
}

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => run()),
  );

  return results;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRpcRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rps limit exceeded|rate limit|too many requests|429/i.test(message);
}

async function withRpcRetry<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRpcRateLimitError(error) || attempt >= attempts - 1) {
        break;
      }
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

function estimatePair(
  healthFactor: bigint,
  collateral: UserReservePosition,
  debt: UserReservePosition,
  userEMode: bigint,
  eModeBonuses: Map<bigint, bigint>,
): PairEstimate | undefined {
  if (
    collateral.currentATokenBalance === 0n ||
    !collateral.usageAsCollateralEnabled ||
    debt.totalDebt === 0n ||
    collateral.reserve.price === 0n ||
    debt.reserve.price === 0n
  ) {
    return undefined;
  }

  const closeFactorBps =
    healthFactor > CLOSE_FACTOR_HF_THRESHOLD
      ? DEFAULT_LIQUIDATION_CLOSE_FACTOR
      : MAX_LIQUIDATION_CLOSE_FACTOR;

  const maxDebtToCover = percentMul(debt.totalDebt, closeFactorBps);
  if (maxDebtToCover === 0n) {
    return undefined;
  }

  let liquidationBonusBps = collateral.reserve.liquidationBonus;
  if (
    userEMode !== 0n &&
    collateral.reserve.eModeCategory === userEMode &&
    eModeBonuses.has(userEMode)
  ) {
    liquidationBonusBps = eModeBonuses.get(userEMode) as bigint;
  }

  const collateralUnit = assetUnits(collateral.reserve.decimals);
  const debtUnit = assetUnits(debt.reserve.decimals);

  const baseCollateral =
    (debt.reserve.price * maxDebtToCover * collateralUnit) /
    (collateral.reserve.price * debtUnit);
  const maxCollateralToLiquidate = percentMul(baseCollateral, liquidationBonusBps);

  let collateralAmount = maxCollateralToLiquidate;
  let debtAmountNeeded = maxDebtToCover;

  if (maxCollateralToLiquidate > collateral.currentATokenBalance) {
    collateralAmount = collateral.currentATokenBalance;
    const rawDebtAmount =
      (collateral.reserve.price * collateralAmount * debtUnit) /
      (debt.reserve.price * collateralUnit);
    debtAmountNeeded = percentDiv(rawDebtAmount, liquidationBonusBps);
  }

  if (collateralAmount === 0n || debtAmountNeeded === 0n) {
    return undefined;
  }

  const bonusCollateral =
    collateralAmount - percentDiv(collateralAmount, liquidationBonusBps);
  const protocolFeeCollateral = percentMul(
    bonusCollateral,
    collateral.reserve.liquidationProtocolFee,
  );
  const collateralToReceive = collateralAmount - protocolFeeCollateral;
  const debtValueBase = (debtAmountNeeded * debt.reserve.price) / debtUnit;
  const collateralValueBase =
    (collateralToReceive * collateral.reserve.price) / collateralUnit;

  return {
    debtAsset: debt.reserve.asset,
    debtSymbol: debt.reserve.symbol,
    collateralAsset: collateral.reserve.asset,
    collateralSymbol: collateral.reserve.symbol,
    closeFactorBps,
    liquidationBonusBps,
    liquidationProtocolFeeBps: collateral.reserve.liquidationProtocolFee,
    maxDebtToCover,
    debtToCover: debtAmountNeeded,
    collateralToReceive,
    protocolFeeCollateral,
    debtValueBase,
    collateralValueBase,
    grossProfitBase: collateralValueBase - debtValueBase,
  };
}

export async function loadReserveMetadata(
  client: PublicClient,
  poolAddressesProvider: Address,
): Promise<{
  dataProvider: Address;
  oracle: Address;
  baseCurrency: Address;
  baseCurrencyUnit: bigint;
  reserves: ReserveMetadata[];
}> {
  const dataProvider = await withRpcRetry(() => client.readContract({
      address: poolAddressesProvider,
      abi: addressProviderAbi,
      functionName: "getPoolDataProvider",
    }), "getPoolDataProvider");
  const oracle = await withRpcRetry(() => client.readContract({
      address: poolAddressesProvider,
      abi: addressProviderAbi,
      functionName: "getPriceOracle",
    }), "getPriceOracle");

  const baseCurrency = await withRpcRetry(() => client.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: "BASE_CURRENCY",
    }), "BASE_CURRENCY");
  const baseCurrencyUnit = await withRpcRetry(() => client.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: "BASE_CURRENCY_UNIT",
    }), "BASE_CURRENCY_UNIT");
  const tokens = await withRpcRetry(() => client.readContract({
      address: dataProvider,
      abi: poolDataProviderAbi,
      functionName: "getAllReservesTokens",
    }), "getAllReservesTokens");

  const reserves = await mapWithConcurrency(tokens, 1, async (token) => {
      const asset = getAddress(token.tokenAddress);
      const configuration = await withRpcRetry(() => client.readContract({
            address: dataProvider,
            abi: poolDataProviderAbi,
            functionName: "getReserveConfigurationData",
            args: [asset],
          }), `getReserveConfigurationData ${token.symbol}`);
      const eModeCategory = await withRpcRetry(() => client.readContract({
              address: dataProvider,
              abi: poolDataProviderAbi,
              functionName: "getReserveEModeCategory",
              args: [asset],
            }), `getReserveEModeCategory ${token.symbol}`)
            .catch(() => 0n);
      const liquidationProtocolFee = await withRpcRetry(() => client.readContract({
              address: dataProvider,
              abi: poolDataProviderAbi,
              functionName: "getLiquidationProtocolFee",
              args: [asset],
            }), `getLiquidationProtocolFee ${token.symbol}`)
            .catch(() => 0n);
      const price = await withRpcRetry(() => client.readContract({
            address: oracle,
            abi: oracleAbi,
            functionName: "getAssetPrice",
            args: [asset],
          }), `getAssetPrice ${token.symbol}`);

      return {
        asset,
        symbol: token.symbol,
        decimals: configuration[0],
        ltv: configuration[1],
        liquidationThreshold: configuration[2],
        liquidationBonus: configuration[3],
        liquidationProtocolFee,
        eModeCategory,
        price,
      } satisfies ReserveMetadata;
    });

  return {
    dataProvider,
    oracle,
    baseCurrency: getAddress(baseCurrency),
    baseCurrencyUnit,
    reserves,
  };
}

export async function analyzeDetailedUser(
  client: PublicClient,
  pool: Address,
  dataProvider: Address,
  reserves: ReserveMetadata[],
  snapshot: Awaited<ReturnType<typeof loadAccountSnapshots>>[number],
): Promise<DetailedUserAnalysis> {
  const userEMode = await withRpcRetry(() => client.readContract({
    address: pool,
    abi: poolAbi,
    functionName: "getUserEMode",
    args: [snapshot.user],
  }), `getUserEMode ${snapshot.user}`);

  const eModeBonuses = new Map<bigint, bigint>();
  if (userEMode !== 0n) {
    const eModeData = await withRpcRetry(() => client.readContract({
      address: pool,
      abi: poolAbi,
      functionName: "getEModeCategoryData",
      args: [Number(userEMode)],
    }), `getEModeCategoryData ${snapshot.user}`);
    eModeBonuses.set(userEMode, BigInt(eModeData.liquidationBonus));
  }

  const userReserves = (
    await mapWithConcurrency(reserves, 1, async (reserve): Promise<UserReservePosition | undefined> => {
        const position = await withRpcRetry(() => client.readContract({
          address: dataProvider,
          abi: poolDataProviderAbi,
          functionName: "getUserReserveData",
          args: [reserve.asset, snapshot.user],
        }), `getUserReserveData ${reserve.symbol} ${snapshot.user}`);

        const totalDebt = position[1] + position[2];
        const collateralValueBase =
          (position[0] * reserve.price) / assetUnits(reserve.decimals);
        const debtValueBase =
          (totalDebt * reserve.price) / assetUnits(reserve.decimals);

        if (position[0] === 0n && totalDebt === 0n) {
          return undefined;
        }

        return {
          reserve,
          currentATokenBalance: position[0],
          currentStableDebt: position[1],
          currentVariableDebt: position[2],
          totalDebt,
          usageAsCollateralEnabled: position[8],
          collateralValueBase,
          debtValueBase,
        } satisfies UserReservePosition;
      })
  ).filter((value): value is UserReservePosition => Boolean(value));

  const topCollateralPositions = sortByValueDesc(
    userReserves.filter(
      (position) =>
        position.currentATokenBalance > 0n && position.usageAsCollateralEnabled,
    ),
    (position) => position.collateralValueBase,
  );
  const topDebtPositions = sortByValueDesc(
    userReserves.filter((position) => position.totalDebt > 0n),
    (position) => position.debtValueBase,
  );

  const pairCandidates = sortByValueDesc(
    topCollateralPositions.flatMap((collateral) =>
      topDebtPositions
        .map((debt) =>
          estimatePair(
            snapshot.healthFactor,
            collateral,
            debt,
            userEMode,
            eModeBonuses,
          ),
        )
        .filter((value): value is PairEstimate => Boolean(value)),
    ),
    (pair) => pair.grossProfitBase,
  );

  return {
    snapshot,
    user: snapshot.user,
    shortUser: `${snapshot.user.slice(0, 6)}...${snapshot.user.slice(-4)}`,
    liquidatable: snapshot.healthFactor < LIQUIDATABLE_HEALTH_FACTOR,
    userEMode,
    topDebtPositions,
    topCollateralPositions,
    pairCandidates,
    bestPair: pairCandidates[0],
  };
}

export async function analyzeUsers(
  client: PublicClient,
  pool: Address,
  dataProvider: Address,
  reserves: ReserveMetadata[],
  snapshots: Awaited<ReturnType<typeof loadAccountSnapshots>>,
): Promise<DetailedUserAnalysis[]> {
  return mapWithConcurrency(snapshots, 2, (snapshot) =>
    analyzeDetailedUser(client, pool, dataProvider, reserves, snapshot),
  );
}

export function toSerializableUserAnalysis(
  detail: DetailedUserAnalysis,
  baseCurrency: Address,
  baseCurrencyUnit: bigint,
): UserAnalysis {
  return {
    user: detail.user,
    shortUser: detail.shortUser,
    healthFactor: formatHealthFactor(detail.snapshot.healthFactor),
    healthFactorWad: detail.snapshot.healthFactor.toString(),
    liquidatable: detail.liquidatable,
    userEMode: detail.userEMode.toString(),
    totalDebtBase: detail.snapshot.totalDebtBase.toString(),
    totalCollateralBase: detail.snapshot.totalCollateralBase.toString(),
    topDebtAssets: detail.topDebtPositions.slice(0, 3).map((position) => ({
      symbol: position.reserve.symbol,
      asset: position.reserve.asset,
      amount: formatAssetAmount(position.totalDebt, position.reserve.decimals),
      valueBase: formatBaseAmount(
        position.debtValueBase,
        baseCurrencyUnit,
        baseCurrency,
      ),
    })),
    topCollateralAssets: detail.topCollateralPositions
      .slice(0, 3)
      .map((position) => ({
        symbol: position.reserve.symbol,
        asset: position.reserve.asset,
        amount: formatAssetAmount(
          position.currentATokenBalance,
          position.reserve.decimals,
        ),
        valueBase: formatBaseAmount(
          position.collateralValueBase,
          baseCurrencyUnit,
          baseCurrency,
        ),
        useAsCollateral: position.usageAsCollateralEnabled,
      })),
    bestPair: detail.bestPair
      ? {
          debtSymbol: detail.bestPair.debtSymbol,
          debtAsset: detail.bestPair.debtAsset,
          collateralSymbol: detail.bestPair.collateralSymbol,
          collateralAsset: detail.bestPair.collateralAsset,
          closeFactorBps: detail.bestPair.closeFactorBps.toString(),
          liquidationBonusBps: detail.bestPair.liquidationBonusBps.toString(),
          liquidationProtocolFeeBps:
            detail.bestPair.liquidationProtocolFeeBps.toString(),
          debtToCover: detail.bestPair.debtToCover.toString(),
          collateralToReceive: detail.bestPair.collateralToReceive.toString(),
          debtValueBase: detail.bestPair.debtValueBase.toString(),
          collateralValueBase: detail.bestPair.collateralValueBase.toString(),
          grossProfitBase: detail.bestPair.grossProfitBase.toString(),
          grossProfitDisplay: formatBaseAmount(
            detail.bestPair.grossProfitBase,
            baseCurrencyUnit,
            baseCurrency,
          ),
        }
      : undefined,
  };
}
