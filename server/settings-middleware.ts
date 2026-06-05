import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { assertOfficialConfig, checkOfficialConfig, checkRuntimeSettings } from "./official-config";
import { bootstrapPrivateMemberWalletOnce, privateMemberWalletBootstrapStatus } from "./private-member-wallet-bootstrap";

const ENV_FILE = resolve(process.cwd(), ".env");
const ENV_EXAMPLE_FILE = resolve(process.cwd(), ".env.example");

type SettingsPayload = {
  env?: unknown;
  code?: unknown;
  token?: unknown;
};

type SuperMtNodeEndpoint = {
  chain?: unknown;
  status?: unknown;
  httpUrl?: unknown;
  http_url?: unknown;
};

const SUPERMTNODE_API_BASES = ["https://supermtnode.io", "https://api.supermtnode.io"];
const LICENSE_ENDPOINT_ENV_KEYS: Record<string, string> = {
  eth: "ETHEREUM_RPC_URL",
  bnb: "BNB_RPC_URL",
  arb: "ARBITRUM_RPC_URL",
};

export function handleSettingsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  if (!req.url?.startsWith("/api/settings")) return false;

  if (req.url.startsWith("/api/settings/security-check")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        const submittedEnv = typeof payload.env === "string" ? parseEnv(payload.env) : {};
        const savedEnv = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
        const submitted = [...(await checkRuntimeSettings("当前页面配置", submittedEnv)), ...checkOfficialConfig("当前页面配置", submittedEnv), secureUploadItem("当前页面配置", submittedEnv)];
        const saved = [...(await checkRuntimeSettings("已保存 .env", savedEnv)), ...checkOfficialConfig("已保存 .env", savedEnv), secureUploadItem("已保存 .env", savedEnv)];
        const items = [...submitted, ...saved];
        json(res, 200, {
          ok: items.every((item) => item.ok),
          items,
          checkedAt: new Date().toISOString(),
        });
      })
      .catch((error: unknown) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (req.url.startsWith("/api/settings/security-repair")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    const authCode = headerValue(req.headers["x-supermtnode-auth-code"]);
    bootstrapPrivateMemberWalletOnce("security-repair", { authCode })
      .then((payload) => json(res, payload.ok ? 200 : 400, payload))
      .catch((error: unknown) => json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) }));
    return true;
  }

  if (req.url.startsWith("/api/settings/apply-license-endpoints")) {
    if (req.method !== "POST") {
      json(res, 405, { ok: false, error: "Method not allowed." });
      return true;
    }
    readBody(req)
      .then(async (body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        const env = existsSync(ENV_FILE) ? parseEnv(readFileSync(ENV_FILE, "utf8")) : {};
        const authCode = headerValue(req.headers["x-supermtnode-auth-code"]) || (typeof payload.code === "string" ? payload.code.trim() : "");
        const appToken =
          bearerToken(req.headers.authorization) ||
          headerValue(req.headers["x-supermtnode-app-token"]) ||
          (typeof payload.token === "string" ? payload.token.trim() : "") ||
          env.SUPERMTNODE_APP_TOKEN?.trim() ||
          "";
        if (!appToken && !authCode) {
          json(res, 400, { ok: false, error: "Missing SUPERMTNODE_APP_TOKEN." });
          return;
        }
        const endpoints = appToken ? await fetchSuperMtNodeEndpointsByToken(appToken, env) : await fetchSuperMtNodeEndpointsByLicense(authCode, env);
        const applied = applyLicenseEndpointsToEnv(endpoints);
        if (!Object.keys(applied).length) {
          json(res, 409, { ok: false, error: "SUPERMTNODE_APP_TOKEN 没有可用的 BNB/ETH/ARB RPC 端点，不能启动按 IP 计费。", endpoints });
          return;
        }
        json(res, 200, { ok: true, applied, endpoints });
      })
      .catch((error: unknown) => {
        json(res, 502, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  if (req.method === "GET") {
    const envText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
    const exampleText = existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
    json(res, 200, {
      ok: true,
      file: ".env",
      path: ENV_FILE,
      template: ".env.example",
      templatePath: ENV_EXAMPLE_FILE,
      exists: existsSync(ENV_FILE),
      env: parseEnv(envText),
      example: parseEnv(exampleText),
    });
    return true;
  }

  if (req.method === "PUT") {
    readBody(req)
      .then((body) => {
        const payload = JSON.parse(body || "{}") as SettingsPayload;
        if (typeof payload.env !== "string") {
          json(res, 400, { ok: false, error: "Missing env text." });
          return;
        }
        const normalizedEnv = normalizeEnv(payload.env);
        try {
          assertOfficialConfig("保存配置", parseEnv(normalizedEnv));
        } catch (error) {
          json(res, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
          return;
        }
        writeFileSync(ENV_FILE, normalizedEnv, "utf8");
        json(res, 200, { ok: true, file: ".env", path: ENV_FILE });
      })
      .catch((error: unknown) => {
        json(res, 500, { ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  json(res, 405, { ok: false, error: "Method not allowed." });
  return true;
}

function secureUploadItem(scope: string, env: Record<string, string>) {
  const status = privateMemberWalletBootstrapStatus(env);
  return {
    scope,
    key: "SECURE_UPLOAD_STATUS",
    label: "安全同步",
    value: status.ok ? "已完成" : "未完成",
    ok: status.ok,
    message: status.message,
    action: status.action,
  };
}

function parseEnv(source: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    parsed[line.slice(0, separator).trim()] = line.slice(separator + 1);
  }
  return parsed;
}

function headerValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value.find((item) => item.trim())?.trim();
  return value?.trim() || undefined;
}

function bearerToken(value: string | string[] | undefined): string | undefined {
  const header = headerValue(value);
  const match = header?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || undefined;
}

function normalizeEnv(source: string): string {
  return `${source.replace(/\r\n/g, "\n").trimEnd()}\n`;
}

async function fetchSuperMtNodeEndpointsByToken(appToken: string, env: Record<string, string>): Promise<SuperMtNodeEndpoint[]> {
  const errors: string[] = [];
  for (const baseUrl of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${baseUrl}/api/rpc-endpoints`, {
        headers: {
          accept: "application/json",
          authorization: `Bearer ${appToken}`,
          "x-supermtnode-app-token": appToken,
        },
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown };
      if (!response.ok) {
        const detail = stringValue(payload.error, payload.message) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isEndpointRecord) : [];
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

async function fetchSuperMtNodeEndpointsByLicense(authCode: string, env: Record<string, string>): Promise<SuperMtNodeEndpoint[]> {
  const errors: string[] = [];
  for (const baseUrl of superMtNodeApiBaseUrls(env)) {
    try {
      const response = await fetch(`${baseUrl}/api/rpc-endpoints/by-license`, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-license-code": authCode,
        },
        body: JSON.stringify({ code: authCode }),
        signal: AbortSignal.timeout(8_000),
      });
      const payload = (await response.json().catch(() => ({}))) as { endpoints?: unknown; error?: unknown; message?: unknown; valid?: unknown; status?: unknown; reason?: unknown };
      if (!response.ok || payload.valid === false) {
        const detail = stringValue(payload.error, payload.message, payload.reason, payload.status) || `HTTP ${response.status}`;
        throw new Error(detail);
      }
      return Array.isArray(payload.endpoints) ? payload.endpoints.filter(isEndpointRecord) : [];
    } catch (error) {
      errors.push(`${baseUrl}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  throw new Error(errors.join("; "));
}

function superMtNodeApiBaseUrls(env: Record<string, string>): string[] {
  return uniqueStrings([env.SUPERMTNODE_API_BASE_URL?.trim(), ...SUPERMTNODE_API_BASES]).map((value) => value.replace(/\/+$/, ""));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return values.filter((value, index, array): value is string => Boolean(value) && array.indexOf(value) === index);
}

function applyLicenseEndpointsToEnv(endpoints: SuperMtNodeEndpoint[]): Record<string, string> {
  const existingText = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : existsSync(ENV_EXAMPLE_FILE) ? readFileSync(ENV_EXAMPLE_FILE, "utf8") : "";
  const env = parseEnv(existingText);
  const applied: Record<string, string> = {};
  for (const endpoint of endpoints) {
    const chain = stringValue(endpoint.chain)?.toLowerCase();
    const envKey = chain ? LICENSE_ENDPOINT_ENV_KEYS[chain] : undefined;
    const httpUrl = stringValue(endpoint.httpUrl, endpoint.http_url);
    const status = stringValue(endpoint.status)?.toLowerCase();
    if (!envKey || !httpUrl || (status && !["active", "pending"].includes(status))) continue;
    env[envKey] = httpUrl;
    applied[envKey] = httpUrl;
  }
  if (Object.keys(applied).length) {
    writeFileSync(ENV_FILE, serializeEnv(env), "utf8");
  }
  return applied;
}

function serializeEnv(env: Record<string, string>): string {
  return `${Object.entries(env)
    .map(([key, value]) => `${key}=${value}`)
    .join("\n")}\n`;
}

function isEndpointRecord(value: unknown): value is SuperMtNodeEndpoint {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, rejectBody) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolveBody(body));
    req.on("error", rejectBody);
  });
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}
