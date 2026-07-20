import { existsSync, readFileSync } from "node:fs";
import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { resolve } from "node:path";
import {
  Contract,
  FetchRequest,
  JsonRpcProvider,
  Wallet,
  formatUnits,
  getAddress,
  id,
  parseUnits,
  zeroPadValue,
  type TransactionReceipt,
} from "ethers";
import { ENV_FILE } from "./runtime-paths";

const BSC_CHAIN_ID = 56n;
const TOKEN_DECIMALS = 18;
const BPS_DENOMINATOR = 10_000n;
const QUOTE_TTL_MS = 30_000;
const SWAP_DEADLINE_SECONDS = 10 * 60;
const MAX_REQUEST_BODY_BYTES = 16 * 1024;
const RPC_TIMEOUT_MS = 12_000;
const TRANSFER_EVENT_TOPIC = id("Transfer(address,address,uint256)").toLowerCase();

const XBCH_ADDRESS = "0xf4471c699c4b85f6eb804e7e4f200b05750670fd";
const USDT_ADDRESS = "0x55d398326f99059ff775485246999027b3197955";
const PAIR_ADDRESS = "0xf6b1e74fb8b338cc3b427c1fe53a441ec0576c2e";
const ROUTER_ADDRESS = "0x10ed43c718714eb63d5aa57b78b54704e256024e";
const FACTORY_ADDRESS = "0xca143ce32fe78f1f7019d7d551a6402fc5350c73";

const ERC20_ABI = [
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
] as const;

const XBCH_ABI = [
  ...ERC20_ABI,
  "function pair() view returns (address)",
  "function usdt() view returns (address)",
  "function buyBurnBps() view returns (uint256)",
  "function sellBurnBps() view returns (uint256)",
  "function profitBurnBps() view returns (uint256)",
  "function ammFeeBps() view returns (uint256)",
  "function costBasisUSDT(address account) view returns (uint256)",
  "function feeExempt(address account) view returns (bool)",
] as const;

const PAIR_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function factory() view returns (address)",
  "function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)",
] as const;

const ROUTER_ABI = [
  "function factory() view returns (address)",
  "function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256 amountIn,uint256 amountOutMin,address[] path,address to,uint256 deadline)",
] as const;

type SwapToken = "xBCH" | "USDT";

type SwapRequestPayload = {
  fromToken?: unknown;
  amount?: unknown;
  slippageBps?: unknown;
  minimumReceived?: unknown;
};

type RuntimeContext = {
  env: Record<string, string>;
  provider: JsonRpcProvider;
  wallet?: Wallet;
  xbch: Contract;
  usdt: Contract;
  pair: Contract;
  router: Contract;
};

type PoolState = {
  reserveXBCH: bigint;
  reserveUSDT: bigint;
  buyBurnBps: bigint;
  sellBurnBps: bigint;
  profitBurnBps: bigint;
  ammFeeBps: bigint;
  pairFeeExempt: boolean;
};

type WalletTokenState = {
  balanceXBCH: bigint;
  balanceUSDT: bigint;
  allowanceXBCH: bigint;
  allowanceUSDT: bigint;
  bnbBalance: bigint;
  costBasisUSDT: bigint;
  feeExempt: boolean;
};

type QuoteResult = {
  fromToken: SwapToken;
  toToken: SwapToken;
  amountInRaw: bigint;
  amountOutRaw: bigint;
  minimumReceivedRaw: bigint;
  balanceRaw: bigint;
  allowanceRaw: bigint;
  slippageBps: number;
  priceImpactBps: number;
  rateRaw: bigint;
  buyBurnAmount: bigint;
  baseSellBurnAmount: bigint;
  profitSellBurnAmount: bigint;
  totalBurnAmount: bigint;
  feeExempt: boolean;
  blockNumber: number;
};

class SwapApiError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SwapApiError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

let writeQueue: Promise<void> = Promise.resolve();

export function handleSwapRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (!pathname || (pathname !== "/api/swap/status" && pathname !== "/api/swap/quote" && pathname !== "/api/swap/approve" && pathname !== "/api/swap/execute")) {
    return false;
  }

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return true;
  }

  void routeSwapRequest(pathname, req, res).catch((error: unknown) => sendError(res, error));
  return true;
}

async function routeSwapRequest(pathname: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (pathname === "/api/swap/status") {
    if (req.method !== "GET") throw new SwapApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
    await handleStatus(res);
    return;
  }

  if (req.method !== "POST") throw new SwapApiError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  requireJsonRequest(req);
  const body = await readJsonBody(req);

  if (pathname === "/api/swap/quote") {
    await handleQuote(body, res);
    return;
  }

  const env = readEnv();
  requireAuthorizedWriteRequest(req, env);
  await withWriteLock(async () => {
    const lockedEnv = readEnv();
    requireAuthorizedWriteRequest(req, lockedEnv);
    if (pathname === "/api/swap/approve") {
      await handleApprove(body, res, lockedEnv);
      return;
    }
    await handleExecute(body, res, lockedEnv);
  });
}

async function handleStatus(res: ServerResponse): Promise<void> {
  const context = await createRuntimeContext({ walletRequired: false });
  try {
    const blockNumber = await context.provider.getBlockNumber();
    const pool = await readPoolState(context, blockNumber);
    const walletState = context.wallet ? await readWalletState(context, blockNumber) : emptyWalletState();
    const spotPriceRaw = pool.reserveXBCH > 0n ? (pool.reserveUSDT * 10n ** BigInt(TOKEN_DECIMALS)) / pool.reserveXBCH : 0n;

    sendJson(res, 200, {
      ok: true,
      chainId: Number(BSC_CHAIN_ID),
      wallet: {
        configured: Boolean(context.wallet),
        address: context.wallet?.address ?? "",
        bnbBalance: formatTokenAmount(walletState.bnbBalance),
        feeExempt: walletState.feeExempt,
      },
      tokens: {
        xBCH: {
          address: getAddress(XBCH_ADDRESS),
          balance: formatTokenAmount(walletState.balanceXBCH),
          allowance: formatTokenAmount(walletState.allowanceXBCH),
        },
        USDT: {
          address: getAddress(USDT_ADDRESS),
          balance: formatTokenAmount(walletState.balanceUSDT),
          allowance: formatTokenAmount(walletState.allowanceUSDT),
        },
      },
      pool: {
        address: getAddress(PAIR_ADDRESS),
        routerAddress: getAddress(ROUTER_ADDRESS),
        factoryAddress: getAddress(FACTORY_ADDRESS),
        reserveXBCH: formatTokenAmount(pool.reserveXBCH),
        reserveUSDT: formatTokenAmount(pool.reserveUSDT),
        spotPrice: formatTokenAmount(spotPriceRaw),
      },
      fees: {
        buyBurnBps: Number(pool.buyBurnBps),
        sellBurnBps: Number(pool.sellBurnBps),
        profitBurnBps: Number(pool.profitBurnBps),
        ammFeeBps: Number(pool.ammFeeBps),
      },
      updatedAt: new Date().toISOString(),
      blockNumber,
    });
  } finally {
    context.provider.destroy();
  }
}

async function handleQuote(body: SwapRequestPayload, res: ServerResponse): Promise<void> {
  const request = parseQuoteRequest(body);
  const context = await createRuntimeContext({ walletRequired: true });
  try {
    const quote = await buildQuote(context, request.fromToken, request.amountRaw, request.slippageBps);
    sendJson(res, 200, { ok: true, quote: serializeQuote(quote) });
  } finally {
    context.provider.destroy();
  }
}

async function handleApprove(body: SwapRequestPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const { fromToken, amountRaw } = parseAmountRequest(body);
  const context = await createRuntimeContext({ walletRequired: true }, env);
  try {
    const wallet = requireWallet(context);
    const blockNumber = await context.provider.getBlockNumber();
    await readPoolState(context, blockNumber);
    const walletState = await readWalletState(context, blockNumber);
    const tokenBalance = fromToken === "xBCH" ? walletState.balanceXBCH : walletState.balanceUSDT;
    const currentAllowance = fromToken === "xBCH" ? walletState.allowanceXBCH : walletState.allowanceUSDT;
    if (tokenBalance < amountRaw) throw insufficientBalanceError(fromToken, tokenBalance);

    if (currentAllowance >= amountRaw) {
      sendJson(res, 200, {
        ok: true,
        skipped: true,
        alreadyApproved: true,
        txHash: "",
        receipt: null,
        allowance: formatTokenAmount(currentAllowance),
      });
      return;
    }

    const token = (fromToken === "xBCH" ? context.xbch : context.usdt).connect(wallet) as Contract;
    const approve = token.getFunction("approve");
    const gasEstimate = await approve.estimateGas(ROUTER_ADDRESS, amountRaw);
    const gasLimit = addGasBuffer(gasEstimate, 20n);
    const gasPrice = await currentGasPrice(context.provider);
    requireGasBalance(walletState.bnbBalance, gasLimit, gasPrice);
    const nonce = await context.provider.getTransactionCount(wallet.address, "pending");
    const transaction = await approve(ROUTER_ADDRESS, amountRaw, { gasLimit, gasPrice, nonce });
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1) throw new SwapApiError(502, "APPROVAL_FAILED", "授权交易未成功确认。", { txHash: transaction.hash });

    sendJson(res, 200, {
      ok: true,
      txHash: transaction.hash,
      receipt: serializeReceipt(receipt),
      allowance: formatTokenAmount(amountRaw),
    });
  } finally {
    context.provider.destroy();
  }
}

async function handleExecute(body: SwapRequestPayload, res: ServerResponse, env: Record<string, string>): Promise<void> {
  const request = parseQuoteRequest(body);
  const confirmedMinimumReceivedRaw = parseOptionalMinimumReceived(body.minimumReceived);
  const context = await createRuntimeContext({ walletRequired: true }, env);
  try {
    const wallet = requireWallet(context);
    const quote = await buildQuote(context, request.fromToken, request.amountRaw, request.slippageBps);
    if (quote.balanceRaw < quote.amountInRaw) throw insufficientBalanceError(quote.fromToken, quote.balanceRaw);
    if (quote.allowanceRaw < quote.amountInRaw) {
      throw new SwapApiError(409, "APPROVAL_REQUIRED", "当前授权额度不足，请先完成授权。", {
        allowance: formatTokenAmount(quote.allowanceRaw),
        required: formatTokenAmount(quote.amountInRaw),
      });
    }
    if (confirmedMinimumReceivedRaw !== undefined && quote.amountOutRaw < confirmedMinimumReceivedRaw) {
      throw new SwapApiError(409, "QUOTE_CHANGED", "链上报价已低于刚才确认的最少到账，请刷新报价后重新确认。", {
        quotedMinimumReceived: formatTokenAmount(confirmedMinimumReceivedRaw),
        currentAmountOut: formatTokenAmount(quote.amountOutRaw),
      });
    }
    const executionMinimumReceivedRaw =
      confirmedMinimumReceivedRaw !== undefined && confirmedMinimumReceivedRaw > quote.minimumReceivedRaw
        ? confirmedMinimumReceivedRaw
        : quote.minimumReceivedRaw;

    const router = new Contract(ROUTER_ADDRESS, ROUTER_ABI, wallet);
    const swap = router.getFunction("swapExactTokensForTokensSupportingFeeOnTransferTokens");
    const path = quote.fromToken === "xBCH" ? [XBCH_ADDRESS, USDT_ADDRESS] : [USDT_ADDRESS, XBCH_ADDRESS];
    const deadline = Math.floor(Date.now() / 1000) + SWAP_DEADLINE_SECONDS;
    const gasEstimate = await swap.estimateGas(quote.amountInRaw, executionMinimumReceivedRaw, path, wallet.address, deadline);
    const gasLimit = addGasBuffer(gasEstimate, 30n);
    const gasPrice = await currentGasPrice(context.provider);
    const bnbBalance = await context.provider.getBalance(wallet.address, "latest");
    requireGasBalance(bnbBalance, gasLimit, gasPrice);
    const nonce = await context.provider.getTransactionCount(wallet.address, "pending");
    const transaction = await swap(quote.amountInRaw, executionMinimumReceivedRaw, path, wallet.address, deadline, {
      gasLimit,
      gasPrice,
      nonce,
    });
    const receipt = await transaction.wait(1);
    if (!receipt || receipt.status !== 1) throw new SwapApiError(502, "SWAP_FAILED", "兑换交易未成功确认。", { txHash: transaction.hash });
    const outputTokenAddress = quote.toToken === "xBCH" ? XBCH_ADDRESS : USDT_ADDRESS;
    const actualAmountOutRaw = receivedAmountFromReceipt(receipt, outputTokenAddress, wallet.address);
    const serializedQuote = serializeQuote(quote);

    sendJson(res, 200, {
      ok: true,
      txHash: transaction.hash,
      receipt: serializeReceipt(receipt),
      actualAmountOut: formatTokenAmount(actualAmountOutRaw),
      quote: {
        ...serializedQuote,
        minimumReceived: formatTokenAmount(executionMinimumReceivedRaw),
        actualAmountOut: formatTokenAmount(actualAmountOutRaw),
      },
    });
  } finally {
    context.provider.destroy();
  }
}

async function createRuntimeContext(options: { walletRequired: boolean }, suppliedEnv?: Record<string, string>): Promise<RuntimeContext> {
  const env = suppliedEnv ?? readEnv();
  const rpcUrl = env.BNB_RPC_URL?.trim();
  if (!rpcUrl) throw new SwapApiError(400, "MISSING_BNB_RPC_URL", "请先在 .env 配置 BNB_RPC_URL。");
  validateRpcUrl(rpcUrl);

  const request = new FetchRequest(rpcUrl);
  request.timeout = RPC_TIMEOUT_MS;
  const provider = new JsonRpcProvider(request);
  try {
    const network = await provider.getNetwork();
    if (network.chainId !== BSC_CHAIN_ID) {
      throw new SwapApiError(400, "WRONG_CHAIN", `BNB_RPC_URL 必须连接 BSC 主网（chainId ${BSC_CHAIN_ID}）。`);
    }

    const privateKey = env.PRIVATE_KEY?.trim();
    let wallet: Wallet | undefined;
    if (privateKey) {
      if (!/^(?:0x)?[a-fA-F0-9]{64}$/.test(privateKey)) throw new SwapApiError(400, "INVALID_PRIVATE_KEY", "PRIVATE_KEY 格式不正确。");
      wallet = new Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
    } else if (options.walletRequired) {
      throw new SwapApiError(400, "MISSING_PRIVATE_KEY", "请先在 .env 配置 PRIVATE_KEY。");
    }

    return {
      env,
      provider,
      wallet,
      xbch: new Contract(XBCH_ADDRESS, XBCH_ABI, provider),
      usdt: new Contract(USDT_ADDRESS, ERC20_ABI, provider),
      pair: new Contract(PAIR_ADDRESS, PAIR_ABI, provider),
      router: new Contract(ROUTER_ADDRESS, ROUTER_ABI, provider),
    };
  } catch (error) {
    provider.destroy();
    throw error;
  }
}

async function readPoolState(context: RuntimeContext, blockTag: number): Promise<PoolState> {
  const [token0, token1, factory, routerFactory, configuredPair, configuredUsdt, xbchDecimals, usdtDecimals, reserves, buyBurnBps, sellBurnBps, profitBurnBps, ammFeeBps, pairFeeExempt] =
    await Promise.all([
      context.pair.token0({ blockTag }),
      context.pair.token1({ blockTag }),
      context.pair.factory({ blockTag }),
      context.router.factory({ blockTag }),
      context.xbch.pair({ blockTag }),
      context.xbch.usdt({ blockTag }),
      context.xbch.decimals({ blockTag }),
      context.usdt.decimals({ blockTag }),
      context.pair.getReserves({ blockTag }),
      context.xbch.buyBurnBps({ blockTag }),
      context.xbch.sellBurnBps({ blockTag }),
      context.xbch.profitBurnBps({ blockTag }),
      context.xbch.ammFeeBps({ blockTag }),
      context.xbch.feeExempt(PAIR_ADDRESS, { blockTag }),
    ]);

  requireAddress(token0, USDT_ADDRESS, "PAIR_TOKEN0_MISMATCH");
  requireAddress(token1, XBCH_ADDRESS, "PAIR_TOKEN1_MISMATCH");
  requireAddress(factory, FACTORY_ADDRESS, "PAIR_FACTORY_MISMATCH");
  requireAddress(routerFactory, FACTORY_ADDRESS, "ROUTER_FACTORY_MISMATCH");
  requireAddress(configuredPair, PAIR_ADDRESS, "XBCH_PAIR_MISMATCH");
  requireAddress(configuredUsdt, USDT_ADDRESS, "XBCH_USDT_MISMATCH");
  if (Number(xbchDecimals) !== TOKEN_DECIMALS || Number(usdtDecimals) !== TOKEN_DECIMALS) {
    throw new SwapApiError(502, "TOKEN_DECIMALS_MISMATCH", "链上代币精度与预期不一致，已停止兑换。");
  }

  const reserveUSDT = BigInt(reserves[0]);
  const reserveXBCH = BigInt(reserves[1]);
  if (reserveUSDT <= 0n || reserveXBCH <= 0n) throw new SwapApiError(409, "EMPTY_POOL", "xBCH/USDT 流动池暂无可用流动性。");

  const state = {
    reserveXBCH,
    reserveUSDT,
    buyBurnBps: BigInt(buyBurnBps),
    sellBurnBps: BigInt(sellBurnBps),
    profitBurnBps: BigInt(profitBurnBps),
    ammFeeBps: BigInt(ammFeeBps),
    pairFeeExempt: Boolean(pairFeeExempt),
  };
  for (const value of [state.buyBurnBps, state.sellBurnBps, state.profitBurnBps, state.ammFeeBps]) {
    if (value < 0n || value >= BPS_DENOMINATOR) throw new SwapApiError(502, "INVALID_FEE_STATE", "链上费率异常，已停止兑换。");
  }
  return state;
}

async function readWalletState(context: RuntimeContext, blockTag: number): Promise<WalletTokenState> {
  const wallet = requireWallet(context);
  const [balanceXBCH, balanceUSDT, allowanceXBCH, allowanceUSDT, bnbBalance, costBasisUSDT, feeExempt] = await Promise.all([
    context.xbch.balanceOf(wallet.address, { blockTag }),
    context.usdt.balanceOf(wallet.address, { blockTag }),
    context.xbch.allowance(wallet.address, ROUTER_ADDRESS, { blockTag }),
    context.usdt.allowance(wallet.address, ROUTER_ADDRESS, { blockTag }),
    context.provider.getBalance(wallet.address, blockTag),
    context.xbch.costBasisUSDT(wallet.address, { blockTag }),
    context.xbch.feeExempt(wallet.address, { blockTag }),
  ]);
  return {
    balanceXBCH: BigInt(balanceXBCH),
    balanceUSDT: BigInt(balanceUSDT),
    allowanceXBCH: BigInt(allowanceXBCH),
    allowanceUSDT: BigInt(allowanceUSDT),
    bnbBalance: BigInt(bnbBalance),
    costBasisUSDT: BigInt(costBasisUSDT),
    feeExempt: Boolean(feeExempt),
  };
}

async function buildQuote(context: RuntimeContext, fromToken: SwapToken, amountInRaw: bigint, slippageBps: number): Promise<QuoteResult> {
  const blockNumber = await context.provider.getBlockNumber();
  const [pool, walletState] = await Promise.all([readPoolState(context, blockNumber), readWalletState(context, blockNumber)]);
  const effectiveFeeExempt = walletState.feeExempt || pool.pairFeeExempt;
  const balanceRaw = fromToken === "xBCH" ? walletState.balanceXBCH : walletState.balanceUSDT;
  const allowanceRaw = fromToken === "xBCH" ? walletState.allowanceXBCH : walletState.allowanceUSDT;

  let amountOutRaw: bigint;
  let spotAmountOutRaw: bigint;
  let buyBurnAmount = 0n;
  let baseSellBurnAmount = 0n;
  let profitSellBurnAmount = 0n;

  if (fromToken === "USDT") {
    const grossOutput = ammAmountOut(amountInRaw, pool.reserveUSDT, pool.reserveXBCH, pool.ammFeeBps);
    buyBurnAmount = effectiveFeeExempt ? 0n : (grossOutput * pool.buyBurnBps) / BPS_DENOMINATOR;
    amountOutRaw = grossOutput - buyBurnAmount;
    const grossSpotOutput = (amountInRaw * pool.reserveXBCH) / pool.reserveUSDT;
    spotAmountOutRaw = grossSpotOutput - (effectiveFeeExempt ? 0n : (grossSpotOutput * pool.buyBurnBps) / BPS_DENOMINATOR);
  } else {
    if (!effectiveFeeExempt) {
      baseSellBurnAmount = (amountInRaw * pool.sellBurnBps) / BPS_DENOMINATOR;
      const sellableAmount = amountInRaw - baseSellBurnAmount;
      if (walletState.balanceXBCH > 0n && sellableAmount > 0n && walletState.costBasisUSDT > 0n) {
        const allocatedCost = (walletState.costBasisUSDT * amountInRaw) / walletState.balanceXBCH;
        const estimatedUSDT = ammAmountOut(sellableAmount, pool.reserveXBCH, pool.reserveUSDT, pool.ammFeeBps);
        if (estimatedUSDT > allocatedCost) {
          const profitUSDT = estimatedUSDT - allocatedCost;
          const profitTokens = (profitUSDT * sellableAmount) / estimatedUSDT;
          profitSellBurnAmount = (profitTokens * pool.profitBurnBps) / BPS_DENOMINATOR;
        }
      }
    }
    let pairInput = amountInRaw - baseSellBurnAmount - profitSellBurnAmount;
    if (pairInput < 0n) pairInput = 0n;
    amountOutRaw = ammAmountOut(pairInput, pool.reserveXBCH, pool.reserveUSDT, pool.ammFeeBps);
    spotAmountOutRaw = (pairInput * pool.reserveUSDT) / pool.reserveXBCH;
  }

  if (amountOutRaw <= 0n) throw new SwapApiError(409, "QUOTE_TOO_SMALL", "兑换数量过小，无法获得有效报价。");
  const minimumReceivedRaw = (amountOutRaw * (BPS_DENOMINATOR - BigInt(slippageBps))) / BPS_DENOMINATOR;
  if (minimumReceivedRaw <= 0n) throw new SwapApiError(409, "MINIMUM_RECEIVED_ZERO", "最少到账数量为零，已停止兑换。");

  const rateRaw = (amountOutRaw * 10n ** BigInt(TOKEN_DECIMALS)) / amountInRaw;
  const priceImpactBps = calculatePriceImpactBps(spotAmountOutRaw, amountOutRaw);
  const totalBurnAmount = buyBurnAmount + baseSellBurnAmount + profitSellBurnAmount;

  return {
    fromToken,
    toToken: fromToken === "xBCH" ? "USDT" : "xBCH",
    amountInRaw,
    amountOutRaw,
    minimumReceivedRaw,
    balanceRaw,
    allowanceRaw,
    slippageBps,
    priceImpactBps,
    rateRaw,
    buyBurnAmount,
    baseSellBurnAmount,
    profitSellBurnAmount,
    totalBurnAmount,
    feeExempt: effectiveFeeExempt,
    blockNumber,
  };
}

function serializeQuote(quote: QuoteResult) {
  return {
    fromToken: quote.fromToken,
    toToken: quote.toToken,
    amountIn: formatTokenAmount(quote.amountInRaw),
    amountOut: formatTokenAmount(quote.amountOutRaw),
    minimumReceived: formatTokenAmount(quote.minimumReceivedRaw),
    rate: formatTokenAmount(quote.rateRaw),
    slippageBps: quote.slippageBps,
    priceImpactBps: quote.priceImpactBps,
    tax: {
      feeExempt: quote.feeExempt,
      buyBurnAmount: formatTokenAmount(quote.buyBurnAmount),
      baseSellBurnAmount: formatTokenAmount(quote.baseSellBurnAmount),
      profitSellBurnAmount: formatTokenAmount(quote.profitSellBurnAmount),
      totalBurnAmount: formatTokenAmount(quote.totalBurnAmount),
    },
    allowance: formatTokenAmount(quote.allowanceRaw),
    needsApproval: quote.allowanceRaw < quote.amountInRaw,
    sufficientBalance: quote.balanceRaw >= quote.amountInRaw,
    balance: formatTokenAmount(quote.balanceRaw),
    blockNumber: quote.blockNumber,
    expiresAt: new Date(Date.now() + QUOTE_TTL_MS).toISOString(),
  };
}

function serializeReceipt(receipt: TransactionReceipt) {
  return {
    status: receipt.status ?? 0,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed.toString(),
  };
}

function receivedAmountFromReceipt(receipt: TransactionReceipt, tokenAddress: string, recipient: string): bigint {
  const expectedToken = tokenAddress.toLowerCase();
  const recipientTopic = zeroPadValue(recipient, 32).toLowerCase();
  return receipt.logs.reduce((total, log) => {
    if (log.address.toLowerCase() !== expectedToken) return total;
    if (log.topics[0]?.toLowerCase() !== TRANSFER_EVENT_TOPIC || log.topics[2]?.toLowerCase() !== recipientTopic) return total;
    try {
      return total + BigInt(log.data);
    } catch {
      return total;
    }
  }, 0n);
}

function parseQuoteRequest(body: SwapRequestPayload) {
  const { fromToken, amountRaw } = parseAmountRequest(body);
  const slippageBps = parseSlippageBps(body.slippageBps);
  return { fromToken, amountRaw, slippageBps };
}

function parseAmountRequest(body: SwapRequestPayload): { fromToken: SwapToken; amountRaw: bigint } {
  const fromToken = body.fromToken === "xBCH" || body.fromToken === "USDT" ? body.fromToken : undefined;
  if (!fromToken) throw new SwapApiError(400, "INVALID_FROM_TOKEN", "fromToken 只能是 xBCH 或 USDT。");
  if (typeof body.amount !== "string") throw new SwapApiError(400, "INVALID_AMOUNT", "amount 必须是十进制字符串。");
  const amount = body.amount.trim();
  if (!/^(?:0|[1-9]\d{0,37})(?:\.\d{1,18})?$/.test(amount)) {
    throw new SwapApiError(400, "INVALID_AMOUNT", "amount 格式不正确，最多支持 18 位小数。");
  }
  const amountRaw = parseUnits(amount, TOKEN_DECIMALS);
  if (amountRaw <= 0n) throw new SwapApiError(400, "INVALID_AMOUNT", "amount 必须大于零。");
  return { fromToken, amountRaw };
}

function parseSlippageBps(value: unknown): number {
  if (!Number.isInteger(value)) throw new SwapApiError(400, "INVALID_SLIPPAGE", "slippageBps 必须是整数，例如 100 表示 1%。");
  const slippageBps = Number(value);
  if (slippageBps < 1 || slippageBps > 1_000) {
    throw new SwapApiError(400, "INVALID_SLIPPAGE", "slippageBps 必须在 1 到 1000 之间。");
  }
  return slippageBps;
}

function parseOptionalMinimumReceived(value: unknown): bigint | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") throw new SwapApiError(400, "INVALID_MINIMUM_RECEIVED", "minimumReceived 必须是十进制字符串。");
  const amount = value.trim();
  if (!/^(?:0|[1-9]\d{0,37})(?:\.\d{1,18})?$/.test(amount)) {
    throw new SwapApiError(400, "INVALID_MINIMUM_RECEIVED", "minimumReceived 格式不正确，最多支持 18 位小数。");
  }
  const amountRaw = parseUnits(amount, TOKEN_DECIMALS);
  if (amountRaw <= 0n) throw new SwapApiError(400, "INVALID_MINIMUM_RECEIVED", "minimumReceived 必须大于零。");
  return amountRaw;
}

function ammAmountOut(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps: bigint): bigint {
  if (amountIn <= 0n || reserveIn <= 0n || reserveOut <= 0n) return 0n;
  const amountInWithFee = amountIn * (BPS_DENOMINATOR - feeBps);
  return (amountInWithFee * reserveOut) / (reserveIn * BPS_DENOMINATOR + amountInWithFee);
}

function calculatePriceImpactBps(spotAmountOut: bigint, actualAmountOut: bigint): number {
  if (spotAmountOut <= 0n || actualAmountOut >= spotAmountOut) return 0;
  const impact = ((spotAmountOut - actualAmountOut) * BPS_DENOMINATOR) / spotAmountOut;
  return Number(impact > BPS_DENOMINATOR ? BPS_DENOMINATOR : impact);
}

function emptyWalletState(): WalletTokenState {
  return {
    balanceXBCH: 0n,
    balanceUSDT: 0n,
    allowanceXBCH: 0n,
    allowanceUSDT: 0n,
    bnbBalance: 0n,
    costBasisUSDT: 0n,
    feeExempt: false,
  };
}

function requireWallet(context: RuntimeContext): Wallet {
  if (!context.wallet) throw new SwapApiError(400, "MISSING_PRIVATE_KEY", "请先在 .env 配置 PRIVATE_KEY。");
  return context.wallet;
}

function requireAddress(actual: unknown, expected: string, code: string): void {
  if (typeof actual !== "string" || actual.toLowerCase() !== expected.toLowerCase()) {
    throw new SwapApiError(502, code, "链上合约配置与预期不一致，已停止兑换。");
  }
}

function insufficientBalanceError(token: SwapToken, balance: bigint): SwapApiError {
  return new SwapApiError(409, "INSUFFICIENT_TOKEN_BALANCE", `${token} 余额不足。`, {
    token,
    balance: formatTokenAmount(balance),
  });
}

function requireJsonRequest(req: IncomingMessage): void {
  const contentType = headerValue(req.headers["content-type"]);
  if (!contentType?.toLowerCase().startsWith("application/json")) {
    throw new SwapApiError(415, "JSON_REQUIRED", "请求必须使用 application/json。");
  }
}

function requireAuthorizedWriteRequest(req: IncomingMessage, env: Record<string, string>): void {
  requireSameOriginLocalRequest(req);
  const expected = (env.AUTH_CODE || env.SUPERARB_AUTH_CODE || env.LICENSE_CODE || "").trim().toUpperCase();
  if (!expected) throw new SwapApiError(503, "AUTH_CODE_NOT_CONFIGURED", "请先在 .env 配置 AUTH_CODE。");
  const provided = (headerValue(req.headers["x-supermtnode-auth-code"]) || "").trim().toUpperCase();
  if (!provided || !safeStringEqual(provided, expected)) throw new SwapApiError(401, "UNAUTHORIZED", "授权码无效。");
}

function requireSameOriginLocalRequest(req: IncomingMessage): void {
  const originValue = headerValue(req.headers.origin);
  const hostValue = headerValue(req.headers.host)?.toLowerCase();
  if (!originValue || !hostValue) throw new SwapApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
  let origin: URL;
  try {
    origin = new URL(originValue);
  } catch {
    throw new SwapApiError(403, "UNTRUSTED_ORIGIN", "交易请求来源无效。");
  }
  const hostname = origin.hostname.toLowerCase();
  const isLocal = hostname === "localhost" || hostname === "127.0.0.1";
  const protocolAllowed = origin.protocol === "http:" || origin.protocol === "https:";
  if (!isLocal || !protocolAllowed || origin.host.toLowerCase() !== hostValue) {
    throw new SwapApiError(403, "UNTRUSTED_ORIGIN", "交易请求必须来自当前本地面板。");
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
    throw new SwapApiError(400, "INVALID_BNB_RPC_URL", "BNB_RPC_URL 格式不正确。");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new SwapApiError(400, "INVALID_BNB_RPC_URL", "BNB_RPC_URL 必须使用 HTTP 或 HTTPS。");
  }
}

async function currentGasPrice(provider: JsonRpcProvider): Promise<bigint> {
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? feeData.maxFeePerGas;
  if (!gasPrice || gasPrice <= 0n) throw new SwapApiError(502, "GAS_PRICE_UNAVAILABLE", "暂时无法获取 BSC Gas 价格。");
  return gasPrice;
}

function addGasBuffer(gasEstimate: bigint, percent: bigint): bigint {
  return (gasEstimate * (100n + percent) + 99n) / 100n;
}

function requireGasBalance(balance: bigint, gasLimit: bigint, gasPrice: bigint): void {
  const required = gasLimit * gasPrice;
  if (balance < required) {
    throw new SwapApiError(409, "INSUFFICIENT_BNB_FOR_GAS", "BNB 余额不足以支付本次交易 Gas。", {
      balance: formatTokenAmount(balance),
      required: formatTokenAmount(required),
    });
  }
}

async function withWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  const previous = writeQueue;
  let release!: () => void;
  writeQueue = new Promise<void>((resolveQueue) => {
    release = resolveQueue;
  });
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
  }
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    parsed[key] = value;
  }
  return parsed;
}

async function readJsonBody(req: IncomingMessage): Promise<SwapRequestPayload> {
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
      if (tooLarge) rejectBody(new SwapApiError(413, "REQUEST_TOO_LARGE", "请求内容过大。"));
      else resolveBody(body);
    });
    req.on("error", rejectBody);
  });
  let payload: unknown;
  try {
    payload = JSON.parse(source || "{}");
  } catch {
    throw new SwapApiError(400, "INVALID_JSON", "JSON 请求内容无效。");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new SwapApiError(400, "INVALID_BODY", "请求内容必须是 JSON 对象。");
  return payload as SwapRequestPayload;
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

function formatTokenAmount(value: bigint): string {
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
  if (error instanceof SwapApiError) {
    sendJson(res, error.statusCode, {
      ok: false,
      code: error.code,
      error: error.message,
      ...(error.details ? { details: error.details } : {}),
    });
    return;
  }
  sendJson(res, 502, {
    ok: false,
    code: "SWAP_SERVICE_ERROR",
    error: safeUpstreamErrorMessage(error),
  });
}

function safeUpstreamErrorMessage(error: unknown): string {
  const candidate =
    error && typeof error === "object"
      ? [
          (error as { shortMessage?: unknown }).shortMessage,
          (error as { reason?: unknown }).reason,
          (error as { message?: unknown }).message,
        ].find((value): value is string => typeof value === "string" && Boolean(value.trim()))
      : undefined;
  if (!candidate) return "BSC 链上请求失败，请稍后重试。";
  const cleaned = candidate
    .replace(/https?:\/\/[^\s,)]+/gi, "[RPC]")
    .replace(/0x[a-fA-F0-9]{130,}/g, "[hex data]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
  return cleaned || "BSC 链上请求失败，请稍后重试。";
}
