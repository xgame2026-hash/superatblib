import type { IncomingMessage, ServerResponse } from "node:http";

const BSC_PRO_QUERY_RPC_URL = "https://rpc.bscpro.supermtglobal.com";
const TX_HASH_PATTERN = /^0x[a-fA-F0-9]{64}$/;
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

type ChainKey = "bnb";
type TxGraphNodeKind = "wallet" | "contract" | "token" | "system";
type TxGraphEdgeKind = "transfer" | "call" | "reference";

type TxGraphNode = {
  id: string;
  label: string;
  kind: TxGraphNodeKind;
  address?: string;
  subtitle?: string;
};

type TxGraphEdge = {
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

type RpcTransaction = {
  hash: string;
  from: string;
  to?: string | null;
  input?: string;
  value?: string;
};

type RpcLog = {
  address: string;
  data: string;
  logIndex?: string;
  topics: string[];
};

type RpcReceipt = {
  contractAddress?: string | null;
  logs?: RpcLog[];
};

type RpcCallTrace = {
  from?: string;
  to?: string;
  input?: string;
  value?: string;
  calls?: RpcCallTrace[];
};

const chainLabels: Record<ChainKey, string> = {
  bnb: "BNB",
};

export function handleTxGraphRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/tx-graph")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  const url = new URL(req.url, "http://127.0.0.1");
  fetchTxGraph({
    chain: url.searchParams.get("chain"),
    txHash: url.searchParams.get("txHash"),
  })
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 400, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  return true;
}

async function fetchTxGraph(payload: { chain: string | null; txHash: string | null }) {
  const chain = normalizeChain(payload.chain);
  const txHash = (payload.txHash ?? "").trim();
  if (!TX_HASH_PATTERN.test(txHash)) {
    throw new Error("请输入正确的交易哈希。");
  }

  const result = await fetchTxGraphForChain(chain, txHash, BSC_PRO_QUERY_RPC_URL);
  if (result) return result;
  throw new Error("BNB RPC 未找到这笔交易；请确认交易哈希属于 BSC 主网。");
}

async function fetchTxGraphForChain(chain: ChainKey, txHash: string, rpcUrl: string) {
  const transaction = await rpc<RpcTransaction>(rpcUrl, "eth_getTransactionByHash", [txHash]);
  if (!transaction) {
    return null;
  }

  const receipt = await rpc<RpcReceipt>(rpcUrl, "eth_getTransactionReceipt", [txHash]);
  if (!receipt) {
    throw new Error("交易收据暂不可用，请稍后再查。");
  }

  const nodes = new Map<string, TxGraphNode>();
  const edgeMap = new Map<string, TxGraphEdge>();
  const from = normalizeAddress(transaction.from);
  const to = transaction.to ? normalizeAddress(transaction.to) : "";

  ensureNode(nodes, from, { kind: "wallet", subtitle: "from" });
  if (to) {
    ensureNode(nodes, to, { kind: "contract", subtitle: "to" });
    addEdge(edgeMap, {
      id: `call:root:${from}:${to}`,
      source: from,
      target: to,
      kind: "call",
      label: selectorLabel(transaction.input),
      selector: selectorFromInput(transaction.input),
      step: 0,
    });
  }

  const nativeValue = hexToBigInt(transaction.value);
  if (to && nativeValue > 0n) {
    addEdge(edgeMap, {
      id: `native:${from}:${to}:${nativeValue.toString()}`,
      source: from,
      target: to,
      kind: "transfer",
      label: `${formatEther(nativeValue)} BNB`,
      tokenSymbol: "BNB",
      amountDisplay: formatEther(nativeValue),
      step: 1,
    });
  }

  parseReceiptLogs(receipt, nodes, edgeMap);

  let traceAvailable = false;
  try {
    const trace = await rpc<RpcCallTrace>(rpcUrl, "debug_traceTransaction", [
      txHash,
      { tracer: "callTracer", timeout: "10s" },
    ]);
    if (trace) {
      traceAvailable = appendTrace(trace, nodes, edgeMap);
    }
  } catch {
    traceAvailable = false;
  }

  const edges = Array.from(edgeMap.values());
  return {
    ok: true,
    txHash,
    chain,
    traceAvailable,
    nodes: Array.from(nodes.values()),
    edges,
    summary: {
      transferCount: edges.filter((edge) => edge.kind === "transfer").length,
      callCount: edges.filter((edge) => edge.kind === "call").length,
      referenceCount: edges.filter((edge) => edge.kind === "reference").length,
    },
  };
}

function parseReceiptLogs(receipt: RpcReceipt, nodes: Map<string, TxGraphNode>, edges: Map<string, TxGraphEdge>) {
  let step = 10;
  for (const log of receipt.logs ?? []) {
    if (log.topics?.[0]?.toLowerCase() !== TRANSFER_TOPIC || log.topics.length < 3) continue;
    const source = addressFromTopic(log.topics[1]);
    const target = addressFromTopic(log.topics[2]);
    const token = normalizeAddress(log.address);
    if (!source || !target || !token) continue;

    const rawAmount = hexToBigInt(log.data);
    const amountDisplay = compactTokenAmount(rawAmount);
    ensureNode(nodes, source, { kind: source.endsWith("0000000000000000000000000000000000000000") ? "system" : "wallet" });
    ensureNode(nodes, target, { kind: "wallet" });
    ensureNode(nodes, token, { kind: "token", subtitle: "ERC20" });
    addEdge(edges, {
      id: `erc20:${log.address}:${log.logIndex ?? step}:${source}:${target}`,
      source,
      target,
      kind: "transfer",
      label: amountDisplay,
      amountDisplay,
      step,
    });
    addEdge(edges, {
      id: `token-ref:${step}:${token}:${target}`,
      source: token,
      target,
      kind: "reference",
      label: "token",
      step,
    });
    step += 1;
  }
}

function appendTrace(trace: RpcCallTrace, nodes: Map<string, TxGraphNode>, edges: Map<string, TxGraphEdge>) {
  let found = false;
  let step = 100;

  const walk = (call: RpcCallTrace) => {
    const source = call.from ? normalizeAddress(call.from) : "";
    const target = call.to ? normalizeAddress(call.to) : "";
    if (source && target) {
      found = true;
      ensureNode(nodes, source, { kind: "contract" });
      ensureNode(nodes, target, { kind: "contract" });
      addEdge(edges, {
        id: `trace:${step}:${source}:${target}:${selectorFromInput(call.input) ?? "call"}`,
        source,
        target,
        kind: "call",
        label: selectorLabel(call.input),
        selector: selectorFromInput(call.input),
        step,
      });

      const value = hexToBigInt(call.value);
      if (value > 0n) {
        addEdge(edges, {
          id: `trace-native:${step}:${source}:${target}:${value.toString()}`,
          source,
          target,
          kind: "transfer",
          label: `${formatEther(value)} BNB`,
          tokenSymbol: "BNB",
          amountDisplay: formatEther(value),
          step,
        });
      }
      step += 1;
    }
    for (const child of call.calls ?? []) {
      walk(child);
    }
  };

  walk(trace);
  return found;
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T | null> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC HTTP ${response.status}`);
  }
  const payload = (await response.json()) as { result?: T | null; error?: { message?: string } };
  if (payload.error) {
    throw new Error(payload.error.message ?? "RPC request failed.");
  }
  return payload.result ?? null;
}

function normalizeChain(value: string | null): ChainKey {
  const key = (value ?? "bnb").toLowerCase();
  if (key === "bnb" || key === "bsc" || key === "binance") return "bnb";
  throw new Error("交易查询页仅支持 BNB Chain。");
}

function ensureNode(nodes: Map<string, TxGraphNode>, id: string, partial: Partial<TxGraphNode>) {
  if (!id) return;
  const existing = nodes.get(id);
  const kind = mergeKind(existing?.kind, partial.kind);
  nodes.set(id, {
    id,
    label: existing?.label ?? shortAddress(id),
    kind,
    address: partial.address ?? existing?.address ?? id,
    subtitle: partial.subtitle ?? existing?.subtitle,
  });
}

function mergeKind(current: TxGraphNodeKind | undefined, next: TxGraphNodeKind | undefined): TxGraphNodeKind {
  const rank: Record<TxGraphNodeKind, number> = { system: 4, wallet: 3, token: 2, contract: 1 };
  if (!current) return next ?? "contract";
  if (!next) return current;
  return rank[next] >= rank[current] ? next : current;
}

function addEdge(edges: Map<string, TxGraphEdge>, edge: TxGraphEdge) {
  if (!edge.source || !edge.target || edge.source === edge.target) return;
  if (!edges.has(edge.id)) {
    edges.set(edge.id, edge);
  }
}

function selectorFromInput(input: string | undefined) {
  return input && input.startsWith("0x") && input.length >= 10 ? input.slice(0, 10) : undefined;
}

function selectorLabel(input: string | undefined) {
  return selectorFromInput(input) ? `call ${selectorFromInput(input)}` : "call";
}

function addressFromTopic(topic: string | undefined) {
  if (!topic || !topic.startsWith("0x") || topic.length !== 66) return "";
  return normalizeAddress(`0x${topic.slice(-40)}`);
}

function normalizeAddress(value: string | undefined | null) {
  if (!value) return "";
  const normalized = value.trim().toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : "";
}

function shortAddress(value: string) {
  return value.length > 14 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function hexToBigInt(value: string | undefined | null) {
  if (!value || value === "0x") return 0n;
  try {
    return BigInt(value);
  } catch {
    return 0n;
  }
}

function formatEther(value: bigint) {
  const base = 10n ** 18n;
  const integer = value / base;
  const fraction = (value % base).toString().padStart(18, "0").slice(0, 6).replace(/0+$/, "");
  return fraction ? `${integer}.${fraction}` : integer.toString();
}

function compactTokenAmount(value: bigint) {
  if (value === 0n) return "0";
  const raw = value.toString();
  return raw.length > 12 ? `${raw.slice(0, 6)}...${raw.slice(-4)}` : raw;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
