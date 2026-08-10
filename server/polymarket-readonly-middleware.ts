import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Contract, FetchRequest, JsonRpcProvider, formatEther, formatUnits, getAddress } from "ethers";
import { ENV_FILE } from "./runtime-paths";

const BSC_CHAIN_ID = 56n;
const TOKEN_DECIMALS = 18;
const FALLBACK_RPC_URL = "https://rpc.bscpro.supermtglobal.com";
const VAULT_ADDRESS = "0xDa09a13CC1C072fe8FcC51952ACc022fd978172f";
// Keep the read side on the current BSC compute-power contract used by purchases.
const POWER_ADDRESS = "0xa03d500e70671f1F1B35ABe8484Eec2f1350c596";
const SUPERMT_POWER_ADDRESS = "0x9F4EEb385C6bD8B5C9743d4E7b7E4BC868bEB199";
const USDT_ADDRESS = "0x55d398326f99059fF775485246999027B3197955";
const MT_ADDRESS = "0xEeFd8da010EDe7b5Eb881ba536057f0b86777777";

const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function allowance(address,address) view returns (uint256)"] as const;
const VAULT_ABI = [
  "function owner() view returns (address)", "function depositsPaused() view returns (bool)", "function withdrawalsPaused() view returns (bool)", "function rewardsPaused() view returns (bool)", "function bridgePaused() view returns (bool)", "function cyclesPaused() view returns (bool)", "function migrationActive() view returns (bool)", "function migrationFinalized() view returns (bool)", "function currentCycleId() view returns (uint256)", "function memberCount() view returns (uint256)", "function totalPrincipalLiability() view returns (uint256)", "function totalLockedPrincipal() view returns (uint256)", "function lifetimeRewardsPaid() view returns (uint256)", "function isMember(address) view returns (bool)", "function blacklisted(address) view returns (bool)", "function getMember(address) view returns (tuple(uint256 availablePrincipal,uint256 lockedPrincipal,uint256 pendingWithdrawal,uint256 lifetimeDeposited,uint256 lifetimePrincipalWithdrawn,uint256 lifetimeRewardReceived,uint64 lastCapitalCheckpoint,uint256 capitalSeconds))", "function getWithdrawalRestriction(address) view returns (tuple(bool restricted,uint64 windowStart,uint256 windowWithdrawn,uint256 rolling24HourLimit,uint256 lifetimeLimit,uint256 lifetimeWithdrawn))", "function memberTotalReturnBps(address) view returns (uint256)", "function cyclePrincipal(uint256,address) view returns (uint256)", "function exitAfterCycle(uint256,address) view returns (uint256)", "function getCycle(uint256) view returns (tuple(uint8 status,uint32 monthId,uint64 fundingEndTime,uint64 startTime,uint64 expectedEndTime,uint64 settlementDeadline,uint256 participantCount,uint256 totalPrincipal,uint256 outboundAmount,uint256 returnedAmount,uint256 grossProfit,uint256 operatingExpense,uint256 netProfit,uint256 rewardBudget,uint256 distributedReward,uint256 releaseCursor,uint256 rewardBatchId,bytes32 participantSnapshotHash,bytes32 settlementReportHash))",
] as const;
const POWER_ABI = ["function balanceOf(address) view returns (uint256)", "function totalSupply() view returns (uint256)", "function totalAllocated() view returns (uint256)", "function availableSupply() view returns (uint256)", "function packagePriceU() view returns (uint256)", "function PACKAGE_POWER() view returns (uint256)", "function purchasesPaused() view returns (bool)", "function migrationActive() view returns (bool)", "function migrationFinalized() view returns (bool)", "function quotePurchase(uint256) view returns (uint256 paymentValueU,uint256 mtAmount,uint256 mtPriceUPerMT)"] as const;
const SUPERMT_POWER_ABI = ["function userRewardBalanceU(address) view returns (uint256)", "function externalBalanceAllowance(address,address) view returns (uint256)"] as const;

export function handlePolymarketReadonlyRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = new URL(req.url || "/", "http://127.0.0.1").pathname;
  if (req.method !== "GET" || !["/api/polymarket/vault/status", "/api/polymarket/power/status"].includes(pathname)) return false;
  void (pathname.endsWith("/vault/status") ? readVaultStatus() : readPowerStatus())
    .then((payload) => sendJson(res, 200, payload))
    .catch((caught) => sendJson(res, 502, { ok: false, error: caught instanceof Error ? caught.message : "读取 BSC 主网状态失败。" }));
  return true;
}

async function readVaultStatus() {
  const context = await createContext();
  try {
    const blockNumber = await context.provider.getBlockNumber();
    const [owner, depositsPaused, withdrawalsPaused, rewardsPaused, bridgePaused, cyclesPaused, migrationActive, migrationFinalized, currentCycleId, memberCount, totalPrincipalLiability, totalLockedPrincipal, lifetimeRewardsPaid] = await Promise.all([
      context.vault.owner(), context.vault.depositsPaused(), context.vault.withdrawalsPaused(), context.vault.rewardsPaused(), context.vault.bridgePaused(), context.vault.cyclesPaused(), context.vault.migrationActive(), context.vault.migrationFinalized(), context.vault.currentCycleId(), context.vault.memberCount(), context.vault.totalPrincipalLiability(), context.vault.totalLockedPrincipal(), context.vault.lifetimeRewardsPaid(),
    ]);
    const wallet = context.walletAddress;
    const state = wallet ? await readVaultWallet(context, wallet, BigInt(currentCycleId)) : emptyVaultWallet();
    return {
      ok: true, chainId: Number(BSC_CHAIN_ID), blockNumber, updatedAt: new Date().toISOString(), contracts: { vault: VAULT_ADDRESS, usdt: USDT_ADDRESS, owner: String(owner) },
      wallet: { configured: Boolean(wallet), address: wallet || "", bnbBalance: token(state.bnbBalance), usdtBalance: token(state.usdtBalance), allowance: token(state.allowance) },
      member: { availablePrincipal: token(state.availablePrincipal), lockedPrincipal: token(state.lockedPrincipal), pendingWithdrawal: token(state.pendingWithdrawal), lifetimeDeposited: token(state.lifetimeDeposited), lifetimePrincipalWithdrawn: token(state.lifetimePrincipalWithdrawn), lifetimeRewardReceived: token(state.lifetimeRewardReceived), cyclePrincipal: token(state.cyclePrincipal), exitAfterCycle: token(state.exitAfterCycle), totalReturnBps: Number(state.totalReturnBps), blacklisted: state.blacklisted, restriction: { restricted: state.restricted, rolling24HourLimit: token(state.rolling24HourLimit), windowWithdrawn: token(state.windowWithdrawn), lifetimeLimit: token(state.lifetimeLimit), lifetimeWithdrawn: token(state.lifetimeWithdrawn) } },
      vault: { depositsPaused: Boolean(depositsPaused), withdrawalsPaused: Boolean(withdrawalsPaused), rewardsPaused: Boolean(rewardsPaused), bridgePaused: Boolean(bridgePaused), cyclesPaused: Boolean(cyclesPaused), migrationActive: Boolean(migrationActive), migrationFinalized: Boolean(migrationFinalized), currentCycleId: Number(currentCycleId), memberCount: Number(memberCount), totalPrincipalLiability: token(BigInt(totalPrincipalLiability)), totalLockedPrincipal: token(BigInt(totalLockedPrincipal)), lifetimeRewardsPaid: token(BigInt(lifetimeRewardsPaid)) },
      cycle: state.cycle,
    };
  } finally { context.provider.destroy(); }
}

async function readPowerStatus() {
  const context = await createContext();
  try {
    const blockNumber = await context.provider.getBlockNumber();
    const [totalSupply, totalAllocated, availableSupply, packagePriceU, packagePower, purchasesPaused, migrationActive, migrationFinalized] = await Promise.all([context.power.totalSupply(), context.power.totalAllocated(), context.power.availableSupply(), context.power.packagePriceU(), context.power.PACKAGE_POWER(), context.power.purchasesPaused(), context.power.migrationActive(), context.power.migrationFinalized()]);
    const state = context.walletAddress ? await readPowerWallet(context, context.walletAddress, BigInt(packagePower)) : emptyPowerWallet();
    return { ok: true, chainId: Number(BSC_CHAIN_ID), blockNumber, updatedAt: new Date().toISOString(), contracts: { power: POWER_ADDRESS, superMtPower: SUPERMT_POWER_ADDRESS, usdt: USDT_ADDRESS, mt: MT_ADDRESS }, wallet: { configured: Boolean(context.walletAddress), address: context.walletAddress || "", bnbBalance: token(state.bnbBalance), isMember: state.isMember, blacklisted: state.blacklisted }, power: { balance: token(state.powerBalance), totalSupply: token(BigInt(totalSupply)), totalAllocated: token(BigInt(totalAllocated)), availableSupply: token(BigInt(availableSupply)), packagePower: token(BigInt(packagePower)), packagePriceUsdt: token(BigInt(packagePriceU)), purchasesPaused: Boolean(purchasesPaused), migrationActive: Boolean(migrationActive), migrationFinalized: Boolean(migrationFinalized) }, payments: { balance: { available: token(state.rewardBalance), allowance: token(state.rewardAllowance) }, mt: { available: token(state.mtBalance), allowance: token(state.mtAllowance), packageQuote: token(state.mtPackageQuote), priceUsdtPerMt: token(state.mtPriceUPerMT) }, usdt: { available: token(state.usdtBalance), allowance: token(state.usdtAllowance) } } };
  } finally { context.provider.destroy(); }
}

async function createContext() {
  const env = readEnv();
  const rpcUrl = env.BNB_RPC_URL?.trim() || FALLBACK_RPC_URL;
  const request = new FetchRequest(rpcUrl); request.timeout = 12_000;
  const provider = new JsonRpcProvider(request);
  const network = await provider.getNetwork();
  if (network.chainId !== BSC_CHAIN_ID) { provider.destroy(); throw new Error("BNB_RPC_URL 必须连接 BSC 主网（chainId 56）。"); }
  const walletAddress = validAddress(env.WALLET_ADDRESS);
  return { provider, walletAddress, usdt: new Contract(USDT_ADDRESS, ERC20_ABI, provider), mt: new Contract(MT_ADDRESS, ERC20_ABI, provider), vault: new Contract(VAULT_ADDRESS, VAULT_ABI, provider), power: new Contract(POWER_ADDRESS, POWER_ABI, provider), superMtPower: new Contract(SUPERMT_POWER_ADDRESS, SUPERMT_POWER_ABI, provider) };
}

async function readVaultWallet(context: Awaited<ReturnType<typeof createContext>>, wallet: string, cycleId: bigint) {
  const [usdtBalance, allowance, bnbBalance, member, restriction, blacklisted, totalReturnBps, cyclePrincipal, exitAfterCycle, cycle] = await Promise.all([context.usdt.balanceOf(wallet), context.usdt.allowance(wallet, VAULT_ADDRESS), context.provider.getBalance(wallet), context.vault.getMember(wallet), context.vault.getWithdrawalRestriction(wallet), context.vault.blacklisted(wallet), context.vault.memberTotalReturnBps(wallet), cycleId ? context.vault.cyclePrincipal(cycleId, wallet) : 0n, cycleId ? context.vault.exitAfterCycle(cycleId, wallet) : 0n, cycleId ? context.vault.getCycle(cycleId) : null]);
  return { usdtBalance: BigInt(usdtBalance), allowance: BigInt(allowance), bnbBalance: BigInt(bnbBalance), availablePrincipal: BigInt(member.availablePrincipal), lockedPrincipal: BigInt(member.lockedPrincipal), pendingWithdrawal: BigInt(member.pendingWithdrawal), lifetimeDeposited: BigInt(member.lifetimeDeposited), lifetimePrincipalWithdrawn: BigInt(member.lifetimePrincipalWithdrawn), lifetimeRewardReceived: BigInt(member.lifetimeRewardReceived), totalReturnBps: BigInt(totalReturnBps), blacklisted: Boolean(blacklisted), restricted: Boolean(restriction.restricted), rolling24HourLimit: BigInt(restriction.rolling24HourLimit), windowWithdrawn: BigInt(restriction.windowWithdrawn), lifetimeLimit: BigInt(restriction.lifetimeLimit), lifetimeWithdrawn: BigInt(restriction.lifetimeWithdrawn), cyclePrincipal: BigInt(cyclePrincipal), exitAfterCycle: BigInt(exitAfterCycle), cycle: cycle ? serializeCycle(cycle) : null };
}

async function readPowerWallet(context: Awaited<ReturnType<typeof createContext>>, wallet: string, packagePower: bigint) {
  const [bnbBalance, isMember, blacklisted, powerBalance, rewardBalance, rewardAllowance, mtBalance, mtAllowance, usdtBalance, usdtAllowance, quote] = await Promise.all([context.provider.getBalance(wallet), context.vault.isMember(wallet), context.vault.blacklisted(wallet), context.power.balanceOf(wallet), context.superMtPower.userRewardBalanceU(wallet), context.superMtPower.externalBalanceAllowance(wallet, POWER_ADDRESS), context.mt.balanceOf(wallet), context.mt.allowance(wallet, POWER_ADDRESS), context.usdt.balanceOf(wallet), context.usdt.allowance(wallet, POWER_ADDRESS), context.power.quotePurchase(packagePower)]);
  return { bnbBalance: BigInt(bnbBalance), isMember: Boolean(isMember), blacklisted: Boolean(blacklisted), powerBalance: BigInt(powerBalance), rewardBalance: BigInt(rewardBalance), rewardAllowance: BigInt(rewardAllowance), mtBalance: BigInt(mtBalance), mtAllowance: BigInt(mtAllowance), usdtBalance: BigInt(usdtBalance), usdtAllowance: BigInt(usdtAllowance), mtPackageQuote: BigInt(quote.mtAmount), mtPriceUPerMT: BigInt(quote.mtPriceUPerMT) };
}

function emptyVaultWallet() { return { usdtBalance: 0n, allowance: 0n, bnbBalance: 0n, availablePrincipal: 0n, lockedPrincipal: 0n, pendingWithdrawal: 0n, lifetimeDeposited: 0n, lifetimePrincipalWithdrawn: 0n, lifetimeRewardReceived: 0n, totalReturnBps: 0n, blacklisted: false, restricted: false, rolling24HourLimit: 0n, windowWithdrawn: 0n, lifetimeLimit: 0n, lifetimeWithdrawn: 0n, cyclePrincipal: 0n, exitAfterCycle: 0n, cycle: null }; }
function emptyPowerWallet() { return { bnbBalance: 0n, isMember: false, blacklisted: false, powerBalance: 0n, rewardBalance: 0n, rewardAllowance: 0n, mtBalance: 0n, mtAllowance: 0n, usdtBalance: 0n, usdtAllowance: 0n, mtPackageQuote: 0n, mtPriceUPerMT: 0n }; }
function serializeCycle(cycle: any) { return { status: Number(cycle.status), monthId: Number(cycle.monthId), fundingEndTime: Number(cycle.fundingEndTime), startTime: Number(cycle.startTime), expectedEndTime: Number(cycle.expectedEndTime), settlementDeadline: Number(cycle.settlementDeadline), participantCount: Number(cycle.participantCount), totalPrincipal: token(BigInt(cycle.totalPrincipal)), outboundAmount: token(BigInt(cycle.outboundAmount)), returnedAmount: token(BigInt(cycle.returnedAmount)), netProfit: token(BigInt(cycle.netProfit)), rewardBudget: token(BigInt(cycle.rewardBudget)), distributedReward: token(BigInt(cycle.distributedReward)) }; }
function token(value: bigint) { return formatUnits(value, TOKEN_DECIMALS); }
function validAddress(value: string | undefined) { try { return value ? getAddress(value.trim()) : ""; } catch { return ""; } }
function readEnv() { if (!existsSync(ENV_FILE)) return {}; const values: Record<string, string> = {}; for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) { const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/); if (match) values[match[1]] = match[2].replace(/^['"]|['"]$/g, ""); } return values; }
function sendJson(res: ServerResponse, status: number, payload: unknown) { res.statusCode = status; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(payload)); }
