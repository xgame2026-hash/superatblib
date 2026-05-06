import { runSelfFundedLiquidator } from "./self-funded-runner.js";

async function main(): Promise<void> {
  await runSelfFundedLiquidator({
    historyKey: "run:liquidator",
    allowAutoDeploy: true,
    missingContractMessage:
      "Missing configured liquidator contract for the selected execution market. Pass --contract, set the market-specific contract env, or use --deploy/--broadcast to deploy automatically.",
    unsupportedChainMessage: "Unsupported chain for liquidator run",
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
