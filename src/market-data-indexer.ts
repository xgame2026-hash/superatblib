import "./env.js";
import {
  beginMarketDataIndexRun,
  failMarketDataIndexRun,
  marketDataPool,
  readMarketDataCursor,
  writeMarketDataSnapshotToDatabase,
} from "./market-data-db.js";
import {
  latestOnchainMarketBlock,
  loadOnchainMarketSnapshot,
  scanOnchainMarketBlockRange,
  type OnchainSnapshot,
} from "./onchain-dashboard-provider.js";

type Args = {
  chain: string;
  period: "1" | "7" | "30";
  fromBlock?: number;
  toBlock?: number;
  maxBlocks: number;
  loop: boolean;
  intervalMs: number;
};

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) return inline.slice(name.length + 3);
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function optionalNumber(name: string): number | undefined {
  const value = Number(readArg(name));
  return Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function parseArgs(): Args {
  const chain = readArg("chain") ?? "ethereum";
  const periodValue = readArg("period") ?? "1";
  const period = ["1", "7", "30"].includes(periodValue)
    ? (periodValue as "1" | "7" | "30")
    : "1";
  const maxBlocks = optionalNumber("max-blocks") ?? 7200;
  const intervalMs = optionalNumber("interval-ms") ?? 60_000;
  return {
    chain,
    period,
    fromBlock: optionalNumber("from-block"),
    toBlock: optionalNumber("to-block"),
    maxBlocks: Math.max(1, maxBlocks),
    loop: hasFlag("loop"),
    intervalMs: Math.max(5_000, intervalMs),
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadNextSnapshot(args: Args): Promise<OnchainSnapshot | null> {
  if (args.fromBlock !== undefined || args.toBlock !== undefined) {
    const latestBlock = args.toBlock ?? await latestOnchainMarketBlock(args.chain);
    const fromBlock = args.fromBlock ?? Math.max(0, latestBlock - args.maxBlocks + 1);
    return scanOnchainMarketBlockRange({
      chainKey: args.chain,
      fromBlock,
      toBlock: latestBlock,
      period: args.period,
    });
  }

  const cursor = await readMarketDataCursor(args.chain);
  if (!cursor?.toBlock) {
    return loadOnchainMarketSnapshot(args.chain, args.period);
  }

  const latestBlock = await latestOnchainMarketBlock(args.chain);
  const fromBlock = cursor.toBlock + 1;
  if (fromBlock > latestBlock) {
    return null;
  }
  const toBlock = Math.min(latestBlock, fromBlock + args.maxBlocks - 1);
  return scanOnchainMarketBlockRange({
    chainKey: args.chain,
    fromBlock,
    toBlock,
    period: args.period,
  });
}

async function runOnce(args: Args): Promise<Record<string, unknown>> {
  const snapshot = await loadNextSnapshot(args);
  if (!snapshot) {
    return {
      ok: true,
      chain: args.chain,
      indexed: false,
      reason: "already-current",
    };
  }
  const runId = await beginMarketDataIndexRun(args.chain, args.period);
  try {
    await writeMarketDataSnapshotToDatabase(snapshot, runId);
    return {
      ok: true,
      chain: snapshot.chain.key,
      period: snapshot.period,
      indexed: true,
      fromBlock: snapshot.fromBlock,
      toBlock: snapshot.toBlock,
      flashloanRows: snapshot.flashloans.length,
      liquidationRows: snapshot.liquidations.length,
    };
  } catch (error) {
    await failMarketDataIndexRun(args.chain, runId, error);
    throw error;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  do {
    const result = await runOnce(args);
    console.log(JSON.stringify(result, null, 2));
    if (args.loop) {
      await sleep(args.intervalMs);
    }
  } while (args.loop);
  await marketDataPool().end();
}

main().catch(async (error) => {
  try {
    await marketDataPool().end();
  } catch {
    // Ignore close errors after a failed index run.
  }
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
