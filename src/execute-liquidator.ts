import { runSelfFundedLiquidator } from "./self-funded-runner.js";

async function main(): Promise<void> {
  await runSelfFundedLiquidator({
    historyKey: "execute:liquidator",
    allowAutoDeploy: false,
    missingContractMessage:
      "Missing configured liquidator contract for the selected execution market or --contract.",
    unsupportedChainMessage: "Unsupported chain for contract execution",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
