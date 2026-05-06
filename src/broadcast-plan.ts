import {
  Abi,
  Account,
  Address,
  Chain,
  Hash,
  Hex,
  PublicClient,
  WalletClient,
  encodeFunctionData,
  keccak256,
  stringToHex,
  toHex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";

export type BroadcastTransport = "public_mempool" | "flashbots_bundle";

export type ContractWriteStep = {
  label: string;
  request: {
    address: Address;
    abi: readonly unknown[];
    functionName: string;
    args?: readonly unknown[];
    chain: Chain;
    account: Address | Account;
    gas?: bigint;
    gasFallback?: bigint;
    value?: bigint;
  };
  waitForReceipt?: boolean;
};

export type BroadcastPlanStepResult = {
  label: string;
  txHash: Hash;
  receipt?: Awaited<ReturnType<PublicClient["waitForTransactionReceipt"]>>;
};

export type BroadcastPlanExecution = {
  transport: BroadcastTransport;
  steps: BroadcastPlanStepResult[];
  metadata?: Record<string, unknown>;
};

type FlashbotsJsonRpcSuccess<T> = {
  jsonrpc: "2.0";
  id: string | number;
  result: T;
};

type FlashbotsJsonRpcError = {
  jsonrpc: "2.0";
  id: string | number;
  error: {
    code?: number;
    message?: string;
    data?: unknown;
  };
};

const FLASHBOTS_SUPPORTED_CHAIN_IDS = new Set([1, 11155111]);

const DEFAULT_FLASHBOTS_MAX_BLOCKS = 3;
const DEFAULT_FLASHBOTS_PRIORITY_FEE_WEI = 2n * 10n ** 9n;
const DEFAULT_FLASHBOTS_APPROVE_GAS = 80_000n;
const DEFAULT_FLASHBOTS_TRANSFER_GAS = 100_000n;
const DEFAULT_FLASHBOTS_LIQUIDATION_GAS = 900_000n;
const DEFAULT_FLASHBOTS_EXECUTE_GAS = 1_500_000n;

function defaultFlashbotsRelayUrl(chainId: number): string {
  return chainId === 11155111
    ? "https://relay-sepolia.flashbots.net"
    : "https://relay.flashbots.net";
}

function parsePositiveInteger(raw: string | undefined, fallback: number): number {
  if (!raw) {
    return fallback;
  }

  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    return fallback;
  }

  return Math.trunc(value);
}

function withGasBuffer(value: bigint): bigint {
  return (value * 12n + 9n) / 10n;
}

function stepGasFallback(step: ContractWriteStep): bigint {
  const label = step.label.trim().toLowerCase();
  if (label.includes("approve")) {
    return DEFAULT_FLASHBOTS_APPROVE_GAS;
  }
  if (label.includes("transfer") || label.includes("distribute")) {
    return DEFAULT_FLASHBOTS_TRANSFER_GAS;
  }
  if (label.includes("liquidation")) {
    return DEFAULT_FLASHBOTS_LIQUIDATION_GAS;
  }
  return DEFAULT_FLASHBOTS_EXECUTE_GAS;
}

async function resolveStepGas(
  publicClient: PublicClient,
  step: ContractWriteStep,
): Promise<bigint> {
  if (step.request.gas !== undefined) {
    return step.request.gas;
  }

  try {
    const estimated = await publicClient.estimateContractGas(step.request as never);
    return withGasBuffer(estimated);
  } catch {
    if (step.request.gasFallback !== undefined) {
      return step.request.gasFallback;
    }
    return stepGasFallback(step);
  }
}

async function buildFlashbotsHeader(
  body: string,
  authPrivateKey: Hash,
): Promise<string> {
  const authAccount = privateKeyToAccount(authPrivateKey);
  const bodyHash = keccak256(stringToHex(body));
  const signature = await authAccount.signMessage({
    message: { raw: bodyHash },
  });
  return `${authAccount.address}:${signature}`;
}

async function flashbotsRpc<T>(
  relayUrl: string,
  authPrivateKey: Hash,
  payload: Record<string, unknown>,
): Promise<T> {
  const body = JSON.stringify(payload);
  const signature = await buildFlashbotsHeader(body, authPrivateKey);
  const response = await fetch(relayUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-flashbots-signature": signature,
    },
    body,
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(
      `Flashbots relay request failed (${response.status} ${response.statusText}).`,
    );
  }

  const json = (await response.json()) as
    | FlashbotsJsonRpcSuccess<T>
    | FlashbotsJsonRpcError;

  if ("error" in json) {
    throw new Error(
      `Flashbots relay error ${json.error.code ?? "unknown"}: ${
        json.error.message ?? "unknown error"
      }`,
    );
  }

  return json.result;
}

async function waitForBlock(
  publicClient: PublicClient,
  blockNumber: bigint,
): Promise<void> {
  for (;;) {
    const latest = await publicClient.getBlockNumber();
    if (latest >= blockNumber) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function readReceipts(
  publicClient: PublicClient,
  txHashes: Hash[],
): Promise<Array<Awaited<ReturnType<PublicClient["getTransactionReceipt"]>> | undefined>> {
  return Promise.all(
    txHashes.map((hash) =>
      publicClient.getTransactionReceipt({ hash }).catch(() => undefined),
    ),
  );
}

async function executeFlashbotsBundle(params: {
  chainId: number;
  publicClient: PublicClient;
  walletClient: WalletClient;
  steps: ContractWriteStep[];
  authPrivateKey: Hash;
}): Promise<BroadcastPlanExecution> {
  const { chainId, publicClient, walletClient, steps, authPrivateKey } = params;
  const relayUrl =
    process.env.FLASHBOTS_RELAY_URL?.trim() || defaultFlashbotsRelayUrl(chainId);
  const maxBlocks = parsePositiveInteger(
    process.env.FLASHBOTS_MAX_BLOCKS,
    DEFAULT_FLASHBOTS_MAX_BLOCKS,
  );
  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const startingNonce = await publicClient.getTransactionCount({
    address:
      typeof steps[0]?.request.account === "string"
        ? steps[0].request.account
        : steps[0].request.account.address,
    blockTag: "pending",
  });
  const baseFeePerGas =
    latestBlock.baseFeePerGas ?? (await publicClient.getGasPrice());
  const maxPriorityFeePerGas = DEFAULT_FLASHBOTS_PRIORITY_FEE_WEI;
  const maxFeePerGas = baseFeePerGas * 2n + maxPriorityFeePerGas;

  const signedTransactions: Hex[] = [];
  const txHashes: Hash[] = [];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const data = encodeFunctionData({
      abi: step.request.abi as Abi,
      functionName: step.request.functionName,
      args: step.request.args,
    });
    const gas = await resolveStepGas(publicClient, step);
    const serialized = await walletClient.signTransaction({
      account: step.request.account,
      chain: step.request.chain,
      type: "eip1559",
      to: step.request.address,
      data,
      value: step.request.value ?? 0n,
      nonce: startingNonce + index,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });
    signedTransactions.push(serialized);
    txHashes.push(keccak256(serialized));
  }

  let lastBundleHash: string | undefined;
  let lastSimulation: Record<string, unknown> | undefined;
  let targetBlockNumber: bigint | undefined;

  for (let offset = 1; offset <= maxBlocks; offset += 1) {
    targetBlockNumber = latestBlock.number + BigInt(offset);
    const blockNumberHex = toHex(targetBlockNumber);

    lastSimulation = await flashbotsRpc<Record<string, unknown>>(relayUrl, authPrivateKey, {
      jsonrpc: "2.0",
      id: 1,
      method: "eth_callBundle",
      params: [
        {
          txs: signedTransactions,
          blockNumber: blockNumberHex,
          stateBlockNumber: "latest",
        },
      ],
    });

    const bundleResult = await flashbotsRpc<{ bundleHash?: string }>(
      relayUrl,
      authPrivateKey,
      {
        jsonrpc: "2.0",
        id: 1,
        method: "eth_sendBundle",
        params: [
          {
            txs: signedTransactions,
            blockNumber: blockNumberHex,
          },
        ],
      },
    );
    lastBundleHash = bundleResult.bundleHash;

    await waitForBlock(publicClient, targetBlockNumber);
    const receipts = await readReceipts(publicClient, txHashes);
    const finalReceipt = receipts[receipts.length - 1];
    if (finalReceipt) {
      return {
        transport: "flashbots_bundle",
        steps: steps.map((step, index) => ({
          label: step.label,
          txHash: txHashes[index],
          receipt: receipts[index],
        })),
        metadata: {
          relayUrl,
          bundleHash: lastBundleHash,
          targetBlockNumber: targetBlockNumber.toString(),
          signedTransactionCount: signedTransactions.length,
          simulation: lastSimulation,
        },
      };
    }
  }

  throw new Error(
    `Flashbots bundle was not included after ${maxBlocks} target blocks.${lastBundleHash ? ` Last bundleHash: ${lastBundleHash}.` : ""}`,
  );
}

export function resolveBroadcastTransport(
  raw: string | undefined,
): BroadcastTransport {
  const normalized = raw?.trim().toLowerCase();
  if (!normalized) {
    return "public_mempool";
  }

  if (
    normalized === "public_mempool" ||
    normalized === "public" ||
    normalized === "mempool"
  ) {
    return "public_mempool";
  }

  if (
    normalized === "flashbots_bundle" ||
    normalized === "flashbots" ||
    normalized === "bundle" ||
    normalized === "flashbots_private" ||
    normalized === "private"
  ) {
    return "flashbots_bundle";
  }

  throw new Error(
    `Unsupported broadcast transport "${raw}". Supported values: public_mempool, flashbots_bundle.`,
  );
}

export function assertBroadcastTransportSupported(
  chainId: number,
  transport: BroadcastTransport,
): void {
  if (
    transport === "flashbots_bundle" &&
    !FLASHBOTS_SUPPORTED_CHAIN_IDS.has(chainId)
  ) {
    throw new Error(
      `flashbots_bundle currently supports Ethereum Mainnet (1) and Sepolia (11155111); received chainId ${chainId}.`,
    );
  }
}

export async function executeBroadcastPlan(params: {
  transport: BroadcastTransport;
  chainId: number;
  publicClient: PublicClient;
  walletClient: WalletClient;
  steps: ContractWriteStep[];
  authPrivateKey?: Hash;
}): Promise<BroadcastPlanExecution> {
  const { transport, chainId, publicClient, walletClient, steps, authPrivateKey } =
    params;

  assertBroadcastTransportSupported(chainId, transport);

  switch (transport) {
    case "public_mempool": {
      const results: BroadcastPlanStepResult[] = [];
      for (const step of steps) {
        const txHash = await walletClient.writeContract(step.request as never);
        const receipt =
          step.waitForReceipt === false
            ? undefined
            : await publicClient.waitForTransactionReceipt({ hash: txHash });
        results.push({
          label: step.label,
          txHash,
          receipt,
        });
      }
      return {
        transport,
        steps: results,
      };
    }
    case "flashbots_bundle": {
      if (!authPrivateKey) {
        throw new Error(
          "flashbots_bundle requires FLASHBOTS_AUTH_PRIVATE_KEY or a forwarded authPrivateKey.",
        );
      }
      return executeFlashbotsBundle({
        chainId,
        publicClient,
        walletClient,
        steps,
        authPrivateKey,
      });
    }
    default: {
      const unreachable: never = transport;
      throw new Error(`Unsupported broadcast transport: ${unreachable}`);
    }
  }
}
