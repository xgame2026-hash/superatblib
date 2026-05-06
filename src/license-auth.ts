import { createHash, createHmac, timingSafeEqual } from "node:crypto";

import type { RowDataPacket } from "mysql2/promise";

import {
  marketDataDatabaseConfigured,
  marketDataPool,
} from "./market-data-db.js";

type LicenseCodeRow = RowDataPacket & {
  code_hash: string;
  plan: string;
  status: string;
  max_activations: number;
  expires_at: Date | string | null;
  features: string | Record<string, unknown> | null;
};

type ActivationRow = RowDataPacket & {
  activation_id: string;
  code_hash: string;
  device_id: string;
  device_name: string | null;
  token_hash: string | null;
  revoked_at: Date | string | null;
};

type LicensePayload = {
  codeHash: string;
  activationId: string;
  deviceId: string;
  plan: string;
  features: Record<string, unknown>;
  issuedAt: number;
  expiresAt: number | null;
};

function truthy(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

export function licenseEnforcementEnabled(): boolean {
  return truthy(process.env.LICENSE_ENFORCEMENT?.trim().toLowerCase());
}

function licenseSecret(): string {
  const secret = process.env.LICENSE_TOKEN_SECRET?.trim();
  if (!secret) {
    throw new Error("LICENSE_TOKEN_SECRET is not configured.");
  }
  return secret;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function base64Url(value: Buffer | string): string {
  return Buffer.from(value).toString("base64url");
}

function parseJsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function activationId(codeHash: string, deviceId: string): string {
  return sha256(`${codeHash}:${deviceId}`);
}

function signToken(payload: LicensePayload): string {
  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = createHmac("sha256", licenseSecret()).update(input).digest("base64url");
  return `${input}.${signature}`;
}

function verifyTokenSignature(token: string): LicensePayload {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid license token.");
  }
  const input = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", licenseSecret()).update(input).digest("base64url");
  const actual = parts[2];
  if (
    expected.length !== actual.length ||
    !timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
  ) {
    throw new Error("Invalid license token signature.");
  }
  const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as LicensePayload;
  if (payload.expiresAt && payload.expiresAt < Math.floor(Date.now() / 1000)) {
    throw new Error("License token expired.");
  }
  return payload;
}

async function audit(action: string, payload: {
  codeHash?: string;
  activationId?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  await marketDataPool().execute(
    `INSERT INTO license_audit_log (code_hash, activation_id, action, detail_json)
     VALUES (?, ?, ?, ?)`,
    [
      payload.codeHash ?? null,
      payload.activationId ?? null,
      action,
      JSON.stringify(payload.detail ?? {}),
    ],
  );
}

async function readLicense(codeHash: string): Promise<LicenseCodeRow | null> {
  const [rows] = await marketDataPool().execute<LicenseCodeRow[]>(
    `SELECT *
       FROM license_codes
      WHERE code_hash = ?
      LIMIT 1`,
    [codeHash],
  );
  return rows[0] ?? null;
}

function assertLicenseUsable(row: LicenseCodeRow | null): LicenseCodeRow {
  if (!row) {
    throw new Error("License code not found.");
  }
  if (row.status !== "active") {
    throw new Error(`License code is ${row.status}.`);
  }
  if (row.expires_at && Date.parse(String(row.expires_at)) <= Date.now()) {
    throw new Error("License code expired.");
  }
  return row;
}

export async function activateLicense(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!marketDataDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  const deviceId = typeof payload.deviceId === "string" ? payload.deviceId.trim() : "";
  const deviceName = typeof payload.deviceName === "string" ? payload.deviceName.trim().slice(0, 160) : null;
  if (!code || !deviceId) {
    throw new Error("License code and deviceId are required.");
  }
  const codeHash = sha256(code);
  const row = assertLicenseUsable(await readLicense(codeHash));
  const id = activationId(codeHash, deviceId);
  const [activationRows] = await marketDataPool().execute<ActivationRow[]>(
    `SELECT *
       FROM license_activations
      WHERE code_hash = ? AND revoked_at IS NULL`,
    [codeHash],
  );
  const existing = activationRows.find((item) => item.device_id === deviceId);
  if (!existing && activationRows.length >= row.max_activations) {
    throw new Error("License activation limit reached.");
  }
  const features = parseJsonObject(row.features);
  const expiresAt = row.expires_at ? Math.floor(Date.parse(String(row.expires_at)) / 1000) : null;
  const token = signToken({
    codeHash,
    activationId: id,
    deviceId,
    plan: row.plan,
    features,
    issuedAt: Math.floor(Date.now() / 1000),
    expiresAt,
  });
  await marketDataPool().execute(
    `INSERT INTO license_activations
       (activation_id, code_hash, device_id, device_name, token_hash, activated_at, last_seen_at)
     VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE
       device_name = VALUES(device_name),
       token_hash = VALUES(token_hash),
       last_seen_at = UTC_TIMESTAMP(),
       revoked_at = NULL`,
    [id, codeHash, deviceId, deviceName, sha256(token)],
  );
  await audit("activate", {
    codeHash,
    activationId: id,
    detail: { deviceId, deviceName, plan: row.plan },
  });
  return {
    ok: true,
    token,
    plan: row.plan,
    features,
    expiresAt,
  };
}

export async function licenseStatus(token: string | null): Promise<Record<string, unknown>> {
  if (!token) {
    return { ok: false, licensed: false, error: "Missing license token." };
  }
  if (!marketDataDatabaseConfigured()) {
    throw new Error("DATABASE_URL is not configured.");
  }
  const payload = verifyTokenSignature(token);
  const code = assertLicenseUsable(await readLicense(payload.codeHash));
  const [rows] = await marketDataPool().execute<ActivationRow[]>(
    `SELECT *
       FROM license_activations
      WHERE activation_id = ? AND code_hash = ?
      LIMIT 1`,
    [payload.activationId, payload.codeHash],
  );
  const activation = rows[0];
  if (!activation || activation.revoked_at) {
    throw new Error("License activation is not active.");
  }
  await marketDataPool().execute(
    `UPDATE license_activations
        SET last_seen_at = UTC_TIMESTAMP(), token_hash = ?
      WHERE activation_id = ?`,
    [sha256(token), payload.activationId],
  );
  return {
    ok: true,
    licensed: true,
    plan: code.plan,
    deviceId: payload.deviceId,
    features: parseJsonObject(code.features),
    expiresAt: payload.expiresAt,
  };
}

function featureAllowed(features: Record<string, unknown>, feature: string): boolean {
  const value = features[feature];
  if (value === true) return true;
  if (typeof value === "string") {
    return ["1", "true", "yes", "on"].includes(value.trim().toLowerCase());
  }
  if (Array.isArray(features.features)) {
    return features.features.includes(feature);
  }
  return false;
}

export async function requireLicensedFeature(
  token: string | null,
  feature: string,
): Promise<Record<string, unknown>> {
  if (!licenseEnforcementEnabled()) {
    return {
      ok: true,
      licensed: false,
      bypassed: true,
      feature,
    };
  }
  const status = await licenseStatus(token);
  const features = parseJsonObject((status as Record<string, unknown>).features);
  if (!featureAllowed(features, feature)) {
    throw new Error(`License does not include ${feature}.`);
  }
  return {
    ...status,
    feature,
  };
}

export function bearerToken(value: string | string[] | undefined): string | null {
  const header = Array.isArray(value) ? value[0] : value;
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header);
  return match ? match[1].trim() : header.trim();
}
