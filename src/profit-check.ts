import { Address, PublicClient, getAddress, parseUnits } from "viem";

import { addressProviderAbi, oracleAbi } from "./abi.js";
import { ChainPreset } from "./config.js";
import { PreparedExecution, erc20Abi } from "./execution-plan.js";
import { formatBaseAmount } from "./liquidation-analysis.js";
import { ResolvedMarket } from "./market.js";

export type ProfitCheckReport = {
  outputToken?: Address;
  outputTokenDecimals?: number;
  outputValueBase?: string;
  debtValueBase: string;
  gasPriceWei: string;
  gasEstimateApprove?: string;
  gasEstimateExecute?: string;
  totalGasEstimate?: string;
  bufferedGasEstimate?: string;
  gasCostWei?: string;
  gasCostBase?: string;
  flashLoanPremiumBps?: string;
  flashLoanPremiumBase?: string;
  grossProfitBase?: string;
  grossProfitDisplay?: string;
  estimatedNetProfitBase?: string;
  estimatedNetProfitDisplay?: string;
  minNetProfitBase: string;
  minNetProfitDisplay: string;
  canBroadcast: boolean;
  reason?: string;
};

type PricingContext = {
  baseCurrency: Address;
  baseCurrencyUnit: bigint;
  prices: Map<Address, bigint>;
};

export type RealizedProfitReport = {
  outputToken?: Address;
  outputTokenDecimals?: number;
  outputAmount?: string;
  outputValueBase?: string;
  collateralAsset?: Address;
  collateralAmount?: string;
  collateralValueBase?: string;
  debtValueBase: string;
  gasUsed: string;
  effectiveGasPriceWei: string;
  gasCostWei: string;
  gasCostBase?: string;
  realizedNetProfitBase?: string;
  realizedNetProfitDisplay?: string;
};

function baseCurrencyDecimals(baseCurrencyUnit: bigint): number {
  return baseCurrencyUnit.toString().length - 1;
}

function parseDisplayBaseAmount(value: string, baseCurrencyUnit: bigint): bigint {
  return parseUnits(value, baseCurrencyDecimals(baseCurrencyUnit));
}

async function loadPricingContext(
  client: PublicClient,
  poolAddressesProvider: Address,
  assets: Address[],
): Promise<PricingContext> {
  const oracle = await client.readContract({
    address: poolAddressesProvider,
    abi: addressProviderAbi,
    functionName: "getPriceOracle",
  });

  const [baseCurrency, baseCurrencyUnit, prices] = await Promise.all([
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
    Promise.all(
      [...new Set(assets.map((asset) => asset.toLowerCase()))].map(async (asset) => {
        const normalized = getAddress(asset);
        const price = await client.readContract({
          address: oracle,
          abi: oracleAbi,
          functionName: "getAssetPrice",
          args: [normalized],
        });
        return [normalized, price] as const;
      }),
    ),
  ]);

  return {
    baseCurrency,
    baseCurrencyUnit,
    prices: new Map(prices),
  };
}

async function loadOutputAndGasPricing(
  client: PublicClient,
  chain:
    | Pick<ChainPreset, "wrappedNativeToken" | "poolAddressesProvider">
    | Pick<ResolvedMarket, "wrappedNativeToken" | "poolAddressesProvider">,
  prepared: PreparedExecution,
  outputToken?: Address,
  collateralAsset?: Address,
): Promise<PricingContext> {
  if (!chain.wrappedNativeToken) {
    throw new Error("Wrapped native token is not configured for this chain.");
  }

  const assets = [
    prepared.liquidationCall.debtAsset,
    chain.wrappedNativeToken,
    outputToken ?? prepared.liquidationCall.debtAsset,
    collateralAsset ?? prepared.liquidationCall.collateralAsset,
  ];

  return loadPricingContext(client, chain.poolAddressesProvider, assets);
}

async function resolveOutputTokenDecimals(
  client: PublicClient,
  prepared: PreparedExecution,
  outputToken: Address,
): Promise<number> {
  if (outputToken.toLowerCase() === prepared.liquidationCall.debtAsset.toLowerCase()) {
    return Number(prepared.liquidationCall.debtDecimals);
  }

  if (
    outputToken.toLowerCase() === prepared.liquidationCall.collateralAsset.toLowerCase()
  ) {
    return Number(prepared.liquidationCall.collateralDecimals);
  }

  return client.readContract({
    address: outputToken,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export async function evaluateProfitability(
  client: PublicClient,
  chain:
    | Pick<ChainPreset, "wrappedNativeToken" | "poolAddressesProvider">
    | Pick<ResolvedMarket, "wrappedNativeToken" | "poolAddressesProvider">,
  prepared: PreparedExecution,
  params: {
    needsApprove: boolean;
    approveGas?: bigint;
    executeGas?: bigint;
    gasPriceWei: bigint;
    gasBufferBps: bigint;
    outputToken?: Address;
    minOutputAmount?: bigint;
    flashLoanPremiumBps?: bigint;
    minNetProfit: string;
    skipProfitCheck: boolean;
  },
): Promise<ProfitCheckReport> {
  if (!chain.wrappedNativeToken) {
    throw new Error("Wrapped native token is not configured for this chain.");
  }

  const pricing = await loadOutputAndGasPricing(
    client,
    chain,
    prepared,
    params.outputToken,
  );
  const debtPrice = pricing.prices.get(prepared.liquidationCall.debtAsset) ?? 0n;
  const nativePrice = pricing.prices.get(chain.wrappedNativeToken) ?? 0n;
  const gasEstimateApprove = params.needsApprove ? params.approveGas ?? 0n : 0n;
  const gasEstimateExecute = params.executeGas ?? 0n;
  const totalGasEstimate = gasEstimateApprove + gasEstimateExecute;
  const bufferedGasEstimate =
    totalGasEstimate === 0n
      ? 0n
      : (totalGasEstimate * params.gasBufferBps) / 10_000n;
  const gasCostWei = bufferedGasEstimate * params.gasPriceWei;
  const gasCostBase = nativePrice === 0n ? undefined : (gasCostWei * nativePrice) / 10n ** 18n;
  const debtValueBase =
    (prepared.liquidationCall.debtToCover * debtPrice) /
    10n ** prepared.liquidationCall.debtDecimals;
  const flashLoanPremiumBase =
    params.flashLoanPremiumBps !== undefined
      ? (debtValueBase * params.flashLoanPremiumBps) / 10_000n
      : undefined;

  let grossProfitBase = prepared.liquidationCall.expectedGrossProfitBase;
  let outputTokenDecimals: number | undefined;
  let outputValueBase: bigint | undefined;

  if (params.outputToken && params.minOutputAmount !== undefined) {
    outputTokenDecimals = await resolveOutputTokenDecimals(
      client,
      prepared,
      params.outputToken,
    );
    const outputPrice = pricing.prices.get(params.outputToken);
    if (outputPrice !== undefined) {
      outputValueBase =
        (params.minOutputAmount * outputPrice) / 10n ** BigInt(outputTokenDecimals);
      grossProfitBase = outputValueBase - debtValueBase;
    }
  }

  const estimatedNetProfitBase =
    gasCostBase !== undefined
      ? grossProfitBase -
        gasCostBase -
        (flashLoanPremiumBase ?? 0n)
      : undefined;
  const minNetProfitBase = parseDisplayBaseAmount(
    params.minNetProfit,
    pricing.baseCurrencyUnit,
  );
  const canBroadcast =
    params.skipProfitCheck ||
    (estimatedNetProfitBase !== undefined && estimatedNetProfitBase >= minNetProfitBase);

  return {
    outputToken: params.outputToken,
    outputTokenDecimals,
    outputValueBase: outputValueBase?.toString(),
    debtValueBase: debtValueBase.toString(),
    gasPriceWei: params.gasPriceWei.toString(),
    gasEstimateApprove: gasEstimateApprove === 0n ? undefined : gasEstimateApprove.toString(),
    gasEstimateExecute: gasEstimateExecute === 0n ? undefined : gasEstimateExecute.toString(),
    totalGasEstimate: totalGasEstimate === 0n ? undefined : totalGasEstimate.toString(),
    bufferedGasEstimate:
      bufferedGasEstimate === 0n ? undefined : bufferedGasEstimate.toString(),
    gasCostWei: gasCostBase === undefined ? undefined : gasCostWei.toString(),
    gasCostBase: gasCostBase?.toString(),
    flashLoanPremiumBps: params.flashLoanPremiumBps?.toString(),
    flashLoanPremiumBase: flashLoanPremiumBase?.toString(),
    grossProfitBase: grossProfitBase.toString(),
    grossProfitDisplay: formatBaseAmount(
      grossProfitBase,
      pricing.baseCurrencyUnit,
      pricing.baseCurrency,
    ),
    estimatedNetProfitBase: estimatedNetProfitBase?.toString(),
    estimatedNetProfitDisplay:
      estimatedNetProfitBase !== undefined
        ? formatBaseAmount(
            estimatedNetProfitBase,
            pricing.baseCurrencyUnit,
            pricing.baseCurrency,
          )
        : undefined,
    minNetProfitBase: minNetProfitBase.toString(),
    minNetProfitDisplay: formatBaseAmount(
      minNetProfitBase,
      pricing.baseCurrencyUnit,
      pricing.baseCurrency,
    ),
    canBroadcast,
    reason: params.skipProfitCheck
      ? "Profit check bypassed."
      : estimatedNetProfitBase === undefined
        ? "Net profit could not be priced from the available oracle data."
        : estimatedNetProfitBase < minNetProfitBase
          ? `Estimated net profit ${formatBaseAmount(
              estimatedNetProfitBase,
              pricing.baseCurrencyUnit,
              pricing.baseCurrency,
            )} is below threshold ${formatBaseAmount(
              minNetProfitBase,
              pricing.baseCurrencyUnit,
              pricing.baseCurrency,
            )}.`
          : undefined,
  };
}

export async function evaluateRealizedProfit(
  client: PublicClient,
  chain:
    | Pick<ChainPreset, "wrappedNativeToken" | "poolAddressesProvider">
    | Pick<ResolvedMarket, "wrappedNativeToken" | "poolAddressesProvider">,
  prepared: PreparedExecution,
  params: {
    outputToken?: Address;
    outputAmount?: bigint;
    collateralAmount?: bigint;
    gasUsed: bigint;
    effectiveGasPriceWei: bigint;
  },
): Promise<RealizedProfitReport> {
  const pricing = await loadOutputAndGasPricing(
    client,
    chain,
    prepared,
    params.outputToken,
    prepared.liquidationCall.collateralAsset,
  );
  const debtPrice = pricing.prices.get(prepared.liquidationCall.debtAsset) ?? 0n;
  const nativePrice = pricing.prices.get(chain.wrappedNativeToken as Address) ?? 0n;
  const debtValueBase =
    (prepared.liquidationCall.debtToCover * debtPrice) /
    10n ** prepared.liquidationCall.debtDecimals;
  const gasCostWei = params.gasUsed * params.effectiveGasPriceWei;
  const gasCostBase = nativePrice === 0n ? undefined : (gasCostWei * nativePrice) / 10n ** 18n;

  let outputTokenDecimals: number | undefined;
  let outputValueBase: bigint | undefined;
  if (params.outputToken && params.outputAmount !== undefined) {
    outputTokenDecimals = await resolveOutputTokenDecimals(
      client,
      prepared,
      params.outputToken,
    );
    const outputPrice = pricing.prices.get(params.outputToken);
    if (outputPrice !== undefined) {
      outputValueBase =
        (params.outputAmount * outputPrice) / 10n ** BigInt(outputTokenDecimals);
    }
  }

  let collateralValueBase: bigint | undefined;
  if (params.collateralAmount !== undefined) {
    const collateralPrice = pricing.prices.get(prepared.liquidationCall.collateralAsset);
    if (collateralPrice !== undefined) {
      collateralValueBase =
        (params.collateralAmount * collateralPrice) /
        10n ** prepared.liquidationCall.collateralDecimals;
    }
  }

  const grossValueBase = outputValueBase ?? collateralValueBase;
  const realizedNetProfitBase =
    grossValueBase !== undefined && gasCostBase !== undefined
      ? grossValueBase - debtValueBase - gasCostBase
      : undefined;

  return {
    outputToken: params.outputToken,
    outputTokenDecimals,
    outputAmount: params.outputAmount?.toString(),
    outputValueBase: outputValueBase?.toString(),
    collateralAsset:
      params.collateralAmount !== undefined
        ? prepared.liquidationCall.collateralAsset
        : undefined,
    collateralAmount: params.collateralAmount?.toString(),
    collateralValueBase: collateralValueBase?.toString(),
    debtValueBase: debtValueBase.toString(),
    gasUsed: params.gasUsed.toString(),
    effectiveGasPriceWei: params.effectiveGasPriceWei.toString(),
    gasCostWei: gasCostWei.toString(),
    gasCostBase: gasCostBase?.toString(),
    realizedNetProfitBase: realizedNetProfitBase?.toString(),
    realizedNetProfitDisplay:
      realizedNetProfitBase !== undefined
        ? formatBaseAmount(
            realizedNetProfitBase,
            pricing.baseCurrencyUnit,
            pricing.baseCurrency,
          )
        : undefined,
  };
}
