import { spawn } from "node:child_process";
import path from "node:path";

import {
  EXECUTION_MARKET_PRESETS,
  type ChainPreset,
  type ExecutionMarketPreset,
} from "./config.js";
import { resolveConfiguredLiquidatorContract } from "./dashboard-settings.js";
import {
  normalizeExecutionMarketKey,
} from "./liquidation/strategies.js";
import {
  defaultExecutionLimit,
  defaultExecutionLookbackBlocks,
  defaultExecutionMinNetProfit,
} from "./liquidation/tuning.js";

export type CliAction =
  | "scan"
  | "analyze"
  | "analyze-morpho-blue"
  | "check-morpho-executor"
  | "execute-liquidator"
  | "run-liquidator"
  | "run-self-funded";

export type CliRunRequest = {
  action?: unknown;
  chain?: unknown;
  market?: unknown;
  marketId?: unknown;
  kind?: unknown;
  venues?: unknown;
  token?: unknown;
  rpcUrl?: unknown;
  addressProvider?: unknown;
  lookbackBlocks?: unknown;
  limit?: unknown;
  allowRisky?: unknown;
  autoSwap?: unknown;
  broadcast?: unknown;
  distributeProfit?: unknown;
  deploy?: unknown;
  minNetProfit?: unknown;
  user?: unknown;
  contract?: unknown;
  hfMax?: unknown;
  refresh?: unknown;
};

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parsePositiveInteger(
  value: unknown,
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

function truthy(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value !== "string") {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function normalizeChainKey(value: unknown): ChainPreset["key"] {
  if (typeof value !== "string") {
    return "ethereum";
  }

  const normalized = value.trim().toLowerCase();
  const preset = Object.values(EXECUTION_MARKET_PRESETS).find((item) => item.chain === normalized);
  if (normalized === "ethereum" || normalized === "polygon" || normalized === "arbitrum" || normalized === "bnb") {
    return normalized as ChainPreset["key"];
  }
  if (preset) {
    return preset.chain;
  }
  throw new Error(`Unsupported chain: ${value}`);
}

function sanitizeCommandJson(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeCommandJson);
  }

  const object = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(object)) {
    if (key === "swapCalldata" && typeof item === "string") {
      next[key] = "[omitted]";
      continue;
    }
    next[key] = sanitizeCommandJson(item);
  }
  return next;
}

function parseJsonFromStdout(stdout: string): unknown {
  const trimmed = stdout.trim();
  if (!trimmed) {
    return undefined;
  }

  try {
    return sanitizeCommandJson(JSON.parse(trimmed));
  } catch {
    const arrayStart = trimmed.indexOf("[");
    const arrayEnd = trimmed.lastIndexOf("]");
    if (arrayStart >= 0 && arrayEnd > arrayStart) {
      try {
        return sanitizeCommandJson(JSON.parse(trimmed.slice(arrayStart, arrayEnd + 1)));
      } catch {
        // fall through
      }
    }

    const objectStart = trimmed.indexOf("{");
    const objectEnd = trimmed.lastIndexOf("}");
    if (objectStart >= 0 && objectEnd > objectStart) {
      try {
        return sanitizeCommandJson(JSON.parse(trimmed.slice(objectStart, objectEnd + 1)));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

function resolveActionFile(action: CliAction): string {
  switch (action) {
    case "scan":
      return "src/scan.ts";
    case "analyze":
      return "src/analyze.ts";
    case "analyze-morpho-blue":
      return "src/analyze-morpho-blue.ts";
    case "check-morpho-executor":
      return "src/check-morpho-executor.ts";
    case "execute-liquidator":
      return "src/execute-liquidator.ts";
    case "run-liquidator":
      return "src/run-liquidator.ts";
    case "run-self-funded":
      return "src/run-self-funded.ts";
  }
}

export function buildCliActionSpec(payload: CliRunRequest): {
  action: CliAction;
  chain: ChainPreset["key"];
  market: ExecutionMarketPreset["key"];
  tsxPath: string;
  args: string[];
  env: NodeJS.ProcessEnv;
} {
  const action = parseOptionalString(payload.action) as CliAction | undefined;
  if (
    action !== "scan" &&
    action !== "analyze" &&
    action !== "analyze-morpho-blue" &&
    action !== "check-morpho-executor" &&
    action !== "execute-liquidator" &&
    action !== "run-liquidator" &&
    action !== "run-self-funded"
  ) {
    throw new Error("Unsupported action.");
  }

  const market =
    action === "check-morpho-executor"
      ? "aave-v3-ethereum"
      : normalizeExecutionMarketKey(payload.market);
  const marketPreset = EXECUTION_MARKET_PRESETS[market];
  const chain =
    action === "check-morpho-executor"
      ? normalizeChainKey(payload.chain ?? "ethereum")
      : normalizeChainKey(payload.chain ?? marketPreset.chain);
  const tuningChain = chain;
  const tuningMarket = market;
  const lookbackBlocks = parsePositiveInteger(
    payload.lookbackBlocks,
    defaultExecutionLookbackBlocks(tuningChain, tuningMarket),
    1,
    5_000_000,
  );
  const limit = parsePositiveInteger(
    payload.limit,
    defaultExecutionLimit(tuningChain, tuningMarket),
    1,
    100,
  );
  const minNetProfit =
    parseOptionalString(payload.minNetProfit) ??
    defaultExecutionMinNetProfit(tuningChain, tuningMarket);
  const rpcUrl = parseOptionalString(payload.rpcUrl);
  const addressProvider = parseOptionalString(payload.addressProvider);
  const marketId = parseOptionalString(payload.marketId);
  const kind = parseOptionalString(payload.kind);
  const user = parseOptionalString(payload.user);
  const contract = parseOptionalString(payload.contract);
  const hfMax = parseOptionalString(payload.hfMax);
  const allowRisky = truthy(payload.allowRisky);
  const autoSwap = truthy(payload.autoSwap);
  const broadcast = truthy(payload.broadcast);
  const distributeProfit = truthy(payload.distributeProfit);
  const deploy = truthy(payload.deploy);
  const refresh = truthy(payload.refresh);

  if (
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded") &&
    !broadcast
  ) {
    throw new Error("Dashboard real mode only: execution actions require broadcast=true.");
  }

  const args = [path.resolve(process.cwd(), resolveActionFile(action))];

  if (action === "analyze-morpho-blue") {
    args.push("--chain", chain);
    args.push("--limit", String(limit), "--json");
    if (marketId) {
      args.push("--marketId", marketId);
    }
    if (kind) {
      args.push("--kind", kind);
    }
    if (hfMax) {
      args.push("--hfMax", hfMax);
    }
    if (refresh) {
      args.push("--refresh");
    }
  } else if (action === "check-morpho-executor") {
    args.push("--chain", chain);
    if (marketId) {
      args.push("--marketId", marketId);
    }
    if (kind) {
      args.push("--kind", kind);
    }
    if (hfMax) {
      args.push("--hfMax", hfMax);
    }
    if (refresh) {
      args.push("--refresh");
    }
  } else {
    args.push(
      "--market",
      market,
      "--chain",
      chain,
      "--lookbackBlocks",
      String(lookbackBlocks),
      "--limit",
      String(limit),
    );
  }

  if (rpcUrl) {
    args.push("--rpcUrl", rpcUrl);
  }
  if (addressProvider) {
    args.push("--addressProvider", addressProvider);
  }
  if (action === "scan" || action === "analyze") {
    args.push("--json");
  }
  if (user && action !== "scan" && action !== "analyze-morpho-blue") {
    args.push("--user", user);
  }
  if (allowRisky && action !== "scan" && action !== "analyze-morpho-blue") {
    args.push("--allowRisky");
  }
  if (
    autoSwap &&
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded")
  ) {
    args.push("--autoSwap");
  }
  if (
    broadcast &&
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded")
  ) {
    args.push("--broadcast");
  }
  if (
    distributeProfit &&
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded")
  ) {
    args.push("--distributeProfit");
  }
  if (deploy && (action === "run-liquidator" || action === "run-self-funded")) {
    args.push("--deploy");
  }
  if (
    minNetProfit &&
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded")
  ) {
    args.push("--minNetProfit", minNetProfit);
  }

  const tsxPath = path.resolve(
    process.cwd(),
    "node_modules",
    ".bin",
    process.platform === "win32" ? "tsx.cmd" : "tsx",
  );

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    FORCE_COLOR: "0",
    NO_COLOR: "1",
    MARKET: market,
  };
  if (
    contract &&
    (action === "execute-liquidator" ||
      action === "run-liquidator" ||
      action === "run-self-funded")
  ) {
    env.LIQUIDATOR_CONTRACT = contract;
  } else if (
    action === "execute-liquidator" ||
    action === "run-liquidator" ||
    action === "run-self-funded"
  ) {
    const configuredContract = resolveConfiguredLiquidatorContract(
      chain,
      undefined,
      market,
    );
    if (configuredContract) {
      env.LIQUIDATOR_CONTRACT = configuredContract;
    }
  }

  return {
    action,
    chain,
    market,
    tsxPath,
    args,
    env,
  };
}

export async function executeCliAction(
  payload: CliRunRequest,
  hooks?: {
    onStdout?: (chunk: string) => void;
    onStderr?: (chunk: string) => void;
  },
): Promise<Record<string, unknown>> {
  const spec = buildCliActionSpec(payload);
  const startedAt = Date.now();
  const stdoutChunks: string[] = [];
  const stderrChunks: string[] = [];

  const result = await new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve, reject) => {
    const child = spawn(spec.tsxPath, spec.args, {
      cwd: process.cwd(),
      env: spec.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout.on("data", (chunk) => {
      const textChunk = String(chunk);
      stdoutChunks.push(textChunk);
      hooks?.onStdout?.(textChunk);
    });
    child.stderr.on("data", (chunk) => {
      const textChunk = String(chunk);
      stderrChunks.push(textChunk);
      hooks?.onStderr?.(textChunk);
    });
    child.on("error", reject);
    child.on("close", (code, signal) => resolve({ code, signal }));
  });

  const stdout = stdoutChunks.join("").trim();
  const stderr = stderrChunks.join("").trim();
  return {
    ok: result.code === 0,
    action: spec.action,
    chain: spec.chain,
    args: spec.args,
    durationMs: Date.now() - startedAt,
    exitCode: result.code,
    signal: result.signal,
    stdout,
    stderr,
    parsed: parseJsonFromStdout(stdout),
  };
}
