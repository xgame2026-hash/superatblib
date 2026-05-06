export const MORPHO_MIN_EXECUTION_COLLATERAL_USD = 1;
export const MORPHO_MIN_EXECUTION_BORROW_USD = 1;

export type MorphoExecutionCandidateLike = {
  marketLabel: string;
  kind: string;
  collateralUsd: number | null | undefined;
  borrowAssetsUsd: number | null | undefined;
};

export type MorphoExecutionCandidateResult = {
  eligible: boolean;
  reasons: string[];
  summary: string;
};

function hasFiniteNumber(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function evaluateMorphoExecutionCandidate(
  target: MorphoExecutionCandidateLike,
): MorphoExecutionCandidateResult {
  const reasons: string[] = [];

  if (target.kind !== "liquidatable") {
    reasons.push("not-liquidatable");
  }

  if (
    !hasFiniteNumber(target.collateralUsd) ||
    target.collateralUsd < MORPHO_MIN_EXECUTION_COLLATERAL_USD
  ) {
    reasons.push("dust-collateral");
  }

  if (
    !hasFiniteNumber(target.borrowAssetsUsd) ||
    target.borrowAssetsUsd < MORPHO_MIN_EXECUTION_BORROW_USD
  ) {
    reasons.push("dust-borrow");
  }

  if (!reasons.length) {
    return {
      eligible: true,
      reasons: [],
      summary: `Morpho execution candidate is eligible for ${target.marketLabel}.`,
    };
  }

  const collateralUsd = hasFiniteNumber(target.collateralUsd)
    ? `$${target.collateralUsd.toFixed(2)}`
    : "--";
  const borrowUsd = hasFiniteNumber(target.borrowAssetsUsd)
    ? `$${target.borrowAssetsUsd.toFixed(2)}`
    : "--";

  return {
    eligible: false,
    reasons,
    summary: `Morpho execution candidate is blocked for ${target.marketLabel} because collateral=${collateralUsd} and borrow=${borrowUsd} do not satisfy the minimum executable notional rules.`,
  };
}
