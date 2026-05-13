import "./env.js";

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { URL } from "node:url";

import { LiquidationQueueStore } from "./liquidation-queue.js";

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function json(res: ServerResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  const parsed = JSON.parse(raw) as unknown;
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function authorized(req: IncomingMessage): boolean {
  const token = process.env.LIQUIDATION_QUEUE_ADMIN_TOKEN;
  if (!token) return true;
  const header = req.headers.authorization;
  return header === `Bearer ${token}`;
}

function allowedChains(): Set<string> | null {
  const raw = process.env.LIQUIDATION_QUEUE_ALLOWED_CHAINS;
  if (!raw?.trim()) return null;
  const chains = raw
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean);
  return chains.length ? new Set(chains) : null;
}

function requestChain(payload: Record<string, unknown>): string {
  return typeof payload.chain === "string" && payload.chain.trim()
    ? payload.chain.trim().toLowerCase()
    : "ethereum";
}

function chainAllowed(payload: Record<string, unknown>): boolean {
  const allowed = allowedChains();
  if (!allowed) return true;
  return allowed.has(requestChain(payload));
}

function isStatusPath(pathname: string): boolean {
  return pathname === "/status" || pathname === "/api/admin/liquidation-queue/status";
}

function isEventPath(pathname: string): boolean {
  return pathname === "/event" || pathname === "/api/admin/liquidation-queue/event";
}

export function createLiquidationQueueServer(store = new LiquidationQueueStore({
  stateFile: process.env.LIQUIDATION_QUEUE_STATE_FILE,
  memberTtlMs: envNumber("LIQUIDATION_QUEUE_MEMBER_TTL_SECONDS", 120) * 1000,
  leaseMs: envNumber("LIQUIDATION_QUEUE_LEASE_SECONDS", 45) * 1000,
})) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (req.method === "GET" && url.pathname === "/health") {
        json(res, 200, { ok: true, service: "liquidation-queue", generatedAt: new Date().toISOString() });
        return;
      }
      if (req.method === "GET" && url.pathname === "/snapshot") {
        if (!authorized(req)) {
          json(res, 401, { ok: false, error: "Unauthorized." });
          return;
        }
        json(res, 200, { ok: true, state: store.snapshot() });
        return;
      }
      if (req.method === "POST" && isStatusPath(url.pathname)) {
        if (!authorized(req)) {
          json(res, 401, { ok: false, error: "Unauthorized." });
          return;
        }
        const payload = await readJson(req);
        if (!chainAllowed(payload)) {
          json(res, 403, {
            ok: false,
            error: `Chain ${requestChain(payload)} is not accepted by this queue server.`,
          });
          return;
        }
        json(res, 200, store.status(payload));
        return;
      }
      if (req.method === "POST" && isEventPath(url.pathname)) {
        if (!authorized(req)) {
          json(res, 401, { ok: false, error: "Unauthorized." });
          return;
        }
        const payload = await readJson(req);
        if (!chainAllowed(payload)) {
          json(res, 403, {
            ok: false,
            error: `Chain ${requestChain(payload)} is not accepted by this queue server.`,
          });
          return;
        }
        json(res, 200, store.event(payload));
        return;
      }
      json(res, 404, { ok: false, error: "Not found." });
    } catch (error) {
      json(res, 500, {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = envNumber("LIQUIDATION_QUEUE_PORT", 4311);
  const host = process.env.LIQUIDATION_QUEUE_HOST || "0.0.0.0";
  const server = createLiquidationQueueServer();
  server.listen(port, host, () => {
    console.log(`Liquidation queue server listening on http://${host}:${port}`);
  });
}
