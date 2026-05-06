import { Address, Hex } from "viem";

export type SwapQuoteProvider = "openocean" | "0x";

export type SwapQuote = {
  provider: SwapQuoteProvider;
  swapTarget: Address;
  allowanceTarget?: Address;
  outputToken: Address;
  minOutputAmount: bigint;
  swapCalldata: Hex;
  inputAmount: bigint;
  outputAmount: bigint;
  estimatedGas?: bigint;
  gasPriceWei: bigint;
  gasPriceGwei?: string;
  slippage: string;
};
