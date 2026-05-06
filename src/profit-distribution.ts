import { Address, PublicClient, getAddress } from "viem";

import { addressProviderAbi, oracleAbi } from "./abi.js";
import { ChainPreset } from "./config.js";
import { PreparedExecution, erc20Abi } from "./execution-plan.js";
import { formatAssetAmount, formatBaseAmount } from "./liquidation-analysis.js";
import { ResolvedMarket } from "./market.js";

export type ProfitRecipient = {
  address: Address;
  bps: bigint;
};

export type ProfitDistributionPlan = {
  token?: Address;
  tokenDecimals?: number;
  grossAmount?: string;
  grossAmountDisplay?: string;
  principalReserveAmount?: string;
  principalReserveAmountDisplay?: string;
  distributableProfitAmount?: string;
  distributableProfitAmountDisplay?: string;
  recipients: Array<{
    address: Address;
    bps: string;
    amount: string;
    amountDisplay: string;
  }>;
  remainderToOwner?: string;
  remainderToOwnerDisplay?: string;
  canDistribute: boolean;
  reason?: string;
};

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

async function getAssetPrice(
  client: PublicClient,
  poolAddressesProvider: Address,
  asset: Address,
): Promise<{ oracle: Address; price: bigint }> {
  const oracle = await client.readContract({
    address: poolAddressesProvider,
    abi: addressProviderAbi,
    functionName: "getPriceOracle",
  });
  const price = await client.readContract({
    address: oracle,
    abi: oracleAbi,
    functionName: "getAssetPrice",
    args: [asset],
  });

  return { oracle, price };
}

async function resolveTokenDecimals(
  client: PublicClient,
  prepared: PreparedExecution,
  token: Address,
): Promise<number> {
  if (token.toLowerCase() === prepared.liquidationCall.debtAsset.toLowerCase()) {
    return Number(prepared.liquidationCall.debtDecimals);
  }

  if (token.toLowerCase() === prepared.liquidationCall.collateralAsset.toLowerCase()) {
    return Number(prepared.liquidationCall.collateralDecimals);
  }

  return client.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "decimals",
  });
}

export function parseProfitRecipients(
  recipientsRaw: string | undefined,
  splitBpsRaw: string | undefined,
): ProfitRecipient[] {
  if (!recipientsRaw && !splitBpsRaw) {
    return [];
  }

  const recipients = (recipientsRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => getAddress(value));
  const splitBps = (splitBpsRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => BigInt(value));

  if (recipients.length === 0 || splitBps.length === 0) {
    throw new Error(
      "PROFIT_RECIPIENTS and PROFIT_SPLIT_BPS must both be set when profit distribution is enabled.",
    );
  }

  if (recipients.length !== splitBps.length) {
    throw new Error("PROFIT_RECIPIENTS and PROFIT_SPLIT_BPS length mismatch.");
  }

  const totalBps = splitBps.reduce((sum, value) => sum + value, 0n);
  if (totalBps > 10_000n) {
    throw new Error("PROFIT_SPLIT_BPS sum cannot exceed 10000.");
  }

  return recipients.map((address, index) => ({
    address,
    bps: splitBps[index],
  }));
}

export async function planProfitDistribution(
  client: PublicClient,
  market:
    | Pick<ChainPreset, "poolAddressesProvider">
    | Pick<ResolvedMarket, "poolAddressesProvider">,
  prepared: PreparedExecution,
  params: {
    outputToken?: Address;
    outputAmount?: bigint;
    collateralAmount?: bigint;
    recipients: ProfitRecipient[];
  },
): Promise<ProfitDistributionPlan> {
  if (params.recipients.length === 0) {
    return {
      recipients: [],
      canDistribute: false,
      reason: "No profit recipients configured.",
    };
  }

  const token =
    params.outputAmount && params.outputAmount > 0n
      ? params.outputToken
      : params.collateralAmount && params.collateralAmount > 0n
        ? prepared.liquidationCall.collateralAsset
        : undefined;
  const grossAmount =
    params.outputAmount && params.outputAmount > 0n
      ? params.outputAmount
      : params.collateralAmount && params.collateralAmount > 0n
        ? params.collateralAmount
        : undefined;

  if (!token || grossAmount === undefined || grossAmount === 0n) {
    return {
      recipients: [],
      canDistribute: false,
      reason: "No realized output token amount available for distribution.",
    };
  }

  const tokenDecimals = await resolveTokenDecimals(client, prepared, token);
  const [{ price: debtPrice }, { price: tokenPrice }] = await Promise.all([
    getAssetPrice(client, market.poolAddressesProvider, prepared.liquidationCall.debtAsset),
    getAssetPrice(client, market.poolAddressesProvider, token),
  ]);

  if (debtPrice === 0n || tokenPrice === 0n) {
    return {
      token,
      tokenDecimals,
      grossAmount: grossAmount.toString(),
      grossAmountDisplay: formatAssetAmount(grossAmount, BigInt(tokenDecimals)),
      recipients: [],
      canDistribute: false,
      reason: "Oracle price unavailable for debt asset or payout token.",
    };
  }

  const debtValueBase =
    (prepared.liquidationCall.debtToCover * debtPrice) /
    10n ** prepared.liquidationCall.debtDecimals;
  const principalReserveAmount = ceilDiv(
    debtValueBase * 10n ** BigInt(tokenDecimals),
    tokenPrice,
  );
  const distributableProfitAmount =
    grossAmount > principalReserveAmount ? grossAmount - principalReserveAmount : 0n;

  if (distributableProfitAmount === 0n) {
    return {
      token,
      tokenDecimals,
      grossAmount: grossAmount.toString(),
      grossAmountDisplay: formatAssetAmount(grossAmount, BigInt(tokenDecimals)),
      principalReserveAmount: principalReserveAmount.toString(),
      principalReserveAmountDisplay: formatAssetAmount(
        principalReserveAmount,
        BigInt(tokenDecimals),
      ),
      distributableProfitAmount: "0",
      distributableProfitAmountDisplay: formatAssetAmount(0n, BigInt(tokenDecimals)),
      recipients: [],
      canDistribute: false,
      reason: "No distributable profit remained after reserving principal.",
    };
  }

  const recipients = params.recipients.map((recipient) => {
    const amount = (distributableProfitAmount * recipient.bps) / 10_000n;
    return {
      address: recipient.address,
      bps: recipient.bps.toString(),
      amount: amount.toString(),
      amountDisplay: formatAssetAmount(amount, BigInt(tokenDecimals)),
    };
  });
  const distributed = recipients.reduce((sum, recipient) => sum + BigInt(recipient.amount), 0n);
  const remainderToOwner = distributableProfitAmount - distributed;

  return {
    token,
    tokenDecimals,
    grossAmount: grossAmount.toString(),
    grossAmountDisplay: formatAssetAmount(grossAmount, BigInt(tokenDecimals)),
    principalReserveAmount: principalReserveAmount.toString(),
    principalReserveAmountDisplay: formatAssetAmount(
      principalReserveAmount,
      BigInt(tokenDecimals),
    ),
    distributableProfitAmount: distributableProfitAmount.toString(),
    distributableProfitAmountDisplay: formatAssetAmount(
      distributableProfitAmount,
      BigInt(tokenDecimals),
    ),
    recipients,
    remainderToOwner: remainderToOwner.toString(),
    remainderToOwnerDisplay: formatAssetAmount(remainderToOwner, BigInt(tokenDecimals)),
    canDistribute: recipients.some((recipient) => BigInt(recipient.amount) > 0n),
    reason: recipients.some((recipient) => BigInt(recipient.amount) > 0n)
      ? undefined
      : "Configured recipient shares round down to zero at current token precision.",
  };
}
