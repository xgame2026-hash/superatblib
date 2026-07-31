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
  getAddress,
  parseUnits,
  type TransactionReceipt,
} from "ethers";
import { ENV_FILE } from "./runtime-paths";

const BSC_CHAIN_ID = 56n;
const TOKEN_DECIMALS = 18;
const MAX_REQUEST_BODY_BYTES = 8 * 1024;
const RPC_TIMEOUT_MS = 12_000;
const PUBLIC_BSC_RPC_URL = "https://bsc-dataseed.bnbchain.org";

const VAULT_ADDRESS = "0xd22a42bEc8E789EeF2b4F34Af4EBd1bE40CC0eF8";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
] as const;

const VAULT_ABI = [
  "function asset() view returns (address)",
  "function owner() view returns (address)",
  "function depositsPaused() view returns (bool)",
  "function withdrawalsPaused() view returns (bool)",
  "function rewardsPaused() view returns (bool)",
  "function bridgePaused() view returns (bool)",
  "function cyclesPaused() view returns (bool)",
  "function migrationActive() view returns (bool)",
  "function migrationFinalized() view returns (bool)",
  "function currentCycleId() view returns (uint256)",
  "function memberCount() view returns (uint256)",
  "function totalPrincipalLiability() view returns (uint256)",
  "function totalLockedPrincipal() view returns (uint256)",
  "function lifetimeRewardsPaid() view returns (uint256)",
  "function blacklisted(address user) view returns (bool)",
  "function getMember(address user) view returns (tuple(uint256 availablePrincipal,uint256 lockedPrincipal,uint256 pendingWithdrawal,uint256 lifetimeDeposited,uint256 lifetimePrincipalWithdrawn,uint256 lifetimeRewardReceived,uint64 lastCapitalCheckpoint,uint256 capitalSeconds))",
  "function getWithdrawalRestriction(address user) view returns (tuple(bool restricted,uint64 windowStart,uint256 windowWithdrawn,uint256 rolling24HourLimit,uint256 lifetimeLimit,uint256 lifetimeWithdrawn))",
  "function getCycle(uint256 cycleId) view returns (tuple(uint8 status,uint32 monthId,uint64 fundingEndTime,uint64 startTime,uint64 expectedEndTime,uint64 settlementDeadline,uint256 participantCount,uint256 totalPrincipal,uint256 outboundAmount,uint256 returnedAmount,uint256 grossProfit,uint256 operatingExpense,uint256 netProfit,uint256 rewardBudget,uint256 distributedReward,uint256 releaseCursor,uint256 rewardBatchId,bytes32 participantSnapshotHash,bytes32 settlementReportHash))",
  "function memberTotalReturnBps(address user) view returns (uint256)",
  "function polymarketDeposit(uint256 amount)",
  "function polymarketWithdrawPrincipal(uint256 amount)",
] as const;

type VaultActionPayload = { amount?: unknown };

class VaultApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(statusCode: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = "VaultApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function handlePolymarketVaultRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (!pathname || ![
    "/api/polymarket/vault/status",
    "/api/polymarket/vault/approve",
    "/api/polymarket/vault/deposit",
    "/api/polymarket/vault/withdraw",
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
  if (pathname === "/api/polymarket/vault/status") {
    if (req.method !== "GET") throw new VaultApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    await handleStatus(res);
    return;
  }

  if (req.method !== "POST") throw new VaultApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  requireJsonRequest(req);
  const body = await readJsonBody(req);
  const env = readEnv();
  requireAuthorizedWriteRequest(req, env);

  await withWriteLock(async () => {
    const lockedEnv = readEnv();
    requireAuthorizedWriteRequest(req, lockedEnv);
    if (pathname === "/api/polymarket/vault/approve") {
      await handleApprove(body, res, lockedEnv);
    } else if (pathname === "/api/polymarket/vault/deposit") {
      await handleDeposit(body, res, lockedEnv);
    } else {
      await handleWithdraw(body, res, lockedEnv);
    }
  });
}

async function handleStatus(res: ServerResponse): Promise<void> {
  const context = await createContext(false);
  try {
    const blockNumber = await context.provider.getBlockNumber();
    const [
      configuredAsset,
      owner,
      depositsPaused,
      withdrawalsPaused,
      rewardsPaused,
      bridgePaused,
      cyclesPaused,
      migrationActive,
      migrationFinalized,
      currentCycleId,
      memberCount,
      totalPrincipalLiability,
      totalLockedPrincipal,
      lifetimeRewardsPaid,
    ] = await Promise.all([
      context.vault.asset({ blockTag: blockNumber }),
      context.vault.owner({ blockTag: blockNumber }),
      context.vault.depositsPaused({ blockTag: blockNumber }),
      context.vault.withdrawalsPaused({ blockTag: blockNumber }),
      context.vault.rewardsPaused({ blockTag: blockNumber }),
      context.vault.bridgePaused({ blockTag: blockNumber }),
      context.vault.cyclesPaused({ blockTag: blockNumber }),
      context.vault.migrationActive({ blockTag: blockNumber }),
      context.vault.migrationFinalized({ blockTag: blockNumber }),
      context.vault.currentCycleId({ blockTag: blockNumber }),
      context.vault.memberCount({ blockTag: blockNumber }),
      context.vault.totalPrincipalLiability({ blockTag: blockNumber }),
      context.vault.totalLockedPrincipal({ blockTag: blockNumber }),
      context.vault.lifetimeRewardsPaid({ blockTag: blockNumber }),
    ]);
    requireAddress(configuredAsset, USDT_ADDRESS, "VAULT_ASSET_MISMATCH", "合约资产不是预期的 BSC USDT。");

    const walletAddress = context.wallet?.address ?? "";
    const walletState = context.wallet
      ? await readWalletState(context, blockNumber, BigInt(currentCycleId))
      : emptyWalletState();

    sendJson(res, 200, {
      ok: true,
      chainId: Number(BSC_CHAIN_ID),
      blockNumber,
      updatedAt: new Date().toISOString(),
      contracts: {
        vault: getAddress(VAULT_ADDRESS),
        usdt: getAddress(USDT_ADDRESS),
        owner: getAddress(String(owner)),
      },
      wallet: {
        configured: Boolean(context.wallet),
        address: walletAddress,
        bnbBalance: token(walletState.bnbBalance),
        usdtBalance: token(walletState.usdtBalance),
        allowance: token(walletState.allowance),
      },
      member: {
        availablePrincipal: token(walletState.availablePrincipal),
        lockedPrincipal: token(walletState.lockedPrincipal),
        pendingWithdrawal: token(walletState.pendingWithdrawal),
        lifetimeDeposited: token(walletState.lifetimeDeposited),
        lifetimePrincipalWithdrawn: token(walletState.lifetimePrincipalWithdrawn),
        lifetimeRewardReceived: token(walletState.lifetimeRewardReceived),
        totalReturnBps: Number(walletState.totalReturnBps),
        blacklisted: walletState.blacklisted,
        restriction: {
          restricted: walletState.restricted,
          rolling24HourLimit: token(walletState.rolling24HourLimit),
          windowWithdrawn: token(walletState.windowWithdrawn),
          lifetimeLimit: token(walletState.lifetimeLimit),
          lifetimeWithdrawn: token(walletState.lifetimeWithdrawn),
        },
      },
      vault: {
        depositsPaused: Boolean(depositsPaused),
        withdrawalsPaused: Boolean(withdrawalsPaused),
        rewardsPaused: Boolean(rewardsPaused),
        bridgePaused: Boolean(bridgePaused),
        cyclesPaused: Boolean(cyclesPaused),
        migrationActive: Boolean(migrationActive),
        migrationFinalized: Boolean(migrationFinalized),
        currentCycleId: Number(currentCycleId),
        memberCount: Number(memberCount),
        totalPrincipalLiability: token(BigInt(totalPrincipalLiability)),
        totalLockedPrincipal: token(BigInt(totalLockedPrincipal)),
        lifetimeRewardsPaid: token(BigInt(lifetimeRewardsPaid)),
      },
      cycle: serializeCycle(walletState.cycle),
    });
  } finally {
    context.provider.destroy();
  }
}

async function handleApprove(body: VaultActionPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const amount = parseAmount(body.amount);
  const context = await createContext(true, env);
  try {
    const wallet = requireWallet(context);
    const [balance, allowance, bnbBalance] = await Promise.all([
      context.usdt.balanceOf(wallet.address),
      context.usdt.allowance(wallet.address, VAULT_ADDRESS),
      context.provider.getBalance(wallet.address),
    ]);
    if (BigInt(balance) < amount) throw new VaultApiError(409, "INSUFFICIENT_USDT", "钱包 USDT 余额不足。", { balance: token(BigInt(balance)) });
    if (BigInt(allowance) >= amount) {
      sendJson(res, 200, { ok: true, skipped: true, txHash: "", allowance: token(BigInt(allowance)) });
      return;
    }
    const tokenContract = context.usdt.connect(wallet) as Contract;
    const receipt = await sendContractTransaction(
      context,
      tokenContract.getFunction("approve"),
      [VAULT_ADDRESS, amount],
      BigInt(bnbBalance),
      "USDT 授权",
    );
    sendJson(res, 200, { ok: true, txHash: receipt.hash, receipt: receipt.data, allowance: token(amount) });
  } finally {
    context.provider.destroy();
  }
}

async function handleDeposit(body: VaultActionPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const amount = parseAmount(body.amount);
  const context = await createContext(true, env);
  try {
    const wallet = requireWallet(context);
    const [balance, allowance, depositsPaused, blacklisted, migrationActive, migrationFinalized, bnbBalance] = await Promise.all([
      context.usdt.balanceOf(wallet.address),
      context.usdt.allowance(wallet.address, VAULT_ADDRESS),
      context.vault.depositsPaused(),
      context.vault.blacklisted(wallet.address),
      context.vault.migrationActive(),
      context.vault.migrationFinalized(),
      context.provider.getBalance(wallet.address),
    ]);
    if (Boolean(depositsPaused)) throw new VaultApiError(409, "DEPOSITS_PAUSED", "合约当前已暂停存入。");
    if (Boolean(blacklisted)) throw new VaultApiError(403, "BLACKLISTED", "当前钱包已被限制，不能存入。");
    if (Boolean(migrationActive) || Boolean(migrationFinalized)) throw new VaultApiError(409, "MIGRATION_ACTIVE", "合约正在迁移，不能存入。");
    if (BigInt(balance) < amount) throw new VaultApiError(409, "INSUFFICIENT_USDT", "钱包 USDT 余额不足。", { balance: token(BigInt(balance)) });

    let approvalTxHash = "";
    if (BigInt(allowance) < amount) {
      const tokenContract = context.usdt.connect(wallet) as Contract;
      const approvalReceipt = await sendContractTransaction(
        context,
        tokenContract.getFunction("approve"),
        [VAULT_ADDRESS, amount],
        BigInt(bnbBalance),
        "USDT 授权",
      );
      approvalTxHash = approvalReceipt.hash;
    }

    const currentBnbBalance = await context.provider.getBalance(wallet.address);
    const vaultContract = context.vault.connect(wallet) as Contract;
    const receipt = await sendContractTransaction(
      context,
      vaultContract.getFunction("polymarketDeposit"),
      [amount],
      BigInt(currentBnbBalance),
      "Polymarket 存入",
    );
    sendJson(res, 200, {
      ok: true,
      txHash: receipt.hash,
      approvalTxHash,
      receipt: receipt.data,
      amount: token(amount),
    });
  } finally {
    context.provider.destroy();
  }
}

async function handleWithdraw(body: VaultActionPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const amount = parseAmount(body.amount);
  const context = await createContext(true, env);
  try {
    const wallet = requireWallet(context);
    const [member, withdrawalsPaused, blacklisted, migrationActive, migrationFinalized, bnbBalance] = await Promise.all([
      context.vault.getMember(wallet.address),
      context.vault.withdrawalsPaused(),
      context.vault.blacklisted(wallet.address),
      context.vault.migrationActive(),
      context.vault.migrationFinalized(),
      context.provider.getBalance(wallet.address),
    ]);
    if (Boolean(withdrawalsPaused)) throw new VaultApiError(409, "WITHDRAWALS_PAUSED", "合约当前已暂停提取。");
    if (Boolean(blacklisted)) throw new VaultApiError(403, "BLACKLISTED", "当前钱包已被限制，不能提取。");
    if (Boolean(migrationActive) || Boolean(migrationFinalized)) throw new VaultApiError(409, "MIGRATION_ACTIVE", "合约正在迁移，不能提取。");
    if (BigInt(member.availablePrincipal) < amount) {
      throw new VaultApiError(409, "INSUFFICIENT_AVAILABLE_PRINCIPAL", "可提取本金不足；周期锁定本金不能提前提取。", {
        availablePrincipal: token(BigInt(member.availablePrincipal)),
      });
    }
    const vaultContract = context.vault.connect(wallet) as Contract;
    const receipt = await sendContractTransaction(
      context,
      vaultContract.getFunction("polymarketWithdrawPrincipal"),
      [amount],
      BigInt(bnbBalance),
      "Polymarket 提取",
    );
    sendJson(res, 200, { ok: true, txHash: receipt.hash, receipt: receipt.data, amount: token(amount) });
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
      if (network.chainId !== BSC_CHAIN_ID) throw new VaultApiError(400, "WRONG_CHAIN", "RPC 必须连接 BSC 主网（chainId 56）。");
      provider = candidate;
      break;
    } catch (error) {
      candidate.destroy();
      lastError = error;
    }
  }
  if (!provider) throw lastError ?? new VaultApiError(502, "RPC_UNAVAILABLE", "BSC RPC 暂时不可用。");

  try {
    const code = await provider.getCode(VAULT_ADDRESS);
    if (code === "0x") throw new VaultApiError(502, "VAULT_NOT_DEPLOYED", "BSC 主网未找到 Polymarket 合约。");
    const privateKey = env.PRIVATE_KEY?.trim();
    let wallet: Wallet | undefined;
    if (privateKey) {
      if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(privateKey)) throw new VaultApiError(400, "INVALID_PRIVATE_KEY", "PRIVATE_KEY 格式不正确。");
      wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
    } else if (walletRequired) {
      throw new VaultApiError(400, "MISSING_PRIVATE_KEY", "请先在设置中配置 PRIVATE_KEY。");
    }
    return {
      env,
      provider,
      wallet,
      usdt: new Contract(USDT_ADDRESS, ERC20_ABI, provider),
      vault: new Contract(VAULT_ADDRESS, VAULT_ABI, provider),
    };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function readWalletState(context: Awaited<ReturnType<typeof createContext>>, blockTag: number, cycleId: bigint) {
  const wallet = requireWallet(context);
  const [usdtBalance, allowance, bnbBalance, member, restriction, blacklisted, totalReturnBps, cycle] = await Promise.all([
    context.usdt.balanceOf(wallet.address, { blockTag }),
    context.usdt.allowance(wallet.address, VAULT_ADDRESS, { blockTag }),
    context.provider.getBalance(wallet.address, blockTag),
    context.vault.getMember(wallet.address, { blockTag }),
    context.vault.getWithdrawalRestriction(wallet.address, { blockTag }),
    context.vault.blacklisted(wallet.address, { blockTag }),
    context.vault.memberTotalReturnBps(wallet.address, { blockTag }),
    cycleId > 0n ? context.vault.getCycle(cycleId, { blockTag }) : Promise.resolve(undefined),
  ]);
  return {
    usdtBalance: BigInt(usdtBalance),
    allowance: BigInt(allowance),
    bnbBalance: BigInt(bnbBalance),
    availablePrincipal: BigInt(member.availablePrincipal),
    lockedPrincipal: BigInt(member.lockedPrincipal),
    pendingWithdrawal: BigInt(member.pendingWithdrawal),
    lifetimeDeposited: BigInt(member.lifetimeDeposited),
    lifetimePrincipalWithdrawn: BigInt(member.lifetimePrincipalWithdrawn),
    lifetimeRewardReceived: BigInt(member.lifetimeRewardReceived),
    restricted: Boolean(restriction.restricted),
    windowWithdrawn: BigInt(restriction.windowWithdrawn),
    rolling24HourLimit: BigInt(restriction.rolling24HourLimit),
    lifetimeLimit: BigInt(restriction.lifetimeLimit),
    lifetimeWithdrawn: BigInt(restriction.lifetimeWithdrawn),
    blacklisted: Boolean(blacklisted),
    totalReturnBps: BigInt(totalReturnBps),
    cycle,
  };
}

function emptyWalletState() {
  return {
    usdtBalance: 0n,
    allowance: 0n,
    bnbBalance: 0n,
    availablePrincipal: 0n,
    lockedPrincipal: 0n,
    pendingWithdrawal: 0n,
    lifetimeDeposited: 0n,
    lifetimePrincipalWithdrawn: 0n,
    lifetimeRewardReceived: 0n,
    restricted: false,
    windowWithdrawn: 0n,
    rolling24HourLimit: 0n,
    lifetimeLimit: 0n,
    lifetimeWithdrawn: 0n,
    blacklisted: false,
    totalReturnBps: 0n,
    cycle: undefined,
  };
}

function serializeCycle(cycle: any) {
  if (!cycle) return null;
  return {
    status: Number(cycle.status),
    monthId: Number(cycle.monthId),
    fundingEndTime: Number(cycle.fundingEndTime),
    startTime: Number(cycle.startTime),
    expectedEndTime: Number(cycle.expectedEndTime),
    settlementDeadline: Number(cycle.settlementDeadline),
    participantCount: Number(cycle.participantCount),
    totalPrincipal: token(BigInt(cycle.totalPrincipal)),
    outboundAmount: token(BigInt(cycle.outboundAmount)),
    returnedAmount: token(BigInt(cycle.returnedAmount)),
    netProfit: token(BigInt(cycle.netProfit)),
    rewardBudget: token(BigInt(cycle.rewardBudget)),
    distributedReward: token(BigInt(cycle.distributedReward)),
  };
}

async function sendContractTransaction(
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
  if (!gasPrice || gasPrice <= 0n) throw new VaultApiError(502, "GAS_PRICE_UNAVAILABLE", "暂时无法获取 BSC Gas 价格。");
  const required = gasLimit * gasPrice;
  if (bnbBalance < required) {
    throw new VaultApiError(409, "INSUFFICIENT_BNB_FOR_GAS", "BNB 余额不足以支付交易 Gas。", {
      balance: formatEther(bnbBalance),
      required: formatEther(required),
    });
  }
  const nonce = await context.provider.getTransactionCount(wallet.address, "pending");
  const transaction = await method(...args, { gasLimit, gasPrice, nonce });
  const receipt = await transaction.wait(1) as TransactionReceipt | null;
  if (!receipt || receipt.status !== 1) {
    throw new VaultApiError(502, "TRANSACTION_FAILED", `${label}交易未成功确认。`, { txHash: transaction.hash });
  }
  return {
    hash: transaction.hash,
    data: { status: receipt.status, blockNumber: receipt.blockNumber, gasUsed: receipt.gasUsed.toString() },
  };
}

function parseAmount(value: unknown): bigint {
  if (typeof value !== "string") throw new VaultApiError(400, "INVALID_AMOUNT", "amount 必须是十进制字符串。");
  const amount = value.trim();
  if (!/^(?:0|[1-9]\d{0,37})(?:\.\d{1,18})?$/.test(amount)) {
    throw new VaultApiError(400, "INVALID_AMOUNT", "金额格式不正确，最多支持 18 位小数。");
  }
  const parsed = parseUnits(amount, TOKEN_DECIMALS);
  if (parsed <= 0n) throw new VaultApiError(400, "INVALID_AMOUNT", "金额必须大于零。");
  return parsed;
}

function requireWallet(context: Awaited<ReturnType<typeof createContext>>): Wallet {
  if (!context.wallet) throw new VaultApiError(400, "MISSING_PRIVATE_KEY", "请先在设置中配置 PRIVATE_KEY。");
  return context.wallet;
}

function requireAddress(actual: unknown, expected: string, code: string, message: string): void {
  if (typeof actual !== "string" || actual.toLowerCase() !== expected.toLowerCase()) throw new VaultApiError(502, code, message);
}

function requireJsonRequest(req: IncomingMessage): void {
  const contentType = headerValue(req.headers["content-type"]);
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    throw new VaultApiError(415, "JSON_REQUIRED", "请求必须使用 application/json。");
  }
}

function requireAuthorizedWriteRequest(req: IncomingMessage, env: Record<string, string>): void {
  requireSameOriginLocalRequest(req);
  const expected = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!expected) throw new VaultApiError(503, "AUTH_CODE_NOT_CONFIGURED", "请先在设置中配置 AUTH_CODE。");
  const provided = (headerValue(req.headers["x-supermtnode-auth-code"]) || "").trim().toUpperCase();
  if (!provided || !safeStringEqual(provided, expected)) throw new VaultApiError(401, "UNAUTHORIZED", "授权码无效。");
}

function requireSameOriginLocalRequest(req: IncomingMessage): void {
  const originValue = headerValue(req.headers.origin);
  const hostValue = headerValue(req.headers.host)?.toLowerCase();
  if (!originValue || !hostValue) throw new VaultApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new VaultApiError(403, "UNTRUSTED_ORIGIN", "交易请求来源无效。");
  }
  const hostname = origin.hostname.toLowerCase();
  if (!["localhost", "127.0.0.1"].includes(hostname) || !["http:", "https:"].includes(origin.protocol) || origin.host.toLowerCase() !== hostValue) {
    throw new VaultApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
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
    throw new VaultApiError(400, "INVALID_BNB_RPC_URL", "BNB RPC 地址格式不正确。");
  }
  if (!["https:", "http:"].includes(url.protocol)) throw new VaultApiError(400, "INVALID_BNB_RPC_URL", "BNB RPC 必须使用 HTTP 或 HTTPS。");
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

async function readJsonBody(req: IncomingMessage): Promise<VaultActionPayload> {
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
      if (tooLarge) rejectBody(new VaultApiError(413, "REQUEST_TOO_LARGE", "请求内容过大。"));
      else resolveBody(body);
    });
    req.on("error", rejectBody);
  });
  try {
    const payload = JSON.parse(source || "{}");
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error();
    return payload as VaultActionPayload;
  } catch {
    throw new VaultApiError(400, "INVALID_JSON", "JSON 请求内容无效。");
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
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function token(value: bigint): string {
  return formatUnits(value, TOKEN_DECIMALS);
}

function sendJson(res: ServerResponse, statusCode: number, payload: unknown): void {
  if (res.writableEnded) return;
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function sendError(res: ServerResponse, error: unknown): void {
  if (error instanceof VaultApiError) {
    sendJson(res, error.statusCode, {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  const candidate = error && typeof error === "object"
    ? [(error as any).shortMessage, (error as any).reason, (error as any).message].find((value) => typeof value === "string" && value.trim())
    : undefined;
  const safeMessage = typeof candidate === "string"
    ? candidate.replace(/https?:\/\/[^\s,)]+/gi, "[RPC]").replace(/0x[a-fA-F0-9]{130,}/g, "[hex data]").replace(/\s+/g, " ").trim().slice(0, 300)
    : "BSC 链上请求失败，请稍后重试。";
  sendJson(res, 502, { ok: false, code: "POLYMARKET_VAULT_ERROR", error: safeMessage });
}
