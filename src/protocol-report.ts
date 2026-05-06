import { loadCliOptions } from "./config.js";
import { currentProtocolPreparationSummary } from "./protocols.js";

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main(): Promise<void> {
  const options = loadCliOptions();
  const summary = currentProtocolPreparationSummary();
  const selectedChain = options.chain;

  const payload = {
    selectedChain: selectedChain
      ? {
          key: selectedChain.key,
          chainId: selectedChain.chainId,
          name: selectedChain.name,
          activeProtocol: selectedChain.protocol.key,
        }
      : undefined,
    activeProtocol: summary.active,
    plannedProtocol: summary.planned,
    adapterBoundaries: summary.adapterBoundaries,
    nextUpgradeWork: summary.nextUpgradeWork,
  };

  if (hasFlag("json")) {
    console.log(JSON.stringify(payload, null, 2));
    return;
  }

  console.log("");
  console.log(`Active protocol: ${summary.active.label}`);
  console.log(`Planned protocol: ${summary.planned.label}`);
  if (selectedChain) {
    console.log(
      `Selected chain: ${selectedChain.name} (${selectedChain.chainId}) -> ${selectedChain.protocol.label}`,
    );
  }

  console.log("");
  console.log("Adapter boundaries:");
  for (const item of summary.adapterBoundaries) {
    console.log(`- ${item}`);
  }

  console.log("");
  console.log("Next upgrade work:");
  for (const item of summary.nextUpgradeWork) {
    console.log(`- ${item}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
