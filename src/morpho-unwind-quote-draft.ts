import { hasZeroExApiKey } from "./zeroex.js";
import type { MorphoRoutePlannerResult } from "./morpho-route-planner.js";
import type { SwapQuoteProvider } from "./swap-quote.js";

export type MorphoUnwindQuoteDraft = {
  stage: "unwind-quote-draft-built";
  available: boolean;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  requestShape: "exact-out-target";
  marketId: string;
  marketLabel: string;
  borrower: string;
  inToken: {
    address: `0x${string}`;
    symbol: string;
    decimals?: number;
  };
  outToken: {
    address: `0x${string}`;
    symbol: string;
    decimals?: number;
  };
  inputAmount: string;
  preferredProviders: SwapQuoteProvider[];
  targetRepayUsd: number | null;
  collateralUsd: number | null;
  unresolved: string[];
  summary: string;
};

function buildMorphoBlueUnwindQuoteDraft(
  chain: "ethereum" | "base",
  routePlanner: MorphoRoutePlannerResult,
): MorphoUnwindQuoteDraft {
  const selected = routePlanner.selectedOpportunity;
  const chainId = chain === "base" ? 8453 : 1;
  const chainLabel = chain === "base" ? "Base" : "Ethereum";
  if (!routePlanner.quoteAvailable || !selected) {
    return {
      stage: "unwind-quote-draft-built",
      available: false,
      chain,
      chainId,
      requestShape: "exact-out-target",
      marketId: "",
      marketLabel: "",
      borrower: "",
      inToken: {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "--",
      },
      outToken: {
        address: "0x0000000000000000000000000000000000000000",
        symbol: "--",
      },
      inputAmount: "0",
      preferredProviders: [],
      targetRepayUsd: null,
      collateralUsd: null,
      unresolved: ["no-live-target"],
      summary:
        `Morpho ${chainLabel} unwind quote draft is not available because the planner did not resolve a live liquidation target.`,
    };
  }

  const preferredProviders: SwapQuoteProvider[] = hasZeroExApiKey()
    ? ["0x", "openocean"]
    : ["openocean"];

  const targetRepayUsd =
    typeof selected.borrowAssetsUsd === "number" ? selected.borrowAssetsUsd : null;

  return {
    stage: "unwind-quote-draft-built",
    available: true,
    chain,
    chainId,
    requestShape: "exact-out-target",
    marketId: selected.marketId,
    marketLabel: selected.marketLabel,
    borrower: selected.user,
    inToken: {
      address: selected.marketParams.collateralToken,
      symbol: selected.collateralSymbol,
      decimals: selected.collateralDecimals,
    },
    outToken: {
      address: selected.marketParams.loanToken,
      symbol: selected.loanSymbol,
      decimals: selected.loanDecimals,
    },
    inputAmount:
      typeof selected.collateralRaw === "string" &&
      selected.collateralRaw !== "0" &&
      selected.collateralRaw.length > 0
        ? selected.collateralRaw
        : typeof selected.collateral === "number" &&
            Number.isFinite(selected.collateral) &&
            selected.collateral > 0
          ? Math.trunc(selected.collateral).toString()
          : "0",
    preferredProviders,
    targetRepayUsd,
    collateralUsd:
      typeof selected.collateralUsd === "number" && Number.isFinite(selected.collateralUsd)
        ? selected.collateralUsd
        : null,
    unresolved: [
      "live-quote-not-requested",
    ],
    summary:
      `Morpho ${chainLabel} unwind quote draft is wired for ${selected.collateralSymbol} -> ${selected.loanSymbol} with ${preferredProviders.join(" -> ")} as provider priority, but live swap calldata still depends on resolved seizedAssets/collateral amount.`,
  };
}

export function buildMorphoBlueEthereumUnwindQuoteDraft(
  routePlanner: MorphoRoutePlannerResult,
): MorphoUnwindQuoteDraft {
  return buildMorphoBlueUnwindQuoteDraft("ethereum", routePlanner);
}

export function buildMorphoBlueBaseUnwindQuoteDraft(
  routePlanner: MorphoRoutePlannerResult,
): MorphoUnwindQuoteDraft {
  return buildMorphoBlueUnwindQuoteDraft("base", routePlanner);
}
