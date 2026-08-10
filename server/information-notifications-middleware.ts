import { existsSync, readFileSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import { ENV_FILE } from "./runtime-paths";

const DEFAULT_INFORMATION_NOTIFICATIONS_URL = "https://privateapi.superarb.ai/v1/liq2/information-notifications";
const DEFAULT_NOTIFICATION_KEY = "monthly_liquidation_reward";
const REQUEST_TIMEOUT_MS = 8_000;

type UpstreamPayload = {
  ok?: unknown;
  source?: unknown;
  notificationKey?: unknown;
  content?: unknown;
  updatedAt?: unknown;
  updatedBy?: unknown;
  message?: unknown;
};

export function handleInformationNotificationsRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const requestUrl = parseRequestUrl(req.url);
  if (!requestUrl || requestUrl.pathname !== "/api/liq2/information-notifications") return false;
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    sendJson(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  let notificationKey: string;
  try {
    notificationKey = normalizeNotificationKey(requestUrl.searchParams.get("notificationKey") || DEFAULT_NOTIFICATION_KEY);
  } catch (error) {
    sendJson(res, 400, { ok: false, error: error instanceof Error ? error.message : "信息通知键格式不正确。" });
    return true;
  }
  void fetchInformationNotification(notificationKey)
    .then((payload) => sendJson(res, 200, payload))
    .catch((error: unknown) => sendJson(res, 502, {
      ok: false,
      error: error instanceof Error ? error.message : "信息通知读取失败。",
    }));
  return true;
}

async function fetchInformationNotification(notificationKey: string) {
  const env = readEnv();
  const walletAddress = configuredWalletAddress(env);
  const appToken = env.SUPERMTNODE_APP_TOKEN?.trim();
  if (!appToken) throw new Error("SUPERMTNODE_APP_TOKEN 未配置，无法读取信息通知。");

  const endpoint = new URL(env.LIQ2_INFORMATION_NOTIFICATIONS_URL?.trim() || DEFAULT_INFORMATION_NOTIFICATIONS_URL);
  endpoint.searchParams.set("walletAddress", walletAddress);
  endpoint.searchParams.set("notificationKey", notificationKey);
  const response = await fetch(endpoint, {
    cache: "no-store",
    headers: {
      accept: "application/json",
      "x-supermtnode-app-token": appToken,
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const payload = (await response.json().catch(() => ({}))) as UpstreamPayload;
  if (!response.ok || payload.ok === false || !stringValue(payload.content)) {
    throw new Error(stringValue(payload.message) || `信息通知接口不可用（HTTP ${response.status}）。`);
  }
  return {
    ok: true,
    source: stringValue(payload.source) || "privateARB.public.liq2_information_notifications",
    notificationKey: stringValue(payload.notificationKey) || notificationKey,
    content: stringValue(payload.content),
    updatedAt: stringValue(payload.updatedAt),
    updatedBy: stringValue(payload.updatedBy),
  };
}

function configuredWalletAddress(env: Record<string, string>): string {
  const walletAddress = env.WALLET_ADDRESS?.trim() || "";
  if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) throw new Error("执行钱包未配置，无法读取信息通知。");
  return walletAddress.toLowerCase();
}

function readEnv(): Record<string, string> {
  const values: Record<string, string> = Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  if (!existsSync(ENV_FILE)) return values;
  for (const rawLine of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    let value = line.slice(separator + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    values[key] = value;
  }
  return values;
}

function parseRequestUrl(value: string | undefined): URL | null {
  try {
    return new URL(value || "", "http://127.0.0.1");
  } catch {
    return null;
  }
}

function normalizeNotificationKey(value: string): string {
  const key = value.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(key)) throw new Error("信息通知键格式不正确。");
  return key;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function sendJson(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.end(JSON.stringify(payload));
}
