import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";

const ENV_FILE = resolve(process.cwd(), ".env");
const BALANCE_OF_SELECTOR = "0x70a08231";

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
  const privateKey = env.PRIVATE_KEY?.trim();
  if (!privateKey) {
    throw new Error("请先在 .env 配置 PRIVATE_KEY，才能查询钱包资产。");
  }

  const walletAddress = privateKeyToAddress(privateKey);
  const chains: ChainKey[] = ["ethereum", "bnb", "arbitrum"];
  const rows = await Promise.all(chains.map((chain) => fetchChainAssets(chain, walletAddress, env)));
  return { ok: true, walletAddress, rows };
}

async function fetchChainAssets(chain: ChainKey, walletAddress: string, env: Record<string, string>): Promise<WalletAssetRow> {
  const rpcUrl = env[chainEnvKeys[chain]]?.trim();
  if (!rpcUrl) {
    return { key: chain, gas: "--", usdc: "--", usdt: "--", rpcStatus: "未配置 RPC" };
  }

  try {
    const [gas, usdc, usdt] = await Promise.all([
      rpc<string>(rpcUrl, "eth_getBalance", [walletAddress, "latest"]).then((value) => formatUnits(hexToBigInt(value), 18, 4)),
      readTokenBalance(rpcUrl, tokenContracts[chain].usdc, walletAddress),
      readTokenBalance(rpcUrl, tokenContracts[chain].usdt, walletAddress),
    ]);
    return { key: chain, gas, usdc, usdt, rpcStatus: "已配置 RPC" };
  } catch (error) {
    return {
      key: chain,
      gas: "--",
      usdc: "--",
      usdt: "--",
      rpcStatus: "RPC 查询失败",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function readTokenBalance(rpcUrl: string, token: { address: string; decimals: number }, walletAddress: string): Promise<string> {
  const data = `${BALANCE_OF_SELECTOR}${walletAddress.slice(2).padStart(64, "0")}`;
  const value = await rpc<string>(rpcUrl, "eth_call", [{ to: token.address, data }, "latest"]);
  return formatUnits(hexToBigInt(value), token.decimals, 2);
}

async function rpc<T>(rpcUrl: string, method: string, params: unknown[]): Promise<T> {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: Date.now(), method, params }),
  });
  if (!response.ok) throw new Error(`RPC HTTP ${response.status}`);
  const payload = (await response.json()) as { result?: T; error?: { message?: string } };
  if (payload.error) throw new Error(payload.error.message ?? "RPC request failed.");
  return payload.result as T;
}

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY 格式不正确。");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
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
