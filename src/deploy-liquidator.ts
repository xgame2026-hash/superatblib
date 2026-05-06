import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { arbitrum, bsc, mainnet, polygon } from "viem/chains";

import { CHAIN_PRESETS, loadCliOptions } from "./config.js";
import {
  compileFlashLoanLiquidator,
  compileSelfFundedLiquidator,
} from "./contract-compiler.js";
import { saveDashboardSettings } from "./dashboard-settings.js";
import { resolveMarket } from "./market.js";

const CHAIN_MAP = {
  1: mainnet,
  56: bsc,
  137: polygon,
  42161: arbitrum,
} as const;

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  if (!privateKey) {
    throw new Error("PRIVATE_KEY is required for deployment.");
  }

  const options = loadCliOptions();
  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    transport: http(options.rpcUrl),
  });
  const market = await resolveMarket(
    publicClient,
    options.chain,
    options.market,
    options.configuredAddressProvider,
  );
  const chain = CHAIN_MAP[market.chainId as keyof typeof CHAIN_MAP];
  if (!chain) {
    throw new Error(`Unsupported chain for deployment: ${market.chainId}`);
  }

  const compiled =
    options.fundingMode === "flash_loan"
      ? compileFlashLoanLiquidator()
      : compileSelfFundedLiquidator();
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(options.executionRpcUrl),
  });

  const hash = await walletClient.deployContract({
    abi: compiled.abi,
    bytecode: compiled.bytecode,
    args: [account.address, market.pool],
    account,
    chain,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  const contractAddress = receipt.contractAddress
    ? getAddress(receipt.contractAddress)
    : undefined;
  if (contractAddress) {
    const chainKey = CHAIN_PRESETS[market.chainId]?.key;
    if (chainKey) {
      saveDashboardSettings({
        chains:
          options.market?.key === "spark-ethereum"
            ? undefined
            : {
                [chainKey]: {
                  liquidatorContract: contractAddress,
                },
              },
        markets: options.market
          ? {
              [options.market.key]: {
                liquidatorContract: contractAddress,
              },
            }
          : undefined,
      });
    }
  }

  console.log(
    JSON.stringify(
      {
        chainId: market.chainId,
        chainName: market.chainName,
        marketId: market.marketId,
        deployer: account.address,
        fundingMode: options.fundingMode,
        contractName: compiled.contractName,
        pool: market.pool,
        txHash: hash,
        contractAddress,
        status: receipt.status,
        gasUsed: receipt.gasUsed.toString(),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
