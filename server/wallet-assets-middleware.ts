import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ENV_FILE } from "./runtime-paths";

const BALANCE_OF_SELECTOR = "0x70a08231";
const RPC_TIMEOUT_MS = 8_000;

type ChainKey = "ethereum" | "bnb" | "arbitrum";
type TokenKey = "usdc" | "usdt";

type WalletAssetRow = {
  key: ChainKey;
  gas: string;
  usdc: string;
  usdt: string;
  rpcStatus: string;
  error?: string;
};

const chainEnvKeys: Record<ChainKey, string> = {
  ethereum: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  arbitrum: "ARBITRUM_RPC_URL",
};

const defaultFallbackRpcUrls: Partial<Record<ChainKey, string>> = {};

const publicRpcUrls: Partial<Record<ChainKey, string[]>> = {
  ethereum: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com"],
  bnb: ["https://bsc-rpc.publicnode.com", "https://bsc-dataseed.binance.org"],
  arbitrum: ["https://arbitrum-one-rpc.publicnode.com", "https://arb1.arbitrum.io/rpc"],
};

const tokenContracts: Record<ChainKey, Record<TokenKey, { address: string; decimals: number }>> = {
  ethereum: {
    usdc: { address: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", decimals: 6 },
    usdt: { address: "0xdAC17F958D2ee523a2206206994597C13D831ec7", decimals: 6 },
  },
  bnb: {
    usdc: { address: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", decimals: 18 },
    usdt: { address: "0x55d398326f99059fF775485246999027B3197955", decimals: 18 },
  },
  arbitrum: {
    usdc: { address: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", decimals: 6 },
    usdt: { address: "0xFd086bC7CD5C481DCC9C85EBE478A1C0b69FCbb9", decimals: 6 },
  },
};

export function handleWalletAssetsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/wallet-assets")) return false;

  if (req.method !== "GET") {
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchWalletAssets()
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
}

async function fetchWalletAssets() {
  const env = readEnv();
  const walletAddress = configuredWalletAddress(env);
  const chains: ChainKey[] = ["ethereum", "bnb", "arbitrum"];
  const rows = await Promise.all(chains.map((chain) => fetchChainAssets(chain, walletAddress, env)));
  return { ok: true, walletAddress, rows };
}

async function fetchChainAssets(chain: ChainKey, walletAddress: string, env: Record<string, string>): Promise<WalletAssetRow> {
  const rpcUrls = rpcUrlsForChain(chain, env);
  if (rpcUrls.length === 0) {
    return { key: chain, gas: "--", usdc: "--", usdt: "--", rpcStatus: "未配置 RPC" };
  }

  const errors: string[] = [];
  for (const rpcUrl of rpcUrls) {
    try {
      const gas = await rpc<string>(chain, rpcUrl, "eth_getBalance", [walletAddress, "latest"], env).then((value) => formatUnits(hexToBigInt(value), 18, 4));
      const [usdc, usdt] = await Promise.all([
        readOptionalTokenBalance(chain, rpcUrl, tokenContracts[chain].usdc, walletAddress, env),
        readOptionalTokenBalance(chain, rpcUrl, tokenContracts[chain].usdt, walletAddress, env),
      ]);
      return { key: chain, gas, usdc, usdt, rpcStatus: publicRpcUrls[chain]?.includes(rpcUrl) ? "公共 RPC" : "已配置 RPC" };
    } catch (error) {
      errors.push(`${rpcEndpointLabel(rpcUrl)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return {
    key: chain,
    gas: "--",
    usdc: "--",
    usdt: "--",
    rpcStatus: "RPC 查询失败",
    error: errors.join("; "),
  };
}

function rpcUrlsForChain(chain: ChainKey, env: Record<string, string>): string[] {
  const configured = env[chainEnvKeys[chain]]?.trim();
  if (chain === "ethereum" || chain === "arbitrum") {
    return uniqueUrls([configured, fallbackRpcUrlForChain(chain, env)]);
  }
  return uniqueUrls([configured, fallbackRpcUrlForChain(chain, env), ...(publicRpcUrls.bnb ?? [])]);
}

function fallbackRpcUrlForChain(chain: ChainKey, env: Record<string, string>): string | undefined {
  if (chain === "ethereum") return env.ETHEREUM_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.ethereum;
  if (chain === "arbitrum") return env.ARBITRUM_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.arbitrum;
  if (chain === "bnb") return env.BNB_FALLBACK_RPC_URL?.trim() || defaultFallbackRpcUrls.bnb;
  return undefined;
}

function uniqueUrls(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function rpcEndpointLabel(value: string): string {
  try {
    return new URL(value).host;
  } catch {
    return value;
  }
}

async function readTokenBalance(chain: ChainKey, rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string, env: Record<string, string>): Promise<string> {
  const data = `${BALANCE_OF_SELECTOR}${walletAddress.slice(2).padStart(64, "0")}`;
  const value = await rpc<string>(chain, rpcUrl, "eth_call", [{ to: token.address, data }, "latest"], env);
  return formatUnits(hexToBigInt(value), token.decimals, 2);
}

async function readOptionalTokenBalance(chain: ChainKey, rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string, env: Record<string, string>): Promise<string> {
  try {
    return await readTokenBalance(chain, rpcUrl, token, walletAddress, env);
  } catch {
    return "--";
  }
}

async function rpc<T>(chain: ChainKey, rpcUrl: string, method: string, params: unknown[], env: Record<string, string>): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
    signal: AbortSignal.timeout(RPC_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC request failed.");
  return payload.result as T;
}

function configuredWalletAddress(env: Record<string, string>): string {
  const value = env.WALLET_ADDRESS?.trim() ?? "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(value)) throw new Error("请先在 .env 配置格式正确的 WALLET_ADDRESS，才能查询钱包资产。");
  return value;
}

function hexToBigInt(value?: string): bigint {
  if (!value || value === "0x") return 0n;
  return BigInt(value);
}

function formatUnits(value: bigint, decimals: number, fractionDigits: number): string {
  const base = 10n ** BigInt(decimals);
  const whole = value / base;
  const fraction = value % base;
  if (fraction === 0n) return whole.toString();
  const scaled = (fraction * 10n ** BigInt(fractionDigits)) / base;
  const fractionText = scaled.toString().padStart(fractionDigits, "0").replace(/0+$/, "");
  return fractionText ? `${whole}.${fractionText}` : whole.toString();
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
  }
  return parsed;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
