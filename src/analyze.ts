import {
  createPublicClient,
  http,
  zeroAddress,
} from "viem";

import { loadCliOptions } from "./config.js";
import { rankPreparedExecutionCandidates } from "./execution-plan.js";
import {
  collectCandidateUsers,
  loadAccountSnapshots,
  resolveMarket,
  sortRiskySnapshots,
} from "./market.js";
import {
  analyzeUsers,
  loadReserveMetadata,
  toSerializableUserAnalysis,
  UserAnalysis,
} from "./liquidation-analysis.js";
import { describeProtocolForOutput } from "./protocols.js";

type RankedUserAnalysis = UserAnalysis & {
  rank?: number;
  selection?: {
    method: string;
    scoreDisplay: string;
    roughNetProfitDisplay?: string;
  };
};

function renderUserSummary(user: RankedUserAnalysis): string {
  const lines = [
    `${typeof user.rank === "number" ? "#" + String(user.rank) + " " : ""}${user.shortUser} ${user.user}`,
    `  HF: ${user.healthFactor} | liquidatable: ${user.liquidatable} | eMode: ${user.userEMode}`,
  ];

  if (user.bestPair) {
    lines.push(
      `  Best pair: repay ${user.bestPair.debtSymbol} against ${user.bestPair.collateralSymbol} | gross profit ${user.bestPair.grossProfitDisplay}`,
    );
  }

  if (user.selection) {
    lines.push(
      `  Selection: ${user.selection.method} | score ${user.selection.scoreDisplay}${user.selection.roughNetProfitDisplay ? ` | rough net ${user.selection.roughNetProfitDisplay}` : ""}`,
    );
  }

  if (user.topDebtAssets.length > 0) {
    lines.push(
      `  Debt: ${user.topDebtAssets.map((item) => `${item.symbol} (${item.valueBase})`).join(", ")}`,
    );
  }

  if (user.topCollateralAssets.length > 0) {
    lines.push(
      `  Collateral: ${user.topCollateralAssets.map((item) => `${item.symbol} (${item.valueBase})`).join(", ")}`,
    );
  }

  return lines.join("\n");
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

  const reserveState = await loadReserveMetadata(
    client,
    market.poolAddressesProvider,
  );
  const selectedUsers = risky.slice(0, options.limit);
  const details = await analyzeUsers(
    client,
    market.pool,
    reserveState.dataProvider,
    reserveState.reserves,
    selectedUsers,
  );
  const rankedPrepared = await rankPreparedExecutionCandidates(
    client,
    market,
    {
      baseCurrency: reserveState.baseCurrency,
      baseCurrencyUnit: reserveState.baseCurrencyUnit,
      reserves: reserveState.reserves,
    },
    details,
    {
      allowRisky: true,
      receiveAToken: false,
    },
    options.fundingMode,
  );
  const rankingByUser = new Map(
    rankedPrepared.map((candidate, index) => [
      candidate.selectedUser.toLowerCase(),
      {
        rank: index + 1,
        selection: {
          method: candidate.selection.method,
          scoreDisplay: candidate.selection.scoreDisplay,
          roughNetProfitDisplay:
            candidate.liquidationCall.expectedNetProfitDisplay,
        },
      },
    ]),
  );
  const analyses: RankedUserAnalysis[] = details.map((detail) => {
    const serialized = toSerializableUserAnalysis(
      detail,
      reserveState.baseCurrency,
      reserveState.baseCurrencyUnit,
    );
    const ranking = rankingByUser.get(serialized.user.toLowerCase());
    return {
      ...serialized,
      rank: ranking?.rank,
      selection: ranking?.selection,
    };
  });

  const summary = {
    chainId: market.chainId,
    chainName: market.chainName,
    marketId: market.marketId,
    protocol: describeProtocolForOutput(market.protocol),
    baseCurrency:
      reserveState.baseCurrency === zeroAddress ? "USD" : reserveState.baseCurrency,
    baseCurrencyUnit: reserveState.baseCurrencyUnit.toString(),
    fromBlock: fromBlock.toString(),
    toBlock: latestBlock.toString(),
    scannedUsers: candidateUsers.size,
    usersWithDebt: snapshots.length,
    riskyUsers: risky.length,
    liquidatableUsers: liquidatable.length,
    analyzedUsers: analyses.length,
    warnings: market.warnings,
    users: analyses,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  console.log("");
  console.log(`Chain: ${market.chainName} (${market.chainId})`);
  console.log(`Protocol: ${market.protocol.label}`);
  console.log(`Market: ${market.marketId ?? "unknown"}`);
  console.log(`Base currency: ${summary.baseCurrency} unit ${summary.baseCurrencyUnit}`);
  console.log(`Blocks: ${fromBlock} -> ${latestBlock}`);
  console.log(`Risky users: ${risky.length}`);
  console.log(`Liquidatable users: ${liquidatable.length}`);

  if (market.warnings.length > 0) {
    console.log("");
    console.log("Warnings:");
    for (const warning of market.warnings) {
      console.log(`- ${warning}`);
    }
  }

  if (analyses.length === 0) {
    console.log("");
    console.log("No risky users found in the scanned window.");
    return;
  }

  console.log("");
  console.log("Top analyzed users:");
    for (const analysis of analyses) {
      console.log(renderUserSummary(analysis));
    }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
