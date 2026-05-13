import "./env.js";
import {
  createPublicClient,
  formatUnits,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";

import {
  simulateBscTailAccounts,
  type BscTailAccountSimulation,
} from "./bsc-tail-simulate.js";

type BscTailProtocol = {
  key: string;
  label: string;
  comptroller: Address;
};

type Candidate = {
  user: Address;
  markets: Set<Address>;
};

export type BscTailRiskRow = {
  user: Address;
  status: "shortfall" | "near" | "healthy";
  liquidityUsd: string;
  shortfallUsd: string;
  markets: string[];
  simulation?: BscTailAccountSimulation;
};

export type BscTailScanTarget = {
  rank: number;
  marketKey: string;
  marketLabel: string;
  user: Address;
  healthFactor: string;
  liquidatable: boolean;
  state: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfitDisplay: string;
  roughNetProfitDisplay: string;
  repayAmountDisplay?: string;
  repaySymbol?: string;
  seizeAmountDisplay?: string;
  collateralAmountSymbol?: string;
  exitPathDisplay?: string;
  simulationReason?: string;
  selectionScoreDisplay: string;
  selectionMethod: string;
  source: "bsc-tail";
  raw: BscTailRiskRow;
};

export type BscTailScanSummary = {
  ok: true;
  protocol: string;
  comptroller: Address;
  fromBlock: string;
  toBlock: string;
  markets: number;
  candidates: number;
  nearLiquidityUsd: number;
  rows: BscTailRiskRow[];
  targets: BscTailScanTarget[];
};

const COMPTROLLER_ABI = parseAbi([
  "function getAllMarkets() view returns (address[])",
  "function getAccountLiquidity(address account) view returns (uint256, uint256, uint256)",
]);

const VTOKEN_ABI = parseAbi([
  "function symbol() view returns (string)",
  "event Borrow(address borrower, uint256 borrowAmount, uint256 accountBorrows, uint256 totalBorrows)",
]);

const BSC_TAIL_PROTOCOLS: Record<string, BscTailProtocol> = {
  venus: {
    key: "venus",
    label: "Venus Protocol",
    comptroller: "0xfD36E2c2a6789Db23113685031d7F16329158384",
  },
};

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function argFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function envNumber(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function resolveRpcUrl(): string {
  return (
    argValue("rpc") ||
    process.env.BNB_RPC_URL ||
    process.env.BSC_RPC_URL ||
    "https://bsc-dataseed.bnbchain.org/"
  );
}

function resolveProtocol(): BscTailProtocol {
  const key = (argValue("protocol") || process.env.BSC_TAIL_PROTOCOL || "venus").toLowerCase();
  const protocol = BSC_TAIL_PROTOCOLS[key];
  if (!protocol) {
    throw new Error(`Unsupported BSC tail protocol: ${key}`);
  }
  return protocol;
}

function shortAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function formatUsdMantissa(value: bigint): string {
  const formatted = formatUnits(value, 18);
  const numeric = Number(formatted);
  if (!Number.isFinite(numeric)) return formatted;
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: numeric >= 1000 ? 0 : 2,
  }).format(numeric);
}

function jsonBigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

function serializeSimulation(simulation: BscTailAccountSimulation): BscTailAccountSimulation {
  const payload = JSON.parse(JSON.stringify(simulation, jsonBigIntReplacer)) as BscTailAccountSimulation & {
    positionCount?: number;
  };
  payload.positionCount = simulation.positions.length;
  payload.positions = [];
  return payload;
}

async function readMarketSymbols(
  client: PublicClient,
  markets: Address[],
): Promise<Map<Address, string>> {
  const entries = await Promise.all(
    markets.map(async (market) => {
      try {
        const symbol = await client.readContract({
          address: market,
          abi: VTOKEN_ABI,
          functionName: "symbol",
        });
        return [market, String(symbol)] as const;
      } catch {
        return [market, shortAddress(market)] as const;
      }
    }),
  );
  return new Map(entries);
}

async function collectBorrowCandidates(params: {
  client: PublicClient;
  markets: Address[];
  fromBlock: bigint;
  toBlock: bigint;
  chunkSize: bigint;
}): Promise<Map<Address, Candidate>> {
  const candidates = new Map<Address, Candidate>();

  for (const market of params.markets) {
    let cursor = params.fromBlock;
    while (cursor <= params.toBlock) {
      const chunkTo = cursor + params.chunkSize - 1n > params.toBlock
        ? params.toBlock
        : cursor + params.chunkSize - 1n;
      const logs = await params.client.getLogs({
        address: market,
        event: VTOKEN_ABI[1],
        fromBlock: cursor,
        toBlock: chunkTo,
      });
      for (const log of logs) {
        const borrower = log.args.borrower;
        if (!borrower) continue;
        const existing = candidates.get(borrower) || { user: borrower, markets: new Set<Address>() };
        existing.markets.add(market);
        candidates.set(borrower, existing);
      }
      cursor = chunkTo + 1n;
    }
  }

  return candidates;
}

async function rankCandidates(params: {
  client: PublicClient;
  comptroller: Address;
  candidates: Candidate[];
  marketSymbols: Map<Address, string>;
  nearLiquidityUsd: number;
}): Promise<BscTailRiskRow[]> {
  const nearThreshold = BigInt(Math.floor(params.nearLiquidityUsd * 1e6)) * 10n ** 12n;
  const rows = await Promise.all(
    params.candidates.map(async (candidate) => {
      const result = await params.client.readContract({
        address: params.comptroller,
        abi: COMPTROLLER_ABI,
        functionName: "getAccountLiquidity",
        args: [candidate.user],
      }) as readonly [bigint, bigint, bigint];
      const [, liquidity, shortfall] = result;
      const status: BscTailRiskRow["status"] =
        shortfall > 0n ? "shortfall" : liquidity <= nearThreshold ? "near" : "healthy";
      return {
        user: candidate.user,
        status,
        liquidityUsd: formatUsdMantissa(liquidity),
        shortfallUsd: formatUsdMantissa(shortfall),
        markets: Array.from(candidate.markets).map((market) =>
          params.marketSymbols.get(market) || shortAddress(market),
        ),
      };
    }),
  );

  const score = (row: BscTailRiskRow): number => {
    if (row.status === "shortfall") return 0;
    if (row.status === "near") return 1;
    return 2;
  };

  return rows.sort((left, right) => {
    const statusDiff = score(left) - score(right);
    if (statusDiff !== 0) return statusDiff;
    return Number(left.liquidityUsd.replace(/,/g, "")) - Number(right.liquidityUsd.replace(/,/g, ""));
  });
}

function rowsToTargets(rows: BscTailRiskRow[]): BscTailScanTarget[] {
  return rows.map((row, index) => {
    const route = row.simulation?.route;
    return {
      rank: index + 1,
      marketKey: "venus-bnb",
      marketLabel: "Venus / BNB Chain",
      user: row.user,
      healthFactor: row.status === "shortfall" ? "0.999" : "--",
      liquidatable: row.status === "shortfall",
      state: row.status === "shortfall" ? "可清算" : row.status === "near" ? "逼近清算" : "观察",
      debtSymbol: route?.repaySymbol || "--",
      collateralSymbol: route?.collateralSymbol || "--",
      grossProfitDisplay: route?.grossProfitUsd || "--",
      roughNetProfitDisplay: route?.netProfitUsd || "--",
      repayAmountDisplay: route ? `${route.repayAmount} ${route.repaySymbol}` : undefined,
      repaySymbol: route?.repaySymbol,
      seizeAmountDisplay: route ? `${route.seizeAmount} ${route.collateralSymbol}` : undefined,
      collateralAmountSymbol: route?.collateralSymbol,
      exitPathDisplay: route?.exitPath,
      simulationReason: route?.reason,
      selectionScoreDisplay: route
        ? `${route.netProfitUsd} net via ${route.exitPath}`
        : row.status === "shortfall"
          ? `Shortfall ${row.shortfallUsd}`
          : `Liquidity ${row.liquidityUsd}`,
      selectionMethod: route ? "bsc-tail-simulation" : "bsc-tail-borrow-event",
      source: "bsc-tail",
      raw: row,
    };
  });
}

export async function scanBscTailProtocol(params: {
  rpcUrl?: string;
  protocolKey?: string;
  lookbackBlocks?: number;
  chunkSize?: number;
  limit?: number;
  nearLiquidityUsd?: number;
} = {}): Promise<BscTailScanSummary> {
  const protocol = params.protocolKey
    ? BSC_TAIL_PROTOCOLS[params.protocolKey.toLowerCase()]
    : resolveProtocol();
  if (!protocol) {
    throw new Error(`Unsupported BSC tail protocol: ${params.protocolKey}`);
  }
  const rpcUrl = params.rpcUrl || resolveRpcUrl();
  const lookbackBlocks = BigInt(params.lookbackBlocks ?? Number(argValue("blocks") || envNumber("BSC_TAIL_SCAN_BLOCKS", 7200)));
  const chunkSize = BigInt(params.chunkSize ?? Number(argValue("chunk") || envNumber("BSC_TAIL_SCAN_CHUNK", 800)));
  const limit = params.limit ?? Number(argValue("limit") || envNumber("BSC_TAIL_SCAN_LIMIT", 25));
  const nearLiquidityUsd = params.nearLiquidityUsd ?? Number(argValue("near-usd") || envNumber("BSC_TAIL_NEAR_USD", 5000));
  const client = createPublicClient({ transport: http(rpcUrl) });
  const latestBlock = await client.getBlockNumber();
  const fromBlock = latestBlock > lookbackBlocks ? latestBlock - lookbackBlocks : 0n;
  const markets = await client.readContract({
    address: protocol.comptroller,
    abi: COMPTROLLER_ABI,
    functionName: "getAllMarkets",
  }) as Address[];
  const marketSymbols = await readMarketSymbols(client, markets);

  const candidates = await collectBorrowCandidates({
    client,
    markets,
    fromBlock,
    toBlock: latestBlock,
    chunkSize,
  });
  const ranked = await rankCandidates({
    client,
    comptroller: protocol.comptroller,
    candidates: Array.from(candidates.values()),
    marketSymbols,
    nearLiquidityUsd,
  });
  const rows = ranked.slice(0, limit);
  if (rows.length > 0) {
    const simulations = await simulateBscTailAccounts({
      client,
      comptroller: protocol.comptroller,
      accounts: rows.map((row) => ({ user: row.user, status: row.status })),
      maxAccounts: limit,
    });
    const simulationByUser = new Map(simulations.map((simulation) => [
      simulation.user.toLowerCase(),
      simulation,
    ]));
    for (const row of rows) {
      const simulation = simulationByUser.get(row.user.toLowerCase());
      row.simulation = simulation ? serializeSimulation(simulation) : undefined;
    }
  }

  return {
    ok: true,
    protocol: protocol.label,
    comptroller: protocol.comptroller,
    fromBlock: fromBlock.toString(),
    toBlock: latestBlock.toString(),
    markets: markets.length,
    candidates: candidates.size,
    nearLiquidityUsd,
    rows,
    targets: rowsToTargets(rows),
  };
}

async function main(): Promise<void> {
  const summary = await scanBscTailProtocol();

  if (argFlag("json")) {
    console.log(JSON.stringify(summary, jsonBigIntReplacer, 2));
    return;
  }

  console.log(`Protocol: ${summary.protocol}`);
  console.log(`Comptroller: ${summary.comptroller}`);
  console.log(`Blocks: ${summary.fromBlock} -> ${summary.toBlock}`);
  console.log(`Markets: ${summary.markets}`);
  console.log(`Borrow candidates: ${summary.candidates}`);
  console.log("");
  console.log(["Status".padEnd(10), "Liquidity".padEnd(14), "Shortfall".padEnd(14), "User".padEnd(44), "Markets"].join(" "));
  for (const row of summary.rows) {
    console.log([
      row.status.padEnd(10),
      row.liquidityUsd.padEnd(14),
      row.shortfallUsd.padEnd(14),
      row.user.padEnd(44),
      row.markets.join(", "),
    ].join(" "));
  }
}

if (process.argv[1] && process.argv[1].endsWith("bsc-tail-scan.ts")) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
