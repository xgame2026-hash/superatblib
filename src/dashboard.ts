import { readFileSync } from "node:fs";
import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";
import {
  createPublicClient,
  formatUnits,
  getAddress,
  http,
  isAddress,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import {
  arbitrageModeLabel,
  normalizeArbitrageModeKey,
  normalizeArbitrageTokenFilter,
  normalizeArbitrageVenueFilter,
} from "./arbitrage/strategies.js";
import { streamArbitrageMonitor } from "./arbitrage/monitor.js";
import {
  inferExecutionChainForSelection,
  normalizeExecutionMarketSelectionKey,
  validateExecutionMarketSelectionChain,
} from "./liquidation/strategies.js";
import {
  defaultExecutionAlertThreshold,
  defaultExecutionLimit,
  defaultExecutionLookbackBlocks,
  defaultExecutionMinNetProfit,
} from "./liquidation/tuning.js";
import { streamLiquidationMonitor } from "./liquidation/monitor.js";

import {
  CHAIN_PRESETS,
  EXECUTION_MARKET_PRESETS,
  type ChainPreset,
  type ExecutionMarketPreset,
} from "./config.js";
import { DASHBOARD_HTML } from "./dashboard-html.js";
import {
  createDashboardApiHandler,
  serveDashboardHtml,
  serveDashboardStaticAsset,
} from "./dashboard-http-handler.js";
import {
  handleDashboardAuthRoute,
  isDashboardAuthRoute,
  requireDashboardAuth,
  serveDashboardAuthPage,
} from "./dashboard-auth.js";
import {
  eigenphiDashboardProviderSummary,
  fetchEigenphiDashboardPayload,
} from "./eigenphi-dashboard-provider.js";
import {
  activateLicense,
  bearerToken,
  licenseStatus,
  requireLicensedFeature,
} from "./license-auth.js";
import { databaseMarketDataIndexStatus } from "./market-data-db.js";
import { onchainDashboardIndexStatus } from "./onchain-dashboard-provider.js";
import {
  DashboardLiveState,
  dashboardLiveStateFilePath,
  loadDashboardLiveState,
  saveDashboardLiveState,
} from "./dashboard-live-state.js";
import {
  dashboardSettingsFilePath,
  loadDashboardSettings,
  resolveConfiguredLiquidatorContract,
  saveDashboardSettings,
} from "./dashboard-settings.js";
import { HistoryEntry, historyFilePath, loadHistory } from "./history.js";
import { loadReserveMetadata } from "./liquidation-analysis.js";
import {
  fetchMorphoBlueBaseDashboardSnapshot,
  fetchMorphoBlueEthereumDashboardSnapshot,
} from "./morpho-blue-api.js";
import { resolveMarket } from "./market.js";
import { morphoBlueEthereumRegistrySummary } from "./morpho-blue-registry.js";
import { strategyMarketsSummary } from "./strategy-markets.js";
import {
  buildCliActionSpec,
  executeCliAction,
  type CliRunRequest,
} from "./cli-launcher.js";

const DASHBOARD_AUTH_LICENSE_TOKEN = "__dashboard_auth_remote_license__";
const DEFAULT_GITHUB_PACKAGE_URL =
  "https://raw.githubusercontent.com/xgame2026-hash/superatblib/main/package.json";
const GITHUB_VERSION_CACHE_TTL_MS = 60_000;

type DashboardVersionCache = {
  expiresAt: number;
  githubVersion: string | null;
  githubError: string | null;
};

let dashboardVersionCache: DashboardVersionCache | null = null;

type DashboardRecipient = {
  address: string;
  bps?: string;
  amount?: string;
  amountDisplay?: string;
};

type DashboardDistribution = {
  token?: string;
  grossAmountDisplay?: string;
  principalReserveAmountDisplay?: string;
  distributableProfitAmountDisplay?: string;
  remainderToOwnerDisplay?: string;
  canDistribute?: boolean;
  reason?: string;
  recipients: DashboardRecipient[];
};

type DashboardEntry = {
  recordedAt: string;
  script: string;
  mode: "simulation" | "broadcast";
  chainName?: string;
  marketId?: string;
  executionMarketLabel?: string;
  selectedUser?: string;
  pair?: string;
  outputToken?: string;
  liquidatable?: boolean;
  estimatedNetProfitDisplay?: string;
  realizedNetProfitDisplay?: string;
  txHash?: string;
  status?: string;
  distribution?: DashboardDistribution;
  raw: unknown;
};

type DashboardRunRequest = CliRunRequest & {
  resumeFromBlock?: unknown;
  resumeChunkStart?: unknown;
  resumeChunkEnd?: unknown;
  resumeUserOffset?: unknown;
  hfMax?: unknown;
  marketId?: unknown;
  kind?: unknown;
  refresh?: unknown;
};

type DashboardConsoleTarget = {
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
  source: "scan" | "analyze" | "morpho-blue";
  buyExchange?: string;
  sellExchange?: string;
  buyPriceDisplay?: string;
  sellPriceDisplay?: string;
  feeEstimateDisplay?: string;
  availableNotionalDisplay?: string;
};

type DashboardConsoleSelection = {
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
  buyExchange?: string;
  sellExchange?: string;
  buyPriceDisplay?: string;
  sellPriceDisplay?: string;
  feeEstimateDisplay?: string;
  availableNotionalDisplay?: string;
};

type QuickNodeUsageMetric = {
  chain: ChainPreset["key"];
  chainName: string;
  requests24h: number | null;
  endpointLabel?: string;
  endpointName?: string;
  network?: string;
  status:
    | "ok"
    | "missing_key"
    | "missing_rpc"
    | "unmatched"
    | "error";
  source: "endpoint" | "chain" | "none";
  message?: string;
};

type QuickNodeUsagePayload = {
  ok: boolean;
  generatedAt: string;
  metrics: Record<ChainPreset["key"], QuickNodeUsageMetric>;
  error?: string;
};

type TxGraphChainKey = "ethereum" | ChainPreset["key"];

type TxGraphNode = {
  id: string;
  label: string;
  kind: "wallet" | "contract" | "token" | "system" | "exchange";
  address?: string;
  subtitle?: string;
};

type TxGraphEdge = {
  id: string;
  source: string;
  target: string;
  kind: "transfer" | "call" | "reference";
  label: string;
  tokenSymbol?: string;
  amountDisplay?: string;
  step?: number;
  selector?: string;
};

type TxGraphPayload = {
  ok: boolean;
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
  error?: string;
};

type BitqueryTxGraphRequest = {
  txHash: `0x${string}`;
  chain: TxGraphChainKey;
  apiKey: string;
};

const TOKEN_BALANCE_OVERRIDES: Partial<
  Record<string, Partial<Record<"USDC" | "USDT", readonly `0x${string}`[]>>>
> = {
  ethereum: {
    USDT: ["0xdAC17F958D2ee523a2206206994597C13D831ec7"],
  },
  polygon: {
    USDC: [
      "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
      "0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174",
    ],
  },
};

let quickNodeUsageCache:
  | {
      expiresAt: number;
      cacheKey: string;
      payload: QuickNodeUsagePayload;
    }
  | undefined;

const DEFAULT_WALLET_SNAPSHOT_TTL_MS = 30_000;
const walletSnapshotCache = new Map<
  string,
  {
    expiresAt: number;
    payload: Record<string, unknown>;
  }
>();
const walletSnapshotInflight = new Map<string, Promise<Record<string, unknown>>>();

const ERC20_TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const BITQUERY_GRAPHQL_URL = "https://streaming.bitquery.io/graphql";

const erc20MetadataAbi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
] as const;

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

function readNonEmptyConfig(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function truthy(value: unknown): boolean {
  return value === true || value === "true" || value === "1" || value === 1;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;

    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(new Error("Request body too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload, null, 2));
}

function text(
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType = "text/plain; charset=utf-8",
): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", contentType);
  res.end(body);
}

function supportedChains(): ChainPreset[] {
  return Object.values(CHAIN_PRESETS).sort((a, b) => a.chainId - b.chainId);
}

function supportedExecutionMarkets(): ExecutionMarketPreset[] {
  return Object.values(EXECUTION_MARKET_PRESETS).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

function normalizeChainKey(value: unknown): ChainPreset["key"] {
  if (typeof value !== "string") {
    return "ethereum";
  }

  const normalized = value.trim().toLowerCase();
  const preset = supportedChains().find((item) => item.key === normalized);
  if (!preset) {
    throw new Error(`Unsupported chain: ${value}`);
  }

  return preset.key;
}

function executionMarketPresetForKey(
  key: ExecutionMarketPreset["key"],
): ExecutionMarketPreset {
  return EXECUTION_MARKET_PRESETS[key];
}

function parsePositiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid number: ${value}`);
  }

  const integer = Math.trunc(parsed);
  return Math.max(minimum, Math.min(maximum, integer));
}

function parseOptionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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

function parseNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractObjectArray(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (!isRecord(value)) {
    return [];
  }

  const directKeys = ["data", "results", "items", "endpoints"];
  for (const key of directKeys) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate.filter(isRecord);
    }
    if (isRecord(candidate)) {
      const nested = extractObjectArray(candidate);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  for (const candidate of Object.values(value)) {
    if (Array.isArray(candidate)) {
      const records = candidate.filter(isRecord);
      if (records.length > 0) {
        return records;
      }
    }
    if (isRecord(candidate)) {
      const nested = extractObjectArray(candidate);
      if (nested.length > 0) {
        return nested;
      }
    }
  }

  return [];
}

function parseCount(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const numeric = Number(value.replace(/,/g, "").trim());
    return Number.isFinite(numeric) ? numeric : null;
  }

  return null;
}

function normalizeComparableText(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeRpcUrlForMatch(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value.trim());
    const normalizedPath = url.pathname.replace(/\/+$/, "");
    return `${url.origin}${normalizedPath}`;
  } catch {
    return value.trim().replace(/\/+$/, "");
  }
}

function quickNodeEndpointNameFromUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    return "";
  }

  try {
    const url = new URL(value.trim());
    const hostname = url.hostname.toLowerCase();
    return hostname.split(".")[0] || "";
  } catch {
    return "";
  }
}

function normalizeGraphChainKey(value: unknown): TxGraphChainKey {
  if (typeof value !== "string") {
    return "ethereum";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "ethereum" || normalized === "eth") {
    return "ethereum";
  }
  if (normalized === "polygon" || normalized === "matic") {
    return "polygon";
  }
  if (normalized === "arbitrum" || normalized === "arb") {
    return "arbitrum";
  }
  if (normalized === "bnb" || normalized === "bsc") {
    return "bnb";
  }
  throw new Error(`Unsupported tx graph chain: ${value}`);
}

function graphChainName(chain: TxGraphChainKey): string {
  return chain === "ethereum"
    ? "Ethereum"
    : chain === "bnb"
      ? "BNB Chain"
      : chain === "arbitrum"
        ? "Arbitrum"
        : "Polygon";
}

function graphDefaultRpcUrl(chain: TxGraphChainKey): string | undefined {
  if (chain === "ethereum") {
    return (
      process.env.CONTROL_RPC_URL ||
      process.env.ETHEREUM_RPC_URL ||
      "https://cloudflare-eth.com"
    );
  }
  const preset =
    chain === "polygon"
      ? CHAIN_PRESETS[137]
      : chain === "arbitrum"
        ? CHAIN_PRESETS[42161]
        : CHAIN_PRESETS[56];
  return process.env[preset.defaultRpcEnv];
}

const TX_GRAPH_BNB_FALLBACK_RPCS = [
  "https://blissful-wiser-pool.bsc.quiknode.pro/d1a545871254b13042697bed9cefb1339dc65173/",
  "https://bsc-dataseed.bnbchain.org/",
  "https://bsc-dataseed2.bnbchain.org/",
];

function graphRpcCandidates(
  chain: TxGraphChainKey,
  preferredRpcUrl?: string | null,
): string[] {
  const values = [
    preferredRpcUrl?.trim() || "",
    graphDefaultRpcUrl(chain)?.trim() || "",
    ...(chain === "bnb" ? TX_GRAPH_BNB_FALLBACK_RPCS : []),
  ];

  const deduped: string[] = [];
  for (const value of values) {
    if (!value || deduped.includes(value)) continue;
    deduped.push(value);
  }
  return deduped;
}

async function streamArbitrageLoop(
  payload: DashboardRunRequest,
  push: (payload: unknown) => void,
  isClosed: () => boolean,
): Promise<void> {
  const mode = normalizeArbitrageModeKey(payload.market);
  const tokenFilter = normalizeArbitrageTokenFilter(payload.token);
  const exchanges = normalizeArbitrageVenueFilter(payload.venues);
  const persistedVenues =
    exchanges && exchanges.length > 0
      ? exchanges.join(",")
      : parseOptionalString(payload.venues);
  let persistedToken = tokenFilter?.join(", ");

  const persistArbitrageState = (
    patch: NonNullable<DashboardLiveState["arbitrage"]>,
  ): void => {
    try {
      saveDashboardLiveState({
        arbitrage: {
          ...(loadDashboardLiveState().arbitrage ?? {}),
          ...patch,
        },
      });
    } catch {
      // Ignore state persistence failures so the stream can continue.
    }
  };

  await streamArbitrageMonitor({
    mode,
    tokenFilter,
    exchanges,
    isClosed,
    handlers: {
      onStdout: (chunk) => push({ type: "stdout", data: chunk }),
      onMeta: (meta) => {
        persistedToken = meta.token ?? persistedToken;
        persistArbitrageState({
          market: meta.market,
          token: persistedToken,
          venues: persistedVenues,
        });
        push({ type: "meta", ...meta });
      },
      onTargets: (rows) => push({ type: "targets", data: rows }),
      onSelection: (selection) => push({ type: "selection", data: selection }),
      onResult: (result) => {
        persistArbitrageState({
          market: mode,
          token: persistedToken,
          venues: persistedVenues,
          lastResult: result,
        });
        push({ type: "result", data: result });
      },
    },
  });
}

async function streamAutoExecutionLoop(
  payload: DashboardRunRequest,
  push: (payload: unknown) => void,
  isClosed: () => boolean,
): Promise<void> {
  const marketSelection = normalizeExecutionMarketSelectionKey(payload.market);
  const chain = normalizeChainKey(
    payload.chain ?? inferExecutionChainForSelection(marketSelection),
  );
  const tuningMarket = marketSelection === "auto-ethereum" ? undefined : marketSelection;
  validateExecutionMarketSelectionChain(marketSelection, chain);
  const rpcUrl = parseOptionalString(payload.rpcUrl) || graphDefaultRpcUrl(chain);
  if (!rpcUrl) {
    throw new Error(`Missing RPC URL for ${chain}.`);
  }

  const lookbackBlocks = BigInt(
    parsePositiveInteger(
      payload.lookbackBlocks,
      defaultExecutionLookbackBlocks(chain, tuningMarket),
      1,
      5_000_000,
    ),
  );
  let resumeFromBlock = parseOptionalString(payload.resumeFromBlock)
    ? BigInt(
        parsePositiveInteger(
          payload.resumeFromBlock,
          0,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      )
    : undefined;
  let resumeChunkStart = parseOptionalString(payload.resumeChunkStart)
    ? BigInt(
        parsePositiveInteger(
          payload.resumeChunkStart,
          0,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      )
    : undefined;
  let resumeChunkEnd = parseOptionalString(payload.resumeChunkEnd)
    ? BigInt(
        parsePositiveInteger(
          payload.resumeChunkEnd,
          0,
          0,
          Number.MAX_SAFE_INTEGER,
        ),
      )
    : undefined;
  let resumeUserOffset = parsePositiveInteger(
    payload.resumeUserOffset,
    0,
    0,
    1_000_000,
  );
  const hfMaxRaw = parseOptionalString(payload.hfMax);
  const hfMax =
    hfMaxRaw && Number.isFinite(Number(hfMaxRaw))
      ? Number(hfMaxRaw)
      : defaultExecutionAlertThreshold(chain, tuningMarket);
  const limit = parsePositiveInteger(
    payload.limit,
    defaultExecutionLimit(chain, tuningMarket),
    1,
    100,
  );
  const allowRisky = truthy(payload.allowRisky);
  const autoSwap = truthy(payload.autoSwap);
  const broadcast = truthy(payload.broadcast);
  const minNetProfit =
    parseOptionalString(payload.minNetProfit) ??
    defaultExecutionMinNetProfit(chain, tuningMarket);
  await streamLiquidationMonitor({
    chain,
    rpcUrl,
    marketSelection,
    lookbackBlocks,
    resumeFromBlock,
    resumeChunkStart,
    resumeChunkEnd,
    resumeUserOffset,
    hfMax,
    limit,
    allowRisky,
    autoSwap,
    broadcast,
    minNetProfit,
    isClosed,
    handlers: {
      onStdout: (chunk) => push({ type: "stdout", data: chunk }),
      onStderr: (chunk) => push({ type: "stderr", data: chunk }),
      onMeta: (meta) => push({ type: "meta", ...meta }),
      onTargets: (rows) => push({ type: "targets", data: rows }),
      onSelection: (selection) => push({ type: "selection", data: selection }),
      onProgress: (progress) => push({ type: "progress", ...progress }),
      onHeartbeat: (heartbeat) => push({ type: "heartbeat", ...heartbeat }),
      onExecution: (data) => push({ type: "execution", data }),
    },
    executeCandidate: async (request, io) =>
      executeCliAction(request, {
        onStdout: io.onStdout,
        onStderr: io.onStderr,
      }),
  });
}

function shortAddress(value: string): string {
  if (value.length <= 12) {
    return value;
  }
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function topicAddress(value: string): `0x${string}` | undefined {
  if (!value || !value.startsWith("0x") || value.length < 42) {
    return undefined;
  }
  const raw = `0x${value.slice(-40)}`;
  try {
    return getAddress(raw);
  } catch {
    return undefined;
  }
}

function cleanTxHash(value: unknown): `0x${string}` {
  if (typeof value !== "string") {
    throw new Error("txHash is required.");
  }
  const trimmed = value.trim();
  if (!/^0x[a-fA-F0-9]{64}$/.test(trimmed)) {
    throw new Error("Invalid txHash.");
  }
  return trimmed as `0x${string}`;
}

function selectorFromInput(value: unknown): string | undefined {
  if (typeof value !== "string" || !value.startsWith("0x") || value.length < 10) {
    return undefined;
  }
  return value.slice(0, 10);
}

function quickNodeUsageLabels(record: Record<string, unknown>): string[] {
  const labels = [
    record.label,
    record.name,
    record.endpointLabel,
    record.endpointName,
    quickNodeEndpointNameFromUrl(record.http_url),
  ]
    .map(normalizeComparableText)
    .filter(Boolean);

  return Array.from(new Set(labels));
}

function quickNodeUsageMatchesChain(
  chain: ChainPreset["key"],
  record: Record<string, unknown>,
): boolean {
  const haystack = [
    record.chain,
    record.network,
    record.networkName,
    record.label,
    record.name,
  ]
    .map(normalizeComparableText)
    .join(" ");

  if (chain === "ethereum") {
    return haystack.includes("ethereum") || haystack.includes("mainnet");
  }
  if (chain === "polygon") {
    return haystack.includes("polygon") || haystack.includes("matic");
  }
  if (chain === "arbitrum") {
    return haystack.includes("arbitrum");
  }
  return (
    haystack.includes("bnb") ||
    haystack.includes("binance smart chain") ||
    haystack.includes("bsc")
  );
}

async function fetchQuickNodeJson(pathname: string, apiKey: string): Promise<unknown> {
  const response = await fetch(`https://api.quicknode.com${pathname}`, {
    headers: {
      accept: "application/json",
      "x-api-key": apiKey,
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`QuickNode API request failed (${response.status})`);
  }

  return response.json();
}

function quickNodeEmptyMetric(
  chain: ChainPreset["key"],
  status: QuickNodeUsageMetric["status"],
  message?: string,
): QuickNodeUsageMetric {
  return {
    chain,
    chainName: CHAIN_PRESETS[
      chain === "ethereum"
        ? 1
        : chain === "polygon"
          ? 137
          : chain === "arbitrum"
            ? 42161
            : 56
    ].name,
    requests24h: null,
    status,
    source: "none",
    message,
  };
}

async function fetchQuickNodeUsage(): Promise<QuickNodeUsagePayload> {
  const settings = loadDashboardSettings();
  const apiKey = parseOptionalString(settings.quicknodeAdminApiKey);
  const cacheKey = JSON.stringify({
    apiKey: apiKey ?? "",
    rpcs: settings.chains,
  });

  if (quickNodeUsageCache && quickNodeUsageCache.cacheKey === cacheKey && quickNodeUsageCache.expiresAt > Date.now()) {
    return quickNodeUsageCache.payload;
  }

  const chains = supportedChains();

  if (!apiKey) {
    const payload: QuickNodeUsagePayload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      metrics: {
        ethereum: quickNodeEmptyMetric("ethereum", "missing_key", "QuickNode Admin API key is not set."),
        polygon: quickNodeEmptyMetric("polygon", "missing_key", "QuickNode Admin API key is not set."),
        arbitrum: quickNodeEmptyMetric("arbitrum", "missing_key", "QuickNode Admin API key is not set."),
        bnb: quickNodeEmptyMetric("bnb", "missing_key", "QuickNode Admin API key is not set."),
      },
    };
    quickNodeUsageCache = {
      cacheKey,
      expiresAt: Date.now() + 30_000,
      payload,
    };
    return payload;
  }

  try {
    const [endpointsPayload, usagePayload] = await Promise.all([
      fetchQuickNodeJson("/v0/endpoints", apiKey),
      fetchQuickNodeJson("/v0/usage/rpc/by-endpoint", apiKey),
    ]);

    const endpoints = extractObjectArray(endpointsPayload);
    const usages = extractObjectArray(usagePayload);
    const metrics = {} as Record<ChainPreset["key"], QuickNodeUsageMetric>;

    for (const chain of chains) {
      const configuredRpc = normalizeRpcUrlForMatch(settings.chains[chain.key]?.rpcUrl);
      if (!configuredRpc) {
        metrics[chain.key] = quickNodeEmptyMetric(chain.key, "missing_rpc", "RPC URL is not configured.");
        continue;
      }

      const endpoint = endpoints.find((candidate) => {
        return normalizeRpcUrlForMatch(candidate.http_url) === configuredRpc;
      });

      let usage: Record<string, unknown> | undefined;
      let source: QuickNodeUsageMetric["source"] = "none";

      if (endpoint) {
        const endpointNames = quickNodeUsageLabels(endpoint);
        usage = usages.find((candidate) => {
          const candidateNames = quickNodeUsageLabels(candidate);
          return endpointNames.some((label) => candidateNames.includes(label));
        });
        source = usage ? "endpoint" : "none";
      }

      if (!usage) {
        const candidates = usages.filter((candidate) => quickNodeUsageMatchesChain(chain.key, candidate));
        if (candidates.length === 1) {
          usage = candidates[0];
          source = "chain";
        }
      }

      if (!usage) {
        metrics[chain.key] = {
          ...quickNodeEmptyMetric(chain.key, "unmatched", "QuickNode endpoint could not be matched from the saved RPC URL."),
          endpointLabel: typeof endpoint?.label === "string" ? endpoint.label : undefined,
          endpointName: typeof endpoint?.name === "string" ? endpoint.name : undefined,
        };
        continue;
      }

      const requests24h =
        parseCount(usage.requests) ??
        parseCount(usage.method_calls) ??
        parseCount(usage.methodCalls) ??
        parseCount(usage.total_requests) ??
        parseCount(usage.totalRequests);

      metrics[chain.key] = {
        chain: chain.key,
        chainName: chain.name,
        requests24h,
        endpointLabel:
          typeof endpoint?.label === "string"
            ? endpoint.label
            : typeof usage.label === "string"
              ? usage.label
              : undefined,
        endpointName:
          typeof endpoint?.name === "string"
            ? endpoint.name
            : typeof usage.name === "string"
              ? usage.name
              : undefined,
        network:
          typeof usage.network === "string"
            ? usage.network
            : typeof usage.chain === "string"
              ? usage.chain
              : undefined,
        status: requests24h === null ? "error" : "ok",
        source,
        message:
          requests24h === null
            ? "QuickNode usage response did not include a recognized request count."
            : undefined,
      };
    }

    const payload: QuickNodeUsagePayload = {
      ok: true,
      generatedAt: new Date().toISOString(),
      metrics,
    };

    quickNodeUsageCache = {
      cacheKey,
      expiresAt: Date.now() + 60_000,
      payload,
    };

    return payload;
  } catch (error) {
    const payload: QuickNodeUsagePayload = {
      ok: false,
      generatedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : String(error),
      metrics: {
        ethereum: quickNodeEmptyMetric("ethereum", "error", error instanceof Error ? error.message : String(error)),
        polygon: quickNodeEmptyMetric("polygon", "error", error instanceof Error ? error.message : String(error)),
        arbitrum: quickNodeEmptyMetric("arbitrum", "error", error instanceof Error ? error.message : String(error)),
        bnb: quickNodeEmptyMetric("bnb", "error", error instanceof Error ? error.message : String(error)),
      },
    };

    quickNodeUsageCache = {
      cacheKey,
      expiresAt: Date.now() + 30_000,
      payload,
    };

    return payload;
  }
}

function bitqueryNetwork(chain: TxGraphChainKey): string {
  switch (chain) {
    case "ethereum":
      return "eth";
    case "polygon":
      return "matic";
    case "arbitrum":
      return "arbitrum";
    case "bnb":
      return "bsc";
  }
}

async function fetchTxGraphFromBitquery(
  payload: BitqueryTxGraphRequest,
): Promise<TxGraphPayload> {
  const query = `
    query {
      EVM(network: ${bitqueryNetwork(payload.chain)}, dataset: combined) {
        Transfers(
          where: {Transaction: {Hash: {is: "${payload.txHash}"}}}
          limit: {count: 500}
        ) {
          Transfer {
            Sender
            Receiver
            Amount
            Currency {
              Symbol
              SmartContract
              Decimals
            }
          }
        }
        Calls(
          where: {Transaction: {Hash: {is: "${payload.txHash}"}}}
          limit: {count: 500}
        ) {
          Call {
            From
            To
            Input
            Signature {
              Name
              Signature
            }
          }
        }
      }
    }
  `;

  const response = await fetch(BITQUERY_GRAPHQL_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${payload.apiKey}`,
    },
    body: JSON.stringify({ query }),
  });

  const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  const errors = body && Array.isArray(body.errors) ? body.errors : [];
  if (!response.ok || errors.length > 0 || !body) {
    const errorText = errors.length > 0
      ? errors
          .map((item) => (isRecord(item) ? asString(item.message) : undefined) ?? String(item))
          .filter(Boolean)
          .join("; ")
      : `Bitquery request failed with status ${response.status}`;
    throw new Error(errorText);
  }

  const evm = isRecord(body.data) && isRecord(body.data.EVM) ? body.data.EVM : null;
  const transfers = evm && Array.isArray(evm.Transfers) ? evm.Transfers.filter(isRecord) : [];
  const calls = evm && Array.isArray(evm.Calls) ? evm.Calls.filter(isRecord) : [];

  const nodes = new Map<string, TxGraphNode>();
  const edges: TxGraphEdge[] = [];
  const nativeTransferEdgeKeys = new Set<string>();
  const seenEdgeIds = new Set<string>();

  function ensureNode(id: string, partial?: Partial<TxGraphNode>): void {
    const existing = nodes.get(id);
    if (existing) {
      nodes.set(id, { ...existing, ...partial, id });
      return;
    }
    nodes.set(id, {
      id,
      label: partial?.label || id,
      kind: partial?.kind || "contract",
      address: partial?.address,
      subtitle: partial?.subtitle,
    });
  }

  let transferStep = 1;
  for (const row of transfers) {
    const transfer = isRecord(row.Transfer) ? row.Transfer : null;
    if (!transfer) continue;
    const sourceRaw = parseNonEmptyString(transfer.Sender);
    const targetRaw = parseNonEmptyString(transfer.Receiver);
    if (!sourceRaw || !targetRaw) continue;
    const source = getAddress(sourceRaw);
    const target = getAddress(targetRaw);
    const currency = isRecord(transfer.Currency) ? transfer.Currency : null;
    const tokenAddressRaw = currency ? parseNonEmptyString(currency.SmartContract) : undefined;
    const tokenAddress =
      tokenAddressRaw && isAddress(tokenAddressRaw) ? getAddress(tokenAddressRaw) : undefined;
    const symbol = currency ? (parseNonEmptyString(currency.Symbol) || (tokenAddress ? shortAddress(tokenAddress) : "TOKEN")) : "TOKEN";
    const amountDisplay = parseNonEmptyString(transfer.Amount) || "0";
    const edgeId = `bitquery:transfer:${transferStep}:${source}:${target}:${symbol}`;
    if (seenEdgeIds.has(edgeId)) continue;
    seenEdgeIds.add(edgeId);

    ensureNode(source, {
      label: shortAddress(source),
      kind: "wallet",
      address: source,
    });
    ensureNode(target, {
      label: shortAddress(target),
      kind: "contract",
      address: target,
    });
    if (tokenAddress) {
      ensureNode(tokenAddress, {
        label: symbol,
        kind: "token",
        address: tokenAddress,
      });
      edges.push({
        id: `bitquery:reference:token:${transferStep}:${source}:${tokenAddress}`,
        source,
        target: tokenAddress,
        kind: "reference",
        label: symbol,
        step: transferStep,
      });
      edges.push({
        id: `bitquery:reference:token:${transferStep}:${tokenAddress}:${target}`,
        source: tokenAddress,
        target,
        kind: "reference",
        label: symbol,
        step: transferStep,
      });
    }
    edges.push({
      id: edgeId,
      source,
      target,
      kind: "transfer",
      label: `${amountDisplay} ${symbol}`,
      tokenSymbol: symbol,
      amountDisplay,
      step: transferStep,
    });
    transferStep += 1;
  }

  let callStep = 1;
  for (const row of calls) {
    const call = isRecord(row.Call) ? row.Call : null;
    if (!call) continue;
    const sourceRaw = parseNonEmptyString(call.From);
    const targetRaw = parseNonEmptyString(call.To);
    if (!sourceRaw || !targetRaw) continue;
    const source = getAddress(sourceRaw);
    const target = getAddress(targetRaw);
    const signatureInfo = isRecord(call.Signature) ? call.Signature : null;
    const selector =
      (signatureInfo && parseNonEmptyString(signatureInfo.Name)) ||
      (signatureInfo && parseNonEmptyString(signatureInfo.Signature)) ||
      selectorFromInput(call.Input);
    const edgeId = `bitquery:call:${callStep}:${source}:${target}:${selector || "call"}`;
    if (seenEdgeIds.has(edgeId)) continue;
    seenEdgeIds.add(edgeId);

    ensureNode(source, {
      label: shortAddress(source),
      kind: "wallet",
      address: source,
    });
    ensureNode(target, {
      label: shortAddress(target),
      kind: "contract",
      address: target,
    });
    edges.push({
      id: edgeId,
      source,
      target,
      kind: "call",
      label: selector ? `call ${selector}` : "call",
      selector,
      step: callStep++,
    });
  }

  return {
    ok: true,
    txHash: payload.txHash,
    chain: payload.chain,
    traceAvailable: calls.length > 0,
    nodes: Array.from(nodes.values()),
    edges,
    summary: {
      transferCount: edges.filter((edge) => edge.kind === "transfer").length,
      callCount: edges.filter((edge) => edge.kind === "call").length,
      referenceCount: edges.filter((edge) => edge.kind === "reference").length,
    },
  };
}

async function fetchTxGraphFromRpc(payload: {
  txHash: unknown;
  chain: unknown;
  rpcUrl?: unknown;
}): Promise<TxGraphPayload> {
  const txHash = cleanTxHash(payload.txHash);
  const chain = normalizeGraphChainKey(payload.chain);
  const rpcUrl = parseOptionalString(payload.rpcUrl) || graphDefaultRpcUrl(chain);
  if (!rpcUrl) {
    throw new Error(`RPC URL is required for ${graphChainName(chain)}.`);
  }

  const client = createPublicClient({ transport: http(rpcUrl) });
  const transaction = await client.getTransaction({ hash: txHash });
  const receipt = await client.getTransactionReceipt({ hash: txHash });

  const nodes = new Map<string, TxGraphNode>();
  const edges: TxGraphEdge[] = [];
  const nativeTransferEdgeKeys = new Set<string>();
  const seenEdgeIds = new Set<string>();
  const tokenCache = new Map<
    string,
    {
      symbol: string;
      decimals: number;
      resolved: boolean;
      rawSymbol?: string;
      emptySymbol: boolean;
    }
  >();
  const tokenContractAddresses = new Set<string>();
  const targetSelectorsByNode = new Map<string, Set<string>>();
  const callSourcesByNode = new Map<string, Set<string>>();
  const codeCache = new Map<string, boolean>();
  const edgeStatsByNode = new Map<
    string,
    { transferIn: number; transferOut: number; callIn: number; callOut: number }
  >();

  const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
  const ERC20_SELECTORS = new Set([
    "0x70a08231",
    "0xa9059cbb",
    "0x23b872dd",
    "0x095ea7b3",
    "0xdd62ed3e",
    "0x313ce567",
    "0x95d89b41",
    "0x18160ddd",
  ]);
  const EXCHANGE_SELECTORS = new Set([
    "0x128acb08",
    "0xfa461e33",
    "0x0dfe1681",
    "0xd21220a7",
    "0x0902f1ac",
  ]);
  const TOKEN_IMPLEMENTATION_SELECTORS = new Set([
    "0x1da24f3e",
    "0xb1bf962d",
    "0xf5298aca",
    "0x353b7b9a",
    "0xae167335",
    "0xb18d6afd",
  ]);
  const CALL_REFERENCE_SPECS = new Map<string, { index: number; label: string }[]>([
    ["0x70a08231", [{ index: 0, label: "balanceOf who" }]],
    ["0xa9059cbb", [{ index: 0, label: "transfer to" }]],
    [
      "0x23b872dd",
      [
        { index: 0, label: "transferFrom from" },
        { index: 1, label: "transferFrom to" },
      ],
    ],
    ["0x128acb08", [{ index: 0, label: "swap recipient" }]],
    [
      "0x00a718a9",
      [
        { index: 0, label: "liquidationCall collateralAsset" },
        { index: 1, label: "liquidationCall debtAsset" },
        { index: 2, label: "liquidationCall user" },
      ],
    ],
    ["0x31873e2e", [{ index: 0, label: "handleAction user" }]],
    ["0x1da24f3e", [{ index: 0, label: "scaledBalanceOf user" }]],
  ]);

  function isShortGraphLabel(value: string | undefined): boolean {
    return typeof value === "string" && /^0x[a-f0-9]{4}\.\.\.[a-f0-9]{4}$/i.test(value);
  }

  function mergeNodeKind(
    current: TxGraphNode["kind"] | undefined,
    next: TxGraphNode["kind"] | undefined,
  ): TxGraphNode["kind"] {
    const rank: Record<TxGraphNode["kind"], number> = {
      system: 5,
      wallet: 4,
      exchange: 3,
      token: 2,
      contract: 1,
    };
    if (!current) {
      return next ?? "contract";
    }
    if (!next) {
      return current;
    }
    return rank[next] >= rank[current] ? next : current;
  }

  function preferNodeLabel(current: string | undefined, next: string | undefined): string | undefined {
    if (!next) {
      return current;
    }
    if (!current) {
      return next;
    }
    if (isShortGraphLabel(current) && !isShortGraphLabel(next)) {
      return next;
    }
    return current;
  }

  function ensureNode(id: string, partial?: Partial<TxGraphNode>): void {
    const existing = nodes.get(id);
    if (existing) {
      nodes.set(id, {
        ...existing,
        ...partial,
        id,
        label: preferNodeLabel(existing.label, partial?.label) ?? existing.label,
        kind: mergeNodeKind(existing.kind, partial?.kind),
        subtitle: partial?.subtitle ?? existing.subtitle,
        address: partial?.address ?? existing.address,
      });
      return;
    }
    nodes.set(id, {
      id,
      label: partial?.label || id,
      kind: partial?.kind || "contract",
      address: partial?.address,
      subtitle: partial?.subtitle,
    });
  }

  function noteTargetSelector(target: string, selector: string | undefined): void {
    if (!selector) {
      return;
    }
    const normalized = selector.toLowerCase();
    const current = targetSelectorsByNode.get(target) ?? new Set<string>();
    current.add(normalized);
    targetSelectorsByNode.set(target, current);
  }

  function noteCallSource(target: string, source: string): void {
    const current = callSourcesByNode.get(target) ?? new Set<string>();
    current.add(source);
    callSourcesByNode.set(target, current);
  }

  function noteEdgeStats(source: string, target: string, kind: TxGraphEdge["kind"]): void {
    const sourceStats = edgeStatsByNode.get(source) ?? {
      transferIn: 0,
      transferOut: 0,
      callIn: 0,
      callOut: 0,
    };
    const targetStats = edgeStatsByNode.get(target) ?? {
      transferIn: 0,
      transferOut: 0,
      callIn: 0,
      callOut: 0,
    };
    if (kind === "transfer") {
      sourceStats.transferOut += 1;
      targetStats.transferIn += 1;
    } else if (kind === "call") {
      sourceStats.callOut += 1;
      targetStats.callIn += 1;
    }
    edgeStatsByNode.set(source, sourceStats);
    edgeStatsByNode.set(target, targetStats);
  }

  function callDataWords(input: string | undefined): string[] {
    if (!input || !input.startsWith("0x") || input.length <= 10) {
      return [];
    }
    const hex = input.slice(10);
    const words: string[] = [];
    for (let index = 0; index + 64 <= hex.length; index += 64) {
      words.push(hex.slice(index, index + 64));
    }
    return words;
  }

  function addressFromCallWord(word: string | undefined): `0x${string}` | undefined {
    if (!word || word.length !== 64) {
      return undefined;
    }
    const addressHex = `0x${word.slice(24)}`;
    return isAddress(addressHex) ? getAddress(addressHex) : undefined;
  }

  function pushReferenceEdge(source: string, target: string, label: string, step: number): void {
    const edgeId = `rpc:reference:param:${step}:${source}:${target}:${label}`;
    if (seenEdgeIds.has(edgeId)) {
      return;
    }
    seenEdgeIds.add(edgeId);
    edges.push({
      id: edgeId,
      source,
      target,
      kind: "reference",
      label,
      step,
    });
  }

  async function tokenMeta(
    address: `0x${string}`,
  ): Promise<{
    symbol: string;
    decimals: number;
    resolved: boolean;
    rawSymbol?: string;
    emptySymbol: boolean;
  }> {
    const key = address.toLowerCase();
    const cached = tokenCache.get(key);
    if (cached) {
      return cached;
    }
    try {
      const [symbol, decimals] = await Promise.all([
        client.readContract({
          address,
          abi: erc20MetadataAbi,
          functionName: "symbol",
        }),
        client.readContract({
          address,
          abi: erc20MetadataAbi,
          functionName: "decimals",
        }),
      ]);
      const rawSymbol = typeof symbol === "string" ? symbol.trim() : "";
      const value = {
        symbol: rawSymbol || shortAddress(address),
        decimals: Number(decimals),
        resolved: true,
        rawSymbol: rawSymbol || undefined,
        emptySymbol: !rawSymbol,
      };
      tokenCache.set(key, value);
      return value;
    } catch {
      const fallback = {
        symbol: shortAddress(address),
        decimals: 18,
        resolved: false,
        rawSymbol: undefined,
        emptySymbol: false,
      };
      tokenCache.set(key, fallback);
      return fallback;
    }
  }

  async function isExternallyOwnedAccount(address: `0x${string}`): Promise<boolean> {
    const key = address.toLowerCase();
    const cached = codeCache.get(key);
    if (cached !== undefined) {
      return cached;
    }
    const code = await client.getCode({ address });
    const isEoa = code === undefined || code === "0x";
    codeCache.set(key, isEoa);
    return isEoa;
  }

  const fromAddress = getAddress(transaction.from);
  const toAddress = transaction.to ? getAddress(transaction.to) : undefined;

  ensureNode(fromAddress, {
    label: shortAddress(fromAddress),
    kind: "wallet",
    address: fromAddress,
    subtitle: "from",
  });
  if (toAddress) {
    ensureNode(toAddress, {
      label: shortAddress(toAddress),
      kind: "contract",
      address: toAddress,
      subtitle: "to",
    });
  }

  if (toAddress && transaction.value > 0n) {
    nativeTransferEdgeKeys.add(`${fromAddress}:${toAddress}:${transaction.value.toString()}`);
    edges.push({
      id: `native:${txHash}:0`,
      source: fromAddress,
      target: toAddress,
      kind: "transfer",
      label: `${formatUnits(transaction.value, 18)} ETH`,
      tokenSymbol: "ETH",
      amountDisplay: formatUnits(transaction.value, 18),
      step: 0,
    });
    noteEdgeStats(fromAddress, toAddress, "transfer");
  }

  let transferStep = 1;
  for (const log of receipt.logs) {
    if (!log.topics || log.topics[0]?.toLowerCase() !== ERC20_TRANSFER_TOPIC) {
      continue;
    }
    const source = topicAddress(log.topics[1] || "");
    const target = topicAddress(log.topics[2] || "");
    if (!source || !target || !log.address) {
      continue;
    }
    const tokenAddress = getAddress(log.address);
    tokenContractAddresses.add(tokenAddress.toLowerCase());
    const meta = await tokenMeta(tokenAddress);
    const amountRaw = BigInt(log.data || "0x0");
    const amountDisplay = formatUnits(amountRaw, meta.decimals);

    ensureNode(source, {
      label: shortAddress(source),
      kind: source === fromAddress ? "wallet" : "contract",
      address: source,
    });
    ensureNode(target, {
      label: shortAddress(target),
      kind: target === fromAddress ? "wallet" : "contract",
      address: target,
    });
    ensureNode(tokenAddress, {
      label: meta.symbol,
      kind: "token",
      address: tokenAddress,
    });
    const sourceTokenRefId = `rpc:reference:token:${transferStep}:${source}:${tokenAddress}`;
    if (!seenEdgeIds.has(sourceTokenRefId)) {
      seenEdgeIds.add(sourceTokenRefId);
      edges.push({
        id: sourceTokenRefId,
        source,
        target: tokenAddress,
        kind: "reference",
        label: "Transfer from",
        step: transferStep,
      });
    }
    const tokenTargetRefId = `rpc:reference:token:${transferStep}:${tokenAddress}:${target}`;
    if (!seenEdgeIds.has(tokenTargetRefId)) {
      seenEdgeIds.add(tokenTargetRefId);
      edges.push({
        id: tokenTargetRefId,
        source: tokenAddress,
        target,
        kind: "reference",
        label: "Transfer to",
        step: transferStep,
      });
    }

    edges.push({
      id: `transfer:${log.transactionHash}:${log.logIndex}`,
      source,
      target,
      kind: "transfer",
      label: `${amountDisplay} ${meta.symbol}`,
      tokenSymbol: meta.symbol,
      amountDisplay,
      step: transferStep++,
    });
    noteEdgeStats(source, target, "transfer");
  }

  let traceAvailable = false;
  try {
    const traceResult = (await (client as unknown as {
      request(args: { method: string; params: unknown[] }): Promise<unknown>;
    }).request({
      method: "debug_traceTransaction",
      params: [txHash, { tracer: "callTracer", timeout: "10s" }],
    })) as Record<string, unknown>;

    let callStep = 1;
    const walk = (call: Record<string, unknown>, parentFrom?: string): void => {
      const source =
        typeof call.from === "string"
          ? getAddress(call.from)
          : parentFrom
            ? getAddress(parentFrom)
            : undefined;
      const target =
        typeof call.to === "string" && call.to
          ? getAddress(call.to)
          : undefined;
      const selector = selectorFromInput(call.input);
      if (source && target) {
        traceAvailable = true;
        noteTargetSelector(target, selector);
        noteCallSource(target, source);
        ensureNode(source, {
          label: shortAddress(source),
          kind: source === fromAddress ? "wallet" : "contract",
          address: source,
        });
        ensureNode(target, {
          label: shortAddress(target),
          kind: target === fromAddress ? "wallet" : "contract",
          address: target,
        });
        const input = typeof call.input === "string" ? call.input : undefined;
        const referenceSpecs = selector ? CALL_REFERENCE_SPECS.get(selector.toLowerCase()) ?? [] : [];
        const words = callDataWords(input);
        for (const spec of referenceSpecs) {
          const referenceAddress = addressFromCallWord(words[spec.index]);
          if (!referenceAddress) {
            continue;
          }
          ensureNode(referenceAddress, {
            label: shortAddress(referenceAddress),
            kind: referenceAddress === fromAddress ? "wallet" : "contract",
            address: referenceAddress,
          });
          pushReferenceEdge(referenceAddress, target, spec.label, callStep);
        }
        const nativeValue =
          typeof call.value === "string" && call.value
            ? BigInt(call.value)
            : typeof call.value === "bigint"
              ? call.value
              : 0n;
        if (nativeValue > 0n) {
          const nativeKey = `${source}:${target}:${nativeValue.toString()}`;
          if (!nativeTransferEdgeKeys.has(nativeKey)) {
            nativeTransferEdgeKeys.add(nativeKey);
            const amountDisplay = formatUnits(nativeValue, 18);
            edges.push({
              id: `native-trace:${callStep}:${source}:${target}`,
              source,
              target,
              kind: "transfer",
              label: `${amountDisplay} Ether`,
              tokenSymbol: "ETH",
              amountDisplay,
              step: callStep,
            });
            noteEdgeStats(source, target, "transfer");
          }
        }
        edges.push({
          id: `call:${callStep}:${source}:${target}`,
          source,
          target,
          kind: "call",
          label: selector ? `call ${selector}` : "call",
          selector,
          step: callStep++,
        });
        noteEdgeStats(source, target, "call");
      }
      const nested = Array.isArray(call.calls)
        ? call.calls.filter(isRecord)
        : [];
      for (const child of nested) {
        walk(child, source);
      }
    };

    if (isRecord(traceResult)) {
      walk(traceResult);
    }
  } catch {
    traceAvailable = false;
  }

  for (const [id, node] of nodes) {
    const address = node.address && isAddress(node.address) ? getAddress(node.address) : undefined;
    if (!address) {
      continue;
    }
    if (address.toLowerCase() === ZERO_ADDRESS.toLowerCase()) {
      ensureNode(id, { kind: "system", label: "System" });
      continue;
    }
    if (await isExternallyOwnedAccount(address)) {
      ensureNode(id, {
        kind: "wallet",
        label: shortAddress(address),
      });
      continue;
    }

    const selectors = targetSelectorsByNode.get(id) ?? new Set<string>();
    const edgeStats = edgeStatsByNode.get(id) ?? {
      transferIn: 0,
      transferOut: 0,
      callIn: 0,
      callOut: 0,
    };
    const selectorList = [...selectors];
    const exchangeHits = selectorList.filter((selector) => EXCHANGE_SELECTORS.has(selector)).length;
    const erc20Hits = selectorList.filter((selector) => ERC20_SELECTORS.has(selector)).length;
    const nonErc20Hits = selectorList.filter((selector) => !ERC20_SELECTORS.has(selector)).length;
    const tokenImplementationHits = selectorList.filter((selector) =>
      TOKEN_IMPLEMENTATION_SELECTORS.has(selector),
    ).length;
    const isATokenImplementation = selectorList.includes("0xf5298aca");
    const isVariableDebtImplementation =
      selectorList.includes("0x353b7b9a") ||
      selectorList.includes("0xae167335") ||
      selectorList.includes("0xb18d6afd");
    const callSources = [...(callSourcesByNode.get(id) ?? new Set<string>())];
    const meta = await tokenMeta(address);
    const isTransferToken = tokenContractAddresses.has(address.toLowerCase());
    const isProxyImplementationLike =
      !isTransferToken &&
      edgeStats.transferIn + edgeStats.transferOut === 0 &&
      edgeStats.callOut === 0 &&
      erc20Hits >= 2 &&
      nonErc20Hits === 0;
    const singleCallerNode = callSources.length === 1 ? nodes.get(callSources[0]) : undefined;
    const callerMeta =
      singleCallerNode &&
      singleCallerNode.kind === "token" &&
      isAddress(callSources[0])
        ? await tokenMeta(getAddress(callSources[0]))
        : undefined;
    const isTokenLike =
      isTransferToken ||
      isATokenImplementation ||
      isVariableDebtImplementation ||
      (isProxyImplementationLike && meta.emptySymbol && callerMeta && callerMeta.decimals > 8) ||
      (meta.resolved && !meta.emptySymbol) ||
      (meta.resolved &&
        !isProxyImplementationLike &&
        !meta.emptySymbol &&
        (erc20Hits >= 1 || edgeStats.transferIn + edgeStats.transferOut > 0)) ||
      (!meta.resolved && erc20Hits >= 3 && nonErc20Hits === 0);

    if (
      exchangeHits >= 1 &&
      edgeStats.transferIn > 0 &&
      edgeStats.transferOut > 0 &&
      edgeStats.callIn <= 3 &&
      edgeStats.callOut <= 8
    ) {
      ensureNode(id, { kind: "exchange" });
      continue;
    }
    if (isTokenLike) {
      const tokenLabel =
        isATokenImplementation
          ? "ATOKEN_IMPL"
          : isVariableDebtImplementation
            ? "VARIABLE_DEBT_TOKEN_IMPL"
            : meta.emptySymbol
              ? "()"
              : meta.resolved && !isShortGraphLabel(meta.symbol)
                ? meta.symbol
                : node.label;
      ensureNode(id, {
        kind: "token",
        label: tokenLabel,
      });
      continue;
    }
    ensureNode(id, { kind: "contract", label: shortAddress(address) });
  }

  const graphNodes = Array.from(nodes.values());
  const systemNodeIds = new Set(
    graphNodes.filter((node) => node.kind === "system").map((node) => node.id),
  );
  const graphEdges = edges.filter(
    (edge) =>
      edge.kind === "transfer" ||
      (!systemNodeIds.has(edge.source) && !systemNodeIds.has(edge.target)),
  );

  return {
    ok: true,
    txHash,
    chain,
    traceAvailable,
    nodes: graphNodes,
    edges: graphEdges,
    summary: {
      transferCount: graphEdges.filter((edge) => edge.kind === "transfer").length,
      callCount: graphEdges.filter((edge) => edge.kind === "call").length,
      referenceCount: graphEdges.filter((edge) => edge.kind === "reference").length,
    },
  };
}

async function fetchTxGraph(payload: {
  txHash: unknown;
  chain: unknown;
  rpcUrl?: unknown;
}): Promise<TxGraphPayload> {
  const txHash = cleanTxHash(payload.txHash);
  const chain = normalizeGraphChainKey(payload.chain);
  const rpcUrl = parseOptionalString(payload.rpcUrl);
  const rpcCandidates = graphRpcCandidates(chain, rpcUrl);

  if (!rpcCandidates.length) {
    throw new Error(`RPC URL is required for ${graphChainName(chain)}.`);
  }

  let lastError: unknown = null;
  for (const candidate of rpcCandidates) {
    try {
      return await fetchTxGraphFromRpc({
        txHash,
        chain,
        rpcUrl: candidate,
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Failed to load transaction graph.");
}

function liveStatePatchForResult(result: Record<string, unknown>): Partial<DashboardLiveState> {
  const action = typeof result.action === "string" ? result.action : undefined;
  const patch: Partial<DashboardLiveState> = {
    lastAction: action,
    lastResult: result,
  };

  if (!result.ok || !action) {
    return patch;
  }

  switch (action) {
    case "scan":
      patch.scan = result;
      break;
    case "analyze":
      patch.analyze = result;
      break;
    case "analyze-morpho-blue":
      patch.morphoBlueAnalyze = result;
      break;
    case "check-morpho-executor":
      patch.morphoExecutorCheck = result;
      break;
    case "execute-liquidator":
      patch.executeLiquidator = result;
      break;
    case "run-liquidator":
      patch.liquidator = result;
      patch.selfFunded = result;
      break;
    case "run-self-funded":
      patch.liquidator = result;
      patch.selfFunded = result;
      break;
    default:
      break;
  }

  return patch;
}

function hasRealValue(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  const normalized = value.trim();
  if (!normalized) {
    return false;
  }

  return !(
    normalized.includes("YOUR_") ||
    normalized.includes("your-rpc") ||
    normalized.includes("Optional")
  );
}

function packageVersion(): string {
  try {
    const payload = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as Record<string, unknown>;
    return typeof payload.version === "string" && payload.version.trim()
      ? payload.version.trim()
      : "unknown";
  } catch {
    return "unknown";
  }
}

async function githubPackageVersion(): Promise<{
  version: string | null;
  error: string | null;
}> {
  if (dashboardVersionCache && dashboardVersionCache.expiresAt > Date.now()) {
    return {
      version: dashboardVersionCache.githubVersion,
      error: dashboardVersionCache.githubError,
    };
  }

  const url = process.env.DASHBOARD_GITHUB_PACKAGE_URL ?? DEFAULT_GITHUB_PACKAGE_URL;
  try {
    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`GitHub package request failed (${response.status}).`);
    }
    const payload = (await response.json()) as Record<string, unknown>;
    const version =
      typeof payload.version === "string" && payload.version.trim()
        ? payload.version.trim()
        : null;
    dashboardVersionCache = {
      expiresAt: Date.now() + GITHUB_VERSION_CACHE_TTL_MS,
      githubVersion: version,
      githubError: version ? null : "GitHub package version missing.",
    };
  } catch (error) {
    dashboardVersionCache = {
      expiresAt: Date.now() + GITHUB_VERSION_CACHE_TTL_MS,
      githubVersion: null,
      githubError: error instanceof Error ? error.message : String(error),
    };
  }

  return {
    version: dashboardVersionCache.githubVersion,
    error: dashboardVersionCache.githubError,
  };
}

async function dashboardVersion(): Promise<Record<string, unknown>> {
  const github = await githubPackageVersion();
  const appVersion = packageVersion();
  return {
    ok: true,
    appVersion,
    githubVersion: github.version ?? appVersion,
    githubVersionSource: github.version ? "github" : "local-fallback",
    ...(github.error ? { githubVersionError: github.error } : {}),
  };
}

function dashboardConfig(): Record<string, unknown> {
  const settings = loadDashboardSettings();
  const chains = supportedChains().map((chain) => ({
    key: chain.key,
    name: chain.name,
    chainId: chain.chainId,
    rpcEnv: chain.defaultRpcEnv,
    rpcConfigured: hasRealValue(process.env[chain.defaultRpcEnv]),
    protocol: chain.protocol.key,
    liquidatorContractConfigured: hasRealValue(
      resolveConfiguredLiquidatorContract(chain.key),
    ),
  }));
  const executionMarkets = supportedExecutionMarkets().map((market) => ({
    key: market.key,
    label: market.label,
    chain: market.chain,
    chainId: market.chainId,
    protocol: market.protocol.key,
    liquidatorContractConfigured: hasRealValue(
      resolveConfiguredLiquidatorContract(
        market.chain,
        undefined,
        market.key,
      ),
    ),
  }));

  return {
    chains,
    executionMarkets,
    protocolRegistries: {
      morphoBlueEthereum: morphoBlueEthereumRegistrySummary(),
    },
    marketDataProviders: eigenphiDashboardProviderSummary(),
    settings,
    privateKeyConfigured: hasRealValue(process.env.PRIVATE_KEY),
    liquidatorContractConfigured: hasRealValue(process.env.LIQUIDATOR_CONTRACT),
    liquidatorContract: process.env.LIQUIDATOR_CONTRACT,
    profitRecipientsConfigured: hasRealValue(process.env.PROFIT_RECIPIENTS),
    historyFile: historyFilePath(),
    liveStateFile: dashboardLiveStateFilePath(),
    settingsFile: dashboardSettingsFilePath(),
  };
}

function decodeFirestoreValue(value: unknown): unknown {
  if (!value || typeof value !== "object") {
    return value;
  }

  const entry = value as Record<string, unknown>;
  if ("nullValue" in entry) {
    return null;
  }
  if ("stringValue" in entry) {
    return entry.stringValue;
  }
  if ("booleanValue" in entry) {
    return entry.booleanValue;
  }
  if ("integerValue" in entry) {
    return Number(entry.integerValue);
  }
  if ("doubleValue" in entry) {
    return Number(entry.doubleValue);
  }
  if ("timestampValue" in entry) {
    return entry.timestampValue;
  }
  if ("mapValue" in entry) {
    const fields =
      entry.mapValue && typeof entry.mapValue === "object"
        ? ((entry.mapValue as { fields?: Record<string, unknown> }).fields ?? {})
        : {};
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(fields)) {
      next[key] = decodeFirestoreValue(item);
    }
    return next;
  }
  if ("arrayValue" in entry) {
    const values =
      entry.arrayValue && typeof entry.arrayValue === "object"
        ? ((entry.arrayValue as { values?: unknown[] }).values ?? [])
        : [];
    return values.map((item) => decodeFirestoreValue(item));
  }

  return entry;
}

function decodeFirestoreDocument(document: unknown): Record<string, unknown> {
  const source =
    document && typeof document === "object" ? (document as Record<string, unknown>) : {};
  const fields =
    source.fields && typeof source.fields === "object"
      ? (source.fields as Record<string, unknown>)
      : {};
  const decoded: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(fields)) {
    decoded[key] = decodeFirestoreValue(value);
  }

  if (typeof source.name === "string") {
    decoded._documentName = source.name;
  }
  if (typeof source.updateTime === "string") {
    decoded._updateTime = source.updateTime;
  }
  if (typeof source.createTime === "string") {
    decoded._createTime = source.createTime;
  }

  return decoded;
}

async function fetchEigenphiDocument(
  chain: string,
  period: "1" | "7" | "30",
  documentName:
    | "liquidation_summary"
    | "liquidation_trend"
    | "liquidation_profit_distribution"
    | "liquidation_protocols"
    | "flashloan_summary"
    | "flashloan_trend"
    | "flashloan_protocols"
    | "tx_profit_leaderboard"
    | "flashloan_latest"
    | "flashloan_top",
): Promise<Record<string, unknown>> {
  const url = `https://firestore.googleapis.com/v1/projects/arbitragescan/databases/(default)/documents/alpha/${chain}/${period}d/${documentName}`;
  return fetchEigenphiDocumentByPath(url);
}

async function fetchEigenphiDocumentByPath(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`EigenPhi request failed (${response.status}) for ${url}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (payload.error) {
    throw new Error(`EigenPhi document error for ${url}: ${JSON.stringify(payload.error)}`);
  }

  return decodeFirestoreDocument(payload);
}

async function fetchEigenphiPathDocument(path: string): Promise<Record<string, unknown>> {
  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return fetchEigenphiDocumentByPath(
    `https://firestore.googleapis.com/v1/projects/arbitragescan/databases/(default)/documents/${encodedPath}`,
  );
}

async function fetchEigenphiOptionalDocument(
  chain: string,
  period: "1" | "7" | "30",
  documentName:
    | "tx_profit_leaderboard"
    | "flashloan_latest"
    | "flashloan_top",
): Promise<Record<string, unknown> | null> {
  try {
    return await fetchEigenphiDocument(chain, period, documentName);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("(404)")) {
      return null;
    }
    throw error;
  }
}

async function fetchEigenphiOptionalPathDocument(
  path: string,
): Promise<Record<string, unknown> | null> {
  try {
    return await fetchEigenphiPathDocument(path);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("(404)")) {
      return null;
    }
    throw error;
  }
}

async function fetchEigenphiCollection(
  path: string,
  options?: {
    pageSize?: number;
    orderBy?: string;
  },
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  if (options?.pageSize) {
    params.set("pageSize", String(options.pageSize));
  }
  if (options?.orderBy) {
    params.set("orderBy", options.orderBy);
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const suffix = params.size ? `?${params.toString()}` : "";
  const url = `https://firestore.googleapis.com/v1/projects/arbitragescan/databases/(default)/documents/${encodedPath}${suffix}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`EigenPhi collection request failed (${response.status}) for ${path}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (payload.error) {
    throw new Error(`EigenPhi collection error for ${path}: ${JSON.stringify(payload.error)}`);
  }

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return documents
    .filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
    )
    .map((document) => decodeFirestoreDocument(document));
}

async function fetchEigenphiCollectionPage(
  path: string,
  options?: {
    pageSize?: number;
    orderBy?: string;
    pageToken?: string;
  },
): Promise<{
  rows: Record<string, unknown>[];
  nextPageToken: string | null;
}> {
  const params = new URLSearchParams();
  if (options?.pageSize) {
    params.set("pageSize", String(options.pageSize));
  }
  if (options?.orderBy) {
    params.set("orderBy", options.orderBy);
  }
  if (options?.pageToken) {
    params.set("pageToken", options.pageToken);
  }

  const encodedPath = path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const suffix = params.size ? `?${params.toString()}` : "";
  const url = `https://firestore.googleapis.com/v1/projects/arbitragescan/databases/(default)/documents/${encodedPath}${suffix}`;
  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`EigenPhi collection request failed (${response.status}) for ${path}.`);
  }

  const payload = (await response.json()) as Record<string, unknown>;
  if (payload.error) {
    throw new Error(`EigenPhi collection error for ${path}: ${JSON.stringify(payload.error)}`);
  }

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  const rows = documents
    .filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
    )
    .map((document) => decodeFirestoreDocument(document));
  return {
    rows,
    nextPageToken: typeof payload.nextPageToken === "string" ? payload.nextPageToken : null,
  };
}

function parseDateBoundary(dateText: string | undefined): {
  day: string;
  startTimestamp: number;
  endTimestamp: number;
} | null {
  if (!dateText || !/^\d{4}-\d{2}-\d{2}$/.test(dateText)) {
    return null;
  }
  const [yearText, monthText, dayText] = dateText.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return null;
  }
  const startTimestamp = Math.floor(Date.UTC(year, month - 1, day, 0, 0, 0) / 1000);
  const endTimestamp = Math.floor(Date.UTC(year, month - 1, day + 1, 0, 0, 0) / 1000);
  return {
    day: dateText,
    startTimestamp,
    endTimestamp,
  };
}

async function fetchEigenphiLatestLiquidationPageFromFirestore(payload: {
  chain: string;
  date?: string;
  page?: number;
  pageSize?: number;
}): Promise<Record<string, unknown>> {
  const chain = payload.chain;
  const page = Number.isFinite(payload.page) ? Math.max(0, Math.trunc(payload.page ?? 0)) : 0;
  const pageSize = Number.isFinite(payload.pageSize)
    ? Math.max(5, Math.min(100, Math.trunc(payload.pageSize ?? 10)))
    : 10;
  const offset = page * pageSize;
  const dateBoundary = parseDateBoundary(parseOptionalString(payload.date));
  const desiredCount = offset + pageSize + 1;
  const matchedRows: Record<string, unknown>[] = [];
  let pageToken: string | null = null;
  let hasMore = true;

  while (hasMore && matchedRows.length < desiredCount) {
    const pagePayload = await fetchEigenphiCollectionPage(`alpha/${chain}/liquidation_latest`, {
      pageSize: 100,
      orderBy: "blockTimestamp desc",
      pageToken: pageToken ?? undefined,
    });

    pageToken = pagePayload.nextPageToken;
    hasMore = Boolean(pageToken);

    for (const row of pagePayload.rows) {
      const timestamp = asNumber(row.blockTimestamp);
      if (dateBoundary && timestamp !== null) {
        if (timestamp < dateBoundary.startTimestamp) {
          hasMore = false;
          break;
        }
        if (timestamp >= dateBoundary.endTimestamp) {
          continue;
        }
      }
      matchedRows.push(row);
      if (matchedRows.length >= desiredCount) {
        break;
      }
    }
  }

  const latestUpdateDoc = await fetchEigenphiOptionalPathDocument(
    `alpha/${chain}/liquidation_latest_updateInfo/default`,
  );

  const rows = matchedRows.slice(offset, offset + pageSize).map((row) => ({
    time: asNumber(row.blockTimestamp),
    borrower: asString(row.borrower) ?? "--",
    liquidator: asString(row.liquidator) ?? "--",
    debtAsset: resolveTokenSymbol(row.debtAsset),
    debtToCover: asNumber(row.debtToCover) ?? 0,
    debtQuantity: asNumber(row.debtQuantity) ?? 0,
    liquidationAsset: resolveTokenSymbol(row.liquidationAsset),
    liquidationAmount: asNumber(row.liquidationAmount) ?? 0,
    liquidationQuantity: asNumber(row.liquidationQuantity) ?? 0,
    protocol: resolveProtocolName(row.protocolInfo),
    txHash: asString(row.txHash) ?? "--",
  }));

  return {
    ok: true,
    sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    sourceProject: "arbitragescan",
    sourceCollection: `alpha/${chain}/liquidation_latest`,
    chain,
    date: dateBoundary?.day ?? null,
    page,
    pageSize,
    hasPrev: page > 0,
    hasNext: matchedRows.length > offset + pageSize || (rows.length === pageSize && hasMore),
    rangeStart: offset,
    rangeEnd: offset + rows.length,
    updateTimestamp: asNumber(latestUpdateDoc?.updateTimestamp) ?? null,
    rows,
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value)
    ? value.filter(
        (item): item is Record<string, unknown> =>
          Boolean(item) && typeof item === "object",
      )
    : [];
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value.replace(/,/g, ""));
    return Number.isFinite(numeric) ? numeric : null;
  }
  return null;
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberCell(value: unknown): string {
  const numeric = asNumber(value);
  if (numeric === null) {
    return "--";
  }
  return numeric.toFixed(2);
}

function integerCell(value: unknown): string {
  const numeric = asNumber(value);
  if (numeric === null) {
    return "--";
  }
  return String(Math.round(numeric));
}

function resolveProtocolName(value: unknown): string {
  const info = asRecord(value);
  return (
    asString(info.showName) ??
    asString(info.name) ??
    asString(info.protocolName) ??
    asString(value) ??
    "--"
  );
}

function resolveTokenSymbolFromList(tokens: unknown): string {
  const list = asArray(tokens);
  if (list.length === 0) {
    return "--";
  }
  const preferred =
    list.find((token) => asString(token.symbol)) ??
    list.find((token) => asString(token.tokenSymbol));
  return (
    asString(preferred?.symbol) ??
    asString(preferred?.tokenSymbol) ??
    "--"
  );
}

function resolveTokenSymbolsFromList(tokens: unknown): string {
  const symbols = asArray(tokens)
    .map((token) => asString(token.symbol) ?? asString(token.tokenSymbol))
    .filter((value): value is string => Boolean(value));
  const unique = [...new Set(symbols)];
  return unique.length ? unique.join(" ") : "--";
}

function resolveTokenSymbol(value: unknown): string {
  const direct = asRecord(value);
  return (
    asString(direct.symbol) ??
    asString(direct.tokenSymbol) ??
    resolveTokenSymbolFromList(value)
  );
}

function resolveProtocolNamesFromList(value: unknown): string {
  const names = asArray(value)
    .map((item) => resolveProtocolName(item))
    .filter((name) => name && name !== "--");
  const unique = [...new Set(names)];
  return unique.length ? unique.join(", ") : "--";
}

function sortRowsByTimestamp(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  return [...rows].sort((left, right) => {
    const leftTime = asNumber(left.time) ?? 0;
    const rightTime = asNumber(right.time) ?? 0;
    return rightTime - leftTime;
  });
}

function aggregateByKey(
  rows: Record<string, unknown>[],
  keyName: string,
  buildSeed: (row: Record<string, unknown>) => Record<string, unknown>,
): Record<string, unknown>[] {
  const buckets = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = asString(row[keyName]) ?? "--";
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, buildSeed(row));
      continue;
    }

    for (const field of ["profit", "cost", "revenue", "amount", "count", "txCount"]) {
      const current = asNumber(existing[field]) ?? 0;
      const next = asNumber(row[field]) ?? 0;
      if (current !== 0 || next !== 0) {
        existing[field] = current + next;
      }
    }

    const latestTime = Math.max(asNumber(existing.time) ?? 0, asNumber(row.time) ?? 0);
    existing.time = latestTime;
  }

  return sortRowsByTimestamp([...buckets.values()]);
}

async function fetchEigenphiLiquidationOverviewFromFirestore(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  const [summary, trend, distribution, protocols] = await Promise.all([
    fetchEigenphiDocument(chain, period, "liquidation_summary"),
    fetchEigenphiDocument(chain, period, "liquidation_trend"),
    fetchEigenphiDocument(chain, period, "liquidation_profit_distribution"),
    fetchEigenphiDocument(chain, period, "liquidation_protocols"),
  ]);

  return {
    ok: true,
    sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    sourceProject: "arbitragescan",
    chain,
    period,
    fetchedAt: new Date().toISOString(),
    summary,
    trend,
    distribution,
    protocols,
  };
}

function summarizeFlashloanLegs(row: Record<string, unknown>): {
  amount: number;
  fee: number;
  asset: string;
  protocol: string;
  borrower: string;
} {
  const lendingResults = asArray(row.lendingResults);
  if (!lendingResults.length) {
    return {
      amount: asNumber(row.amount) ?? 0,
      fee: Math.abs(asNumber(row.fee) ?? 0),
      asset: resolveTokenSymbol(row.asset),
      protocol: resolveProtocolName(row.protocolInfo),
      borrower: asString(row.borrower) ?? "--",
    };
  }

  const amount = lendingResults.reduce((sum, item) => sum + (asNumber(item.amount) ?? 0), 0);
  const fee = lendingResults.reduce(
    (sum, item) => sum + Math.abs(asNumber(item.fee) ?? 0),
    0,
  );
  const assets = [
    ...new Set(
      lendingResults
        .map((item) => resolveTokenSymbol(item.asset ?? item))
        .filter((value) => value && value !== "--"),
    ),
  ];
  const protocols = [
    ...new Set(
      lendingResults
        .map((item) => resolveProtocolName(item.protocolInfo))
        .filter((value) => value && value !== "--"),
    ),
  ];
  const borrower = asString(lendingResults[0]?.borrower) ?? asString(row.borrower) ?? "--";

  return {
    amount,
    fee,
    asset: assets.length ? assets.join(" ") : "--",
    protocol: protocols.length ? protocols.join(", ") : "--",
    borrower,
  };
}

function normalizeFlashloanRow(row: Record<string, unknown>): Record<string, unknown> {
  const summary = summarizeFlashloanLegs(row);
  const legs = asArray(row.lendingResults).map((item) => ({
    borrower: asString(item.borrower) ?? summary.borrower,
    amount: asNumber(item.amount) ?? 0,
    fee: Math.abs(asNumber(item.fee) ?? 0),
    asset: resolveTokenSymbol(item.asset),
    protocol: resolveProtocolName(item.protocolInfo),
    protocolInfo: asRecord(item.protocolInfo),
    assetInfo: asRecord(item.asset),
  }));
  return {
    time: asNumber(row.blockTimestamp),
    txHash: asString(row.txHash) ?? asString(row.transactionHash) ?? "--",
    purpose: asString(row.purpose) ?? "--",
    blockNumber: asNumber(row.blockNumber) ?? 0,
    tokenCount: asNumber(row.tokenCount) ?? 0,
    lpCount: asNumber(row.lpCount) ?? 0,
    borrower: summary.borrower,
    asset: summary.asset,
    protocol: summary.protocol,
    amount: summary.amount,
    fee: summary.fee,
    legs,
  };
}

async function fetchEigenphiFlashloanOverviewFromFirestore(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  const [
    summaryDoc,
    trendDoc,
    protocolsDoc,
    topDoc,
    latestUpdateDoc,
    latestCollectionRows,
  ] = await Promise.all([
    fetchEigenphiDocument(chain, period, "flashloan_summary"),
    fetchEigenphiDocument(chain, period, "flashloan_trend"),
    fetchEigenphiDocument(chain, period, "flashloan_protocols"),
    fetchEigenphiDocument(chain, period, "flashloan_top"),
    fetchEigenphiOptionalPathDocument(`alpha/${chain}/flashloan_latest_updateInfo/default`),
    fetchEigenphiCollection(`alpha/${chain}/flashloan_latest`, {
      pageSize: 20,
      orderBy: "blockTimestamp desc",
    }),
  ]);

  const summary = asRecord(summaryDoc.data);
  const trendRows = asArray(trendDoc.data).map((row) => ({
    protocolTrendItems: asArray(row.protocolTrendItems),
    timestamp: asNumber(row.timestamp),
    amount:
      asNumber(row.amount) ??
      asArray(row.protocolTrendItems).reduce(
        (sum, item) => sum + (asNumber(item.amount) ?? 0),
        0,
      ),
    txCount: asNumber(row.txCount) ?? 0,
  }));
  const protocolRows = asArray(protocolsDoc.data)
    .map((row) => ({
      protocolInfo: asRecord(row.protocolInfo),
      amount: asNumber(row.amount) ?? 0,
      fee: Math.abs(asNumber(row.fee) ?? 0),
      txCount: asNumber(row.txCount) ?? 0,
      borrowerCount: asNumber(row.borrowerCount) ?? 0,
      flashloanCount: asNumber(row.flashloanCount) ?? 0,
      flashloanAssetCount:
        asNumber(row.flashloanAssetCount) ??
        asNumber(row.liquidatedAssetCount) ??
        asArray(row.assets).length,
      assets: asArray(row.assets),
    }))
    .sort((left, right) => right.amount - left.amount);
  const topRows = asArray(topDoc.data)
    .map((row) => normalizeFlashloanRow(row))
    .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0));
  const latestRows = latestCollectionRows
    .map((row) => normalizeFlashloanRow(row))
    .sort((left, right) => (asNumber(right.time) ?? 0) - (asNumber(left.time) ?? 0));

  return {
    ok: true,
    sourcePage: "https://eigenphi.io/mev/ethereum/flashloan",
    sourceProject: "arbitragescan",
    chain,
    period,
    fetchedAt: new Date().toISOString(),
    summary: {
      data: {
        txCount: asNumber(summary.txCount) ?? 0,
        amount: asNumber(summary.amount) ?? 0,
        fee: Math.abs(asNumber(summary.fee) ?? 0),
        flashloanCount: asNumber(summary.flashloanCount) ?? 0,
        flashloanBorrowerCount: asNumber(summary.flashloanBorrowerCount) ?? 0,
        flashloanAssetCount: asNumber(summary.flashloanAssetCount) ?? 0,
      },
      updateTimestamp: asNumber(summaryDoc.updateTimestamp) ?? null,
    },
    trend: {
      data: trendRows,
      updateTimestamp: asNumber(trendDoc.updateTimestamp) ?? null,
    },
    protocols: {
      data: protocolRows,
      updateTimestamp: asNumber(protocolsDoc.updateTimestamp) ?? null,
    },
    top: {
      rows: topRows,
      updateTimestamp: asNumber(topDoc.updateTimestamp) ?? null,
    },
    latest: {
      rows: latestRows,
      updateTimestamp:
        asNumber(latestUpdateDoc?.updateTimestamp) ??
        asNumber(summaryDoc.updateTimestamp) ??
        null,
    },
  };
}

async function fetchEigenphiLiquidationLeaderboardFromFirestore(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  const nextPaths = {
    txProfit: `alpha/${chain}/${period}d/liquidation_tx_profit/profit/default`,
    liquidations: `alpha/${chain}/${period}d/liquidation_top_liquidation/amount/default`,
    liquidators: `alpha/${chain}/${period}d/liquidation_top_liquidators/amount/default`,
    assets: `alpha/${chain}/${period}d/liquidation_top_assets/amount/default`,
    borrowers: `alpha/${chain}/${period}d/liquidation_top_borrowers/amount/default`,
    latestUpdate: `alpha/${chain}/liquidation_latest_updateInfo/default`,
  } as const;

  const [
    txProfitDoc,
    topLiquidationDoc,
    topLiquidatorsDoc,
    topAssetsDoc,
    topBorrowersDoc,
    latestUpdateDoc,
    latestCollectionRows,
    legacyTxProfitDoc,
    legacyFlashloanLatestDoc,
  ] = await Promise.all([
    fetchEigenphiOptionalPathDocument(nextPaths.txProfit),
    fetchEigenphiOptionalPathDocument(nextPaths.liquidations),
    fetchEigenphiOptionalPathDocument(nextPaths.liquidators),
    fetchEigenphiOptionalPathDocument(nextPaths.assets),
    fetchEigenphiOptionalPathDocument(nextPaths.borrowers),
    fetchEigenphiOptionalPathDocument(nextPaths.latestUpdate),
    fetchEigenphiCollection(`alpha/${chain}/liquidation_latest`, {
      pageSize: 10,
      orderBy: "blockTimestamp desc",
    }),
    fetchEigenphiOptionalDocument(chain, period, "tx_profit_leaderboard"),
    fetchEigenphiOptionalDocument(chain, period, "flashloan_latest"),
  ]);

  const txProfitSource = asArray(txProfitDoc?.data);
  const topLiquidationSource = asArray(topLiquidationDoc?.data);
  const topLiquidatorsSource = asArray(topLiquidatorsDoc?.data);
  const topAssetsSource = asArray(topAssetsDoc?.data);
  const topBorrowersSource = asArray(topBorrowersDoc?.data);

  const txProfitRows = txProfitSource.length
    ? txProfitSource
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.liquidator) ?? "--",
          asset: resolveTokenSymbolsFromList(row.liquidatedAssets),
          profit: asNumber(row.profit) ?? 0,
          cost: asNumber(row.cost) ?? 0,
          revenue: asNumber(row.revenue) ?? 0,
          protocol: resolveProtocolNamesFromList(row.protocolInfos),
          txHash: asString(row.transactionHash) ?? "--",
          count: 1,
          txCount: 1,
        }))
        .sort((left, right) => (asNumber(right.profit) ?? 0) - (asNumber(left.profit) ?? 0))
    : [...asArray(legacyTxProfitDoc?.data)
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.fromAddress) ?? "--",
          asset: resolveTokenSymbolFromList(row.tokens),
          profit: asNumber(row.profit) ?? 0,
          cost: asNumber(row.cost) ?? 0,
          revenue: asNumber(row.revenue) ?? 0,
          protocol: resolveProtocolName(row.contractLabels),
          txHash: asString(row.txHash) ?? "--",
          count: 1,
          txCount: 1,
        }))]
        .sort((left, right) => (asNumber(right.profit) ?? 0) - (asNumber(left.profit) ?? 0));

  const liquidationRows = topLiquidationSource.length
    ? topLiquidationSource
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.liquidator) ?? "--",
          borrower: asString(row.borrower) ?? "--",
          asset: resolveTokenSymbol(row.liquidationAsset),
          amount: asNumber(row.liquidationAmount) ?? 0,
          protocol: resolveProtocolName(row.protocolInfo),
          txHash: asString(row.transactionHash) ?? "--",
          txCount: 1,
        }))
        .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0))
    : [...asArray(legacyFlashloanLatestDoc?.data)
        .filter((row) => (asString(row.purpose) ?? "").toLowerCase() === "liquidation")
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.borrower) ?? "--",
          borrower: asString(row.borrower) ?? "--",
          asset: resolveTokenSymbol(row.asset) || "--",
          amount: asNumber(row.amount) ?? 0,
          protocol: resolveProtocolName(row.protocolInfo),
          txHash: asString(row.transactionHash) ?? "--",
          txCount: 1,
        }))]
        .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0));

  const latestLiquidationRows = latestCollectionRows.length
    ? latestCollectionRows
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.liquidator) ?? "--",
          borrower: asString(row.borrower) ?? "--",
          asset: resolveTokenSymbol(row.liquidationAsset),
          amount: asNumber(row.liquidationAmount) ?? 0,
          protocol: resolveProtocolName(row.protocolInfo),
          txHash: asString(row.txHash) ?? "--",
          txCount: 1,
        }))
        .sort((left, right) => (asNumber(right.time) ?? 0) - (asNumber(left.time) ?? 0))
    : [...liquidationRows].sort(
        (left, right) => (asNumber(right.time) ?? 0) - (asNumber(left.time) ?? 0),
      );

  const liquidatorRows = topLiquidatorsSource.length
    ? topLiquidatorsSource
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          liquidator: asString(row.liquidator) ?? "--",
          amount: asNumber(row.liquidationAmount) ?? 0,
          txCount: asNumber(row.liquidationTxCount) ?? 0,
          liquidatedAssetCount: asNumber(row.liquidatedAssetCount) ?? 0,
        }))
        .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0))
    : aggregateByKey(liquidationRows, "liquidator", (row) => ({
        time: row.time,
        liquidator: row.liquidator,
        amount: row.amount,
        txCount: row.txCount,
        liquidatedAssetCount: 1,
      })).sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0));

  const assetRows = topAssetsSource.length
    ? topAssetsSource
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          asset: resolveTokenSymbol(row.asset),
          amount: asNumber(row.liquidationAmount) ?? 0,
          txCount: asNumber(row.liquidationTxCount) ?? 0,
        }))
        .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0))
    : aggregateByKey(liquidationRows, "asset", (row) => ({
        time: row.time,
        asset: row.asset,
        amount: row.amount,
        txCount: row.txCount,
      })).sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0));

  const borrowerRows = topBorrowersSource.length
    ? topBorrowersSource
        .map((row) => ({
          time: asNumber(row.blockTimestamp),
          borrower: asString(row.borrower) ?? "--",
          amount: asNumber(row.liquidationAmount) ?? 0,
          txCount: asNumber(row.liquidationTxCount) ?? 0,
          liquidatedAssetCount: asNumber(row.liquidatedAssetCount) ?? 0,
        }))
        .sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0))
    : aggregateByKey(liquidationRows, "borrower", (row) => ({
        time: row.time,
        borrower: row.borrower,
        amount: row.amount,
        txCount: row.txCount,
        liquidatedAssetCount: 1,
      })).sort((left, right) => (asNumber(right.amount) ?? 0) - (asNumber(left.amount) ?? 0));

  return {
    ok: true,
    sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    sourceProject: "arbitragescan",
    chain,
    period,
    fetchedAt: new Date().toISOString(),
    supports: {
      txProfitLeaderboard: Boolean(txProfitDoc || legacyTxProfitDoc),
      flashloanLatest: Boolean(latestCollectionRows.length || legacyFlashloanLatestDoc),
      liquidationTxProfit: Boolean(txProfitDoc),
      liquidationTopLiquidation: Boolean(topLiquidationDoc),
      liquidationTopLiquidators: Boolean(topLiquidatorsDoc),
      liquidationTopAssets: Boolean(topAssetsDoc),
      liquidationTopBorrowers: Boolean(topBorrowersDoc),
      liquidationLatest: latestCollectionRows.length > 0,
    },
    latest: {
      rows: latestLiquidationRows,
      updateTimestamp:
        asNumber(latestUpdateDoc?.updateTimestamp) ??
        asNumber(txProfitDoc?.updateTimestamp) ??
        asNumber(topLiquidationDoc?.updateTimestamp) ??
        null,
    },
    tabs: {
      txProfit: {
        rows: txProfitRows,
      },
      liquidations: {
        rows: liquidationRows,
      },
      liquidators: {
        rows: liquidatorRows,
      },
      liquidatedAssets: {
        rows: assetRows,
      },
      liquidatedBorrowers: {
        rows: borrowerRows,
      },
    },
  };
}

async function fetchEigenphiLatestLiquidationPage(payload: {
  chain: string;
  date?: string;
  page?: number;
  pageSize?: number;
}): Promise<Record<string, unknown>> {
  const page = Number.isFinite(payload.page) ? Math.max(0, Math.trunc(payload.page ?? 0)) : 0;
  const pageSize = Number.isFinite(payload.pageSize)
    ? Math.max(5, Math.min(100, Math.trunc(payload.pageSize ?? 10)))
    : 10;
  return fetchEigenphiDashboardPayload(
    {
      key: "latest-liquidation",
      chain: payload.chain,
      date: parseOptionalString(payload.date),
      page,
      pageSize,
      sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    },
    () =>
      fetchEigenphiLatestLiquidationPageFromFirestore({
        ...payload,
        page,
        pageSize,
      }),
  );
}

async function fetchEigenphiLiquidationOverview(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  return fetchEigenphiDashboardPayload(
    {
      key: "liquidation-overview",
      chain,
      period,
      sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    },
    () => fetchEigenphiLiquidationOverviewFromFirestore(chain, period),
  );
}

async function fetchEigenphiFlashloanOverview(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  return fetchEigenphiDashboardPayload(
    {
      key: "flashloan-overview",
      chain,
      period,
      sourcePage: "https://eigenphi.io/mev/ethereum/flashloan",
    },
    () => fetchEigenphiFlashloanOverviewFromFirestore(chain, period),
  );
}

async function fetchEigenphiLiquidationLeaderboard(
  chain: string,
  period: "1" | "7" | "30",
): Promise<Record<string, unknown>> {
  return fetchEigenphiDashboardPayload(
    {
      key: "liquidation-leaderboard",
      chain,
      period,
      sourcePage: "https://eigenphi.io/mev/ethereum/liquidation",
    },
    () => fetchEigenphiLiquidationLeaderboardFromFirestore(chain, period),
  );
}

const erc20BalanceAbi = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

function walletSnapshotTtlMs(): number {
  const configured = Number(process.env.DASHBOARD_WALLET_SNAPSHOT_TTL_MS);
  return Number.isFinite(configured) && configured >= 0
    ? configured
    : DEFAULT_WALLET_SNAPSHOT_TTL_MS;
}

function walletSnapshotCacheKey(
  chain: ChainPreset,
  privateKey: `0x${string}` | undefined,
  rpcUrl: string | undefined,
): string {
  let accountAddress = "";
  try {
    accountAddress = privateKey ? privateKeyToAccount(privateKey).address : "";
  } catch {
    accountAddress = "invalid-private-key";
  }
  return JSON.stringify({
    chain: chain.key,
    account: accountAddress,
    rpcUrl: rpcUrl ?? "",
  });
}

async function walletSnapshotForChain(
  chain: ChainPreset,
): Promise<Record<string, unknown>> {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const rpcUrl = process.env[chain.defaultRpcEnv];
  const cacheKey = walletSnapshotCacheKey(chain, privateKey, rpcUrl);
  const cached = walletSnapshotCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.payload;
  }

  const inflight = walletSnapshotInflight.get(cacheKey);
  if (inflight) return inflight;

  const promise = fetchUncachedWalletSnapshotForChain(chain)
    .then((payload) => {
      const ttlMs = walletSnapshotTtlMs();
      if (ttlMs > 0) {
        const snapshotTtlMs = payload.ready === true ? ttlMs : Math.min(ttlMs, 5_000);
        walletSnapshotCache.set(cacheKey, {
          expiresAt: Date.now() + snapshotTtlMs,
          payload,
        });
      }
      return payload;
    })
    .finally(() => {
      walletSnapshotInflight.delete(cacheKey);
    });

  walletSnapshotInflight.set(cacheKey, promise);
  return promise;
}

async function fetchUncachedWalletSnapshotForChain(
  chain: ChainPreset,
): Promise<Record<string, unknown>> {
  const privateKey = process.env.PRIVATE_KEY as `0x${string}` | undefined;
  const rpcUrl = process.env[chain.defaultRpcEnv];
  if (!privateKey || !rpcUrl) {
    return {
      chain: chain.key,
      chainName: chain.name,
      ready: false,
      reason: !privateKey ? "PRIVATE_KEY missing" : `${chain.defaultRpcEnv} missing`,
    };
  }

  try {
    const account = privateKeyToAccount(privateKey);
    const client = createPublicClient({ transport: http(rpcUrl) });
    const market = await resolveMarket(client, chain, undefined, undefined);
    const nativeBalance = await client.getBalance({ address: account.address });
    const reserveState = await loadReserveMetadata(client, market.poolAddressesProvider);

    const buildTokenCandidates = (
      tokenSymbol: "USDC" | "USDT",
    ): Map<string, { asset: `0x${string}`; decimals: number; symbol?: string }> => {
      const candidates = new Map<
        string,
        { asset: `0x${string}`; decimals: number; symbol?: string }
      >();
      const matchedReserve =
        reserveState.reserves.find((reserve) => reserve.symbol === tokenSymbol) ??
        reserveState.reserves.find((reserve) =>
          String(reserve.symbol).toUpperCase().includes(tokenSymbol),
        );
      if (matchedReserve) {
        candidates.set(matchedReserve.asset.toLowerCase(), {
          asset: matchedReserve.asset,
          decimals: Number(matchedReserve.decimals),
          symbol: matchedReserve.symbol,
        });
      }
      for (const reserve of reserveState.reserves) {
        if (!String(reserve.symbol).toUpperCase().includes(tokenSymbol)) continue;
        candidates.set(reserve.asset.toLowerCase(), {
          asset: reserve.asset,
          decimals: Number(reserve.decimals),
          symbol: reserve.symbol,
        });
      }
      for (const asset of TOKEN_BALANCE_OVERRIDES[chain.key]?.[tokenSymbol] ?? []) {
        if (!candidates.has(asset.toLowerCase())) {
          candidates.set(asset.toLowerCase(), {
            asset,
            decimals: 6,
            symbol: tokenSymbol,
          });
        }
      }
      return candidates;
    };

    const resolveBestTokenBalance = async (tokenSymbol: "USDC" | "USDT") => {
      const candidates = buildTokenCandidates(tokenSymbol);
      let bestBalance: bigint | undefined;
      let bestAsset: `0x${string}` | undefined;
      let bestSymbol: string | undefined;
      let bestBalanceDisplay: string | undefined;

      for (const candidate of candidates.values()) {
        try {
          const balance = await client.readContract({
            address: candidate.asset,
            abi: erc20BalanceAbi,
            functionName: "balanceOf",
            args: [account.address],
          });
          if (bestBalance === undefined || balance > bestBalance) {
            bestBalance = balance;
            bestAsset = candidate.asset;
            bestSymbol = candidate.symbol;
            bestBalanceDisplay = formatUnits(balance, candidate.decimals);
          }
        } catch {
          continue;
        }
      }

      return {
        asset: bestAsset,
        symbol: bestSymbol ?? tokenSymbol,
        balance: bestBalance,
        balanceDisplay: bestBalanceDisplay,
      };
    };

    const [usdcToken, usdtToken] = await Promise.all([
      resolveBestTokenBalance("USDC"),
      resolveBestTokenBalance("USDT"),
    ]);

    const nativeSymbol =
      chain.key === "polygon"
        ? "POL"
        : chain.key === "bnb"
          ? "BNB"
          : "ETH";
    const watchedBalances = [
      {
        key: nativeSymbol.toLowerCase() + "-gas",
        symbol: nativeSymbol,
        label: `${nativeSymbol} Gas`,
        kind: "gas",
        asset: undefined,
        balance: nativeBalance.toString(),
        balanceDisplay: formatUnits(nativeBalance, 18),
      },
      {
        key: "usdc",
        symbol: usdcToken.symbol ?? "USDC",
        label: "USDC Balance",
        kind: "stablecoin",
        asset: usdcToken.asset,
        balance: usdcToken.balance?.toString(),
        balanceDisplay: usdcToken.balanceDisplay,
      },
      {
        key: "usdt",
        symbol: usdtToken.symbol ?? "USDT",
        label: "USDT Balance",
        kind: "stablecoin",
        asset: usdtToken.asset,
        balance: usdtToken.balance?.toString(),
        balanceDisplay: usdtToken.balanceDisplay,
      },
    ];

    return {
      chain: chain.key,
      chainName: chain.name,
      protocol: chain.protocol.key,
      ready: true,
      address: getAddress(account.address),
      nativeSymbol,
      nativeBalance: nativeBalance.toString(),
      nativeBalanceDisplay: formatUnits(nativeBalance, 18),
      usdcAsset: usdcToken.asset,
      usdcSymbol: usdcToken.symbol,
      usdcBalance: usdcToken.balance?.toString(),
      usdcBalanceDisplay: usdcToken.balanceDisplay,
      usdtAsset: usdtToken.asset,
      usdtSymbol: usdtToken.symbol,
      usdtBalance: usdtToken.balance?.toString(),
      usdtBalanceDisplay: usdtToken.balanceDisplay,
      watchedBalances,
      liquidatorContract: resolveConfiguredLiquidatorContract(chain.key),
    };
  } catch (error) {
    return {
      chain: chain.key,
      chainName: chain.name,
      ready: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function pickDistribution(raw: unknown): DashboardDistribution | undefined {
  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const object = raw as Record<string, unknown>;
  const recipients = Array.isArray(object.recipients)
    ? object.recipients
        .filter(
          (recipient): recipient is Record<string, unknown> =>
            Boolean(recipient) && typeof recipient === "object",
        )
        .map((recipient) => ({
          address: typeof recipient.address === "string" ? recipient.address : "unknown",
          bps: typeof recipient.bps === "string" ? recipient.bps : undefined,
          amount: typeof recipient.amount === "string" ? recipient.amount : undefined,
          amountDisplay:
            typeof recipient.amountDisplay === "string" ? recipient.amountDisplay : undefined,
        }))
    : [];

  return {
    token: typeof object.token === "string" ? object.token : undefined,
    grossAmountDisplay:
      typeof object.grossAmountDisplay === "string" ? object.grossAmountDisplay : undefined,
    principalReserveAmountDisplay:
      typeof object.principalReserveAmountDisplay === "string"
        ? object.principalReserveAmountDisplay
        : undefined,
    distributableProfitAmountDisplay:
      typeof object.distributableProfitAmountDisplay === "string"
        ? object.distributableProfitAmountDisplay
        : undefined,
    remainderToOwnerDisplay:
      typeof object.remainderToOwnerDisplay === "string"
        ? object.remainderToOwnerDisplay
        : undefined,
    canDistribute: typeof object.canDistribute === "boolean" ? object.canDistribute : undefined,
    reason: typeof object.reason === "string" ? object.reason : undefined,
    recipients,
  };
}

function toDashboardEntry(entry: HistoryEntry): DashboardEntry {
  const raw =
    entry.raw && typeof entry.raw === "object" ? (entry.raw as Record<string, unknown>) : {};
  const executeLiquidation =
    raw.executeLiquidation && typeof raw.executeLiquidation === "object" && raw.executeLiquidation
      ? (raw.executeLiquidation as Record<string, unknown>)
      : {};
  const broadcastResult =
    raw.broadcastResult && typeof raw.broadcastResult === "object" && raw.broadcastResult
      ? (raw.broadcastResult as Record<string, unknown>)
      : {};

  const pair =
    entry.debtSymbol && entry.collateralSymbol
      ? `${entry.debtSymbol} <- ${entry.collateralSymbol}`
      : undefined;

  return {
    recordedAt: entry.recordedAt,
    script: entry.script,
    mode: entry.mode,
    chainName: entry.chainName,
    marketId: entry.marketId,
    executionMarketLabel: entry.executionMarketLabel,
    selectedUser: entry.selectedUser,
    pair,
    outputToken: entry.outputToken,
    liquidatable: entry.liquidatable,
    estimatedNetProfitDisplay: entry.estimatedNetProfitDisplay,
    realizedNetProfitDisplay: entry.realizedNetProfitDisplay,
    txHash: entry.broadcastResult?.executeTxHash,
    status: entry.broadcastResult?.status,
    distribution: pickDistribution(broadcastResult.realizedDistribution),
    raw: {
      ...raw,
      executeLiquidation:
        Object.keys(executeLiquidation).length === 0
          ? undefined
          : {
              ...executeLiquidation,
              swap:
                executeLiquidation.swap &&
                typeof executeLiquidation.swap === "object" &&
                executeLiquidation.swap
                  ? {
                      ...(executeLiquidation.swap as Record<string, unknown>),
                      swapCalldata: "[omitted]",
                    }
                  : undefined,
            },
    },
  };
}

function buildSummary(entries: DashboardEntry[]): Record<string, unknown> {
  const latest = entries[0];
  const liquidatableEntries = entries.filter((entry) => entry.liquidatable).length;

  return {
    totalEntries: entries.length,
    broadcastCount: entries.length,
    simulationCount: 0,
    liquidatableCount: liquidatableEntries,
    latestRecordedAt: latest?.recordedAt,
    latestEstimatedNetProfitDisplay: undefined,
    latestRealizedNetProfitDisplay: latest?.realizedNetProfitDisplay,
    latestPair: latest?.pair,
    latestChainName: latest?.chainName,
    latestExecutionMarketLabel: latest?.executionMarketLabel,
    latestUser: latest?.selectedUser,
    latestMode: latest ? "broadcast" : undefined,
  };
}

function recentEntries(limit: number, onlyBroadcast: boolean): DashboardEntry[] {
  const entries = loadHistory();
  const filtered = onlyBroadcast ? entries.filter((entry) => entry.mode === "broadcast") : entries;
  const sliced = filtered.slice(Math.max(0, filtered.length - limit)).reverse();
  return sliced.map(toDashboardEntry);
}

async function marketDataIndexStatus(): Promise<Record<string, unknown>> {
  const databaseStatus = await databaseMarketDataIndexStatus();
  const localStatus = onchainDashboardIndexStatus();
  if (!databaseStatus) return localStatus;
  return {
    ...databaseStatus,
    local: localStatus,
  };
}

const serveApi = createDashboardApiHandler({
  activateLicense,
  buildCliActionSpec,
  buildSummary: (entries) => buildSummary(entries as DashboardEntry[]),
  dashboardConfig,
  historyFilePath,
  dashboardLiveStateFilePath,
  dashboardSettingsFilePath,
  executeCliAction,
  fetchEigenphiFlashloanOverview,
  fetchEigenphiLatestLiquidationPage,
  fetchEigenphiLiquidationLeaderboard,
  fetchEigenphiLiquidationOverview,
  fetchMarketDataIndexStatus: marketDataIndexStatus,
  fetchMorphoBlueEthereumDashboardSnapshot,
  fetchMorphoBlueBaseDashboardSnapshot,
  fetchQuickNodeUsage,
  fetchTxGraph,
  json,
  liveStatePatchForResult,
  licenseStatus: (token) => licenseStatus(bearerToken(token ?? undefined)),
  loadDashboardLiveState,
  loadDashboardSettings,
  parseOptionalString,
  readBody,
  recentEntries: (limit, onlyBroadcast) =>
    recentEntries(limit, onlyBroadcast) as unknown as Record<string, unknown>[],
  requireLicensedFeature: (token, feature) =>
    bearerToken(token ?? undefined) === DASHBOARD_AUTH_LICENSE_TOKEN
      ? Promise.resolve({
          ok: true,
          licensed: true,
          dashboardAuth: true,
          feature,
        })
      : requireLicensedFeature(bearerToken(token ?? undefined), feature),
  saveDashboardLiveState: (patch) =>
    saveDashboardLiveState(patch as Partial<DashboardLiveState>),
  saveDashboardSettings,
  strategyMarketsSummary,
  streamArbitrageLoop: (payload, push, isClosed) =>
    streamArbitrageLoop(payload as DashboardRunRequest, push, isClosed),
  streamAutoExecutionLoop: (payload, push, isClosed) =>
    streamAutoExecutionLoop(payload as DashboardRunRequest, push, isClosed),
  supportedChains,
  truthy,
  walletSnapshotForChain: (chain) =>
    walletSnapshotForChain(chain as ChainPreset),
});

const serveHtml = (res: ServerResponse): void => {
  serveDashboardHtml(
    {
      html: DASHBOARD_HTML,
      text,
    },
    res,
  );
};

const serveStaticAsset = (
  res: ServerResponse,
  pathname: string,
): boolean => {
  return serveDashboardStaticAsset(
    {
      json,
    },
    res,
    pathname,
  );
};

function main(): void {
  const host =
    readNonEmptyConfig(readArg("host")) ??
    readNonEmptyConfig(process.env.DASHBOARD_HOST) ??
    "127.0.0.1";
  const port = Number(
    readNonEmptyConfig(readArg("port")) ??
      readNonEmptyConfig(process.env.DASHBOARD_PORT) ??
      "4310",
  );
  if (!Number.isFinite(port) || port <= 0) {
    throw new Error(`Invalid dashboard port: ${port}`);
  }

  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${host}:${port}`);
    void (async () => {
      if (isDashboardAuthRoute(url.pathname)) {
        await handleDashboardAuthRoute(req, res, url.pathname, { readBody, text });
        return;
      }
      if (url.pathname.startsWith("/api/")) {
        const auth = await requireDashboardAuth(req);
        if (!auth.authorized) {
          json(res, 401, { ok: false, error: auth.error ?? "Authorization required." });
          return;
        }
        if (url.pathname === "/api/version") {
          json(res, 200, await dashboardVersion());
          return;
        }
        req.headers.authorization = `Bearer ${DASHBOARD_AUTH_LICENSE_TOKEN}`;
        req.headers["x-license-token"] = DASHBOARD_AUTH_LICENSE_TOKEN;
        await serveApi(req, res, url);
        return;
      }
      if (serveStaticAsset(res, url.pathname)) {
        return;
      }
      const auth = await requireDashboardAuth(req);
      if (!auth.authorized) {
        serveDashboardAuthPage(res, text, auth.error ?? "");
        return;
      }
      serveHtml(res);
    })().catch((error) => {
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
  });

  server.listen(port, host, () => {
    if (process.env.DASHBOARD_VERBOSE === "1") {
      console.log(
        JSON.stringify(
          {
            ok: true,
            url: `http://${host}:${port}`,
            historyFile: historyFilePath(),
            liveStateFile: dashboardLiveStateFilePath(),
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(`[dashboard] ready at http://${host}:${port}`);
  });
}

main();
