import { createPublicClient, formatUnits, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import type { MorphoUnwindQuoteDraft } from "./morpho-unwind-quote-draft.js";
import type { SwapQuoteProvider } from "./swap-quote.js";
import { fetchOpenOceanSwapQuote } from "./openocean.js";
import { fetchZeroExSwapQuote, hasZeroExApiKey } from "./zeroex.js";

const MORPHO_UNWIND_MIN_COLLATERAL_USD = 1;

export type MorphoLiveUnwindQuote = {
  stage: "unwind-live-quote-attempted";
  requested: boolean;
  available: boolean;
  account: string;
  provider: SwapQuoteProvider | "";
  swapTarget: string;
  allowanceTarget: string;
  swapCalldata?: `0x${string}`;
  inputAmount: string;
  outputAmount: string;
  minOutputAmount: string;
  gasEstimate: string;
  unresolved: string[];
  summary: string;
};

export async function buildMorphoBlueLiveUnwindQuote(input: {
  draft: MorphoUnwindQuoteDraft | null;
  rpcUrl: string;
  privateKey: string;
}): Promise<MorphoLiveUnwindQuote> {
  const draft = input.draft;
  const chainLabel = draft && draft.chain === "base" ? "Base" : "Ethereum";
  if (!draft || !draft.available) {
    return {
      stage: "unwind-live-quote-attempted",
      requested: false,
      available: false,
      account: "",
      provider: "",
      swapTarget: "",
      allowanceTarget: "",
      inputAmount: "0",
      outputAmount: "0",
      minOutputAmount: "0",
      gasEstimate: "0",
      unresolved: ["no-unwind-draft"],
      summary:
        "Morpho live unwind quote cannot run because there is no unwind quote draft yet.",
    };
  }

  if (!input.rpcUrl.trim()) {
    return {
      stage: "unwind-live-quote-attempted",
      requested: false,
      available: false,
      account: "",
      provider: "",
      swapTarget: "",
      allowanceTarget: "",
      inputAmount: draft.inputAmount,
      outputAmount: "0",
      minOutputAmount: "0",
      gasEstimate: "0",
      unresolved: ["missing-rpc"],
      summary:
        `Morpho live unwind quote cannot run because Morpho ${chainLabel} RPC is missing.`,
    };
  }

  if (!input.privateKey.trim()) {
    return {
      stage: "unwind-live-quote-attempted",
      requested: false,
      available: false,
      account: "",
      provider: "",
      swapTarget: "",
      allowanceTarget: "",
      inputAmount: draft.inputAmount,
      outputAmount: "0",
      minOutputAmount: "0",
      gasEstimate: "0",
      unresolved: ["missing-private-key"],
      summary:
        "Morpho live unwind quote cannot run because the executor private key is missing.",
    };
  }

  if (!draft.inputAmount || draft.inputAmount === "0") {
    return {
      stage: "unwind-live-quote-attempted",
      requested: false,
      available: false,
      account: "",
      provider: "",
      swapTarget: "",
      allowanceTarget: "",
      inputAmount: draft.inputAmount,
      outputAmount: "0",
      minOutputAmount: "0",
      gasEstimate: "0",
      unresolved: ["missing-input-amount"],
      summary:
        "Morpho live unwind quote cannot run because the collateral sizing draft has no input amount yet.",
    };
  }

  const account = privateKeyToAccount(input.privateKey as Hex);
  if (
    typeof draft.collateralUsd === "number" &&
    Number.isFinite(draft.collateralUsd) &&
    draft.collateralUsd < MORPHO_UNWIND_MIN_COLLATERAL_USD
  ) {
    return {
      stage: "unwind-live-quote-attempted",
      requested: false,
      available: false,
      account: account.address,
      provider: "",
      swapTarget: "",
      allowanceTarget: "",
      inputAmount: draft.inputAmount,
      outputAmount: "0",
      minOutputAmount: "0",
      gasEstimate: "0",
      unresolved: ["dust-collateral"],
      summary:
        `Morpho live unwind quote skipped because collateral notional is dust: ~$${draft.collateralUsd.toExponential(2)} in ${draft.inToken.symbol}, below the $${MORPHO_UNWIND_MIN_COLLATERAL_USD} execution floor.`,
    };
  }
  const client = createPublicClient({
    transport: http(input.rpcUrl),
  });
  const providers: SwapQuoteProvider[] = hasZeroExApiKey()
    ? ["0x", "openocean"]
    : ["openocean"];

  const amount = BigInt(draft.inputAmount);
  const inDecimals = BigInt(draft.inToken.decimals ?? 18);
  const errors: string[] = [];

  for (const provider of providers) {
    try {
      const quote =
        provider === "0x"
          ? await fetchZeroExSwapQuote(client, {
              chainId: draft.chainId,
              account: account.address,
              inTokenAddress: draft.inToken.address,
              outTokenAddress: draft.outToken.address,
              amount,
              slippage: "1",
            })
          : await fetchOpenOceanSwapQuote(client, {
              chainId: draft.chainId,
              account: account.address,
              inTokenAddress: draft.inToken.address,
              inTokenDecimals: inDecimals,
              outTokenAddress: draft.outToken.address,
              amount,
              slippage: "1",
            });

      return {
        stage: "unwind-live-quote-attempted",
        requested: true,
        available: true,
        account: account.address,
        provider,
        swapTarget: quote.swapTarget,
        allowanceTarget: quote.allowanceTarget ?? "",
        swapCalldata: quote.swapCalldata,
        inputAmount: quote.inputAmount.toString(),
        outputAmount: quote.outputAmount.toString(),
        minOutputAmount: quote.minOutputAmount.toString(),
        gasEstimate: quote.estimatedGas ? quote.estimatedGas.toString() : "0",
        unresolved: [],
        summary:
          `Morpho live unwind quote succeeded via ${provider} for ${formatUnits(amount, Number(inDecimals))} ${draft.inToken.symbol} -> ${draft.outToken.symbol}.`,
      };
    } catch (error) {
      errors.push(`${provider}:${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    stage: "unwind-live-quote-attempted",
    requested: true,
    available: false,
    account: account.address,
    provider: "",
    swapTarget: "",
    allowanceTarget: "",
    inputAmount: draft.inputAmount,
    outputAmount: "0",
    minOutputAmount: "0",
    gasEstimate: "0",
    unresolved: ["quote-failed"],
    summary:
      `Morpho live unwind quote attempted ${providers.join(" -> ")} but no provider returned a usable quote. ${errors.join(" | ")}`,
  };
}

export async function buildMorphoBlueEthereumLiveUnwindQuote(input: {
  draft: MorphoUnwindQuoteDraft | null;
  rpcUrl: string;
  privateKey: string;
}): Promise<MorphoLiveUnwindQuote> {
  return buildMorphoBlueLiveUnwindQuote(input);
}

export async function buildMorphoBlueBaseLiveUnwindQuote(input: {
  draft: MorphoUnwindQuoteDraft | null;
  rpcUrl: string;
  privateKey: string;
}): Promise<MorphoLiveUnwindQuote> {
  return buildMorphoBlueLiveUnwindQuote(input);
}
