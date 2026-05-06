import type { MorphoPrivateRelayDraft } from "./morpho-private-relay-draft.js";

export type MorphoLiveSubmissionReadiness = {
  stage: "live-submission-assessed";
  ready: boolean;
  transport: "flashbots_bundle" | "public_mempool" | null;
  chain: "ethereum" | "base";
  unresolved: string[];
  summary: string;
};

export function assessMorphoLiveSubmissionReadiness(input: {
  draft: MorphoPrivateRelayDraft;
  authPrivateKey?: string;
}): MorphoLiveSubmissionReadiness {
  const { draft } = input;

  if (draft.signedTransactions === 0) {
    return {
      stage: "live-submission-assessed",
      ready: false,
      transport: null,
      chain: draft.chain,
      unresolved: ["no-signed-transactions"],
      summary:
        "Morpho live submission is blocked because there are no signed transaction candidates yet.",
    };
  }

  if (draft.chain === "base") {
    return {
      stage: "live-submission-assessed",
      ready: true,
      transport: "public_mempool",
      chain: draft.chain,
      unresolved: [],
      summary:
        "Morpho Base can now use a public mempool submission path via Base RPC. No private relay is required for the current build-only broadcast boundary.",
    };
  }

  if (!input.authPrivateKey?.trim()) {
    return {
      stage: "live-submission-assessed",
      ready: false,
      transport: "flashbots_bundle",
      chain: draft.chain,
      unresolved: ["missing-flashbots-auth"],
      summary:
        "Morpho Ethereum still needs FLASHBOTS_AUTH_PRIVATE_KEY before the Flashbots bundle submission path becomes usable.",
    };
  }

  return {
    stage: "live-submission-assessed",
    ready: true,
    transport: "flashbots_bundle",
    chain: draft.chain,
    unresolved: [],
    summary:
      "Morpho Ethereum can use the Flashbots bundle submission path once a real executable candidate survives the execution gate.",
  };
}
