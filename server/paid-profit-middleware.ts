import type { IncomingMessage, ServerResponse } from "node:http";

const DEFAULT_PRIVATE_MEMBER_API_URL = "https://privateapi.superarb.ai";
const DEFAULT_TIMEOUT_MS = 8_000;

type PaidProfitPayload = {
  ok?: unknown;
  totalPaidUsdt?: unknown;
  total_paid_usdt?: unknown;
  payoutCount?: unknown;
  payout_count?: unknown;
  updatedAt?: unknown;
  updated_at?: unknown;
  source?: unknown;
};

export function handlePaidProfitRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const pathname = requestPathname(req.url);
  if (pathname !== "/api/liq2/paid-profit") return false;

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    json(res, 405, { ok: false, error: "Method not allowed." });
    return true;
  }

  fetchPaidProfit()
    .then((payload) => json(res, 200, payload))
    .catch((error: unknown) => {
      json(res, 502, { ok: false, totalPaidUsdt: "0.00000000", payoutCount: 0, error: error instanceof Error ? error.message : String(error) });
    });

  return true;
}

function requestPathname(url: string | undefined) {
  if (!url) return "";
  try {
    return new URL(url, "http://localhost").pathname;
  } catch {
    return "";
  }
}

async function fetchPaidProfit() {
  const env = readEnv();
  const privateMemberBase = (env.LIQ2_PRIVATE_MEMBER_API_URL?.trim() || DEFAULT_PRIVATE_MEMBER_API_URL).replace(/\/+$/, "");
  const response = await fetch(`${privateMemberBase}/paid-profit`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeoutMs(env)),
  });
  if (!response.ok) throw new Error(`private paid profit request failed (${response.status})`);
  const payload = (await response.json()) as PaidProfitPayload;
  return {
    ok: true,
    source: stringValue(payload.source) || "privateARB.public.paid_profit_events",
    totalPaidUsdt: stringValue(payload.totalPaidUsdt, payload.total_paid_usdt) || "0.00000000",
    payoutCount: numberValue(payload.payoutCount, payload.payout_count) ?? 0,
    updatedAt: stringValue(payload.updatedAt, payload.updated_at) || new Date().toISOString(),
  };
}

function timeoutMs(env: Record<string, string>) {
  const value = Number(env.LIQ2_PRIVATE_MEMBER_TIMEOUT_MS || env.LIQUIDATION_SNAPSHOT_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  return Number.isFinite(value) && value >= 1_000 ? value : DEFAULT_TIMEOUT_MS;
}

function readEnv() {
  return process.env as Record<string, string>;
}

function stringValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim()) {
      const numeric = Number(value.replace(/,/g, ""));
      if (Number.isFinite(numeric)) return numeric;
    }
  }
  return null;
}

function json(res: ServerResponse, status: number, payload: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.end(JSON.stringify(payload));
}
