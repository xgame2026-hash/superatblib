import { executeCliAction } from "./cli-launcher.js";
import { CHAIN_PRESETS, type ChainPreset } from "./config.js";
import { readArg } from "./execution-plan.js";
import {
  defaultExecutionAlertThreshold,
  defaultExecutionLimit,
  defaultExecutionLookbackBlocks,
  defaultExecutionMinNetProfit,
} from "./liquidation/tuning.js";
import {
  inferExecutionChainForSelection,
  normalizeExecutionMarketSelectionKey,
  validateExecutionMarketSelectionChain,
} from "./liquidation/strategies.js";
import {
  streamLiquidationMonitor,
  type LiquidationExecutionRequest,
} from "./liquidation/monitor.js";

function normalizeChainKey(value: unknown) {
  if (typeof value !== "string") {
    return "ethereum" as const;
  }
  const normalized = value.trim().toLowerCase();
  const preset = Object.values(CHAIN_PRESETS).find((item) => item.key === normalized);
  if (!preset) {
    throw new Error(`Unsupported chain: ${value}`);
  }
  return preset.key;
}

function parsePositiveInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }
  const integer = Math.trunc(parsed);
  return Math.max(minimum, Math.min(maximum, integer));
}

function boolArg(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function resolveRpcUrl(chain: ChainPreset["key"]): string | undefined {
  const preset = Object.values(CHAIN_PRESETS).find((item) => item.key === chain);
  if (!preset) {
    return undefined;
  }
  if (chain === "ethereum") {
    return (
      process.env.CONTROL_RPC_URL ||
      process.env.ETHEREUM_RPC_URL ||
      process.env.RPC_URL ||
      "https://cloudflare-eth.com"
    );
  }
  return process.env[preset.defaultRpcEnv];
}

async function runLiquidatorSubprocess(
  request: LiquidationExecutionRequest,
  io: {
    onStdout: (chunk: string) => void;
    onStderr: (chunk: string) => void;
  },
): Promise<unknown> {
  return await executeCliAction(
    {
      action: request.action,
      chain: request.chain,
      market: request.market,
      rpcUrl: request.rpcUrl,
      lookbackBlocks: request.lookbackBlocks,
      limit: request.limit,
      allowRisky: request.allowRisky,
      autoSwap: request.autoSwap,
      broadcast: request.broadcast,
      minNetProfit: request.minNetProfit,
      user: request.user,
    },
    {
      onStdout: io.onStdout,
      onStderr: io.onStderr,
    },
  );
}

async function main(): Promise<void> {
  const marketSelection = normalizeExecutionMarketSelectionKey(
    readArg("market") ?? readArg("mode"),
  );
  const inferredChain = inferExecutionChainForSelection(marketSelection);
  const chain = normalizeChainKey(readArg("chain") ?? inferredChain);
  const tuningMarket = marketSelection === "auto-ethereum" ? undefined : marketSelection;
  validateExecutionMarketSelectionChain(marketSelection, chain);
  const rpcUrl = readArg("rpcUrl") ?? resolveRpcUrl(chain);
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for ${chain}.`);
  }

  const lookbackBlocks = BigInt(
    parsePositiveInteger(
      readArg("lookbackBlocks"),
      defaultExecutionLookbackBlocks(chain, tuningMarket),
      1,
      5_000_000,
    ),
  );
  const resumeFromBlock = readArg("resumeFromBlock")
    ? BigInt(parsePositiveInteger(readArg("resumeFromBlock"), 0, 0, Number.MAX_SAFE_INTEGER))
    : undefined;
  const resumeChunkStart = readArg("resumeChunkStart")
    ? BigInt(parsePositiveInteger(readArg("resumeChunkStart"), 0, 0, Number.MAX_SAFE_INTEGER))
    : undefined;
  const resumeChunkEnd = readArg("resumeChunkEnd")
    ? BigInt(parsePositiveInteger(readArg("resumeChunkEnd"), 0, 0, Number.MAX_SAFE_INTEGER))
    : undefined;
  const resumeUserOffset = parsePositiveInteger(
    readArg("resumeUserOffset"),
    0,
    0,
    1_000_000,
  );
  const hfMaxRaw = readArg("hfMax");
  const hfMax =
    hfMaxRaw && Number.isFinite(Number(hfMaxRaw))
      ? Number(hfMaxRaw)
      : defaultExecutionAlertThreshold(chain, tuningMarket);
  const limit = parsePositiveInteger(
    readArg("limit"),
    defaultExecutionLimit(chain, tuningMarket),
    1,
    100,
  );
  const allowRisky = boolArg("allowRisky");
  const autoSwap = boolArg("autoSwap");
  const broadcast = boolArg("broadcast");
  const minNetProfit =
    readArg("minNetProfit") ?? defaultExecutionMinNetProfit(chain, tuningMarket);
  const maxCyclesRaw = readArg("maxCycles");
  const maxCycles = maxCyclesRaw ? Number(maxCyclesRaw) : undefined;
  if (maxCycles !== undefined && !Number.isFinite(maxCycles)) {
    throw new Error(`Invalid maxCycles: ${maxCyclesRaw}`);
  }

  let heartbeats = 0;
  await streamLiquidationMonitor({
    chain,
    rpcUrl,
    marketSelection,
    lookbackBlocks,
    resumeFromBlock,
    resumeChunkStart,
    resumeChunkEnd,
    resumeUserOffset,
    hfMax,
    limit,
    allowRisky,
    autoSwap,
    broadcast,
    minNetProfit,
    isClosed: () => maxCycles !== undefined && heartbeats >= maxCycles,
    handlers: {
      onStdout: (chunk) => process.stdout.write(chunk),
      onStderr: (chunk) => process.stderr.write(chunk),
      onMeta: (meta) =>
        process.stdout.write(`${JSON.stringify({ type: "meta", data: meta })}\n`),
      onTargets: (rows) =>
        process.stdout.write(`${JSON.stringify({ type: "targets", data: rows })}\n`),
      onSelection: (selection) =>
        process.stdout.write(`${JSON.stringify({ type: "selection", data: selection })}\n`),
      onProgress: (progress) =>
        process.stdout.write(`${JSON.stringify({ type: "progress", ...progress })}\n`),
      onHeartbeat: (heartbeat) => {
        heartbeats += 1;
        process.stdout.write(`${JSON.stringify({ type: "heartbeat", ...heartbeat })}\n`);
      },
      onExecution: (execution) =>
        process.stdout.write(`${JSON.stringify({ type: "execution", data: execution })}\n`),
    },
    executeCandidate: broadcast ? runLiquidatorSubprocess : undefined,
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
