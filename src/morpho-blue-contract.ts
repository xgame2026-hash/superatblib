import {
  maxUint256,
  type Address,
  encodeFunctionData,
  parseAbi,
  type Hex,
} from "viem";

export const MORPHO_BLUE_ETHEREUM_ADDRESS =
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as Address;
export const MORPHO_BLUE_BASE_ADDRESS =
  "0xBBBBBbbBBb9cC5e90e3b3Af64bdAF62C37EEFFCb" as Address;

export function morphoBlueAddressForChain(
  chain: "ethereum" | "base",
): Address {
  return chain === "base" ? MORPHO_BLUE_BASE_ADDRESS : MORPHO_BLUE_ETHEREUM_ADDRESS;
}

export type MorphoBlueMarketParamsDraft = {
  loanToken: Address;
  collateralToken: Address;
  oracle: Address;
  irm: Address;
  lltv: string;
};

export type MorphoBlueLiquidateDraftInput = {
  marketParams: MorphoBlueMarketParamsDraft;
  borrower: Address;
  seizedAssets: string;
  repaidShares: string;
  data: Hex;
};

// Mirrors the official Morpho Blue liquidation bot ABI:
// apps/client/src/abis/morpho/morphoBlue.ts
const morphoBlueLiquidateAbi = parseAbi([
  "function liquidate((address loanToken,address collateralToken,address oracle,address irm,uint256 lltv) marketParams,address borrower,uint256 seizedAssets,uint256 repaidShares,bytes data) returns (uint256,uint256)",
]);

const erc20ApproveAbi = parseAbi([
  "function approve(address spender,uint256 amount) returns (bool)",
]);

export function encodeMorphoBlueLiquidateDraft(
  input: MorphoBlueLiquidateDraftInput,
): Hex {
  return encodeFunctionData({
    abi: morphoBlueLiquidateAbi,
    functionName: "liquidate",
    args: [
      {
        loanToken: input.marketParams.loanToken,
        collateralToken: input.marketParams.collateralToken,
        oracle: input.marketParams.oracle,
        irm: input.marketParams.irm,
        lltv: BigInt(input.marketParams.lltv),
      },
      input.borrower,
      BigInt(input.seizedAssets),
      BigInt(input.repaidShares),
      input.data,
    ],
  });
}

export function encodeErc20ApproveDraft(input: {
  spender: Address;
  amount?: bigint;
}): Hex {
  return encodeFunctionData({
    abi: erc20ApproveAbi,
    functionName: "approve",
    args: [input.spender, input.amount ?? maxUint256],
  });
}
