import {
  normalizeArbitrageModeKey,
  normalizeArbitrageTokenFilter,
  normalizeArbitrageVenueFilter,
} from "./arbitrage/strategies.js";
import { streamArbitrageMonitor } from "./arbitrage/monitor.js";
import { readArg } from "./execution-plan.js";

async function main(): Promise<void> {
  const mode = normalizeArbitrageModeKey(readArg("market") ?? readArg("mode"));
  const tokenFilter = normalizeArbitrageTokenFilter(readArg("token"));
  const exchanges = normalizeArbitrageVenueFilter(readArg("venues"));
  const loopDelayRaw = readArg("loopDelayMs");
  const maxCyclesRaw = readArg("maxCycles");
  const loopDelayMs = loopDelayRaw ? Number(loopDelayRaw) : undefined;
  const maxCycles = maxCyclesRaw ? Number(maxCyclesRaw) : undefined;
  if (loopDelayMs !== undefined && !Number.isFinite(loopDelayMs)) {
    throw new Error(`Invalid loopDelayMs: ${loopDelayRaw}`);
  }
  if (maxCycles !== undefined && !Number.isFinite(maxCycles)) {
    throw new Error(`Invalid maxCycles: ${maxCyclesRaw}`);
  }

  let cyclesSeen = 0;
  await streamArbitrageMonitor({
    mode,
    tokenFilter,
    exchanges,
    loopDelayMs,
    isClosed: () => maxCycles !== undefined && cyclesSeen >= maxCycles,
    handlers: {
      onStdout: (chunk) => {
        process.stdout.write(chunk);
        if (chunk.startsWith("\n$ cycle ") || chunk.startsWith("$ cycle ")) {
          cyclesSeen += 1;
        }
      },
      onSelection: (selection) => {
        process.stdout.write(`${JSON.stringify({ type: "selection", data: selection })}\n`);
      },
      onResult: (result) => {
        process.stdout.write(`${JSON.stringify({ type: "result", data: result })}\n`);
      },
      onMeta: (meta) => {
        process.stdout.write(`${JSON.stringify({ type: "meta", data: meta })}\n`);
      },
    },
  });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
