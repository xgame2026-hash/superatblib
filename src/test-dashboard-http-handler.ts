import assert from "node:assert/strict";
import { IncomingMessage, ServerResponse } from "node:http";
import { URL } from "node:url";

import {
  createDashboardApiHandler,
  serveDashboardHtml,
  serveDashboardStaticAsset,
  type DashboardApiHandlerDeps,
} from "./dashboard-http-handler.js";

type MockResponse = ServerResponse & {
  body?: string;
  headers: Record<string, string>;
};

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const response = {
    statusCode: 0,
    headers,
    setHeader(name: string, value: string) {
      headers[name.toLowerCase()] = value;
    },
    end(chunk?: string | Buffer) {
      response.body = chunk ? String(chunk) : "";
    },
    write(chunk: string | Buffer) {
      response.body = (response.body ?? "") + String(chunk);
      return true;
    },
    flushHeaders() {},
    on() {
      return response;
    },
  } as unknown as MockResponse;
  return response;
}

function createMockRequest(method = "GET"): IncomingMessage {
  return {
    method,
    on() {
      return this;
    },
  } as unknown as IncomingMessage;
}

function createDeps(): DashboardApiHandlerDeps {
  return {
    activateLicense: async () => ({ ok: true, token: "test-token" }),
    buildCliActionSpec: () => ({ action: "scan", chain: "ethereum", market: "aave", args: [] }),
    buildSummary: (entries) => ({ count: entries.length }),
    dashboardConfig: () => ({ ok: true, mode: "dashboard" }),
    historyFilePath: () => "/tmp/history.json",
    dashboardLiveStateFilePath: () => "/tmp/live-state.json",
    dashboardSettingsFilePath: () => "/tmp/settings.json",
    executeCliAction: async () => ({ ok: true }),
    fetchEigenphiFlashloanOverview: async () => ({ ok: true, type: "flashloan-overview" }),
    fetchEigenphiLatestLiquidationPage: async () => ({ ok: true, type: "latest-liquidation" }),
    fetchEigenphiLiquidationLeaderboard: async () => ({ ok: true, type: "leaderboard" }),
    fetchEigenphiLiquidationOverview: async () => ({ ok: true, type: "overview" }),
    fetchMarketDataIndexStatus: () => ({ ok: true, type: "index-status" }),
    fetchMorphoBlueEthereumDashboardSnapshot: async () => ({ ok: true, type: "morpho" }),
    fetchMorphoBlueBaseDashboardSnapshot: async () => ({ ok: true, type: "morpho-base" }),
    fetchQuickNodeUsage: async () => ({ ok: true, type: "quicknode" }),
    fetchUserRpcUsage: async () => ({ ok: true, type: "user-rpc" }),
    fetchPublicLiquidationFeed: async () => ({ ok: true, type: "public-feed", targets: [] }),
    scanBscTailProtocol: async () => ({ ok: true, type: "bsc-tail", targets: [] }),
    fetchLiquidationQueueStatus: async () => ({ ok: true, type: "liquidation-queue", eligible: true }),
    reportLiquidationQueueEvent: async () => ({ ok: true, type: "liquidation-queue-event" }),
    fetchTxGraph: async () => ({ ok: true, type: "tx-graph" }),
    json: (res, statusCode, payload) => {
      res.statusCode = statusCode;
      res.setHeader("content-type", "application/json; charset=utf-8");
      res.end(JSON.stringify(payload));
    },
    liveStatePatchForResult: () => ({}),
    licenseStatus: async () => ({ ok: true, licensed: true }),
    loadDashboardLiveState: () => ({ ok: true }),
    loadDashboardSettings: () => ({ ok: true }),
    parseOptionalString: (value) =>
      typeof value === "string" && value.trim() ? value.trim() : undefined,
    readBody: async () => "",
    recentEntries: () => [],
    requireLicensedFeature: async () => ({ ok: true }),
    saveDashboardLiveState: () => {},
    saveDashboardSettings: (payload) => payload,
    strategyMarketsSummary: () => ({ ok: true, type: "strategy" }),
    streamArbitrageLoop: async () => {},
    streamAutoExecutionLoop: async () => {},
    supportedChains: () => [{ key: "ethereum" }, { key: "arbitrum" }],
    truthy: (value) => value === true || value === "true" || value === "1",
    walletSnapshotForChain: async (chain) => ({ ok: true, chain: chain.key }),
  };
}

const apiHandler = createDashboardApiHandler(createDeps());
const lockedApiHandler = createDashboardApiHandler({
  ...createDeps(),
  requireLicensedFeature: async () => {
    throw new Error("Missing licensed feature.");
  },
});

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/health"));
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "application/json; charset=utf-8");
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.ok, true);
  assert.equal(payload.historyFile, "/tmp/history.json");
  assert.equal(payload.liveStateFile, "/tmp/live-state.json");
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/config"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.ok, true);
  assert.deepEqual(payload.strategy, { ok: true, type: "strategy" });
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/market-data/flashloan-overview?chain=ethereum&period=7"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.type, "flashloan-overview");
}

{
  let calls = 0;
  const cachedHandler = createDashboardApiHandler({
    ...createDeps(),
    fetchEigenphiFlashloanOverview: async () => {
      calls += 1;
      return { ok: true, type: "flashloan-overview", calls };
    },
  });
  const firstReq = createMockRequest("GET");
  const firstRes = createMockResponse();
  await cachedHandler(firstReq, firstRes, new URL("http://localhost/api/market-data/flashloan-overview?chain=ethereum&period=7"));
  assert.equal(firstRes.statusCode, 200);
  const firstPayload = JSON.parse(firstRes.body ?? "{}") as Record<string, unknown>;
  assert.equal(firstPayload.calls, 1);
  const secondReq = createMockRequest("GET");
  const secondRes = createMockResponse();
  await cachedHandler(secondReq, secondRes, new URL("http://localhost/api/market-data/flashloan-overview?chain=ethereum&period=7"));
  assert.equal(secondRes.statusCode, 200);
  const secondPayload = JSON.parse(secondRes.body ?? "{}") as Record<string, unknown>;
  assert.equal(secondPayload.calls, 1);
  assert.equal(((secondPayload.cache as Record<string, unknown>).hit), true);
  assert.equal(calls, 1);
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await lockedApiHandler(req, res, new URL("http://localhost/api/market-data/flashloan-overview?chain=ethereum&period=7"));
  assert.equal(res.statusCode, 403);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.ok, false);
  assert.equal(payload.feature, "flashloan");
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/market-data/index-status"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.type, "index-status");
}

{
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: true, rows: [{ title: "news" }] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  try {
    const req = createMockRequest("GET");
    const res = createMockResponse();
    await apiHandler(req, res, new URL("http://localhost/api/overview-snapshot?period=7&flashloanPeriod=7"));
    assert.equal(res.statusCode, 200);
    const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
    assert.equal(payload.ok, true);
    assert.equal(payload.source, "overview-snapshot");
    const data = payload.data as Record<string, Record<string, unknown>>;
    assert.equal(data.eigenphiOverview.type, "overview");
    assert.equal(data.eigenphiFlashloanOverview.type, "flashloan-overview");
    assert.equal(data.morphoBlueMarkets.type, "morpho");
    assert.deepEqual(data.strategyNews.rows, [{ title: "news" }]);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/public-liquidation-feed?chain=arbitrum"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.type, "public-feed");
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/liquidation-queue/status?chain=arbitrum&market=aave-v3-arbitrum"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.type, "liquidation-queue");
}

{
  const req = createMockRequest("POST");
  const res = createMockResponse();
  req.push = () => false;
  await apiHandler(req, res, new URL("http://localhost/api/liquidation-queue/event"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.type, "liquidation-queue-event");
}

{
  const req = createMockRequest("POST");
  const res = createMockResponse();
  req.push = () => false;
  await apiHandler(req, res, new URL("http://localhost/api/license/activate"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.ok, true);
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/license/status"));
  assert.equal(res.statusCode, 200);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.licensed, true);
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/wallet?chain=bad-chain"));
  assert.equal(res.statusCode, 400);
  const payload = JSON.parse(res.body ?? "{}") as Record<string, unknown>;
  assert.equal(payload.ok, false);
}

{
  const req = createMockRequest("GET");
  const res = createMockResponse();
  await apiHandler(req, res, new URL("http://localhost/api/does-not-exist"));
  assert.equal(res.statusCode, 404);
}

{
  const res = createMockResponse();
  serveDashboardHtml(
    {
      html: "<html>ok</html>",
      text: (target, statusCode, body, contentType) => {
        target.statusCode = statusCode;
        target.setHeader("content-type", contentType ?? "text/plain; charset=utf-8");
        target.end(body);
      },
    },
    res,
  );
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(res.body, "<html>ok</html>");
}

{
  const res = createMockResponse();
  const served = serveDashboardStaticAsset(
    {
      cwd: "/tmp",
      json: (target, statusCode, payload) => {
        target.statusCode = statusCode;
        target.setHeader("content-type", "application/json; charset=utf-8");
        target.end(JSON.stringify(payload));
      },
    },
    res,
    "/not-an-asset",
  );
  assert.equal(served, false);
}

console.log("dashboard http handler ok");
