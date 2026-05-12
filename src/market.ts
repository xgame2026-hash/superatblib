import {
  Address,
  PublicClient,
  formatUnits,
  getAddress,
  isAddress,
} from "viem";

import { addressProviderAbi, poolAbi, poolEvents } from "./abi.js";
import {
  CHAIN_PRESETS,
  ChainPreset,
  ExecutionMarketPreset,
} from "./config.js";
import { AAVE_V3_PROTOCOL, type ProtocolDescriptor } from "./protocols.js";

export type ResolvedMarket = {
  chainId: number;
  chainName: string;
  marketId?: string;
  executionMarketKey?: string;
  executionMarketLabel?: string;
  protocol: ProtocolDescriptor;
  poolAddressesProvider: Address;
  pool: Address;
  wrappedNativeToken?: Address;
  warnings: string[];
  source?: string;
};

export type AccountSnapshot = {
  user: Address;
  totalCollateralBase: bigint;
  totalDebtBase: bigint;
  availableBorrowsBase: bigint;
  currentLiquidationThreshold: bigint;
  ltv: bigint;
  healthFactor: bigint;
};

type MarketProgressLogger = (message: string) => void;

export const HEALTH_FACTOR_DECIMALS = 18;
export const LIQUIDATABLE_HEALTH_FACTOR = 1n * 10n ** 18n;
const MULTICALL3_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11" as const;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRpcRateLimitError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /rps limit exceeded|rate limit|too many requests|429/i.test(message);
}

async function withRpcRetry<T>(
  operation: () => Promise<T>,
  label: string,
  attempts = 5,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRpcRateLimitError(error) || attempt >= attempts - 1) {
        break;
      }
      await sleep(900 * (attempt + 1));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} failed.`);
}

function minBigInt(left: bigint, right: bigint): bigint {
  return left < right ? left : right;
}

function isRetryableLogRangeError(error: unknown): boolean {
  const message =
    error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return (
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("request too large") ||
    message.includes("response size exceeded") ||
    message.includes("query returned more than") ||
    message.includes("block range") ||
    message.includes("limit exceeded")
  );
}

async function getLogsAdaptive(
  client: PublicClient,
  params: {
    pool: Address;
    fromBlock: bigint;
    toBlock: bigint;
  },
  logger?: MarketProgressLogger,
): Promise<any[]> {
  try {
    return await client.getLogs({
      address: params.pool,
      events: poolEvents,
      fromBlock: params.fromBlock,
      toBlock: params.toBlock,
      strict: false,
    });
  } catch (error) {
    const span = params.toBlock - params.fromBlock;
    if (!isRetryableLogRangeError(error) || span <= 0n) {
      throw error;
    }

    const midpoint = params.fromBlock + span / 2n;
    logger?.(
      `Log range ${params.fromBlock} -> ${params.toBlock} failed, splitting into ${params.fromBlock} -> ${midpoint} and ${midpoint + 1n} -> ${params.toBlock}`,
    );
    const [left, right] = await Promise.all([
      getLogsAdaptive(client, {
        pool: params.pool,
        fromBlock: params.fromBlock,
        toBlock: midpoint,
      }, logger),
      getLogsAdaptive(client, {
        pool: params.pool,
        fromBlock: midpoint + 1n,
        toBlock: params.toBlock,
      }, logger),
    ]);
    return [...left, ...right];
  }
}

function addUser(target: Set<Address>, value: unknown): void {
  if (typeof value === "string" && isAddress(value)) {
    target.add(getAddress(value));
  }
}

export function toHealthFactorWad(value: number): bigint {
  return BigInt(Math.round(value * 1e6)) * 10n ** 12n;
}

export function formatHealthFactor(value: bigint): string {
  const asNumber = Number(formatUnits(value, HEALTH_FACTOR_DECIMALS));
  if (Number.isFinite(asNumber)) {
    return asNumber.toFixed(asNumber < 1 ? 4 : 3);
  }

  return formatUnits(value, HEALTH_FACTOR_DECIMALS);
}

export function formatBasisPoints(value: bigint): string {
  return `${(Number(value) / 100).toFixed(2)}%`;
}

export function shortAddress(address: Address): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export async function hasCode(
  client: PublicClient,
  address: Address,
): Promise<boolean> {
  const code = await client.getCode({ address });
  return code !== "0x";
}

export async function resolveMarket(
  client: PublicClient,
  intendedChain: ChainPreset | undefined,
  intendedExecutionMarket: ExecutionMarketPreset | undefined,
  configuredAddressProvider: Address | undefined,
): Promise<ResolvedMarket> {
  const warnings: string[] = [];
  const chainId = await client.getChainId();
  if (intendedChain && intendedChain.chainId !== chainId) {
    throw new Error(
      `RPC chainId ${chainId} does not match --chain ${intendedChain.key} (${intendedChain.chainId}).`,
    );
  }
  if (intendedExecutionMarket && intendedExecutionMarket.chainId !== chainId) {
    throw new Error(
      `RPC chainId ${chainId} does not match --market ${intendedExecutionMarket.key} (${intendedExecutionMarket.chainId}).`,
    );
  }
  const chainPreset = CHAIN_PRESETS[chainId];
  const preset = intendedExecutionMarket ?? chainPreset;

  let poolAddressesProvider = configuredAddressProvider
    ? getAddress(configuredAddressProvider)
    : undefined;

  if (poolAddressesProvider) {
    const providerHasCode = await hasCode(client, poolAddressesProvider);
    if (!providerHasCode) {
      warnings.push(
        `Configured ADDRESS_PROVIDER ${poolAddressesProvider} has no code on chain ${chainId}.`,
      );
      poolAddressesProvider = undefined;
    }
  }

  if (!poolAddressesProvider) {
    if (!preset) {
      throw new Error(
        `No valid ADDRESS_PROVIDER found on chain ${chainId}, and there is no local preset for this chain.`,
      );
    }

    poolAddressesProvider = preset.poolAddressesProvider;
    warnings.push(
      `Using canonical ${intendedExecutionMarket?.label ?? chainPreset?.name ?? `chain ${chainId}`} address provider ${poolAddressesProvider}.`,
    );
  }

  let pool: Address | undefined;
  let marketId: string | undefined;

  try {
    const [resolvedPool, resolvedMarketId] = await Promise.all([
      client.readContract({
        address: poolAddressesProvider,
        abi: addressProviderAbi,
        functionName: "getPool",
      }),
      client
        .readContract({
          address: poolAddressesProvider,
          abi: addressProviderAbi,
          functionName: "getMarketId",
        })
        .catch(() => undefined),
    ]);

    pool = getAddress(resolvedPool);
    marketId = resolvedMarketId;
  } catch (error) {
    if (!preset) {
      throw error;
    }

    poolAddressesProvider = preset.poolAddressesProvider;
    pool = preset.pool;
    warnings.push(
      `Configured ADDRESS_PROVIDER is incompatible on chain ${chainId}; using preset provider ${preset.poolAddressesProvider} and pool ${preset.pool}.`,
    );
  }

  if (!(await hasCode(client, pool))) {
    throw new Error(`Resolved pool ${pool} has no code on chain ${chainId}.`);
  }

  return {
    chainId,
    chainName: chainPreset?.name ?? `Chain ${chainId}`,
    marketId,
    executionMarketKey: intendedExecutionMarket?.key,
    executionMarketLabel: intendedExecutionMarket?.label,
    protocol: preset?.protocol ?? AAVE_V3_PROTOCOL,
    poolAddressesProvider,
    pool,
    wrappedNativeToken: preset?.wrappedNativeToken,
    warnings,
    source: preset?.source,
  };
}

export async function collectCandidateUsers(
  client: PublicClient,
  pool: Address,
  fromBlock: bigint,
  toBlock: bigint,
  chunkSize: bigint,
  logger?: MarketProgressLogger,
): Promise<Set<Address>> {
  const users = new Set<Address>();

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = minBigInt(start + chunkSize - 1n, toBlock);
    logger?.(`Scanning pool events: blocks ${start} -> ${end}`);

    const logs = await getLogsAdaptive(client, {
      pool,
      fromBlock: start,
      toBlock: end,
    }, logger);

    for (const log of logs) {
      switch (log.eventName) {
        case "Supply":
          addUser(users, log.args.onBehalfOf);
          addUser(users, log.args.user);
          break;
        case "Borrow":
          addUser(users, log.args.onBehalfOf);
          addUser(users, log.args.user);
          break;
        case "Withdraw":
          addUser(users, log.args.user);
          break;
        case "Repay":
          addUser(users, log.args.user);
          break;
        case "ReserveUsedAsCollateralEnabled":
        case "ReserveUsedAsCollateralDisabled":
        case "UserEModeSet":
        case "LiquidationCall":
          addUser(users, log.args.user);
          break;
        default:
          break;
      }
    }
  }

  return users;
}

export async function loadAccountSnapshots(
  client: PublicClient,
  pool: Address,
  users: Address[],
  userBatchSize: number,
  logger?: MarketProgressLogger,
): Promise<AccountSnapshot[]> {
  const positions: AccountSnapshot[] = [];

  for (let index = 0; index < users.length; index += userBatchSize) {
    const batch = users.slice(index, index + userBatchSize);
    logger?.(
      `Reading user account data: ${index + 1} -> ${Math.min(index + batch.length, users.length)} / ${users.length}`,
    );

    let batchResults:
      | Array<
          | {
              status: "success";
              result: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
            }
          | {
              status: "failure";
            }
        >
      | undefined;

    try {
      // A single multicall batch is materially cheaper than one RPC call per user.
      batchResults = (await withRpcRetry(() => client.multicall({
        allowFailure: true,
        multicallAddress: MULTICALL3_ADDRESS,
        contracts: batch.map((user) => ({
          address: pool,
          abi: poolAbi,
          functionName: "getUserAccountData",
          args: [user],
        })),
      }), `multicall getUserAccountData ${index + 1}`)) as Array<
        | {
            status: "success";
            result: readonly [bigint, bigint, bigint, bigint, bigint, bigint];
          }
        | {
            status: "failure";
          }
      >;
    } catch (error) {
      console.warn(
        `Multicall getUserAccountData failed for ${batch.length} users, falling back to single reads: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      batchResults = [];
      for (const user of batch) {
          try {
            const result = await withRpcRetry(() => client.readContract({
              address: pool,
              abi: poolAbi,
              functionName: "getUserAccountData",
              args: [user],
            }), `getUserAccountData ${user}`);
            batchResults.push({
              status: "success" as const,
              result,
            });
          } catch {
            batchResults.push({
              status: "failure" as const,
            });
          }
      }
    }

    for (const [resultIndex, result] of batchResults.entries()) {
      if (result.status !== "success") {
        continue;
      }
      const accountData = result.result;
      const snapshot: AccountSnapshot = {
        user: batch[resultIndex],
        totalCollateralBase: accountData[0],
        totalDebtBase: accountData[1],
        availableBorrowsBase: accountData[2],
        currentLiquidationThreshold: accountData[3],
        ltv: accountData[4],
        healthFactor: accountData[5],
      };
      if (snapshot.totalDebtBase > 0n) {
        positions.push(snapshot);
      }
    }
  }

  return positions;
}

export function sortRiskySnapshots(
  snapshots: AccountSnapshot[],
  alertThreshold: number,
): { risky: AccountSnapshot[]; liquidatable: AccountSnapshot[] } {
  const alertThresholdWad = toHealthFactorWad(alertThreshold);
  const risky = snapshots
    .filter((snapshot) => snapshot.healthFactor < alertThresholdWad)
    .sort((left, right) => {
      if (left.healthFactor === right.healthFactor) {
        if (left.totalDebtBase === right.totalDebtBase) {
          return 0;
        }

        return left.totalDebtBase > right.totalDebtBase ? -1 : 1;
      }

      return left.healthFactor < right.healthFactor ? -1 : 1;
    });

  return {
    risky,
    liquidatable: risky.filter(
      (snapshot) => snapshot.healthFactor < LIQUIDATABLE_HEALTH_FACTOR,
    ),
  };
}
