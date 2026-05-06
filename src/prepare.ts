import {
  Address,
  createPublicClient,
  http,
} from "viem";

import { loadCliOptions } from "./config.js";
import {
  PreparedExecution,
  buildPreparedExecution,
  buildPreparedExecutionCandidates,
  hasFlag,
  readArg,
} from "./execution-plan.js";

function toSerializablePreparedExecution(result: PreparedExecution) {
  return {
    ...result,
    approve: {
      ...result.approve,
      amount: result.approve.amount.toString(),
    },
    liquidationCall: {
      ...result.liquidationCall,
      debtToCover: result.liquidationCall.debtToCover.toString(),
      expectedCollateralToReceive:
        result.liquidationCall.expectedCollateralToReceive.toString(),
      expectedGrossProfitBase:
        result.liquidationCall.expectedGrossProfitBase.toString(),
    },
  };
}

async function main(): Promise<void> {
  const options = loadCliOptions();
  const targetUser = readArg("user") as Address | undefined;
  const allowRisky = hasFlag("allowRisky");
  const receiveAToken = hasFlag("receiveAToken");
  const client = createPublicClient({
    transport: http(options.rpcUrl),
  });

  const candidates = await buildPreparedExecutionCandidates(client, options, {
    targetUser,
    allowRisky,
    receiveAToken,
  });
  const result = candidates[0] ?? (await buildPreparedExecution(client, options, {
    targetUser,
    allowRisky,
    receiveAToken,
  }));

  console.log(
    JSON.stringify(
      {
        selected: toSerializablePreparedExecution(result),
        candidates: candidates.map(toSerializablePreparedExecution),
      },
      (_key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
