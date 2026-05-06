import "./env.js";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type HistoryEntry = {
  recordedAt: string;
  script: string;
  mode: "simulation" | "broadcast";
  chainId?: number;
  chainName?: string;
  marketId?: string;
  executionMarketKey?: string;
  executionMarketLabel?: string;
  selectedUser?: string;
  debtSymbol?: string;
  collateralSymbol?: string;
  outputToken?: string;
  estimatedNetProfitDisplay?: string;
  realizedNetProfitDisplay?: string;
  liquidatable?: boolean;
  broadcastResult?: {
    executeTxHash?: string;
    status?: string;
  };
  raw: unknown;
};

function readArg(name: string): string | undefined {
  const inline = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (inline) {
    return inline.slice(name.length + 3);
  }

  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index >= 0) {
    return process.argv[index + 1];
  }

  return undefined;
}

export function historyFilePath(): string {
  return path.resolve(
    process.cwd(),
    process.env.HISTORY_FILE ?? ".data/execution-history.jsonl",
  );
}

function ensureHistoryDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  if (!existsSync(directory)) {
    mkdirSync(directory, { recursive: true });
  }
}

export function appendExecutionHistory(
  script: string,
  report: Record<string, unknown>,
): void {
  const filePath = historyFilePath();
  ensureHistoryDirectory(filePath);

  const executeLiquidation =
    typeof report.executeLiquidation === "object" && report.executeLiquidation
      ? (report.executeLiquidation as Record<string, unknown>)
      : undefined;
  const profitCheck =
    typeof report.profitCheck === "object" && report.profitCheck
      ? (report.profitCheck as Record<string, unknown>)
      : undefined;
  const broadcastResult =
    typeof report.broadcastResult === "object" && report.broadcastResult
      ? (report.broadcastResult as Record<string, unknown>)
      : undefined;

  const entry: HistoryEntry = {
    recordedAt: new Date().toISOString(),
    script,
    mode: broadcastResult ? "broadcast" : "simulation",
    chainId:
      typeof report.chainId === "number"
        ? report.chainId
        : typeof report.chainId === "string"
          ? Number(report.chainId)
          : undefined,
    chainName:
      typeof report.chainName === "string" ? report.chainName : undefined,
    marketId: typeof report.marketId === "string" ? report.marketId : undefined,
    executionMarketKey:
      typeof report.executionMarketKey === "string"
        ? report.executionMarketKey
        : undefined,
    executionMarketLabel:
      typeof report.executionMarketLabel === "string"
        ? report.executionMarketLabel
        : undefined,
    selectedUser:
      typeof report.selectedUser === "string" ? report.selectedUser : undefined,
    debtSymbol:
      typeof executeLiquidation?.debtSymbol === "string"
        ? executeLiquidation.debtSymbol
        : undefined,
    collateralSymbol:
      typeof executeLiquidation?.collateralSymbol === "string"
        ? executeLiquidation.collateralSymbol
        : undefined,
    outputToken:
      typeof executeLiquidation?.swap === "object" && executeLiquidation.swap
        ? ((executeLiquidation.swap as Record<string, unknown>).outputToken as string | undefined)
        : undefined,
    estimatedNetProfitDisplay:
      typeof profitCheck?.estimatedNetProfitDisplay === "string"
        ? profitCheck.estimatedNetProfitDisplay
        : undefined,
    realizedNetProfitDisplay:
      typeof broadcastResult?.realizedProfit === "object" && broadcastResult.realizedProfit
        ? (((broadcastResult.realizedProfit as Record<string, unknown>)
            .realizedNetProfitDisplay as string | undefined) ??
          undefined)
        : undefined,
    liquidatable:
      typeof report.liquidatable === "boolean" ? report.liquidatable : undefined,
    broadcastResult: broadcastResult
      ? {
          executeTxHash:
            typeof broadcastResult.executeTxHash === "string"
              ? broadcastResult.executeTxHash
              : undefined,
          status:
            typeof broadcastResult.status === "string"
              ? broadcastResult.status
              : undefined,
        }
      : undefined,
    raw: report,
  };

  appendFileSync(filePath, `${JSON.stringify(entry)}\n`, "utf8");
}

export function loadHistory(): HistoryEntry[] {
  const filePath = historyFilePath();
  if (!existsSync(filePath)) {
    return [];
  }

  return readFileSync(filePath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HistoryEntry);
}

export function summarizeHistoryEntry(entry: HistoryEntry): Record<string, unknown> {
  return {
    recordedAt: entry.recordedAt,
    script: entry.script,
    mode: entry.mode,
    chainName: entry.chainName,
    executionMarketLabel: entry.executionMarketLabel,
    selectedUser: entry.selectedUser,
    pair:
      entry.debtSymbol && entry.collateralSymbol
        ? `${entry.debtSymbol} <- ${entry.collateralSymbol}`
        : undefined,
    estimatedNetProfitDisplay: entry.estimatedNetProfitDisplay,
    realizedNetProfitDisplay: entry.realizedNetProfitDisplay,
    txHash: entry.broadcastResult?.executeTxHash,
    status: entry.broadcastResult?.status,
  };
}

if (process.argv[1]?.endsWith("/history.ts")) {
  const limit = Number(readArg("limit") ?? process.env.HISTORY_LIMIT ?? "10");
  const entries = loadHistory();
  const recent = entries.slice(Math.max(0, entries.length - limit)).reverse();
  console.log(JSON.stringify(recent.map(summarizeHistoryEntry), null, 2));
}
