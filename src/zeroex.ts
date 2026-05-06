import { Address, PublicClient, getAddress } from "viem";

import { SwapQuote } from "./swap-quote.js";

export type ZeroExSwapQuote = SwapQuote & {
  provider: "0x";
};

type ZeroExQuoteResponse = {
  reason?: string;
  validationErrors?: Array<{ reason?: string; field?: string; code?: number }>;
  liquidityAvailable?: boolean;
  buyAmount?: string;
  minBuyAmount?: string;
  sellAmount?: string;
  gas?: string;
  gasPrice?: string;
  allowanceTarget?: string;
  issues?: {
    allowance?: {
      spender?: string | null;
    } | null;
  };
  transaction?: {
    to?: string;
    data?: string;
    value?: string;
    gas?: string;
    gasPrice?: string;
  };
};

function parseSlippageToBps(slippage: string): string {
  const numeric = Number(slippage);
  if (!Number.isFinite(numeric) || numeric < 0) {
    throw new Error(`Invalid 0x slippage value: ${slippage}`);
  }

  return Math.round(numeric * 100).toString();
}

function formatZeroExError(payload: ZeroExQuoteResponse): string {
  if (payload.reason) {
    return payload.reason;
  }

  const firstValidationError = payload.validationErrors?.find(
    (entry) => entry.reason,
  );
  if (firstValidationError?.reason) {
    return firstValidationError.reason;
  }

  return "unknown error";
}

export function hasZeroExApiKey(): boolean {
  return Boolean(process.env.ZEROX_API_KEY?.trim());
}

export async function fetchZeroExSwapQuote(
  client: PublicClient,
  params: {
    chainId: number;
    account: Address;
    inTokenAddress: Address;
    outTokenAddress: Address;
    amount: bigint;
    slippage: string;
  },
): Promise<ZeroExSwapQuote> {
  const apiKey = process.env.ZEROX_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("0x auto swap is disabled because ZEROX_API_KEY is not set.");
  }

  const query = new URLSearchParams({
    chainId: params.chainId.toString(),
    sellToken: params.inTokenAddress,
    buyToken: params.outTokenAddress,
    sellAmount: params.amount.toString(),
    taker: params.account,
    slippageBps: parseSlippageToBps(params.slippage),
  });

  const response = await fetch(
    `https://api.0x.org/swap/allowance-holder/quote?${query.toString()}`,
    {
      headers: {
        "0x-api-key": apiKey,
        "0x-version": "v2",
      },
    },
  );

  const payload = (await response.json()) as ZeroExQuoteResponse;
  if (!response.ok) {
    throw new Error(
      `0x quote failed with HTTP ${response.status} ${response.statusText}: ${formatZeroExError(payload)}.`,
    );
  }

  if (payload.liquidityAvailable === false) {
    throw new Error("0x quote reported no liquidity for this route.");
  }

  if (!payload.transaction?.to || !payload.transaction.data) {
    throw new Error("0x quote did not include transaction calldata.");
  }

  const value = BigInt(payload.transaction.value ?? "0");
  if (value !== 0n) {
    throw new Error("Only ERC20 swap quotes with value=0 are supported.");
  }

  const gasPriceWei = BigInt(
    payload.transaction.gasPrice ?? payload.gasPrice ?? (await client.getGasPrice()).toString(),
  );
  const allowanceTarget =
    payload.issues?.allowance?.spender ?? payload.allowanceTarget;

  return {
    provider: "0x",
    swapTarget: getAddress(payload.transaction.to),
    allowanceTarget: allowanceTarget ? getAddress(allowanceTarget) : undefined,
    outputToken: params.outTokenAddress,
    minOutputAmount: BigInt(payload.minBuyAmount ?? payload.buyAmount ?? "0"),
    swapCalldata: payload.transaction.data as `0x${string}`,
    inputAmount: BigInt(payload.sellAmount ?? params.amount.toString()),
    outputAmount: BigInt(payload.buyAmount ?? "0"),
    estimatedGas:
      payload.transaction.gas !== undefined
        ? BigInt(payload.transaction.gas)
        : payload.gas !== undefined
          ? BigInt(payload.gas)
          : undefined,
    gasPriceWei,
    gasPriceGwei: ((gasPriceWei + 1_000_000_000n - 1n) / 1_000_000_000n).toString(),
    slippage: params.slippage,
  };
}
