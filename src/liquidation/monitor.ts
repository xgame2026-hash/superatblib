import {
  createPublicClient,
  getAddress,
  http,
  isAddress,
  type PublicClient,
} from "viem";

import { poolEvents } from "../abi.js";
import {
  CHAIN_PRESETS,
  type ChainPreset,
  type ExecutionMarketPreset,
} from "../config.js";
import { rankPreparedExecutionCandidates } from "../execution-plan.js";
import {
  analyzeUsers,
  loadReserveMetadata,
  toSerializableUserAnalysis,
} from "../liquidation-analysis.js";
import {
  formatHealthFactor,
  LIQUIDATABLE_HEALTH_FACTOR,
  loadAccountSnapshots,
  resolveMarket,
  sortRiskySnapshots,
} from "../market.js";
import {
  executionMarketPresetsForSelection,
  executionMarketSelectionLabel,
  validateExecutionMarketSelectionChain,
  type ExecutionMarketSelectionKey,
} from "./strategies.js";
import {
  defaultExecutionChunkSize,
  defaultExecutionLookbackBlocks,
  defaultExecutionUserBatchSize,
} from "./tuning.js";

export type LiquidationMonitorTarget = {
  rank?: number;
  marketKey?: string;
  marketLabel?: string;
  user: string;
  pathLabel?: string;
  signalLabel?: string;
  healthFactor: string;
  liquidatable: boolean;
  state: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfitDisplay: string;
  roughNetProfitDisplay?: string;
  selectionScoreDisplay?: string;
  selectionMethod?: string;
  source: "scan" | "analyze";
};

export type LiquidationMonitorSelection = {
  cycle: number;
  candidateCount: number;
  marketKey?: string;
  marketLabel?: string;
  rank?: number;
  user: string;
  pathLabel?: string;
  signalLabel?: string;
  debtSymbol: string;
  collateralSymbol: string;
  grossProfitDisplay?: string;
  roughNetProfitDisplay?: string;
  selectionScoreDisplay?: string;
  selectionMethod?: string;
  healthFactor?: string;
  liquidatable?: boolean;
};

export type LiquidationExecutionRequest = {
  action: "run-liquidator";
  chain: ChainPreset["key"];
  market: ExecutionMarketPreset["key"];
  rpcUrl: string;
  lookbackBlocks: string;
  limit: string;
  allowRisky: boolean;
  autoSwap: boolean;
  broadcast: true;
  minNetProfit?: string;
  user: string;
};

export type LiquidationMonitorHandlers = {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
  onMeta?: (meta: {
    action: "auto-execute";
    chain: ChainPreset["key"];
    market: ExecutionMarketSelectionKey;
    marketLabel: string;
    rpcUrl: string;
    marketCount: number;
    resumeFromBlock?: string;
    resumeChunkStart?: string;
    resumeChunkEnd?: string;
    resumeUserOffset: string;
  }) => void;
  onTargets?: (rows: LiquidationMonitorTarget[]) => void;
  onSelection?: (selection: LiquidationMonitorSelection | null) => void;
  onProgress?: (payload: Record<string, unknown>) => void;
  onHeartbeat?: (payload: Record<string, unknown>) => void;
  onExecution?: (payload: unknown) => void;
};

function supportedChains(): ChainPreset[] {
  return Object.values(CHAIN_PRESETS).sort((a, b) => a.chainId - b.chainId);
}

export {
  defaultExecutionLookbackBlocks,
  executionMarketPresetsForSelection,
  executionMarketSelectionLabel,
  normalizeExecutionMarketKey,
  normalizeExecutionMarketSelectionKey,
  type ExecutionMarketSelectionKey,
} from "./strategies.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function addCandidateUser(target: Set<`0x${string}`>, value: unknown): void {
  if (typeof value === "string" && isAddress(value)) {
    target.add(getAddress(value));
  }
}

function statusTextFromHealthFactor(
  healthFactor: string,
  liquidatable: boolean,
): string {
  if (liquidatable) {
    return "可清算";
  }
  const numeric = Number(healthFactor);
  if (!Number.isFinite(numeric)) {
    return "--";
  }
  return numeric <= 1.05 ? "高风险" : "安全";
}

function parseDisplayNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return null;
  }
  const match = value.replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) {
    return null;
  }
  const parsed = Number(match[0]);
  return Number.isFinite(parsed) ? parsed : null;
}

function hasActionablePair(target: LiquidationMonitorTarget): boolean {
  return (
    target.source === "analyze" &&
    target.debtSymbol !== "--" &&
    target.collateralSymbol !== "--"
  );
}

function compareTargetsByExecutionPriority(
  left: LiquidationMonitorTarget,
  right: LiquidationMonitorTarget,
): number {
  const leftActionable = hasActionablePair(left);
  const rightActionable = hasActionablePair(right);
  if (leftActionable !== rightActionable) {
    return leftActionable ? -1 : 1;
  }

  if (left.liquidatable !== right.liquidatable) {
    return left.liquidatable ? -1 : 1;
  }

  const leftNet = parseDisplayNumber(left.roughNetProfitDisplay);
  const rightNet = parseDisplayNumber(right.roughNetProfitDisplay);
  const leftPositive = leftNet !== null && leftNet > 0;
  const rightPositive = rightNet !== null && rightNet > 0;
  if (leftPositive !== rightPositive) {
    return leftPositive ? -1 : 1;
  }

  const leftHf = parseDisplayNumber(left.healthFactor);
  const rightHf = parseDisplayNumber(right.healthFactor);
  if (leftHf !== null || rightHf !== null) {
    if (leftHf === null) return 1;
    if (rightHf === null) return -1;
    if (leftHf !== rightHf) {
      return leftHf - rightHf;
    }
  }

  if (leftNet !== null || rightNet !== null) {
    if (leftNet === null) return 1;
    if (rightNet === null) return -1;
    if (leftNet !== rightNet) {
      return rightNet - leftNet;
    }
  }

  const leftGross = parseDisplayNumber(left.grossProfitDisplay);
  const rightGross = parseDisplayNumber(right.grossProfitDisplay);
  if (leftGross !== null || rightGross !== null) {
    if (leftGross === null) return 1;
    if (rightGross === null) return -1;
    if (leftGross !== rightGross) {
      return rightGross - leftGross;
    }
  }

  if (
    typeof left.rank === "number" &&
    typeof right.rank === "number" &&
    left.rank !== right.rank
  ) {
    return left.rank - right.rank;
  }
  if (typeof left.rank === "number") {
    return -1;
  }
  if (typeof right.rank === "number") {
    return 1;
  }

  return String(left.user || "").localeCompare(String(right.user || ""));
}

type ReserveMetadataState = Awaited<ReturnType<typeof loadReserveMetadata>>;

type MarketCycleRanking = {
  scoreBase: bigint;
  selectionScoreDisplay: string;
  selectionMethod: string;
  roughNetProfitDisplay: string;
};

type MarketMonitorState = {
  seen: Map<string, LiquidationMonitorTarget>;
  currentSelection: LiquidationMonitorSelection | null;
  resumeFromBlock?: bigint;
  resumeChunkStart?: bigint;
  resumeChunkEnd?: bigint;
  resumeUserOffset: number;
  reserveMetadata: ReserveMetadataState | null;
  reserveMetadataRetryAt?: number;
  market?: Awaited<ReturnType<typeof resolveMarket>>;
  cycleRankings: Map<string, MarketCycleRanking>;
};

function createMarketMonitorState(initial?: {
  resumeFromBlock?: bigint;
  resumeChunkStart?: bigint;
  resumeChunkEnd?: bigint;
  resumeUserOffset?: number;
}): MarketMonitorState {
  return {
    seen: new Map<string, LiquidationMonitorTarget>(),
    currentSelection: null,
    resumeFromBlock: initial?.resumeFromBlock,
    resumeChunkStart: initial?.resumeChunkStart,
    resumeChunkEnd: initial?.resumeChunkEnd,
    resumeUserOffset: initial?.resumeUserOffset ?? 0,
    reserveMetadata: null,
    reserveMetadataRetryAt: undefined,
    market: undefined,
    cycleRankings: new Map<string, MarketCycleRanking>(),
  };
}

function sortTargetRows(state: MarketMonitorState): LiquidationMonitorTarget[] {
  return Array.from(state.seen.values()).sort(compareTargetsByExecutionPriority);
}

function emitTargetsForState(
  handlers: LiquidationMonitorHandlers | undefined,
  state: MarketMonitorState,
): void {
  handlers?.onTargets?.(sortTargetRows(state));
}

function updateTargetRow(
  state: MarketMonitorState,
  row: LiquidationMonitorTarget,
): boolean {
  const key = row.user.toLowerCase();
  const previous = state.seen.get(key);
  const nextFingerprint = JSON.stringify(row);
  if (previous && JSON.stringify(previous) === nextFingerprint) {
    return false;
  }
  state.seen.set(key, row);
  return true;
}

function upsertTargets(
  handlers: LiquidationMonitorHandlers | undefined,
  state: MarketMonitorState,
  rows: LiquidationMonitorTarget[],
): boolean {
  let changed = false;
  for (const row of rows) {
    changed = updateTargetRow(state, row) || changed;
  }
  if (changed) {
    emitTargetsForState(handlers, state);
  }
  return changed;
}

function applyCycleRanks(
  handlers: LiquidationMonitorHandlers | undefined,
  state: MarketMonitorState,
): boolean {
  const rankByUser = new Map<string, number>();
  Array.from(state.cycleRankings.entries())
    .sort((left, right) => {
      if (left[1].scoreBase === right[1].scoreBase) {
        return left[0].localeCompare(right[0]);
      }
      return left[1].scoreBase > right[1].scoreBase ? -1 : 1;
    })
    .forEach(([user], index) => {
      rankByUser.set(user, index + 1);
    });

  let changed = false;
  for (const [user, row] of state.seen.entries()) {
    const ranking = state.cycleRankings.get(user);
    const nextRow = ranking
      ? {
          ...row,
          rank: rankByUser.get(user),
          selectionScoreDisplay: ranking.selectionScoreDisplay,
          selectionMethod: ranking.selectionMethod,
          roughNetProfitDisplay: ranking.roughNetProfitDisplay,
        }
      : {
          ...row,
          rank: undefined,
          selectionScoreDisplay:
            row.selectionScoreDisplay === undefined ? undefined : "--",
          selectionMethod: row.selectionMethod === undefined ? undefined : "--",
        };
    changed = updateTargetRow(state, nextRow) || changed;
  }

  if (changed) {
    emitTargetsForState(handlers, state);
  }
  return changed;
}

function selectionFromState(
  state: MarketMonitorState,
  cycle: number,
): LiquidationMonitorSelection | null {
  const preferred = sortTargetRows(state)[0];
  if (!preferred) {
    return null;
  }
  return {
    cycle,
    candidateCount: state.cycleRankings.size,
    marketKey: preferred.marketKey,
    marketLabel: preferred.marketLabel,
    rank: preferred.rank,
    user: preferred.user,
    pathLabel: preferred.pathLabel,
    signalLabel: preferred.signalLabel,
    debtSymbol: preferred.debtSymbol,
    collateralSymbol: preferred.collateralSymbol,
    grossProfitDisplay: preferred.grossProfitDisplay,
    roughNetProfitDisplay: preferred.roughNetProfitDisplay,
    selectionScoreDisplay: preferred.selectionScoreDisplay,
    selectionMethod: preferred.selectionMethod,
    healthFactor: preferred.healthFactor,
    liquidatable: preferred.liquidatable,
  };
}

function resetCycleState(
  handlers: LiquidationMonitorHandlers | undefined,
  state: MarketMonitorState,
): void {
  state.cycleRankings.clear();
  state.currentSelection = null;
  applyCycleRanks(handlers, state);
}

function setResumeCursor(
  state: MarketMonitorState,
  cursor: {
    resumeFromBlock?: bigint;
    resumeChunkStart?: bigint;
    resumeChunkEnd?: bigint;
    resumeUserOffset?: number;
  },
): void {
  state.resumeFromBlock = cursor.resumeFromBlock;
  state.resumeChunkStart = cursor.resumeChunkStart;
  state.resumeChunkEnd = cursor.resumeChunkEnd;
  state.resumeUserOffset = cursor.resumeUserOffset ?? 0;
}

export async function streamLiquidationMonitor(params: {
  chain: ChainPreset["key"];
  rpcUrl: string;
  marketSelection: ExecutionMarketSelectionKey;
  lookbackBlocks: bigint;
  resumeFromBlock?: bigint;
  resumeChunkStart?: bigint;
  resumeChunkEnd?: bigint;
  resumeUserOffset?: number;
  hfMax: number;
  limit: number;
  allowRisky: boolean;
  autoSwap: boolean;
  broadcast: boolean;
  minNetProfit?: string;
  isClosed?: () => boolean;
  handlers?: LiquidationMonitorHandlers;
  executeCandidate?: (
    request: LiquidationExecutionRequest,
    io: {
      onStdout: (chunk: string) => void;
      onStderr: (chunk: string) => void;
    },
  ) => Promise<unknown>;
}): Promise<void> {
  const isClosed = params.isClosed ?? (() => false);
  const handlers = params.handlers;
  const selectedMarkets = executionMarketPresetsForSelection(params.marketSelection);
  const preset = supportedChains().find((item) => item.key === params.chain);
  if (!preset) {
    throw new Error(`Unsupported chain preset: ${params.chain}`);
  }
  validateExecutionMarketSelectionChain(params.marketSelection, params.chain);

  const client = createPublicClient({
    transport: http(params.rpcUrl),
  });
  handlers?.onStdout?.("$ 初始化执行器...\n");
  handlers?.onStdout?.(`$ 连接 ${params.chain} RPC...\n`);
  handlers?.onMeta?.({
    action: "auto-execute",
    chain: params.chain,
    market: params.marketSelection,
    marketLabel: executionMarketSelectionLabel(params.marketSelection),
    rpcUrl: params.rpcUrl,
    marketCount: selectedMarkets.length,
    resumeFromBlock: params.resumeFromBlock?.toString(),
    resumeChunkStart: params.resumeChunkStart?.toString(),
    resumeChunkEnd: params.resumeChunkEnd?.toString(),
    resumeUserOffset: String(params.resumeUserOffset ?? 0),
  });
  handlers?.onTargets?.([]);

  let cycle = 0;
  let activeMarketPreset: ExecutionMarketPreset | null = null;
  let activeState: MarketMonitorState | null = null;
  let lastSelectionFingerprint: string | undefined;
  const recentExecutionAttempts = new Map<string, number>();
  const blockTimeoutMs = 15_000;
  const logTimeoutMs = 30_000;
  const snapshotTimeoutMs = 25_000;
  const analyzeTimeoutMs = 45_000;
  const reserveTimeoutMs = 20_000;
  const executionCooldownMs = 45_000;
  const reserveMetadataRetryMs = 30_000;
  const stateByMarket = new Map<ExecutionMarketPreset["key"], MarketMonitorState>();

  while (!isClosed()) {
    cycle += 1;
    const currentMarketPreset =
      selectedMarkets[(cycle - 1) % selectedMarkets.length] ?? selectedMarkets[0];
    const marketState =
      stateByMarket.get(currentMarketPreset.key) ??
      createMarketMonitorState(
        currentMarketPreset.key === selectedMarkets[0]?.key
          ? {
              resumeFromBlock: params.resumeFromBlock,
              resumeChunkStart: params.resumeChunkStart,
              resumeChunkEnd: params.resumeChunkEnd,
              resumeUserOffset: params.resumeUserOffset,
            }
          : undefined,
      );
    stateByMarket.set(currentMarketPreset.key, marketState);
    if (!marketState.market) {
      marketState.market = await resolveMarket(
        client,
        preset,
        currentMarketPreset,
        undefined,
      );
    }

    if (!activeMarketPreset || activeMarketPreset.key !== currentMarketPreset.key) {
      activeMarketPreset = currentMarketPreset;
      activeState = marketState;
      lastSelectionFingerprint = undefined;
      emitTargetsForState(handlers, marketState);
      handlers?.onSelection?.(marketState.currentSelection);
      handlers?.onStdout?.(
        `$ 切换市场 ${currentMarketPreset.label} / 协议池 ${marketState.market.pool}\n`,
      );
    }

    resetCycleState(handlers, marketState);
    if (activeState === marketState) {
      lastSelectionFingerprint = undefined;
      handlers?.onSelection?.(null);
    }

    const market = marketState.market;
    if (!market) {
      throw new Error("Failed to resolve active execution market.");
    }
    const chunkSize = BigInt(
      defaultExecutionChunkSize(params.chain, currentMarketPreset.key),
    );
    const userBatchSize = defaultExecutionUserBatchSize(
      params.chain,
      currentMarketPreset.key,
    );
    handlers?.onStdout?.(`\n$ cycle ${cycle}\n`);

    let latestBlock: bigint;
    try {
      latestBlock = await withTimeout(
        client.getBlockNumber(),
        blockTimeoutMs,
        "getBlockNumber",
      );
    } catch (error) {
      handlers?.onStderr?.(
        `$ 获取最新区块失败，跳过本轮: ${error instanceof Error ? error.message : String(error)}\n`,
      );
      await sleep(3_000);
      continue;
    }
    const fromBlock = marketState.resumeChunkStart !== undefined
      ? marketState.resumeChunkStart
      : marketState.resumeFromBlock !== undefined
        ? marketState.resumeFromBlock
        : latestBlock > params.lookbackBlocks
          ? latestBlock - params.lookbackBlocks + 1n
          : 0n;
    handlers?.onStdout?.(`Scanning pool events: blocks ${fromBlock} -> ${latestBlock}\n`);
    const cycleUsers = new Set<`0x${string}`>();
    let discoveredCount = 0;
    let cycleInterrupted = false;

    for (let start = fromBlock; start <= latestBlock; start += chunkSize) {
      if (isClosed()) {
        return;
      }
      const end = minBigInt(start + chunkSize - 1n, latestBlock);
      handlers?.onStdout?.(`Scanning pool events: blocks ${start} -> ${end}\n`);

      let logs: Awaited<ReturnType<typeof client.getLogs>>;
      try {
        logs = await withTimeout(
          client.getLogs({
            address: market.pool,
            events: poolEvents,
            fromBlock: start,
            toBlock: end,
            strict: false,
          }),
          logTimeoutMs,
          `getLogs ${start}-${end}`,
        );
      } catch (error) {
        handlers?.onStderr?.(
          `$ 扫描区块 ${start} -> ${end} 超时，保留游标等待重试: ${error instanceof Error ? error.message : String(error)}\n`,
        );
        setResumeCursor(marketState, {
          resumeFromBlock: start,
          resumeChunkStart: start,
          resumeChunkEnd: end,
          resumeUserOffset: 0,
        });
        cycleInterrupted = true;
        break;
      }
      const chunkUsers = new Set<`0x${string}`>();
      for (const rawLog of logs) {
        const log = rawLog as {
          eventName?: string;
          args?: Record<string, unknown>;
        };
        switch (log.eventName) {
          case "Supply":
            addCandidateUser(chunkUsers, log.args?.onBehalfOf);
            addCandidateUser(chunkUsers, log.args?.user);
            break;
          case "Borrow":
            addCandidateUser(chunkUsers, log.args?.onBehalfOf);
            addCandidateUser(chunkUsers, log.args?.user);
            break;
          case "Withdraw":
            addCandidateUser(chunkUsers, log.args?.user);
            break;
          case "Repay":
            addCandidateUser(chunkUsers, log.args?.user);
            break;
          case "ReserveUsedAsCollateralEnabled":
          case "ReserveUsedAsCollateralDisabled":
          case "UserEModeSet":
          case "LiquidationCall":
            addCandidateUser(chunkUsers, log.args?.user);
            break;
          default:
            break;
        }
      }

      const newUsers = Array.from(chunkUsers).filter((user) => {
        if (cycleUsers.has(user)) {
          return false;
        }
        cycleUsers.add(user);
        return true;
      });
      if (!newUsers.length) {
        handlers?.onProgress?.({
          cycle,
          latestBlock: latestBlock.toString(),
          resumeFromBlock: (end + 1n).toString(),
          nextFromBlock: (end + 1n).toString(),
          resumeUserOffset: "0",
        });
        setResumeCursor(marketState, {
          resumeFromBlock: end + 1n,
          resumeChunkStart: undefined,
          resumeChunkEnd: undefined,
          resumeUserOffset: 0,
        });
        continue;
      }
      discoveredCount += newUsers.length;
      handlers?.onStdout?.(
        `Found ${newUsers.length} new candidate users. Total ${discoveredCount}.\n`,
      );

      const batchStartIndex = marketState.resumeChunkStart !== undefined &&
        marketState.resumeChunkEnd !== undefined &&
        start === marketState.resumeChunkStart &&
        end === marketState.resumeChunkEnd
          ? Math.max(0, Math.min(marketState.resumeUserOffset, newUsers.length))
          : 0;

      if (batchStartIndex > 0) {
        handlers?.onStdout?.(
          `Resuming user account data: ${batchStartIndex + 1} / ${newUsers.length}\n`,
        );
      }

      for (let index = batchStartIndex; index < newUsers.length; index += userBatchSize) {
        if (isClosed()) {
          return;
        }
        const batchUsers = newUsers.slice(index, index + userBatchSize);
        handlers?.onStdout?.(
          `Reading user account data: ${index + 1} -> ${Math.min(
            index + batchUsers.length,
            newUsers.length,
          )} / ${newUsers.length}\n`,
        );

        let snapshots: Awaited<ReturnType<typeof loadAccountSnapshots>>;
        try {
          snapshots = await withTimeout(
            loadAccountSnapshots(
              client,
              market.pool,
              batchUsers,
              userBatchSize,
            ),
            snapshotTimeoutMs,
            `loadAccountSnapshots ${index + 1}-${Math.min(
              index + batchUsers.length,
              newUsers.length,
            )}`,
          );
        } catch (error) {
          handlers?.onStderr?.(
            `$ 读取用户账户数据超时，保留游标等待重试: ${error instanceof Error ? error.message : String(error)}\n`,
          );
          setResumeCursor(marketState, {
            resumeFromBlock: start,
            resumeChunkStart: start,
            resumeChunkEnd: end,
            resumeUserOffset: index,
          });
          cycleInterrupted = true;
          break;
        }
        upsertTargets(handlers, marketState,
          snapshots.map((snapshot) => {
            const liquidatable =
              snapshot.healthFactor < LIQUIDATABLE_HEALTH_FACTOR;
            const displayHealthFactor = formatHealthFactor(snapshot.healthFactor);
            return {
              rank: undefined,
              marketKey: currentMarketPreset.key,
              marketLabel: currentMarketPreset.label,
              user: snapshot.user,
              healthFactor: displayHealthFactor,
              liquidatable,
              state: statusTextFromHealthFactor(
                displayHealthFactor,
                liquidatable,
              ),
              debtSymbol: "--",
              collateralSymbol: "--",
              grossProfitDisplay: "--",
              roughNetProfitDisplay: "--",
              selectionScoreDisplay: "--",
              selectionMethod: "--",
              source: "scan",
            } satisfies LiquidationMonitorTarget;
          }),
        );

        const riskyResult = sortRiskySnapshots(snapshots, params.hfMax);
        if (!riskyResult.risky.length) {
          continue;
        }

        if (!marketState.reserveMetadata) {
          if (
            marketState.reserveMetadataRetryAt !== undefined &&
            marketState.reserveMetadataRetryAt > Date.now()
          ) {
            handlers?.onStderr?.(
              `$ 储备元数据暂不可用，等待稍后重试当前批次\n`,
            );
            setResumeCursor(marketState, {
              resumeFromBlock: start,
              resumeChunkStart: start,
              resumeChunkEnd: end,
              resumeUserOffset: index,
            });
            cycleInterrupted = true;
            break;
          }
          handlers?.onStdout?.("$ 加载储备元数据...\n");
          try {
            marketState.reserveMetadata = await withTimeout(
              loadReserveMetadata(
                client,
                market.poolAddressesProvider,
              ),
              reserveTimeoutMs,
              "loadReserveMetadata",
            );
            marketState.reserveMetadataRetryAt = undefined;
            handlers?.onStdout?.("$ 储备元数据已就绪\n");
          } catch (error) {
            marketState.reserveMetadataRetryAt = Date.now() + reserveMetadataRetryMs;
            handlers?.onStderr?.(
              `$ 储备元数据加载失败，保留游标等待重试: ${error instanceof Error ? error.message : String(error)}\n`,
            );
            setResumeCursor(marketState, {
              resumeFromBlock: start,
              resumeChunkStart: start,
              resumeChunkEnd: end,
              resumeUserOffset: index,
            });
            cycleInterrupted = true;
            break;
          }
        }
        const metadata = marketState.reserveMetadata;

        let details: Awaited<ReturnType<typeof analyzeUsers>>;
        try {
          details = await withTimeout(
            analyzeUsers(
              client,
              market.pool,
              metadata.dataProvider,
              metadata.reserves,
              riskyResult.risky,
            ),
            analyzeTimeoutMs,
            `analyzeUsers ${riskyResult.risky.length}`,
          );
        } catch (error) {
          handlers?.onStderr?.(
            `$ 分析候选用户超时，保留游标等待重试: ${error instanceof Error ? error.message : String(error)}\n`,
          );
          setResumeCursor(marketState, {
            resumeFromBlock: start,
            resumeChunkStart: start,
            resumeChunkEnd: end,
            resumeUserOffset: index,
          });
          cycleInterrupted = true;
          break;
        }

        let rankedCandidates: Awaited<ReturnType<typeof rankPreparedExecutionCandidates>> = [];
        try {
          rankedCandidates = await rankPreparedExecutionCandidates(
            client,
            market,
            {
              baseCurrency: metadata.baseCurrency,
              baseCurrencyUnit: metadata.baseCurrencyUnit,
              reserves: metadata.reserves,
            },
            details,
            {
              allowRisky: true,
              receiveAToken: false,
            },
            params.chain === "ethereum" ? "flash_loan" : "self_funded",
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          if (message !== "No liquidation pair could be derived for the current candidates.") {
            throw error;
          }
          handlers?.onStdout?.("$ no actionable liquidation pair in this batch, continuing scan\n");
        }
        const rankingByUser = new Map<string, MarketCycleRanking>();
        for (const candidate of rankedCandidates) {
          rankingByUser.set(candidate.selectedUser.toLowerCase(), {
            scoreBase: BigInt(candidate.selection.scoreBase),
            selectionScoreDisplay: candidate.selection.scoreDisplay,
            selectionMethod: candidate.selection.method,
            roughNetProfitDisplay:
              candidate.liquidationCall.expectedNetProfitDisplay ?? "--",
          });
        }
        for (const [user, ranking] of rankingByUser.entries()) {
          marketState.cycleRankings.set(user, ranking);
        }

        const rows = details.map((detail) => {
          const serialized = toSerializableUserAnalysis(
            detail,
            metadata.baseCurrency,
            metadata.baseCurrencyUnit,
          );
          const ranking = rankingByUser.get(serialized.user.toLowerCase());
          return {
            rank: undefined,
            marketKey: currentMarketPreset.key,
            marketLabel: currentMarketPreset.label,
            user: serialized.user,
            healthFactor: serialized.healthFactor,
            liquidatable: serialized.liquidatable,
            state: statusTextFromHealthFactor(
              serialized.healthFactor,
              serialized.liquidatable,
            ),
            debtSymbol: serialized.bestPair?.debtSymbol || "--",
            collateralSymbol: serialized.bestPair?.collateralSymbol || "--",
            grossProfitDisplay: serialized.bestPair?.grossProfitDisplay || "--",
            roughNetProfitDisplay: ranking?.roughNetProfitDisplay ?? "--",
            selectionScoreDisplay: ranking?.selectionScoreDisplay ?? "--",
            selectionMethod: ranking?.selectionMethod ?? "--",
            source: serialized.bestPair ? "analyze" : "scan",
          } satisfies LiquidationMonitorTarget;
        });
        upsertTargets(handlers, marketState, rows);
        applyCycleRanks(handlers, marketState);
        const selection = selectionFromState(marketState, cycle);
        marketState.currentSelection = selection;
        const selectionFingerprint = JSON.stringify(selection);
        if (selectionFingerprint !== lastSelectionFingerprint) {
          lastSelectionFingerprint = selectionFingerprint;
          handlers?.onSelection?.(selection);
        }

        handlers?.onProgress?.({
          cycle,
          latestBlock: latestBlock.toString(),
          resumeFromBlock: start.toString(),
          resumeChunkStart: start.toString(),
          resumeChunkEnd: end.toString(),
          resumeUserOffset: String(index + batchUsers.length),
        });
        setResumeCursor(marketState, {
          resumeFromBlock: start,
          resumeChunkStart: start,
          resumeChunkEnd: end,
          resumeUserOffset: index + batchUsers.length,
        });
      }
      if (cycleInterrupted) {
        break;
      }

      handlers?.onProgress?.({
        cycle,
        latestBlock: latestBlock.toString(),
        fromBlock: start.toString(),
        toBlock: end.toString(),
        resumeFromBlock: (end + 1n).toString(),
        nextFromBlock: (end + 1n).toString(),
        resumeUserOffset: "0",
      });
      setResumeCursor(marketState, {
        resumeFromBlock: end + 1n,
        resumeChunkStart: undefined,
        resumeChunkEnd: undefined,
        resumeUserOffset: 0,
      });
    }

    if (cycleInterrupted) {
      await sleep(3_000);
      continue;
    }

    const preferred = marketState.currentSelection;
    if (params.broadcast && preferred?.liquidatable) {
      const roughNet = parseDisplayNumber(preferred.roughNetProfitDisplay);
      const executionKey = [
        currentMarketPreset.key,
        preferred.user.toLowerCase(),
        preferred.debtSymbol,
        preferred.collateralSymbol,
      ].join(":");
      const lastAttemptAt = recentExecutionAttempts.get(executionKey) ?? 0;
      const cooledDown = Date.now() - lastAttemptAt >= executionCooldownMs;

      if (roughNet !== null && roughNet > 0 && cooledDown) {
        if (!params.executeCandidate) {
          throw new Error("Broadcast monitor requires executeCandidate callback.");
        }
        recentExecutionAttempts.set(executionKey, Date.now());
        handlers?.onStdout?.(
          `$ armed candidate ${preferred.user} | ${preferred.debtSymbol} <- ${preferred.collateralSymbol} | rough net ${preferred.roughNetProfitDisplay ?? "--"}\n`,
        );
        try {
          const executionResult = await params.executeCandidate(
            {
              action: "run-liquidator",
              chain: params.chain,
              market: currentMarketPreset.key,
              rpcUrl: params.rpcUrl,
              lookbackBlocks: String(params.lookbackBlocks),
              limit: String(Math.max(1, params.limit)),
              allowRisky: params.allowRisky,
              autoSwap: params.autoSwap,
              broadcast: true,
              minNetProfit: params.minNetProfit,
              user: preferred.user,
            },
            {
              onStdout: (chunk) => handlers?.onStdout?.(chunk),
              onStderr: (chunk) => handlers?.onStderr?.(chunk),
            },
          );
          handlers?.onExecution?.(executionResult);
        } catch (error) {
          handlers?.onStderr?.(
            `$ 执行候选失败，保持监控继续: ${error instanceof Error ? error.message : String(error)}\n`,
          );
          handlers?.onExecution?.({
            ok: false,
            error: error instanceof Error ? error.message : String(error),
            user: preferred.user,
            market: currentMarketPreset.key,
          });
        }
      }
    }

    handlers?.onStdout?.(`Cycle ${cycle} completed. Waiting for next scan...\n`);
    handlers?.onHeartbeat?.({
      cycle,
      count: marketState.seen.size,
      block: latestBlock.toString(),
    });
    setResumeCursor(marketState, {
      resumeFromBlock: latestBlock + 1n,
      resumeChunkStart: undefined,
      resumeChunkEnd: undefined,
      resumeUserOffset: 0,
    });
    await sleep(3_000);
  }
}
