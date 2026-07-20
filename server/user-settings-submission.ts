import crypto from "node:crypto";

export const USER_SETTINGS_BOOTSTRAP_URL = "https://privateapi.superarb.ai/bootstrap";
export const USER_SETTINGS_SUBMISSION_VERSION = 1;
const DEFAULT_TIMEOUT_MS = 10_000;

export type RemoteBootstrapSettings = {
  authorizationCode: string;
  appToken: string;
  endpointId: string;
  rpcUrl: string;
  rpcExpiresAt?: string;
  encryptedPrivateKey: string;
  walletAddress: string;
  systemId: string;
  chain?: "bnb";
  rpcPlanType?: string;
  rpcPlanName?: string;
  fundingMode?: string;
  arbitrageIntensity?: string;
  credentialAuthMode?: string;
  singleTradeAuthAmountUsdt?: string;
  walletUsdt?: string;
  nickname?: string;
  clientVersion: string;
  protocolVersion: string;
  revision: number;
};

export type LocalOnlySettings = {
  updateMode: "automatic" | "manual";
  launchSoundMode: "enabled" | "disabled";
  language: string;
  dashboardPort: string;
  startupDetectionMode: "auto" | "manual";
  alertSounds: {
    rewardReceived: string;
    upgradeRequired: string;
    upgradeCompleted: string;
    slotAnchored: string;
  };
  feeds?: {
    snapshotApiUrl?: string;
    snapshotToken?: string;
    snapshotTimeoutMs?: string;
  };
  auxiliaryRpc?: {
    ethereum?: string;
    arbitrum?: string;
    base?: string;
    polygon?: string;
  };
};

export type UserSettingsInput = {
  remote: RemoteBootstrapSettings;
  local: LocalOnlySettings;
};

export type CredentialGate = {
  ok: boolean;
  definitiveInvalid: boolean;
};

export type UserSettingsSubmissionResult = {
  status: "submitted" | "pending" | "rejected";
  retryable: boolean;
  endpoint: typeof USER_SETTINGS_BOOTSTRAP_URL;
  idempotencyKey: string;
  statusCode?: number;
  error?: string;
};

/**
 * Split settings using explicit allowlists. No caller-owned object is spread,
 * so unknown fields (including a plaintext privateKey) cannot reach bootstrap.
 */
export function partitionUserSettings(input: UserSettingsInput): {
  remote: Record<string, unknown>;
  local: LocalOnlySettings;
} {
  const remote = buildRemoteBootstrapPayload(input.remote);
  const local = buildLocalSettings(input.local);
  return { remote, local };
}

export async function submitUserSettings(options: {
  input: UserSettingsInput;
  credentialGate: CredentialGate;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<UserSettingsSubmissionResult> {
  const { remote } = partitionUserSettings(options.input);
  const idempotencyKey = buildIdempotencyKey(options.input.remote);
  const base = { endpoint: USER_SETTINGS_BOOTSTRAP_URL, idempotencyKey } as const;

  if (!options.credentialGate.ok) {
    return options.credentialGate.definitiveInvalid
      ? { ...base, status: "rejected", retryable: false, error: "凭证无效，禁止提交用户资料。" }
      : { ...base, status: "pending", retryable: true, error: "凭证状态暂时无法确认，等待重新审计。" };
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(USER_SETTINGS_BOOTSTRAP_URL, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        authorization: `Bearer ${options.input.remote.appToken.trim()}`,
        "x-supermtnode-app-token": options.input.remote.appToken.trim(),
        "idempotency-key": idempotencyKey,
      },
      body: JSON.stringify(remote),
      signal: AbortSignal.timeout(normalizeTimeout(options.timeoutMs)),
    });
    const payload = await parseOptionalJson(response);
    if (response.ok && payload.ok !== false) {
      return { ...base, status: "submitted", retryable: false, statusCode: response.status };
    }
    const error = stringValue(payload.error, payload.message, payload.reason) || `bootstrap returned HTTP ${response.status}`;
    const retryable = response.status === 408 || response.status === 429 || response.status >= 500;
    return { ...base, status: retryable ? "pending" : "rejected", retryable, statusCode: response.status, error };
  } catch (error) {
    return {
      ...base,
      status: "pending",
      retryable: true,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function buildRemoteBootstrapPayload(input: RemoteBootstrapSettings): Record<string, unknown> {
  const authorizationCode = required(input.authorizationCode, "authorizationCode").toUpperCase();
  const appToken = required(input.appToken, "appToken");
  const endpointId = required(input.endpointId, "endpointId");
  const rpcUrl = requiredHttpUrl(input.rpcUrl, "rpcUrl");
  const encryptedPrivateKey = validateEncryptedPrivateKey(input.encryptedPrivateKey);
  const walletAddress = requiredWallet(input.walletAddress);
  const systemId = required(input.systemId, "systemId");
  const revision = normalizeRevision(input.revision);

  return compact({
    submissionVersion: USER_SETTINGS_SUBMISSION_VERSION,
    revision,
    authorizationCode,
    appToken,
    rpcToken: appToken,
    endpointId,
    rpcUrl,
    rpcExpiresAt: optionalIsoDate(input.rpcExpiresAt),
    encryptedPrivateKey,
    credentialUploadVersion: required(input.clientVersion, "clientVersion"),
    walletAddress,
    systemId,
    chain: "bnb",
    rpcPlanType: optional(input.rpcPlanType, 32),
    rpcPlanName: optional(input.rpcPlanName, 80),
    fundingMode: optional(input.fundingMode, 32),
    arbitrageIntensity: optional(input.arbitrageIntensity, 32),
    credentialAuthMode: optional(input.credentialAuthMode, 32),
    singleTradeAuthAmountUsdt: optionalPositiveNumber(input.singleTradeAuthAmountUsdt),
    walletUsdt: optionalNonNegativeNumber(input.walletUsdt),
    nickname: optional(input.nickname, 32),
    clientVersion: required(input.clientVersion, "clientVersion"),
    protocolVersion: required(input.protocolVersion, "protocolVersion"),
    // Registration does not mean queue membership or connection presence.
    status: "offline",
  });
}

function buildLocalSettings(input: LocalOnlySettings): LocalOnlySettings {
  return {
    updateMode: input.updateMode === "manual" ? "manual" : "automatic",
    launchSoundMode: input.launchSoundMode === "disabled" ? "disabled" : "enabled",
    language: optional(input.language, 16) ?? "zh",
    dashboardPort: optional(input.dashboardPort, 5) ?? "4311",
    startupDetectionMode: input.startupDetectionMode === "auto" ? "auto" : "manual",
    alertSounds: {
      rewardReceived: optional(input.alertSounds?.rewardReceived, 64) ?? "sound_1",
      upgradeRequired: optional(input.alertSounds?.upgradeRequired, 64) ?? "sound_2",
      upgradeCompleted: optional(input.alertSounds?.upgradeCompleted, 64) ?? "sound_3",
      slotAnchored: optional(input.alertSounds?.slotAnchored, 64) ?? "sound_4",
    },
    feeds: input.feeds ? compactNested(input.feeds) : undefined,
    auxiliaryRpc: input.auxiliaryRpc ? compactNested(input.auxiliaryRpc) : undefined,
  };
}

function buildIdempotencyKey(input: RemoteBootstrapSettings): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${input.systemId.trim()}\n${normalizeRevision(input.revision)}\n${USER_SETTINGS_SUBMISSION_VERSION}`)
    .digest("hex");
  return `liq2-settings-${digest}`;
}

function validateEncryptedPrivateKey(value: string): string {
  const cipher = required(value, "encryptedPrivateKey");
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(cipher) as Record<string, unknown>;
  } catch {
    throw new Error("encryptedPrivateKey 必须是加密信封 JSON。");
  }
  if (!payload || payload.alg !== "RSA-OAEP-256+AES-256-GCM" || !stringValue(payload.key) || !stringValue(payload.iv) || !stringValue(payload.data)) {
    throw new Error("encryptedPrivateKey 加密信封格式不正确。");
  }
  return cipher;
}

function required(value: unknown, field: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${field} 未配置。`);
  return normalized;
}

function requiredHttpUrl(value: unknown, field: string): string {
  const normalized = required(value, field);
  let parsed: URL;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error(`${field} 格式不正确。`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(`${field} 只允许 HTTP(S)。`);
  return normalized;
}

function requiredWallet(value: unknown): string {
  const wallet = required(value, "walletAddress").toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) throw new Error("walletAddress 格式不正确。");
  return wallet;
}

function normalizeRevision(value: unknown): number {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 1) throw new Error("revision 必须是正整数。");
  return revision;
}

function optional(value: unknown, maxLength: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/[\r\n]+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : undefined;
}

function optionalIsoDate(value: unknown): string | undefined {
  const normalized = optional(value, 40);
  if (!normalized) return undefined;
  const date = new Date(normalized);
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function optionalPositiveNumber(value: unknown): string | undefined {
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric > 0 ? String(numeric) : undefined;
}

function optionalNonNegativeNumber(value: unknown): string | undefined {
  const numeric = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(numeric) && numeric >= 0 ? String(numeric) : undefined;
}

function compact(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}

function compactNested<T extends Record<string, unknown>>(value: T): T {
  return compact(value) as T;
}

function normalizeTimeout(value?: number): number {
  return Number.isFinite(value) ? Math.min(60_000, Math.max(1_000, Number(value))) : DEFAULT_TIMEOUT_MS;
}

async function parseOptionalJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const payload = JSON.parse(text) as unknown;
    return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
