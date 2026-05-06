import {
  Address,
  Hex,
  PublicClient,
  encodeFunctionData,
  getAddress,
  parseAbi,
} from "viem";

import {
  AutoSwapSelectionError,
  fetchBestSwapQuote,
  selectAutoSwap,
} from "../arbitrage/auto-swap.js";
import { SwapQuote } from "../arbitrage/swap-quote.js";
import {
  compileFlashLoanLiquidator,
  compileSelfFundedLiquidator,
} from "../contract-compiler.js";
import { ChainPreset, FundingMode } from "../config.js";
import { PreparedExecution, erc20Abi } from "../execution-plan.js";
import { ResolvedMarket, resolveMarket } from "../market.js";
import {
  planProfitDistribution,
  ProfitRecipient,
} from "../profit-distribution.js";
import { evaluateProfitability } from "../profit-check.js";

export type AutoSwapSelectionResult = Awaited<ReturnType<typeof selectAutoSwap>>;
export type ProfitabilityReport = Awaited<ReturnType<typeof evaluateProfitability>>;
export type ProfitDistributionPlan = Awaited<
  ReturnType<typeof planProfitDistribution>
>;
export type SwapSelectionMarket =
  | Pick<
      ChainPreset,
      "chainId" | "poolAddressesProvider" | "wrappedNativeToken"
    >
  | Awaited<ReturnType<typeof resolveMarket>>;
export type LiquidatorCompilation =
  | ReturnType<typeof compileFlashLoanLiquidator>
  | ReturnType<typeof compileSelfFundedLiquidator>;

export type AutoSwapCandidateEvaluation = {
  prepared: PreparedExecution;
  selection?: AutoSwapSelectionResult;
  quote?: SwapQuote;
  selectionBlockedReason?: string;
  providerAttempts?: Array<{
    symbol: string;
    provider: string;
    ok: boolean;
    reason?: string;
  }>;
};

export type CandidateExecutionAttempt = {
  prepared: PreparedExecution;
  minCollateralReceived: bigint;
  debtTokenBalance: bigint;
  allowanceToContract: bigint;
  needsApprove: boolean;
  autoSwapSelection?: AutoSwapSelectionResult;
  autoSwapQuote?: SwapQuote;
  autoSwapBlockedReason?: string;
  autoSwapProviderAttempts?: Array<{
    symbol: string;
    provider: string;
    ok: boolean;
    reason?: string;
  }>;
  hasSwap: boolean;
  resolvedSwapTarget?: Address;
  resolvedAllowanceTarget?: Address;
  resolvedOutputToken?: Address;
  resolvedSwapCalldata?: Hex;
  resolvedMinOutputAmount: bigint;
  approveGasEstimate?: bigint;
  executeGasEstimate?: bigint;
  approveSimulation?:
    | { ok: true; gas?: string }
    | { ok: false; reason: string };
  liquidationSimulation: SimulationReport;
  profitCheck: ProfitabilityReport;
  estimatedDistribution: ProfitDistributionPlan;
  executionGate: {
    routeOk: boolean;
    simulateOk: boolean;
    profitable: boolean;
    canExecute: boolean;
    reason?: string;
  };
  routeAttempts?: Array<{
    index: number;
    provider?: string;
    symbol?: string;
    outputToken?: Address;
    hasSwap: boolean;
    canExecute: boolean;
    reason?: string;
  }>;
};

export type RouteProviderSummaryEntry = {
  provider: string;
  attempts: number;
  executableCount: number;
  blockedCount: number;
  cachedBlockedCount: number;
  latestReason?: string;
  symbols: string[];
};

export type SimulationTrace = {
  failingTo?: string;
  failingToLabel?: string;
  failingInputSelector?: string;
  revertSelector?: string;
  decodedRevertSelector?: string;
  error?: string;
};

export type SimulationReport =
  | { ok: true; gas?: string }
  | {
      ok: false;
      reason: string;
      selector?: string;
      decodedSelector?: string;
      trace?: SimulationTrace;
    };

const CONTRACT_LABEL_ABI = parseAbi([
  "function name() view returns (string)",
  "function symbol() view returns (string)",
]);

const contractLabelCache = new Map<string, string | undefined>();

type RouteVariant = {
  hasSwap: boolean;
  symbol?: string;
  outputToken?: Address;
  swapTarget?: Address;
  allowanceTarget?: Address;
  swapCalldata?: Hex;
  minOutputAmount: bigint;
  profitCheck?: ProfitabilityReport;
  quote?: SwapQuote;
};

function toSortableProfit(
  report:
    | AutoSwapSelectionResult["selected"]["profitCheck"]
    | ProfitabilityReport,
): bigint {
  if (report.estimatedNetProfitBase !== undefined) {
    return BigInt(report.estimatedNetProfitBase);
  }

  if (report.grossProfitBase !== undefined) {
    return BigInt(report.grossProfitBase);
  }

  return -(10n ** 30n);
}

export function sameAssetPair(prepared: PreparedExecution): boolean {
  return (
    prepared.liquidationCall.collateralAsset.toLowerCase() ===
    prepared.liquidationCall.debtAsset.toLowerCase()
  );
}

function isStrictlyProfitable(report: ProfitabilityReport): boolean {
  if (!report.canBroadcast) {
    return false;
  }
  if (report.estimatedNetProfitBase !== undefined) {
    return BigInt(report.estimatedNetProfitBase) > 0n;
  }
  if (report.grossProfitBase !== undefined) {
    return BigInt(report.grossProfitBase) > 0n;
  }
  return false;
}

export function describeSimulationFailure(report: SimulationReport): string {
  if (report.ok) {
    return "Execution simulation succeeded.";
  }

  if (report.decodedSelector) {
    return `Execution simulation failed with ${report.decodedSelector}.`;
  }

  if (report.trace?.decodedRevertSelector) {
    const targetLabel = report.trace.failingToLabel ?? report.trace.failingTo;
    const target = targetLabel ? ` at ${targetLabel}` : "";
    return `Execution simulation failed${target} with ${report.trace.decodedRevertSelector}.`;
  }

  if (report.trace?.failingTo || report.trace?.revertSelector || report.trace?.failingInputSelector) {
    if (
      report.trace.failingToLabel &&
      report.trace.failingToLabel.toUpperCase().includes("DEBT_TOKEN_IMPL")
    ) {
      return `Execution simulation failed because the swap route hit ${report.trace.failingToLabel} (${report.trace.failingTo}) via ${report.trace.failingInputSelector ?? "unknown call"}.`;
    }
    const parts = [
      report.trace.failingToLabel
        ? `target ${report.trace.failingToLabel} (${report.trace.failingTo})`
        : report.trace.failingTo
          ? `target ${report.trace.failingTo}`
          : undefined,
      report.trace.failingInputSelector
        ? `call ${report.trace.failingInputSelector}`
        : undefined,
      report.trace.revertSelector && report.trace.revertSelector !== "0x00000000"
        ? `revert ${report.trace.revertSelector}`
        : undefined,
      report.trace.error ?? undefined,
    ].filter(Boolean);
    if (parts.length > 0) {
      return `Execution simulation failed inside external call (${parts.join(", ")}).`;
    }
  }

  if (report.selector) {
    return `Execution simulation failed with unknown selector ${report.selector}.`;
  }

  return report.reason;
}

function isInternalProtocolLabel(label: string | undefined): boolean {
  const normalized = label?.toUpperCase();
  if (!normalized) {
    return false;
  }

  return [
    "DEBT_TOKEN_IMPL",
    "ATOKEN_IMPL",
    "STABLE_DEBT_TOKEN",
    "VARIABLE_DEBT_TOKEN",
    "AAVE",
  ].some((token) => normalized.includes(token));
}

function routeCacheKey(route: {
  quote?: SwapQuote;
  swapTarget?: Address;
  allowanceTarget?: Address;
  outputToken?: Address;
  swapCalldata?: Hex;
}): string | undefined {
  const provider = route.quote?.provider;
  const swapTarget = route.swapTarget ?? route.quote?.swapTarget;
  const allowanceTarget =
    route.allowanceTarget ??
    route.quote?.allowanceTarget ??
    route.quote?.swapTarget;
  const outputToken = route.outputToken ?? route.quote?.outputToken;
  const selector = selectorFromHexData(route.swapCalldata);

  if (!provider || !swapTarget || !allowanceTarget || !outputToken || !selector) {
    return undefined;
  }

  return [
    provider,
    swapTarget.toLowerCase(),
    allowanceTarget.toLowerCase(),
    outputToken.toLowerCase(),
    selector,
  ].join(":");
}

function unsafeRouteReasonFromSimulation(report: SimulationReport): string | undefined {
  if (report.ok) {
    return undefined;
  }

  if (
    report.trace?.failingTo &&
    isInternalProtocolLabel(report.trace.failingToLabel)
  ) {
    return `Blocked cached route after hitting ${report.trace.failingToLabel} (${report.trace.failingTo}) via ${report.trace.failingInputSelector ?? "unknown call"}.`;
  }

  return undefined;
}

async function readContractLabel(
  client: PublicClient,
  address: Address | undefined,
): Promise<string | undefined> {
  if (!address) {
    return undefined;
  }

  const cacheKey = address.toLowerCase();
  if (contractLabelCache.has(cacheKey)) {
    return contractLabelCache.get(cacheKey);
  }

  const [name, symbol] = await Promise.all([
    client
      .readContract({
        address,
        abi: CONTRACT_LABEL_ABI,
        functionName: "name",
      })
      .catch(() => undefined),
    client
      .readContract({
        address,
        abi: CONTRACT_LABEL_ABI,
        functionName: "symbol",
      })
      .catch(() => undefined),
  ]);

  const label =
    typeof name === "string" && typeof symbol === "string"
      ? name === symbol
        ? name
        : `${name} (${symbol})`
      : typeof name === "string"
        ? name
        : typeof symbol === "string"
          ? symbol
          : undefined;

  contractLabelCache.set(cacheKey, label);
  return label;
}

function knownRevertSelector(selector: string | undefined): string | undefined {
  switch (selector?.toLowerCase()) {
    case "0x5fc483c5":
      return "OnlyOwner()";
    case "0x4b602735":
      return "OnlyPool()";
    case "0xbfda1f28":
      return "InvalidInitiator()";
    case "0xc891add2":
      return "InvalidAsset()";
    case "0xd92e233d":
      return "ZeroAddress()";
    case "0x1f2a2005":
      return "ZeroAmount()";
    case "0xab143c06":
      return "Reentrancy()";
    case "0x83a09894":
      return "ReceiveATokenUnsupported()";
    case "0x0fdff63a":
      return "SwapRequired()";
    case "0x8ae7ce6b":
      return "MinCollateralNotMet(uint256,uint256)";
    case "0x04477f00":
      return "MinOutputNotMet(uint256,uint256)";
    case "0x9c055a77":
      return "InsufficientRepayment(uint256,uint256)";
    case "0x3f409f9a":
      return "TokenCallFailed()";
    case "0x350c20f1":
      return "ExternalCallFailed()";
    default:
      return undefined;
  }
}

function extractSelectorFromText(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  const match = value.match(/0x[a-fA-F0-9]{8}(?![a-fA-F0-9])/);
  return match?.[0]?.toLowerCase();
}

function selectorFromHexData(value: string | undefined): string | undefined {
  if (!value || !value.startsWith("0x") || value.length < 10) {
    return undefined;
  }
  return value.slice(0, 10).toLowerCase();
}

function collectFailingTraceNode(node: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!node || typeof node !== "object") {
    return undefined;
  }
  const nested = Array.isArray(node.calls)
    ? node.calls
        .map((child) => collectFailingTraceNode(child as Record<string, unknown>))
        .filter(Boolean)
    : [];
  if (nested.length > 0) {
    return nested[nested.length - 1];
  }
  if (
    typeof node.error === "string" ||
    typeof node.revertReason === "string" ||
    typeof node.output === "string"
  ) {
    return node;
  }
  return undefined;
}

async function traceCallFailure(
  client: PublicClient,
  tx: {
    from: Address;
    to: Address;
    data: Hex;
  },
): Promise<SimulationTrace | undefined> {
  try {
    const trace = (await (
      client as unknown as {
        request(args: { method: string; params: unknown[] }): Promise<unknown>;
      }
    ).request({
      method: "debug_traceCall",
      params: [
        {
          from: tx.from,
          to: tx.to,
          data: tx.data,
          value: "0x0",
        },
        "latest",
        { tracer: "callTracer", timeout: "10s" },
      ],
    })) as Record<string, unknown>;

    const failingNode = collectFailingTraceNode(trace);
    if (!failingNode) {
      return undefined;
    }

    const revertSelector = selectorFromHexData(
      typeof failingNode.output === "string" ? failingNode.output : undefined,
    );
    const failingInputSelector = selectorFromHexData(
      typeof failingNode.input === "string" ? failingNode.input : undefined,
    );

    return {
      failingTo:
        typeof failingNode.to === "string"
          ? getAddress(failingNode.to)
          : undefined,
      failingToLabel: await readContractLabel(
        client,
        typeof failingNode.to === "string"
          ? getAddress(failingNode.to)
          : undefined,
      ),
      failingInputSelector,
      revertSelector,
      decodedRevertSelector: knownRevertSelector(revertSelector),
      error:
        typeof failingNode.error === "string"
          ? failingNode.error
          : typeof failingNode.revertReason === "string"
            ? failingNode.revertReason
            : undefined,
    };
  } catch {
    return undefined;
  }
}

export async function estimateContractGasOrUndefined(
  client: PublicClient,
  params: Parameters<PublicClient["estimateContractGas"]>[0],
): Promise<bigint | undefined> {
  try {
    return await client.estimateContractGas(params);
  } catch {
    return undefined;
  }
}

export async function trySelectAutoSwap(
  client: PublicClient,
  market: SwapSelectionMarket,
  prepared: PreparedExecution,
  params: Parameters<typeof selectAutoSwap>[3],
): Promise<{
  selection?: AutoSwapSelectionResult;
  quote?: SwapQuote;
  blockedReason?: string;
  providerAttempts?: Array<{
    symbol: string;
    provider: string;
    ok: boolean;
    reason?: string;
  }>;
}> {
  try {
    const selection = await selectAutoSwap(client, market, prepared, params);
    return {
      selection,
      quote: selection.selected.quote,
      providerAttempts: selection.providerAttempts,
    };
  } catch (error) {
    return {
      blockedReason: error instanceof Error ? error.message : String(error),
      providerAttempts:
        error instanceof AutoSwapSelectionError ? error.providerAttempts : undefined,
    };
  }
}

export function candidateKey(prepared: PreparedExecution): string {
  return [
    prepared.selectedUser.toLowerCase(),
    prepared.liquidationCall.debtAsset.toLowerCase(),
    prepared.liquidationCall.collateralAsset.toLowerCase(),
  ].join(":");
}

async function simulateContractWithDiagnostics(
  client: PublicClient,
  request: Parameters<PublicClient["simulateContract"]>[0],
  traceTx: {
    from: Address;
    to: Address;
    data: Hex;
  },
): Promise<SimulationReport> {
  try {
    const simulation = await client.simulateContract(request);
    return {
      ok: true,
      gas: simulation.request.gas?.toString(),
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const selector = extractSelectorFromText(reason);
    const trace = await traceCallFailure(client, traceTx);
    return {
      ok: false,
      reason,
      selector,
      decodedSelector: knownRevertSelector(selector),
      trace,
    };
  }
}

export async function preselectAutoSwapCandidates(params: {
  client: PublicClient;
  market: SwapSelectionMarket;
  preparedCandidates: PreparedExecution[];
  fundingMode: FundingMode;
  ownerAddress: Address;
  contractAddress: Address;
  autoSwap: boolean;
  swapTarget?: Address;
  outputToken?: Address;
  swapCalldata?: Hex;
  swapOutToken?: Address;
  minCollateralBps: bigint;
  swapSlippage: string;
  autoSwapSymbols?: string;
  flashLoanPremiumBps?: bigint;
  gasBufferBps: bigint;
  minNetProfit: string;
  skipProfitCheck: boolean;
}): Promise<Map<string, AutoSwapCandidateEvaluation>> {
  const preselectedAutoSwapByKey = new Map<string, AutoSwapCandidateEvaluation>();
  const canAutoSelectCandidate =
    params.autoSwap && !params.swapTarget && !params.outputToken && !params.swapCalldata;
  if (!canAutoSelectCandidate || params.preparedCandidates.length <= 1) {
    return preselectedAutoSwapByKey;
  }

  const autoSwapWindow = params.preparedCandidates.slice(
    0,
    Math.min(5, params.preparedCandidates.length),
  );
  const evaluated = await Promise.allSettled(
    autoSwapWindow.map(async (candidate) => {
      const candidateMinCollateralReceived =
        (candidate.liquidationCall.expectedCollateralToReceive *
          params.minCollateralBps) /
        10_000n;
      if (sameAssetPair(candidate)) {
        return {
          prepared: candidate,
        } satisfies AutoSwapCandidateEvaluation;
      }
      const candidateNeedsApprove =
        params.fundingMode === "self_funded"
          ? (
              await params.client.readContract({
                address: candidate.approve.token,
                abi: erc20Abi,
                functionName: "allowance",
                args: [params.ownerAddress, params.contractAddress],
              })
            ) < candidate.approve.amount
          : false;

      if (!params.swapOutToken) {
        const autoSwapAttempt = await trySelectAutoSwap(
          params.client,
          params.market,
          candidate,
          {
            account: params.contractAddress,
            amount: candidateMinCollateralReceived,
            slippage: params.swapSlippage,
            candidateSymbols: params.autoSwapSymbols,
            needsApprove: candidateNeedsApprove,
            approveGas: candidateNeedsApprove ? 55_000n : undefined,
            flashLoanPremiumBps: params.flashLoanPremiumBps,
            gasBufferBps: params.gasBufferBps,
            minNetProfit: params.minNetProfit,
            skipProfitCheck: params.skipProfitCheck,
          },
        );

        return {
          prepared: candidate,
          selection: autoSwapAttempt.selection,
          quote: autoSwapAttempt.quote,
          selectionBlockedReason:
            autoSwapAttempt.selection?.selected.profitCheck.reason ??
            autoSwapAttempt.blockedReason,
          providerAttempts: autoSwapAttempt.providerAttempts,
        } satisfies AutoSwapCandidateEvaluation;
      }

      const quote = await fetchBestSwapQuote(params.client, {
        chainId: candidate.chainId,
        account: params.contractAddress,
        inTokenAddress: candidate.liquidationCall.collateralAsset,
        inTokenDecimals: candidate.liquidationCall.collateralDecimals,
        outTokenAddress: params.swapOutToken,
        amount: candidateMinCollateralReceived,
        slippage: params.swapSlippage,
      });

      return {
        prepared: candidate,
        quote,
      } satisfies AutoSwapCandidateEvaluation;
    }),
  );

  const successful: AutoSwapCandidateEvaluation[] = [];
  for (const item of evaluated) {
    if (item.status === "fulfilled") {
      successful.push(item.value);
    }
  }

  successful.sort((left, right) => {
    const leftReport = left.selection?.selected.profitCheck;
    const rightReport = right.selection?.selected.profitCheck;
    if (leftReport && rightReport) {
      const leftProfit = toSortableProfit(leftReport);
      const rightProfit = toSortableProfit(rightReport);
      if (leftProfit === rightProfit) {
        return 0;
      }

      return leftProfit > rightProfit ? -1 : 1;
    }

    const leftScore = BigInt(left.prepared.selection.scoreBase);
    const rightScore = BigInt(right.prepared.selection.scoreBase);
    if (leftScore === rightScore) {
      return 0;
    }

    return leftScore > rightScore ? -1 : 1;
  });

  for (const candidate of successful) {
    preselectedAutoSwapByKey.set(candidateKey(candidate.prepared), candidate);
  }

  return preselectedAutoSwapByKey;
}

function buildRouteVariants(params: {
  candidate: PreparedExecution;
  autoSwapSelection?: AutoSwapSelectionResult;
  autoSwapQuote?: SwapQuote;
  autoSwapBlockedReason?: string;
  swapTarget?: Address;
  outputToken?: Address;
  swapCalldata?: Hex;
  swapAllowanceTarget?: Address;
  minOutputAmount: bigint;
  swapOutToken?: Address;
}): RouteVariant[] {
  const {
    candidate,
    autoSwapSelection,
    autoSwapQuote,
    minOutputAmount,
    outputToken,
    swapAllowanceTarget,
    swapCalldata,
    swapOutToken,
    swapTarget,
  } = params;

  if (sameAssetPair(candidate)) {
    return [
      {
        hasSwap: false,
        symbol: candidate.liquidationCall.debtSymbol,
        outputToken: undefined,
        swapTarget: undefined,
        allowanceTarget: undefined,
        swapCalldata: undefined,
        minOutputAmount: 0n,
        profitCheck: undefined,
        quote: undefined,
      },
    ];
  }

  if (autoSwapSelection?.profitableCandidates?.length) {
    return autoSwapSelection.profitableCandidates.slice(0, 3).map((route) => ({
      hasSwap: true,
      symbol: route.symbol,
      outputToken: route.quote.outputToken,
      swapTarget: route.quote.swapTarget,
      allowanceTarget:
        route.quote.allowanceTarget ?? route.quote.swapTarget,
      swapCalldata: route.quote.swapCalldata,
      minOutputAmount: route.quote.minOutputAmount,
      profitCheck: route.profitCheck,
      quote: route.quote,
    }));
  }

  return [
    {
      hasSwap: Boolean(
        (swapTarget ?? autoSwapQuote?.swapTarget) &&
          (outputToken ?? autoSwapQuote?.outputToken) &&
          (swapCalldata ?? autoSwapQuote?.swapCalldata),
      ),
      symbol: swapOutToken ? undefined : autoSwapSelection?.selected.symbol,
      outputToken: outputToken ?? autoSwapQuote?.outputToken,
      swapTarget: swapTarget ?? autoSwapQuote?.swapTarget,
      allowanceTarget:
        swapAllowanceTarget ??
        autoSwapQuote?.allowanceTarget ??
        swapTarget ??
        autoSwapQuote?.swapTarget,
      swapCalldata: swapCalldata ?? autoSwapQuote?.swapCalldata,
      minOutputAmount:
        minOutputAmount !== 0n
          ? minOutputAmount
          : autoSwapQuote?.minOutputAmount ?? 0n,
      profitCheck: autoSwapSelection?.selected.profitCheck,
      quote: autoSwapQuote,
    },
  ];
}

export async function evaluatePreparedCandidate(params: {
  client: PublicClient;
  market: SwapSelectionMarket;
  fundingMode: FundingMode;
  ownerAddress: Address;
  contractAddress: Address;
  compiled: LiquidatorCompilation;
  candidate: PreparedExecution;
  minCollateralBps: bigint;
  gasBufferBps: bigint;
  minNetProfit: string;
  skipProfitCheck: boolean;
  autoSwap: boolean;
  swapTarget?: Address;
  swapAllowanceTarget?: Address;
  outputToken?: Address;
  swapCalldata?: Hex;
  minOutputAmount: bigint;
  swapOutToken?: Address;
  swapSlippage: string;
  autoSwapSymbols?: string;
  flashLoanPremiumBps?: bigint;
  profitRecipients: ProfitRecipient[];
  preselectedAutoSwapByKey: Map<string, AutoSwapCandidateEvaluation>;
  blockedSwapRouteCache: Map<string, string>;
  blockedRouteStats: { hits: number };
}): Promise<CandidateExecutionAttempt> {
  const minCollateralReceived =
    (params.candidate.liquidationCall.expectedCollateralToReceive *
      params.minCollateralBps) /
    10_000n;
  if (!params.candidate.liquidatable) {
    return {
      prepared: params.candidate,
      minCollateralReceived,
      debtTokenBalance: 0n,
      allowanceToContract: 0n,
      needsApprove: false,
      hasSwap: false,
      resolvedMinOutputAmount: 0n,
      liquidationSimulation: {
        ok: false,
        reason: "Target is not liquidatable at current state.",
      },
      profitCheck: await evaluateProfitability(params.client, params.market, params.candidate, {
        needsApprove: false,
        gasPriceWei: await params.client.getGasPrice(),
        flashLoanPremiumBps: params.flashLoanPremiumBps,
        gasBufferBps: params.gasBufferBps,
        minNetProfit: params.minNetProfit,
        skipProfitCheck: params.skipProfitCheck,
      }),
      estimatedDistribution: await planProfitDistribution(
        params.client,
        params.market,
        params.candidate,
        {
          collateralAmount: minCollateralReceived,
          recipients: params.profitRecipients,
        },
      ),
      executionGate: {
        routeOk: false,
        simulateOk: false,
        profitable: false,
        canExecute: false,
        reason: "Target is not liquidatable at current state.",
      },
    };
  }

  const [debtTokenBalance, allowanceToContract] =
    params.fundingMode === "self_funded"
      ? await Promise.all([
          params.client.readContract({
            address: params.candidate.approve.token,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [params.ownerAddress],
          }),
          params.client.readContract({
            address: params.candidate.approve.token,
            abi: erc20Abi,
            functionName: "allowance",
            args: [params.ownerAddress, params.contractAddress],
          }),
        ])
      : [0n, 0n];

  const needsApprove =
    params.fundingMode === "self_funded" &&
    allowanceToContract < params.candidate.approve.amount;
  const preselected = params.preselectedAutoSwapByKey.get(candidateKey(params.candidate));
  let autoSwapSelection = preselected?.selection;
  let autoSwapQuote = preselected?.quote;
  let autoSwapBlockedReason = preselected?.selectionBlockedReason;
  let autoSwapProviderAttempts = preselected?.providerAttempts;

  if (
    !autoSwapSelection &&
    !autoSwapQuote &&
    !sameAssetPair(params.candidate) &&
    !params.swapTarget &&
    !params.outputToken &&
    !params.swapCalldata &&
    params.autoSwap
  ) {
    if (!params.swapOutToken) {
      const autoSwapAttempt = await trySelectAutoSwap(
        params.client,
        params.market,
        params.candidate,
        {
          account: params.contractAddress,
          amount: minCollateralReceived,
          slippage: params.swapSlippage,
          candidateSymbols: params.autoSwapSymbols,
          needsApprove,
          approveGas: needsApprove ? 55_000n : undefined,
          flashLoanPremiumBps: params.flashLoanPremiumBps,
          gasBufferBps: params.gasBufferBps,
          minNetProfit: params.minNetProfit,
          skipProfitCheck: params.skipProfitCheck,
        },
      );
      autoSwapSelection = autoSwapAttempt.selection;
      autoSwapQuote = autoSwapAttempt.quote;
      autoSwapBlockedReason = autoSwapAttempt.blockedReason;
      autoSwapProviderAttempts = autoSwapAttempt.providerAttempts;
    } else {
      try {
        autoSwapQuote = await fetchBestSwapQuote(params.client, {
          chainId: params.candidate.chainId,
          account: params.contractAddress,
          inTokenAddress: params.candidate.liquidationCall.collateralAsset,
          inTokenDecimals: params.candidate.liquidationCall.collateralDecimals,
          outTokenAddress: params.swapOutToken,
          amount: minCollateralReceived,
          slippage: params.swapSlippage,
        });
      } catch (error) {
        autoSwapBlockedReason =
          error instanceof Error ? error.message : String(error);
      }
    }
  }

  const routeVariants = buildRouteVariants({
    candidate: params.candidate,
    autoSwapSelection,
    autoSwapQuote,
    autoSwapBlockedReason,
    swapTarget: params.swapTarget,
    outputToken: params.outputToken,
    swapCalldata: params.swapCalldata,
    swapAllowanceTarget: params.swapAllowanceTarget,
    minOutputAmount: params.minOutputAmount,
    swapOutToken: params.swapOutToken,
  });
  const requiresSwapForRepayment =
    params.fundingMode === "flash_loan" && !sameAssetPair(params.candidate);
  const approveGasEstimate = needsApprove
    ? await estimateContractGasOrUndefined(params.client, {
        address: params.candidate.approve.token,
        abi: erc20Abi,
        functionName: "approve",
        args: [params.contractAddress, params.candidate.approve.amount],
        account: params.ownerAddress,
      })
    : undefined;
  const approveSimulation =
    params.fundingMode === "self_funded"
      ? await params.client
          .simulateContract({
            address: params.candidate.approve.token,
            abi: erc20Abi,
            functionName: "approve",
            args: [params.contractAddress, params.candidate.approve.amount],
            account: params.ownerAddress,
          })
          .then((simulation) => ({
            ok: true as const,
            gas: simulation.request.gas?.toString(),
          }))
          .catch((error) => ({
            ok: false as const,
            reason: error instanceof Error ? error.message : String(error),
          }))
      : undefined;
  const routeAttemptSummaries: NonNullable<CandidateExecutionAttempt["routeAttempts"]> = [];
  let fallbackAttempt: CandidateExecutionAttempt | undefined;

  for (let index = 0; index < routeVariants.length; index += 1) {
    const route = routeVariants[index];
    const routeCacheLookupKey = route.hasSwap ? routeCacheKey(route) : undefined;
    const cachedBlockedReason =
      routeCacheLookupKey
        ? params.blockedSwapRouteCache.get(routeCacheLookupKey)
        : undefined;
    const executeCall = {
      address: params.contractAddress,
      abi: params.compiled.abi,
      functionName: route.hasSwap ? "executeLiquidationAndSwap" : "executeLiquidation",
      args: route.hasSwap
        ? [
            params.candidate.liquidationCall.collateralAsset,
            params.candidate.liquidationCall.debtAsset,
            params.candidate.liquidationCall.user,
            params.candidate.liquidationCall.debtToCover,
            minCollateralReceived,
            route.swapTarget as Address,
            (route.allowanceTarget ?? route.swapTarget) as Address,
            route.outputToken as Address,
            route.minOutputAmount,
            route.swapCalldata as Hex,
          ]
        : [
            params.candidate.liquidationCall.collateralAsset,
            params.candidate.liquidationCall.debtAsset,
            params.candidate.liquidationCall.user,
            params.candidate.liquidationCall.debtToCover,
            minCollateralReceived,
            false,
          ],
      account: params.ownerAddress,
    } as const;
    const executeGasEstimate = await estimateContractGasOrUndefined(
      params.client,
      executeCall,
    );
    const executeCallData = encodeFunctionData({
      abi: params.compiled.abi,
      functionName: executeCall.functionName,
      args: executeCall.args,
    });
    const liquidationSimulation = cachedBlockedReason
      ? ({
          ok: false,
          reason: cachedBlockedReason,
        } satisfies SimulationReport)
      : await simulateContractWithDiagnostics(
          params.client,
          executeCall as Parameters<PublicClient["simulateContract"]>[0],
          {
            from: params.ownerAddress,
            to: params.contractAddress,
            data: executeCallData,
          },
        );
    if (cachedBlockedReason) {
      params.blockedRouteStats.hits += 1;
    }
    const gasPriceWei = route.quote?.gasPriceWei ?? (await params.client.getGasPrice());
    const approveGasForCheck =
      approveGasEstimate ??
      (approveSimulation?.ok && approveSimulation.gas
        ? BigInt(approveSimulation.gas)
        : undefined);
    const executeGasForCheck =
      executeGasEstimate ??
      (liquidationSimulation.ok && liquidationSimulation.gas
        ? BigInt(liquidationSimulation.gas)
        : undefined);
    const profitCheck =
      route.profitCheck ??
      (await evaluateProfitability(params.client, params.market, params.candidate, {
        needsApprove,
        approveGas: approveGasForCheck,
        executeGas: executeGasForCheck,
        gasPriceWei,
        flashLoanPremiumBps: params.flashLoanPremiumBps,
        gasBufferBps: params.gasBufferBps,
        outputToken: route.hasSwap ? (route.outputToken as Address) : undefined,
        minOutputAmount: route.hasSwap ? route.minOutputAmount : undefined,
        minNetProfit: params.minNetProfit,
        skipProfitCheck: params.skipProfitCheck,
      }));
    const estimatedDistribution = await planProfitDistribution(
      params.client,
      params.market,
      params.candidate,
      {
        outputToken: route.hasSwap ? (route.outputToken as Address) : undefined,
        outputAmount: route.hasSwap ? route.minOutputAmount : undefined,
        collateralAmount: route.hasSwap ? undefined : minCollateralReceived,
        recipients: params.profitRecipients,
      },
    );
    const unsafeRouteReason = route.hasSwap
      ? unsafeRouteReasonFromSimulation(liquidationSimulation)
      : undefined;
    if (routeCacheLookupKey && unsafeRouteReason) {
      params.blockedSwapRouteCache.set(routeCacheLookupKey, unsafeRouteReason);
    }
    const executionGate = {
      routeOk: !requiresSwapForRepayment || route.hasSwap,
      simulateOk: liquidationSimulation.ok && !cachedBlockedReason,
      profitable: isStrictlyProfitable(profitCheck),
      canExecute:
        (!requiresSwapForRepayment || route.hasSwap) &&
        liquidationSimulation.ok &&
        !cachedBlockedReason &&
        isStrictlyProfitable(profitCheck),
      reason: requiresSwapForRepayment && !route.hasSwap
        ? autoSwapBlockedReason
          ? `No executable swap route: ${autoSwapBlockedReason}`
          : "Flash-loan repayment requires a swap route, but no swap quote was selected."
        : cachedBlockedReason
        ? cachedBlockedReason
        : !liquidationSimulation.ok
        ? describeSimulationFailure(liquidationSimulation)
        : !isStrictlyProfitable(profitCheck)
          ? profitCheck.reason ?? "Estimated net profit is not positive."
          : undefined,
    };
    const candidateAttempt: CandidateExecutionAttempt = {
      prepared: params.candidate,
      minCollateralReceived,
      debtTokenBalance,
      allowanceToContract,
      needsApprove,
      autoSwapSelection,
      autoSwapQuote: route.quote,
      autoSwapBlockedReason,
      autoSwapProviderAttempts,
      hasSwap: route.hasSwap,
      resolvedSwapTarget: route.swapTarget,
      resolvedAllowanceTarget: route.allowanceTarget ?? route.swapTarget,
      resolvedOutputToken: route.outputToken,
      resolvedSwapCalldata: route.swapCalldata,
      resolvedMinOutputAmount: route.minOutputAmount,
      approveGasEstimate,
      executeGasEstimate,
      approveSimulation,
      liquidationSimulation,
      profitCheck,
      estimatedDistribution,
      executionGate,
      routeAttempts: routeAttemptSummaries,
    };
    routeAttemptSummaries.push({
      index: index + 1,
      provider: route.quote?.provider,
      symbol: route.symbol,
      outputToken: route.outputToken,
      hasSwap: route.hasSwap,
      canExecute: executionGate.canExecute,
      reason: executionGate.reason,
    });
    if (!fallbackAttempt) {
      fallbackAttempt = candidateAttempt;
    }
    if (candidateAttempt.executionGate.canExecute) {
      candidateAttempt.routeAttempts = [...routeAttemptSummaries];
      return candidateAttempt;
    }
    fallbackAttempt = {
      ...candidateAttempt,
      routeAttempts: [...routeAttemptSummaries],
    };
  }

  return fallbackAttempt as CandidateExecutionAttempt;
}

export function summarizeRouteProviders(
  candidateAttempts: CandidateExecutionAttempt[],
): RouteProviderSummaryEntry[] {
  return Array.from(
    candidateAttempts.reduce((accumulator, attempt) => {
      for (const providerAttempt of attempt.autoSwapProviderAttempts ?? []) {
        const current =
          accumulator.get(providerAttempt.provider) ??
          ({
            provider: providerAttempt.provider,
            attempts: 0,
            executableCount: 0,
            blockedCount: 0,
            cachedBlockedCount: 0,
            latestReason: undefined,
            symbols: [],
          } satisfies RouteProviderSummaryEntry);
        current.attempts += 1;
        if (!providerAttempt.ok) {
          current.blockedCount += 1;
        }
        if (providerAttempt.symbol && !current.symbols.includes(providerAttempt.symbol)) {
          current.symbols.push(providerAttempt.symbol);
        }
        if (providerAttempt.reason) {
          current.latestReason = providerAttempt.reason;
        }
        accumulator.set(providerAttempt.provider, current);
      }
      for (const routeAttempt of attempt.routeAttempts ?? []) {
        if (!routeAttempt.provider) {
          continue;
        }

        const current =
          accumulator.get(routeAttempt.provider) ??
          ({
            provider: routeAttempt.provider,
            attempts: 1,
            executableCount: 0,
            blockedCount: 0,
            cachedBlockedCount: 0,
            latestReason: undefined,
            symbols: [],
          } satisfies RouteProviderSummaryEntry);
        if (routeAttempt.canExecute) {
          current.executableCount += 1;
        } else {
          current.blockedCount += 1;
        }
        if (routeAttempt.reason?.includes("Blocked cached route")) {
          current.cachedBlockedCount += 1;
        }
        if (routeAttempt.symbol && !current.symbols.includes(routeAttempt.symbol)) {
          current.symbols.push(routeAttempt.symbol);
        }
        if (routeAttempt.reason) {
          current.latestReason = routeAttempt.reason;
        }
        accumulator.set(routeAttempt.provider, current);
      }
      return accumulator;
    }, new Map<string, RouteProviderSummaryEntry>()).values(),
  ).sort((left, right) => {
    if (left.executableCount !== right.executableCount) {
      return right.executableCount - left.executableCount;
    }
    if (left.attempts !== right.attempts) {
      return right.attempts - left.attempts;
    }
    return left.provider.localeCompare(right.provider);
  });
}
