import { createPublicClient, http, parseAbi } from "viem";

import type {
  MorphoBlueChain,
  MorphoBlueReadOnlyOpportunity,
} from "./morpho-blue-api.js";
import { morphoBlueAddressForChain } from "./morpho-blue-contract.js";

const morphoBluePositionAbi = parseAbi([
  "function position(bytes32 id,address user) view returns (uint256 supplyShares,uint128 borrowShares,uint128 collateral)",
]);

function numberFromBigint(value: bigint): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function needsOnchainHydration(opportunity: MorphoBlueReadOnlyOpportunity): boolean {
  return (
    opportunity.collateral === null ||
    opportunity.collateralRaw === null ||
    opportunity.borrowShares === null ||
    opportunity.borrowSharesRaw === null
  );
}

async function readMorphoBluePositionState(input: {
  chain: MorphoBlueChain;
  rpcUrl: string;
  marketId: string;
  user: string;
}): Promise<{
  collateral: number | null;
  collateralRaw: string | null;
  borrowShares: number | null;
  borrowSharesRaw: string | null;
}> {
  const client = createPublicClient({
    transport: http(input.rpcUrl),
  });

  const result = await client.readContract({
    address: morphoBlueAddressForChain(input.chain),
    abi: morphoBluePositionAbi,
    functionName: "position",
    args: [input.marketId as `0x${string}`, input.user as `0x${string}`],
  });

  const borrowShares = result[1];
  const collateral = result[2];

  return {
    collateral: numberFromBigint(collateral),
    collateralRaw: collateral.toString(),
    borrowShares: numberFromBigint(borrowShares),
    borrowSharesRaw: borrowShares.toString(),
  };
}

export async function hydrateMorphoOpportunitiesWithOnchainPositions(input: {
  chain: MorphoBlueChain;
  rpcUrl: string;
  opportunities: MorphoBlueReadOnlyOpportunity[];
}): Promise<MorphoBlueReadOnlyOpportunity[]> {
  if (!input.rpcUrl.trim() || !Array.isArray(input.opportunities) || input.opportunities.length === 0) {
    return input.opportunities;
  }

  const hydrated = await Promise.all(
    input.opportunities.map(async (opportunity) => {
      if (!needsOnchainHydration(opportunity)) {
        return opportunity;
      }

      try {
        const onchainState = await readMorphoBluePositionState({
          chain: input.chain,
          rpcUrl: input.rpcUrl,
          marketId: opportunity.marketId,
          user: opportunity.user,
        });

        return {
          ...opportunity,
          collateral:
            opportunity.collateral !== null ? opportunity.collateral : onchainState.collateral,
          collateralRaw: opportunity.collateralRaw ?? onchainState.collateralRaw,
          borrowShares:
            opportunity.borrowShares !== null ? opportunity.borrowShares : onchainState.borrowShares,
          borrowSharesRaw: opportunity.borrowSharesRaw ?? onchainState.borrowSharesRaw,
        };
      } catch {
        return opportunity;
      }
    }),
  );

  return hydrated;
}
