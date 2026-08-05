import { timingSafeEqual } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  formatEther,
  formatUnits,
  type TransactionReceipt,
} from "ethers";
import { ENV_FILE } from "./runtime-paths";

const BSC_CHAIN_ID = 56n;
const TOKEN_DECIMALS = 18;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const RPC_TIMEOUT_MS = 12_000;
const PUBLIC_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org";

const VAULT_ADDRESS = "0xDa09a13CC1C072fe8FcC51952ACc022fd978172f";
const POWER_ADDRESS = "0x4b0986dF759c9F67cA3D16000d0c0DE9B25E6ec4";
const SUPERMT_POWER_ADDRESS = "0x9F4EEb385C6bD8B5C9743d4E7b7E4BC868bEB199";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const MT_ADDRESS = "0xEeFd8da010EDe7b5Eb881ba536057f0b86777777";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner,address spender) view returns (uint256)",
  "function approve(address spender,uint256 amount) returns (bool)",
] as const;

const VAULT_ABI = [
  "function isMember(address user) view returns (bool)",
  "function blacklisted(address user) view returns (bool)",
] as const;

const POWER_ABI = [
  "function balanceOf(address user) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function totalAllocated() view returns (uint256)",
  "function availableSupply() view returns (uint256)",
  "function packagePriceU() view returns (uint256)",
  "function PACKAGE_POWER() view returns (uint256)",
  "function purchasesPaused() view returns (bool)",
  "function migrationActive() view returns (bool)",
  "function migrationFinalized() view returns (bool)",
  "function quotePurchase(uint256 powerAmount) view returns (uint256 paymentValueU,uint256 mtAmount,uint256 mtPriceUPerMT)",
  "function buyWithUSDT(uint256 powerAmount) returns (uint256)",
  "function buyWithMT(uint256 powerAmount,uint256 maxMtAmount) returns (uint256)",
  "function buyWithSuperMTPowerBalance(uint256 powerAmount) returns (uint256)",
] as const;

const SUPERMT_POWER_ABI = [
  "function userRewardBalanceU(address user) view returns (uint256)",
  "function externalBalanceAllowance(address user,address spender) view returns (uint256)",
  "function approveExternalBalanceSpender(address spender,uint256 amountU) returns (bool)",
] as const;

type PaymentMethod = "balance" | "mt" | "usdt";
type PowerActionPayload = { method?: unknown; packages?: unknown };

class PowerApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "PowerApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function handlePolymarketPowerRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (!pathname || ![
    "/api/polymarket/power/status",
    "/api/polymarket/power/purchase",
  ].includes(pathname)) return false;

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  void routeRequest(pathname, req, res).catch((error: unknown) => sendError(res, error));
  return true;
}

async function routeRequest(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (pathname === "/api/polymarket/power/status") {
    if (req.method !== "GET") throw new PowerApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    await handleStatus(res);
    return;
  }

  if (req.method !== "POST") throw new PowerApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  requireJsonRequest(req);
  const body = await readJsonBody(req);
  const env = readEnv();
  requireAuthorizedWriteRequest(req, env);

  await withWriteLock(async () => {
    const lockedEnv = readEnv();
    requireAuthorizedWriteRequest(req, lockedEnv);
    await handlePurchase(body, res, lockedEnv);
  });
}

async function handleStatus(res: ServerResponse): Promise<void> {
  const context = await createContext(false);
  try {
    const blockNumber = await context.provider.getBlockNumber();
    const walletAddress = context.wallet?.address ?? "";
    const [
      totalSupply,
      totalAllocated,
      availableSupply,
      packagePriceU,
      packagePower,
      purchasesPaused,
      migrationActive,
      migrationFinalized,
    ] = await Promise.all([
      context.power.totalSupply({ blockTag: blockNumber }),
      context.power.totalAllocated({ blockTag: blockNumber }),
      context.power.availableSupply({ blockTag: blockNumber }),
      context.power.packagePriceU({ blockTag: blockNumber }),
      context.power.PACKAGE_POWER({ blockTag: blockNumber }),
      context.power.purchasesPaused({ blockTag: blockNumber }),
      context.power.migrationActive({ blockTag: blockNumber }),
      context.power.migrationFinalized({ blockTag: blockNumber }),
    ]);

    const walletState = context.wallet
      ? await readWalletState(context, blockNumber, BigInt(packagePower))
      : emptyWalletState();

    sendJson(res, 200, {
      ok: true,
      chainId: Number(BSC_CHAIN_ID),
      blockNumber,
      updatedAt: new Date().toISOString(),
      contracts: {
        power: POWER_ADDRESS,
        superMtPower: SUPERMT_POWER_ADDRESS,
        usdt: USDT_ADDRESS,
        mt: MT_ADDRESS,
      },
      wallet: {
        configured: Boolean(context.wallet),
        address: walletAddress,
        bnbBalance: token(walletState.bnbBalance),
        isMember: walletState.isMember,
        blacklisted: walletState.blacklisted,
      },
      power: {
        balance: token(walletState.powerBalance),
        totalSupply: token(BigInt(totalSupply)),
        totalAllocated: token(BigInt(totalAllocated)),
        availableSupply: token(BigInt(availableSupply)),
        packagePower: token(BigInt(packagePower)),
        packagePriceUsdt: token(BigInt(packagePriceU)),
        purchasesPaused: Boolean(purchasesPaused),
        migrationActive: Boolean(migrationActive),
        migrationFinalized: Boolean(migrationFinalized),
      },
      payments: {
        balance: {
          available: token(walletState.rewardBalance),
          allowance: token(walletState.rewardAllowance),
        },
        mt: {
          available: token(walletState.mtBalance),
          allowance: token(walletState.mtAllowance),
          packageQuote: token(walletState.mtPackageQuote),
          priceUsdtPerMt: token(walletState.mtPriceUPerMT),
        },
        usdt: {
          available: token(walletState.usdtBalance),
          allowance: token(walletState.usdtAllowance),
        },
      },
    });
  } finally {
    context.provider.destroy();
  }
}

async function handlePurchase(body: PowerActionPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const method = parsePaymentMethod(body.method);
  const packages = parsePackages(body.packages);
  const context = await createContext(true, env);
  try {
    const wallet = requireWallet(context);
    const packagePower = BigInt(await context.power.PACKAGE_POWER());
    const powerAmount = packagePower * packages;
    const [
      quote,
      availableSupply,
      purchasesPaused,
      migrationActive,
      migrationFinalized,
      isMember,
      blacklisted,
      bnbBalance,
    ] = await Promise.all([
      context.power.quotePurchase(powerAmount),
      context.power.availableSupply(),
      context.power.purchasesPaused(),
      context.power.migrationActive(),
      context.power.migrationFinalized(),
      context.vault.isMember(wallet.address),
      context.vault.blacklisted(wallet.address),
      context.provider.getBalance(wallet.address),
    ]);

    const paymentValueU = BigInt(quote.paymentValueU);
    const mtAmount = BigInt(quote.mtAmount);
    if (Boolean(purchasesPaused)) throw new PowerApiError(409, "PURCHASES_PAUSED", "算力购买当前已暂停。");
    if (Boolean(migrationActive) || Boolean(migrationFinalized)) throw new PowerApiError(409, "POWER_FROZEN", "算力合约当前不可购买。");
    if (!Boolean(isMember)) throw new PowerApiError(403, "MEMBER_REQUIRED", "请先存入 USDT 成为 Polymarket 会员，再购买算力。");
    if (Boolean(blacklisted)) throw new PowerApiError(403, "BLACKLISTED", "当前钱包已被限制，不能购买算力。");
    if (BigInt(availableSupply) < powerAmount) throw new PowerApiError(409, "INSUFFICIENT_POWER_SUPPLY", "可用算力供应不足。");

    let approvalTxHash = "";
    if (method === "usdt") {
      const [balance, allowance] = await Promise.all([
        context.usdt.balanceOf(wallet.address),
        context.usdt.allowance(wallet.address, POWER_ADDRESS),
      ]);
      if (BigInt(balance) < paymentValueU) throw new PowerApiError(409, "INSUFFICIENT_USDT", "钱包 USDT 余额不足。");
      if (BigInt(allowance) < paymentValueU) {
        const receipt = await sendTransaction(context, (context.usdt.connect(wallet) as Contract).getFunction("approve"), [POWER_ADDRESS, paymentValueU], BigInt(bnbBalance), "USDT 授权");
        approvalTxHash = receipt.hash;
      }
    } else if (method === "mt") {
      const [balance, allowance] = await Promise.all([
        context.mt.balanceOf(wallet.address),
        context.mt.allowance(wallet.address, POWER_ADDRESS),
      ]);
      if (BigInt(balance) < mtAmount) throw new PowerApiError(409, "INSUFFICIENT_MT", "钱包 MT 余额不足。");
      if (BigInt(allowance) < mtAmount) {
        const receipt = await sendTransaction(context, (context.mt.connect(wallet) as Contract).getFunction("approve"), [POWER_ADDRESS, mtAmount], BigInt(bnbBalance), "MT 授权");
        approvalTxHash = receipt.hash;
      }
    } else {
      const [balance, allowance] = await Promise.all([
        context.superMtPower.userRewardBalanceU(wallet.address),
        context.superMtPower.externalBalanceAllowance(wallet.address, POWER_ADDRESS),
      ]);
      if (BigInt(balance) < paymentValueU) throw new PowerApiError(409, "INSUFFICIENT_REWARD_BALANCE", "SuperMT 余额不足。");
      if (BigInt(allowance) < paymentValueU) {
        const receipt = await sendTransaction(
          context,
          (context.superMtPower.connect(wallet) as Contract).getFunction("approveExternalBalanceSpender"),
          [POWER_ADDRESS, paymentValueU],
          BigInt(bnbBalance),
          "SuperMT 余额授权",
        );
        approvalTxHash = receipt.hash;
      }
    }

    const currentBnbBalance = await context.provider.getBalance(wallet.address);
    const power = context.power.connect(wallet) as Contract;
    const purchaseMethod = method === "usdt"
      ? power.getFunction("buyWithUSDT")
      : method === "mt"
        ? power.getFunction("buyWithMT")
        : power.getFunction("buyWithSuperMTPowerBalance");
    const args = method === "mt" ? [powerAmount, mtAmount] : [powerAmount];
    const receipt = await sendTransaction(context, purchaseMethod, args, BigInt(currentBnbBalance), "算力购买");

    sendJson(res, 200, {
      ok: true,
      method,
      packages: Number(packages),
      powerAmount: token(powerAmount),
      paymentValueUsdt: token(paymentValueU),
      mtAmount: token(mtAmount),
      approvalTxHash,
      txHash: receipt.hash,
      receipt: receipt.data,
    });
  } finally {
    context.provider.destroy();
  }
}

async function createContext(walletRequired: boolean, suppliedEnv?: Record<string, string>) {
  const env = suppliedEnv ?? readEnv();
  const candidates = [
    env.BNB_RPC_URL?.trim(),
    env.BSC_RPC_URL?.trim(),
    env.BNB_FALLBACK_RPC_URL?.trim(),
    PUBLIC_BSC_RPC_URL,
  ].filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index);

  let provider: JsonRpcProvider | undefined;
  let lastError: unknown;
  for (const rpcUrl of candidates) {
    validateRpcUrl(rpcUrl);
    const request = new FetchRequest(rpcUrl);
    request.timeout = RPC_TIMEOUT_MS;
    const candidate = new JsonRpcProvider(request);
    try {
      const network = await candidate.getNetwork();
      if (network.chainId !== BSC_CHAIN_ID) throw new PowerApiError(400, "WRONG_CHAIN", "RPC 必须连接 BSC 主网（chainId 56）。");
      provider = candidate;
      break;
    } catch (error) {
      candidate.destroy();
      lastError = error;
    }
  }
  if (!provider) throw lastError ?? new PowerApiError(502, "RPC_UNAVAILABLE", "BSC RPC 暂时不可用。");

  try {
    const [powerCode, vaultCode] = await Promise.all([provider.getCode(POWER_ADDRESS), provider.getCode(VAULT_ADDRESS)]);
    if (powerCode === "0x" || vaultCode === "0x") throw new PowerApiError(502, "CONTRACT_NOT_DEPLOYED", "BSC 主网未找到 Polymarket 算力合约。");
    const privateKey = env.PRIVATE_KEY?.trim();
    let wallet: Wallet | undefined;
    if (privateKey) {
      if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(privateKey)) throw new PowerApiError(400, "INVALID_PRIVATE_KEY", "PRIVATE_KEY 格式不正确。");
      wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
    } else if (walletRequired) {
      throw new PowerApiError(400, "MISSING_PRIVATE_KEY", "请先在设置中配置 PRIVATE_KEY。");
    }
    return {
      provider,
      wallet,
      vault: new Contract(VAULT_ADDRESS, VAULT_ABI, provider),
      power: new Contract(POWER_ADDRESS, POWER_ABI, provider),
      superMtPower: new Contract(SUPERMT_POWER_ADDRESS, SUPERMT_POWER_ABI, provider),
      usdt: new Contract(USDT_ADDRESS, ERC20_ABI, provider),
      mt: new Contract(MT_ADDRESS, ERC20_ABI, provider),
    };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function readWalletState(context: Awaited<ReturnType<typeof createContext>>, blockTag: number, packagePower: bigint) {
  const wallet = requireWallet(context);
  const [quote, powerBalance, rewardBalance, rewardAllowance, mtBalance, mtAllowance, usdtBalance, usdtAllowance, bnbBalance, isMember, blacklisted] = await Promise.all([
    context.power.quotePurchase(packagePower, { blockTag }),
    context.power.balanceOf(wallet.address, { blockTag }),
    context.superMtPower.userRewardBalanceU(wallet.address, { blockTag }),
    context.superMtPower.externalBalanceAllowance(wallet.address, POWER_ADDRESS, { blockTag }),
    context.mt.balanceOf(wallet.address, { blockTag }),
    context.mt.allowance(wallet.address, POWER_ADDRESS, { blockTag }),
    context.usdt.balanceOf(wallet.address, { blockTag }),
    context.usdt.allowance(wallet.address, POWER_ADDRESS, { blockTag }),
    context.provider.getBalance(wallet.address, blockTag),
    context.vault.isMember(wallet.address, { blockTag }),
    context.vault.blacklisted(wallet.address, { blockTag }),
  ]);
  return {
    powerBalance: BigInt(powerBalance),
    rewardBalance: BigInt(rewardBalance),
    rewardAllowance: BigInt(rewardAllowance),
    mtBalance: BigInt(mtBalance),
    mtAllowance: BigInt(mtAllowance),
    mtPackageQuote: BigInt(quote.mtAmount),
    mtPriceUPerMT: BigInt(quote.mtPriceUPerMT),
    usdtBalance: BigInt(usdtBalance),
    usdtAllowance: BigInt(usdtAllowance),
    bnbBalance: BigInt(bnbBalance),
    isMember: Boolean(isMember),
    blacklisted: Boolean(blacklisted),
  };
}

function emptyWalletState() {
  return {
    powerBalance: 0n,
    rewardBalance: 0n,
    rewardAllowance: 0n,
    mtBalance: 0n,
    mtAllowance: 0n,
    mtPackageQuote: 0n,
    mtPriceUPerMT: 0n,
    usdtBalance: 0n,
    usdtAllowance: 0n,
    bnbBalance: 0n,
    isMember: false,
    blacklisted: false,
  };
}

async function sendTransaction(
  context: Awaited<ReturnType<typeof createContext>>,
  method: any,
  args: unknown[],
  bnbBalance: bigint,
  label: string,
) {
  const wallet = requireWallet(context);
  const gasEstimate = await method.estimateGas(...args);
  const gasLimit = (gasEstimate * 125n + 99n) / 100n;
  const feeData = await context.provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice || gasPrice <= 0n) throw new PowerApiError(502, "GAS_PRICE_UNAVAILABLE", "暂时无法获取 BSC Gas 价格。");
  const required = gasLimit * gasPrice;
  if (bnbBalance < required) {
    throw new PowerApiError(409, "INSUFFICIENT_BNB_FOR_GAS", "BNB 余额不足以支付交易 Gas。", {
      balance: formatEther(bnbBalance),
      required: formatEther(required),
    });
  }
  const nonce = await context.provider.getTransactionCount(wallet.address, "pending");
  const transaction = await method(...args, { gasLimit, gasPrice, nonce });
  const receipt = await transaction.wait(1) as TransactionReceipt | null;
  if (!receipt || receipt.status !== 1) throw new PowerApiError(502, "TRANSACTION_FAILED", `${label}交易未成功确认。`, { txHash: transaction.hash });
  return {
    hash: transaction.hash,
    data: { status: receipt.status, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() },
  };
}

function parsePaymentMethod(value: unknown): PaymentMethod {
  if (value === "balance" || value === "mt" || value === "usdt") return value;
  throw new PowerApiError(400, "INVALID_PAYMENT_METHOD", "请选择余额、MT 或 USDT 支付。");
}

function parsePackages(value: unknown): bigint {
  const normalized = typeof value === "number" ? String(value) : typeof value === "string" ? value.trim() : "";
  if (!/^[1-9]\d{0,2}$/.test(normalized)) throw new PowerApiError(400, "INVALID_PACKAGES", "购买份数必须是 1 到 999 的整数。");
  const packages = BigInt(normalized);
  if (packages > 999n) throw new PowerApiError(400, "INVALID_PACKAGES", "单次最多购买 999 份。");
  return packages;
}

function token(value: bigint): string {
  return formatUnits(value, TOKEN_DECIMALS);
}

function requireWallet(context: Awaited<ReturnType<typeof createContext>>): Wallet {
  if (!context.wallet) throw new PowerApiError(400, "MISSING_PRIVATE_KEY", "请先在设置中配置 PRIVATE_KEY。");
  return context.wallet;
}

function requireJsonRequest(req: IncomingMessage): void {
  const contentType = headerValue(req.headers["content-type"]);
  if (!contentType?.toLowerCase().startsWith("application/json")) throw new PowerApiError(415, "JSON_REQUIRED", "请求必须使用 application/json。");
}

function requireAuthorizedWriteRequest(req: IncomingMessage, env: Record<string, string>): void {
  requireSameOriginLocalRequest(req);
  const expected = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!expected) throw new PowerApiError(503, "AUTH_CODE_NOT_CONFIGURED", "请先在设置中配置 AUTH_CODE。");
  const provided = (headerValue(req.headers["x-supermtnode-auth-code"]) || "").trim().toUpperCase();
  if (!provided || !safeStringEqual(provided, expected)) throw new PowerApiError(401, "UNAUTHORIZED", "授权码无效。");
}

function requireSameOriginLocalRequest(req: IncomingMessage): void {
  const originValue = headerValue(req.headers.origin);
  const hostValue = headerValue(req.headers.host)?.toLowerCase();
  if (!originValue || !hostValue) throw new PowerApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new PowerApiError(403, "UNTRUSTED_ORIGIN", "交易请求来源无效。");
  }
  const hostname = origin.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1"].includes(hostname) || !["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !== hostValue) {
    throw new PowerApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
  }
}

function safeStringEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function validateRpcUrl(value: string): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new PowerApiError(400, "INVALID_BNB_RPC_URL", "BNB RPC 地址格式不正确。");
  }
  if (!["https:", "http:"].includes(url.protocol)) throw new PowerApiError(400, "INVALID_BNB_RPC_URL", "BNB RPC 必须使用 HTTP 或 HTTPS。");
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

async function readJsonBody(req: IncomingMessage): Promise<PowerActionPayload> {
  const source = await new Promise<string>((resolveBody, rejectBody) => {
    let body = "";
    let tooLarge = false;
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => {
      if (tooLarge) return;
      body += chunk;
      if (Buffer.byteLength(body, "utf8") > MAX_REQUEST_BODY_BYTES) {
        tooLarge = true;
        body = "";
      }
    });
    req.on("end", () => {
      if (tooLarge) rejectBody(new PowerApiError(413, "REQUEST_TOO_LARGE", "请求内容过大。"));
      else resolveBody(body);
    });
    req.on("error", rejectBody);
  });
  try {
    const payload = JSON.parse(source || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload as PowerActionPayload;
  } catch {
    throw new PowerApiError(400, "INVALID_JSON", "JSON 请求内容无效。");
  }
}

async function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolveQueue) => { release = resolveQueue; });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
}

function requestPathname(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value, "http://127.0.0.1").pathname;
  } catch {
    return undefined;
  }
}

function headerValue(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function sendJson(res: ServerResponse, statusCode: number, payload: Record<string, unknown>): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof PowerApiError) {
    sendJson(res, error.statusCode, { ok: false, code: error.code, error: error.message, ...(error.details ? { details: error.details } : {}) });
    return;
  }
  const message = error instanceof Error ? error.message : "Unknown error";
  sendJson(res, 500, { ok: false, code: "INTERNAL_ERROR", error: message });
}
