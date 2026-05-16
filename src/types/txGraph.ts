export type TxGraphChainKey = "ethereum" | "bnb" | "arbitrum";
export type TxGraphNodeKind = "wallet" | "contract" | "token" | "system";
export type TxGraphEdgeKind = "transfer" | "call" | "reference";

export type TxGraphNode = {
  id: string;
  label: string;
  kind: TxGraphNodeKind;
  address?: string;
  subtitle?: string;
};

export type TxGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: TxGraphEdgeKind;
  label: string;
  step: number;
  tokenSymbol?: string;
  amountDisplay?: string;
  selector?: string;
};

export type TxGraphPayload = {
  ok: true;
  txHash: string;
  chain: TxGraphChainKey;
  traceAvailable: boolean;
  nodes: TxGraphNode[];
  edges: TxGraphEdge[];
  summary: {
    transferCount: number;
    callCount: number;
    referenceCount: number;
  };
};
