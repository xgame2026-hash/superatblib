export const SUPERMTNODE_LICENSE_CHECK_URL = "https://api.supermtnode.io/license/check";

type LicenseCheckPayload = {
  ok?: unknown;
  valid?: unknown;
  status?: unknown;
  error?: unknown;
  reason?: unknown;
  message?: unknown;
  expiresAt?: unknown;
  expires_at?: unknown;
  validUntil?: unknown;
  valid_until?: unknown;
};

/**
 * The one authoritative SuperMTNode authorization-code check used by local
 * server features. Keep this URL fixed so a local environment cannot redirect
 * credential verification to an untrusted host.
 */
export async function assertActiveSuperMtNodeLicense(authCode: string): Promise<void> {
  const code = authCode.trim().toUpperCase();
  if (!code) throw new Error("授权码未配置。");

  const response = await fetch(SUPERMTNODE_LICENSE_CHECK_URL, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(8_000),
  });
  const payload = (await response.json().catch(() => ({}))) as LicenseCheckPayload;
  const expiryValue = stringValue(payload.expiresAt, payload.expires_at, payload.validUntil, payload.valid_until);
  const expiry = expiryValue ? Date.parse(expiryValue) : Number.NaN;
  if (
    response.ok
    && payload.ok === true
    && payload.valid === true
    && payload.status === "active"
    && Number.isFinite(expiry)
    && expiry > Date.now()
  ) return;

  const detail = stringValue(payload.error, payload.reason, payload.message)
    || (!expiryValue ? "授权服务未返回有效期。" : expiry <= Date.now() ? "授权码已过期。" : stringValue(payload.status))
    || `HTTP ${response.status}`;
  throw new Error(detail);
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}
