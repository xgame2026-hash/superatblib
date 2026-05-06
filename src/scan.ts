import {
  createPublicClient,
  http,
} from "viem";

import { loadCliOptions } from "./config.js";
import {
  AccountSnapshot,
  LIQUIDATABLE_HEALTH_FACTOR,
  collectCandidateUsers,
  formatBasisPoints,
  formatHealthFactor,
  loadAccountSnapshots,
  resolveMarket,
  shortAddress,
  sortRiskySnapshots,
} from "./market.js";
import { describeProtocolForOutput } from "./protocols.js";

function renderTable(rows: AccountSnapshot[], limit: number): string {
  const header = [
    "HF".padEnd(8),
    "DebtBase".padEnd(14),
    "CollBase".padEnd(14),
    "LiqThreshold".padEnd(14),
    "User",
  ].join(" ");

  const body = rows.slice(0, limit).map((row) =>
    [
      formatHealthFactor(row.healthFactor).padEnd(8),
      row.totalDebtBase.toString().padEnd(14),
      row.totalCollateralBase.toString().padEnd(14),
      formatBasisPoints(row.currentLiquidationThreshold).padEnd(14),
      `${shortAddress(row.user)} (${row.user})`,
    ].join(" "),
  );

  return [header, ...body].join("\n");
}

async function main(): Promise<void> {
  const options = loadCliOptions();
  const client = createPublicClient({
    transport: http(options.rpcUrl),
  });

  const market = await resolveMarket(
    client,
    options.chain,
    options.market,
    options.configuredAddressProvider,
  );
  const latestBlock = options.toBlock ?? (await client.getBlockNumber());
  const fromBlock =
    options.fromBlock ??
    (latestBlock > options.lookbackBlocks ? latestBlock - options.lookbackBlocks : 0n);

  const candidateUsers = await collectCandidateUsers(
    client,
    market.pool,
    fromBlock,
    latestBlock,
    options.chunkSize,
    console.log,
  );

  const snapshots = await loadAccountSnapshots(
    client,
    market.pool,
    [...candidateUsers],
    options.userBatchSize,
    console.log,
  );

  const { risky, liquidatable } = sortRiskySnapshots(
    snapshots,
    options.alertThreshold,
  );

  const summary = {
    chainId: market.chainId,
    chainName: market.chainName,
    marketId: market.marketId,
    protocol: describeProtocolForOutput(market.protocol),
    poolAddressesProvider: market.poolAddressesProvider,
    pool: market.pool,
    fromBlock: fromBlock.toString(),
    toBlock: latestBlock.toString(),
    scannedUsers: candidateUsers.size,
    usersWithDebt: snapshots.length,
    riskyUsers: risky.length,
    liquidatableUsers: liquidatable.length,
    alertThreshold: options.alertThreshold,
    warnings: market.warnings,
    source: market.source,
    topRiskyUsers: risky.slice(0, options.limit).map((snapshot) => ({
      user: snapshot.user,
      healthFactor: formatHealthFactor(snapshot.healthFactor),
      totalDebtBase: snapshot.totalDebtBase.toString(),
      totalCollateralBase: snapshot.totalCollateralBase.toString(),
      currentLiquidationThreshold: snapshot.currentLiquidationThreshold.toString(),
      ltv: snapshot.ltv.toString(),
    })),
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("");
  console.log(`Chain: ${market.chainName} (${market.chainId})`);
  console.log(`Protocol: ${market.protocol.label}`);
  console.log(`PoolAddressesProvider: ${market.poolAddressesProvider}`);
  console.log(`Pool: ${market.pool}`);
  if (market.marketId) {
    console.log(`MarketId: ${market.marketId}`);
  }
  console.log(`Blocks: ${fromBlock} -> ${latestBlock}`);
  console.log(`Candidate users: ${candidateUsers.size}`);
  console.log(`Users with debt: ${snapshots.length}`);
  console.log(`Risky users (HF < ${options.alertThreshold}): ${risky.length}`);
  console.log(`Liquidatable users (HF < 1.0): ${liquidatable.length}`);

  if (market.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of market.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (risky.length === 0) {
    console.log("");
    console.log("No risky users found in the scanned window.");
    return;
  }

  console.log("");
  console.log("Top risky users:");
  console.log(renderTable(risky, options.limit));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
