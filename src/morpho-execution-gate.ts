import {
  evaluateMorphoExecutionCandidate,
  type MorphoExecutionCandidateResult,
} from "./morpho-execution-candidate.js";
import type { MorphoRoutePlannerResult } from "./morpho-route-planner.js";

export type MorphoExecutionGateResult = MorphoExecutionCandidateResult;

export function evaluateMorphoExecutionGate(
  routePlanner: MorphoRoutePlannerResult,
): MorphoExecutionGateResult {
  const selected = routePlanner.selectedOpportunity;
  if (!routePlanner.quoteAvailable || !selected) {
    return {
      eligible: false,
      reasons: ["no-live-target"],
      summary:
        "Morpho execution gate is blocked because the route planner did not resolve a live target.",
    };
  }

  const candidate = evaluateMorphoExecutionCandidate(selected);
  return {
    eligible: candidate.eligible,
    reasons: candidate.reasons,
    summary: candidate.eligible
      ? `Morpho execution gate passed for ${selected.marketLabel}; the target is liquidatable and above the minimum notional floor.`
      : `Morpho execution gate blocked ${selected.marketLabel} because collateral=${typeof selected.collateralUsd === "number" ? `$${selected.collateralUsd.toFixed(2)}` : "--"} and borrow=${typeof selected.borrowAssetsUsd === "number" ? `$${selected.borrowAssetsUsd.toFixed(2)}` : "--"} do not satisfy the minimum executable notional rules.`,
  };
}
