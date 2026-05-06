import { createPublicClient, createWalletClient, http, toHex, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base, mainnet } from "viem/chains";

import type { MorphoPrivateSubmissionDraft } from "./morpho-private-submission-draft.js";

type MorphoRelayCandidateTransaction = {
  key: string;
  to: string;
  data: `0x${string}`;
  gas: string;
  nonce: number;
  signedTx: Hex;
};

export type MorphoPrivateRelayDraft = {
  stage: "relay-draft-built";
  executable: false;
  submitReady: false;
  chain: "ethereum" | "base";
  chainId: 1 | 8453;
  transport:
    | "flashbots_bundle_candidate"
    | "custom_private_relay_candidate"
    | "public_mempool_candidate";
  relayUrl: string;
  account: string;
  targetMarketLabel: string;
  targetBlockNumber: string;
  signedTransactions: number;
  unresolved: string[];
  transactions: MorphoRelayCandidateTransaction[];
  relayPayload:
    | {
        simulate: Record<string, unknown>;
        submit: Record<string, unknown>;
      }
    | {
        submit: Record<string, unknown>;
      }
    | null;
  summary: string;
};

const CHAIN_MAP = {
  ethereum: mainnet,
  base,
} as const;

export async function buildMorphoPrivateRelayDraft(input: {
  submissionDraft: MorphoPrivateSubmissionDraft;
  rpcUrl: string;
  privateKey: string;
  authPrivateKey?: string;
}): Promise<MorphoPrivateRelayDraft> {
  const draft = input.submissionDraft;
  const relayUrl = draft.relayUrl.trim();
  const transport =
    draft.chain === "base" ? "public_mempool_candidate" : draft.relayTransport;

  if (!draft.steps.length) {
    return {
      stage: "relay-draft-built",
      executable: false,
      submitReady: false,
      chain: draft.chain,
      chainId: draft.chainId,
      transport,
      relayUrl,
      account: "",
      targetMarketLabel: draft.targetMarketLabel,
      targetBlockNumber: "",
      signedTransactions: 0,
      unresolved: ["no-submission-steps"],
      transactions: [],
      relayPayload: null,
      summary:
        "Morpho private relay draft cannot be built because there is no encoded submission sequence yet.",
    };
  }

  if (!input.rpcUrl.trim()) {
    return {
      stage: "relay-draft-built",
      executable: false,
      submitReady: false,
      chain: draft.chain,
      chainId: draft.chainId,
      transport,
      relayUrl,
      account: "",
      targetMarketLabel: draft.targetMarketLabel,
      targetBlockNumber: "",
      signedTransactions: 0,
      unresolved: ["missing-rpc"],
      transactions: [],
      relayPayload: null,
      summary:
        `Morpho private relay draft cannot be built because ${draft.chain} RPC is missing.`,
    };
  }

  if (!input.privateKey.trim()) {
    return {
      stage: "relay-draft-built",
      executable: false,
      submitReady: false,
      chain: draft.chain,
      chainId: draft.chainId,
      transport,
      relayUrl,
      account: "",
      targetMarketLabel: draft.targetMarketLabel,
      targetBlockNumber: "",
      signedTransactions: 0,
      unresolved: ["missing-private-key"],
      transactions: [],
      relayPayload: null,
      summary:
        "Morpho private relay draft cannot be built because the executor private key is missing.",
    };
  }

  const chain = CHAIN_MAP[draft.chain];
  const account = privateKeyToAccount(input.privateKey as Hex);
  const publicClient = createPublicClient({
    chain,
    transport: http(input.rpcUrl),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: http(input.rpcUrl),
  });

  const latestBlock = await publicClient.getBlock({ blockTag: "latest" });
  const startingNonce = await publicClient.getTransactionCount({
    address: account.address,
    blockTag: "pending",
  });
  const gasPrice = await publicClient.getGasPrice();
  const maxPriorityFeePerGas = 2n * 10n ** 9n;
  const maxFeePerGas = (latestBlock.baseFeePerGas ?? gasPrice) * 2n + maxPriorityFeePerGas;

  const transactions: MorphoRelayCandidateTransaction[] = [];
  for (let index = 0; index < draft.steps.length; index += 1) {
    const step = draft.steps[index];
    if (step.calldataStatus !== "encoded-draft" || !step.data || !step.to.startsWith("0x")) {
      continue;
    }

    const gas = await publicClient
      .estimateGas({
        account: account.address,
        to: step.to as `0x${string}`,
        data: step.data,
        value: 0n,
      })
      .catch(() => 250_000n);

    const signedTx = await walletClient.signTransaction({
      account,
      chain,
      type: "eip1559",
      to: step.to as `0x${string}`,
      data: step.data,
      value: 0n,
      nonce: startingNonce + index,
      gas,
      maxFeePerGas,
      maxPriorityFeePerGas,
    });

    transactions.push({
      key: step.key,
      to: step.to,
      data: step.data,
      gas: gas.toString(),
      nonce: startingNonce + index,
      signedTx,
    });
  }

  const targetBlockNumber = (latestBlock.number + 1n).toString();
  const unresolved = [
    ...draft.unresolved,
    ...(draft.chain === "ethereum" && relayUrl ? [] : draft.chain === "ethereum" ? ["missing-relay-url"] : []),
    ...(draft.chain === "ethereum" && !input.authPrivateKey?.trim() ? ["missing-flashbots-auth"] : []),
  ];

  const relayPayload =
    draft.chain === "ethereum"
      ? {
          simulate: {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_callBundle",
            params: [
              {
                txs: transactions.map((item) => item.signedTx),
                blockNumber: toHex(BigInt(targetBlockNumber)),
                stateBlockNumber: "latest",
              },
            ],
          },
          submit: {
            jsonrpc: "2.0",
            id: 1,
            method: "eth_sendBundle",
            params: [
              {
                txs: transactions.map((item) => item.signedTx),
                blockNumber: toHex(BigInt(targetBlockNumber)),
              },
            ],
          },
        }
      : {
          submit: {
            chainId: draft.chainId,
            transport: "public_mempool",
            rpcUrl: input.rpcUrl.trim(),
            txs: transactions.map((item) => item.signedTx),
            targetBlockNumber,
          },
        };

  return {
    stage: "relay-draft-built",
    executable: false,
    submitReady: false,
    chain: draft.chain,
    chainId: draft.chainId,
    transport,
    relayUrl,
    account: account.address,
    targetMarketLabel: draft.targetMarketLabel,
    targetBlockNumber,
    signedTransactions: transactions.length,
    unresolved,
    transactions,
    relayPayload,
    summary:
      transactions.length > 0
        ? draft.chain === "base"
          ? `Morpho Base broadcast draft signed ${transactions.length} transaction candidates for ${draft.targetMarketLabel} and can now be handed to a public mempool submission path.`
          : unresolved.every((item) => item === "live-relay-submission-unimplemented")
            ? `Morpho private relay draft signed ${transactions.length} transaction candidates for ${draft.targetMarketLabel}. Settlement is already resolved in the current config, so the last remaining blocker is live relay submission.`
            : `Morpho private relay draft signed ${transactions.length} transaction candidates for ${draft.targetMarketLabel}, but it is still not submit-ready until the remaining unresolved steps are finalized.`
        : `Morpho private relay draft could not sign any transactions for ${draft.targetMarketLabel}.`,
  };
}
