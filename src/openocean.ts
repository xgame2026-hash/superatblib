import { Address, Hex, PublicClient, formatUnits, getAddress } from "viem";

import { SwapQuote } from "./swap-quote.js";

const OPENOCEAN_CHAIN_CODES: Record<number, string> = {
  1: "eth",
  56: "bsc",
  137: "polygon",
  42161: "arbitrum",
};

export type OpenOceanSwapQuote = SwapQuote & {
  provider: "openocean";
  chainCode: string;
  gasPriceGwei: string;
};

type OpenOceanResponse = {
  code?: number;
  message?: string;
  data?: {
    inAmount?: string;
    outAmount?: string;
    estimatedGas?: string | number;
    minOutAmount?: string;
    to?: string;
    value?: string;
    gasPrice?: string;
    data?: string;
    outToken?: {
      address?: string;
    };
  };
};

const OPENOCEAN_MIN_INTERVAL_MS = 350;
const OPENOCEAN_MAX_RETRIES = 2;
const OPENOCEAN_TIMEOUT_MS = 8_000;

let openOceanNextRequestAt = 0;
let openOceanSchedule: Promise<void> = Promise.resolve();

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForOpenOceanTurn(): Promise<void> {
  const previous = openOceanSchedule;
  let release!: () => void;
  openOceanSchedule = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;
  const now = Date.now();
  const waitMs = Math.max(0, openOceanNextRequestAt - now);
  if (waitMs > 0) {
    await sleep(waitMs);
  }
  openOceanNextRequestAt = Date.now() + OPENOCEAN_MIN_INTERVAL_MS;
  release();
}

function retryDelayMs(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const asNumber = Number(retryAfter);
    if (Number.isFinite(asNumber) && asNumber >= 0) {
      return asNumber * 1000;
    }
  }

  return OPENOCEAN_MIN_INTERVAL_MS * (attempt + 2);
}

function normalizeDecimalString(value: string): string {
  if (!value.includes(".")) {
    return value;
  }

  return value.replace(/(?:\.0+|(\.\d*?)0+)$/, "$1");
}

export async function fetchOpenOceanSwapQuote(
  client: PublicClient,
  params: {
    chainId: number;
    account: Address;
    inTokenAddress: Address;
    inTokenDecimals: bigint;
    outTokenAddress: Address;
    amount: bigint;
    slippage: string;
  },
): Promise<OpenOceanSwapQuote> {
  const chainCode = OPENOCEAN_CHAIN_CODES[params.chainId];
  if (!chainCode) {
    throw new Error(`OpenOcean auto swap is not configured for chainId ${params.chainId}.`);
  }

  const gasPriceWei = await client.getGasPrice();
  const gasPriceGwei = ceilDiv(gasPriceWei, 1_000_000_000n).toString();
  const amountDisplay = normalizeDecimalString(
    formatUnits(params.amount, Number(params.inTokenDecimals)),
  );

  const query = new URLSearchParams({
    inTokenAddress: params.inTokenAddress,
    outTokenAddress: params.outTokenAddress,
    amount: amountDisplay,
    gasPrice: gasPriceGwei,
    slippage: params.slippage,
    account: params.account,
  });

  let response: Response | undefined;
  for (let attempt = 0; attempt <= OPENOCEAN_MAX_RETRIES; attempt += 1) {
    await waitForOpenOceanTurn();
    response = await fetch(
      `https://open-api.openocean.finance/v3/${chainCode}/swap_quote?${query.toString()}`,
      {
        signal: AbortSignal.timeout(OPENOCEAN_TIMEOUT_MS),
      },
    );
    if (response.ok) {
      break;
    }
    if (response.status !== 429 || attempt === OPENOCEAN_MAX_RETRIES) {
      throw new Error(
        `OpenOcean swap_quote failed with HTTP ${response.status} ${response.statusText}.`,
      );
    }
    await sleep(retryDelayMs(response, attempt));
  }
  if (!response || !response.ok) {
    throw new Error("OpenOcean swap_quote failed before a response was received.");
  }

  const payload = (await response.json()) as OpenOceanResponse;
  if (payload.code !== 200 || !payload.data) {
    throw new Error(
      `OpenOcean swap_quote returned an error: ${payload.message ?? "unknown error"}.`,
    );
  }

  if (!payload.data.to || !payload.data.data) {
    throw new Error("OpenOcean swap_quote did not include transaction calldata.");
  }

  const value = BigInt(payload.data.value ?? "0");
  if (value !== 0n) {
    throw new Error("Only ERC20 swap quotes with value=0 are supported.");
  }

  const outputToken =
    payload.data.outToken?.address !== undefined
      ? getAddress(payload.data.outToken.address)
      : params.outTokenAddress;

  return {
    provider: "openocean",
    chainCode,
    swapTarget: getAddress(payload.data.to),
    outputToken,
    minOutputAmount: BigInt(payload.data.minOutAmount ?? payload.data.outAmount ?? "0"),
    swapCalldata: payload.data.data as Hex,
    inputAmount: BigInt(payload.data.inAmount ?? params.amount.toString()),
    outputAmount: BigInt(payload.data.outAmount ?? "0"),
    estimatedGas:
      payload.data.estimatedGas !== undefined
        ? BigInt(payload.data.estimatedGas)
        : undefined,
    gasPriceWei: BigInt(payload.data.gasPrice ?? gasPriceWei.toString()),
    gasPriceGwei,
    slippage: params.slippage,
  };
}
