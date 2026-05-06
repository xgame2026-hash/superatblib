import { Address, PublicClient } from "viem";

import { ChainPreset } from "../config.js";
import { PreparedExecution } from "../execution-plan.js";
import { loadReserveMetadata } from "../liquidation-analysis.js";
import { ResolvedMarket } from "../market.js";
import { fetchOpenOceanSwapQuote } from "../openocean.js";
import { evaluateProfitability, ProfitCheckReport } from "../profit-check.js";
import { SwapQuote } from "./swap-quote.js";
import { fetchZeroExSwapQuote, hasZeroExApiKey } from "../zeroex.js";

const DEFAULT_AUTO_SWAP_SYMBOLS = ["USDC", "USDT", "DAI", "WETH", "WMATIC", "WBNB"];
const DEFAULT_AUTO_SWAP_QUOTE_TIMEOUT_MS = 8_000;
const DEFAULT_AUTO_SWAP_PROVIDER_FAILURE_THRESHOLD = 2;
const DEFAULT_AUTO_SWAP_PROVIDER_COOLDOWN_MS = 30_000;
const DEFAULT_AUTO_SWAP_PAIR_FAILURE_CACHE_MS = 20_000;

type ProviderHealthState = {
  consecutiveFailures: number;
  cooldownUntil?: number;
  lastFailureReason?: string;
};

type PairFailureState = {
  until: number;
  reason: string;
};

const providerHealthByKey = new Map<string, ProviderHealthState>();
const pairFailureCacheByKey = new Map<string, PairFailureState>();

export type AutoSwapQuoteCandidate = {
  symbol: string;
  asset: Address;
  quote: SwapQuote;
  profitCheck: ProfitCheckReport;
};

type SwapQuoteRouteCandidate = {
  symbol: string;
  asset: Address;
  quote: SwapQuote;
};

export type AutoSwapProviderAttempt = {
  symbol: string;
  provider: SwapQuote["provider"];
  ok: boolean;
  reason?: string;
};

export type AutoSwapSelection = {
  selected: AutoSwapQuoteCandidate;
  profitableCandidates: AutoSwapQuoteCandidate[];
  candidatesTried: string[];
  providerAttempts: AutoSwapProviderAttempt[];
};

export class AutoSwapSelectionError extends Error {
  providerAttempts: AutoSwapProviderAttempt[];
  candidatesTried: string[];

  constructor(
    message: string,
    params?: {
      providerAttempts?: AutoSwapProviderAttempt[];
      candidatesTried?: string[];
    },
  ) {
    super(message);
    this.name = "AutoSwapSelectionError";
    this.providerAttempts = params?.providerAttempts ?? [];
    this.candidatesTried = params?.candidatesTried ?? [];
  }
}

type QuoteContext = {
  chainId: number;
  account: Address;
  inTokenAddress: Address;
  inTokenDecimals: bigint;
  amount: bigint;
  slippage: string;
};

function resolveAutoSwapQuoteTimeoutMs(): number {
  return readPositiveIntEnv(
    "AUTO_SWAP_QUOTE_TIMEOUT_MS",
    DEFAULT_AUTO_SWAP_QUOTE_TIMEOUT_MS,
  );
}

function resolveAutoSwapProviderFailureThreshold(): number {
  return readPositiveIntEnv(
    "AUTO_SWAP_PROVIDER_FAILURE_THRESHOLD",
    DEFAULT_AUTO_SWAP_PROVIDER_FAILURE_THRESHOLD,
  );
}

function resolveAutoSwapProviderCooldownMs(): number {
  return readPositiveIntEnv(
    "AUTO_SWAP_PROVIDER_COOLDOWN_MS",
    DEFAULT_AUTO_SWAP_PROVIDER_COOLDOWN_MS,
  );
}

function resolveAutoSwapPairFailureCacheMs(): number {
  return readPositiveIntEnv(
    "AUTO_SWAP_PAIR_FAILURE_CACHE_MS",
    DEFAULT_AUTO_SWAP_PAIR_FAILURE_CACHE_MS,
  );
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function providerHealthKey(
  chainId: number,
  provider: SwapQuote["provider"],
): string {
  return `${chainId}:${provider}`;
}

function pairFailureKey(params: {
  chainId: number;
  provider: SwapQuote["provider"];
  inTokenAddress: Address;
  outTokenAddress: Address;
}): string {
  return `${params.chainId}:${params.provider}:${params.inTokenAddress.toLowerCase()}:${params.outTokenAddress.toLowerCase()}`;
}

function activeProviderCooldownReason(
  chainId: number,
  provider: SwapQuote["provider"],
): string | undefined {
  const state = providerHealthByKey.get(providerHealthKey(chainId, provider));
  if (!state?.cooldownUntil) {
    return undefined;
  }
  if (state.cooldownUntil <= Date.now()) {
    delete state.cooldownUntil;
    providerHealthByKey.set(providerHealthKey(chainId, provider), state);
    return undefined;
  }
  return `Provider ${provider} cooling down after repeated failures.`;
}

function activePairFailureReason(params: {
  chainId: number;
  provider: SwapQuote["provider"];
  inTokenAddress: Address;
  outTokenAddress: Address;
}): string | undefined {
  const key = pairFailureKey(params);
  const state = pairFailureCacheByKey.get(key);
  if (!state) {
    return undefined;
  }
  if (state.until <= Date.now()) {
    pairFailureCacheByKey.delete(key);
    return undefined;
  }
  return `Recent quote failure cached for ${params.provider}.`;
}

function recordProviderSuccess(
  chainId: number,
  provider: SwapQuote["provider"],
): void {
  providerHealthByKey.set(providerHealthKey(chainId, provider), {
    consecutiveFailures: 0,
  });
}

function recordProviderFailure(
  chainId: number,
  provider: SwapQuote["provider"],
  reason: string,
): void {
  const key = providerHealthKey(chainId, provider);
  const current = providerHealthByKey.get(key) ?? { consecutiveFailures: 0 };
  const nextFailures = current.consecutiveFailures + 1;
  const nextState: ProviderHealthState = {
    consecutiveFailures: nextFailures,
    lastFailureReason: reason,
  };
  if (nextFailures >= resolveAutoSwapProviderFailureThreshold()) {
    nextState.cooldownUntil = Date.now() + resolveAutoSwapProviderCooldownMs();
  }
  providerHealthByKey.set(key, nextState);
}

function recordPairFailure(params: {
  chainId: number;
  provider: SwapQuote["provider"];
  inTokenAddress: Address;
  outTokenAddress: Address;
  reason: string;
}): void {
  pairFailureCacheByKey.set(pairFailureKey(params), {
    until: Date.now() + resolveAutoSwapPairFailureCacheMs(),
    reason: params.reason,
  });
}

function clearPairFailure(params: {
  chainId: number;
  provider: SwapQuote["provider"];
  inTokenAddress: Address;
  outTokenAddress: Address;
}): void {
  pairFailureCacheByKey.delete(pairFailureKey(params));
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutHandle = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms.`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

function parseCandidateSymbols(
  raw: string | undefined,
  debtSymbol: string,
): string[] {
  const requested = raw
    ? raw
        .split(",")
        .map((value) => value.trim().toUpperCase())
        .filter(Boolean)
    : [];

  return [...new Set([debtSymbol.toUpperCase(), ...requested, ...DEFAULT_AUTO_SWAP_SYMBOLS])];
}

function toSortableProfit(report: ProfitCheckReport): bigint {
  if (report.estimatedNetProfitBase !== undefined) {
    return BigInt(report.estimatedNetProfitBase);
  }

  if (report.grossProfitBase !== undefined) {
    return BigInt(report.grossProfitBase);
  }

  return -(10n ** 30n);
}

function toSortableQuoteOutput(quote: SwapQuote): bigint {
  return quote.minOutputAmount > 0n ? quote.minOutputAmount : quote.outputAmount;
}

function passesProfitGate(report: ProfitCheckReport, skipProfitCheck: boolean): boolean {
  if (skipProfitCheck) {
    return true;
  }
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

function quoteAttemptLabel(symbol: string, provider: SwapQuote["provider"]): string {
  return `${symbol}@${provider}`;
}

async function fetchQuoteCandidatesForTarget(
  client: PublicClient,
  target: {
    symbol: string;
    asset: Address;
  },
  context: QuoteContext,
): Promise<{
  routes: SwapQuoteRouteCandidate[];
  attempts: AutoSwapProviderAttempt[];
}> {
  const timeoutMs = resolveAutoSwapQuoteTimeoutMs();
  const providers: Array<{
    provider: SwapQuote["provider"];
    load: () => Promise<SwapQuote>;
  }> = [
    {
      provider: "openocean",
      load: () =>
      fetchOpenOceanSwapQuote(client, {
        chainId: context.chainId,
        account: context.account,
        inTokenAddress: context.inTokenAddress,
        inTokenDecimals: context.inTokenDecimals,
        outTokenAddress: target.asset,
        amount: context.amount,
        slippage: context.slippage,
      }),
    },
  ];

  if (hasZeroExApiKey()) {
    providers.push({
      provider: "0x",
      load: () =>
        fetchZeroExSwapQuote(client, {
          chainId: context.chainId,
          account: context.account,
          inTokenAddress: context.inTokenAddress,
          outTokenAddress: target.asset,
          amount: context.amount,
          slippage: context.slippage,
        }),
    });
  }

  const results = await Promise.all(
    providers.map(async (entry) => {
      const pairParams = {
        chainId: context.chainId,
        provider: entry.provider,
        inTokenAddress: context.inTokenAddress,
        outTokenAddress: target.asset,
      } as const;
      const pairBlockedReason = activePairFailureReason(pairParams);
      if (pairBlockedReason) {
        return {
          provider: entry.provider,
          ok: false as const,
          reason: pairBlockedReason,
        };
      }
      const cooldownReason = activeProviderCooldownReason(
        context.chainId,
        entry.provider,
      );
      if (cooldownReason) {
        return {
          provider: entry.provider,
          ok: false as const,
          reason: cooldownReason,
        };
      }
      try {
        const quote = await withTimeout(
          entry.load(),
          timeoutMs,
          `${quoteAttemptLabel(target.symbol, entry.provider)} quote`,
        );
        recordProviderSuccess(context.chainId, entry.provider);
        clearPairFailure(pairParams);
        return {
          provider: entry.provider,
          ok: true as const,
          quote,
        };
      } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        recordProviderFailure(context.chainId, entry.provider, reason);
        recordPairFailure({
          ...pairParams,
          reason,
        });
        return {
          provider: entry.provider,
          ok: false as const,
          reason,
        };
      }
    }),
  );
  const attempts = results.map((item) => ({
    symbol: target.symbol,
    provider: item.provider,
    ok: item.ok,
    reason: item.ok ? undefined : item.reason,
  }) satisfies AutoSwapProviderAttempt);
  const routes = results
    .filter(
      (
        item,
      ): item is {
        provider: SwapQuote["provider"];
        ok: true;
        quote: SwapQuote;
      } => item.ok,
    )
    .map((entry) => ({
      symbol: target.symbol,
      asset: target.asset,
      quote: entry.quote,
    }) satisfies SwapQuoteRouteCandidate)
    .sort((left, right) => {
      const leftOutput = toSortableQuoteOutput(left.quote);
      const rightOutput = toSortableQuoteOutput(right.quote);
      if (leftOutput === rightOutput) {
        return 0;
      }

      return leftOutput > rightOutput ? -1 : 1;
    });

  return {
    routes,
    attempts,
  };
}

export async function fetchBestSwapQuote(
  client: PublicClient,
  params: QuoteContext & {
    outTokenAddress: Address;
  },
): Promise<SwapQuote> {
  const candidates = await fetchQuoteCandidatesForTarget(
    client,
    {
      symbol: params.outTokenAddress,
      asset: params.outTokenAddress,
    },
    params,
  );

  if (candidates.routes.length === 0) {
    const providers = candidates.attempts
      .map((attempt) => attempt.provider)
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `No swap quote provider returned a route for ${params.outTokenAddress}. Tried: ${providers || "none"}.`,
    );
  }

  return candidates.routes[0].quote;
}

export async function selectAutoSwap(
  client: PublicClient,
  market:
    | Pick<
        ChainPreset,
        "chainId" | "poolAddressesProvider" | "wrappedNativeToken"
      >
    | Pick<
        ResolvedMarket,
        "chainId" | "poolAddressesProvider" | "wrappedNativeToken"
      >,
  prepared: PreparedExecution,
  params: {
    account: Address;
    amount: bigint;
    slippage: string;
    candidateSymbols?: string;
    needsApprove: boolean;
    approveGas?: bigint;
    flashLoanPremiumBps?: bigint;
    gasBufferBps: bigint;
    minNetProfit: string;
    skipProfitCheck: boolean;
  },
): Promise<AutoSwapSelection> {
  const evaluationTimeoutMs = resolveAutoSwapQuoteTimeoutMs() * 2;
  const reserveState = await loadReserveMetadata(client, market.poolAddressesProvider);
  const candidateSymbols = parseCandidateSymbols(
    params.candidateSymbols,
    prepared.liquidationCall.debtSymbol,
  );

  const reserves = candidateSymbols
    .map((symbol) =>
      reserveState.reserves.find(
        (reserve) =>
          reserve.symbol.toUpperCase() === symbol &&
          reserve.asset.toLowerCase() !==
            prepared.liquidationCall.collateralAsset.toLowerCase(),
      ),
    )
    .filter((reserve): reserve is (typeof reserveState.reserves)[number] => Boolean(reserve));

  if (reserves.length === 0) {
    throw new Error(
      `No swap candidates matched symbols: ${candidateSymbols.join(", ")}.`,
    );
  }

  const quoted = await Promise.allSettled(
    reserves.flatMap((reserve) => [
      withTimeout(
        (async () => {
          const quotedTarget = await fetchQuoteCandidatesForTarget(
            client,
            {
              symbol: reserve.symbol,
              asset: reserve.asset,
            },
            {
              chainId: market.chainId,
              account: params.account,
              inTokenAddress: prepared.liquidationCall.collateralAsset,
              inTokenDecimals: prepared.liquidationCall.collateralDecimals,
              amount: params.amount,
              slippage: params.slippage,
            },
          );
          if (quotedTarget.routes.length === 0) {
            throw new AutoSwapSelectionError(
              `No auto swap quote providers returned a route for ${reserve.symbol}.`,
              {
                providerAttempts: quotedTarget.attempts,
                candidatesTried: quotedTarget.attempts.map((attempt) =>
                  quoteAttemptLabel(attempt.symbol, attempt.provider),
                ),
              },
            );
          }

          return Promise.all(
            quotedTarget.routes.map(async (route) => {
              const profitCheck = await evaluateProfitability(client, market, prepared, {
                needsApprove: params.needsApprove,
                approveGas: params.approveGas,
                executeGas: route.quote.estimatedGas,
                gasPriceWei: route.quote.gasPriceWei,
                flashLoanPremiumBps: params.flashLoanPremiumBps,
                gasBufferBps: params.gasBufferBps,
                outputToken: route.quote.outputToken,
                minOutputAmount: route.quote.minOutputAmount,
                minNetProfit: params.minNetProfit,
                skipProfitCheck: params.skipProfitCheck,
              });

              return {
                ...route,
                profitCheck,
              } satisfies AutoSwapQuoteCandidate;
            }),
          );
        })(),
        evaluationTimeoutMs,
        `${reserve.symbol} auto swap evaluation`,
      ),
    ]),
  );

  const successful = quoted
    .filter(
      (
        item,
      ): item is PromiseFulfilledResult<AutoSwapQuoteCandidate[]> =>
        item.status === "fulfilled",
    )
    .flatMap((item) => item.value)
    .sort((left, right) => {
      const leftProfit = toSortableProfit(left.profitCheck);
      const rightProfit = toSortableProfit(right.profitCheck);
      if (leftProfit === rightProfit) {
        return 0;
      }

      return leftProfit > rightProfit ? -1 : 1;
    });

  const profitable = successful.filter((candidate) =>
    passesProfitGate(candidate.profitCheck, params.skipProfitCheck),
  );
  const providerAttempts = quoted.flatMap((item) => {
    if (item.status === "fulfilled") {
      return item.value.map((candidate) => ({
        symbol: candidate.symbol,
        provider: candidate.quote.provider,
        ok: true,
      }) satisfies AutoSwapProviderAttempt);
    }
    if (item.reason instanceof AutoSwapSelectionError) {
      return item.reason.providerAttempts;
    }
    return [];
  });
  const candidatesTried = providerAttempts.map((attempt) =>
    quoteAttemptLabel(attempt.symbol, attempt.provider),
  );

  if (successful.length === 0) {
    const reasons = quoted
      .filter(
        (
          item,
        ): item is PromiseRejectedResult => item.status === "rejected",
      )
      .map((item) => item.reason instanceof Error ? item.reason.message : String(item.reason))
      .join(" | ");
    throw new AutoSwapSelectionError(`All auto swap quotes failed. ${reasons}`, {
      providerAttempts,
      candidatesTried,
    });
  }

  if (profitable.length === 0) {
    const best = successful[0];
    throw new AutoSwapSelectionError(
      `No auto swap quote passed profitability gate. Best candidate ${quoteAttemptLabel(best.symbol, best.quote.provider)} produced ${best.profitCheck.estimatedNetProfitDisplay ?? best.profitCheck.grossProfitDisplay ?? "unknown profit"}.`,
      {
        providerAttempts,
        candidatesTried,
      },
    );
  }

  return {
    selected: profitable[0],
    profitableCandidates: profitable,
    candidatesTried,
    providerAttempts,
  } satisfies AutoSwapSelection;
}
