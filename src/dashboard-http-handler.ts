import { existsSync, readFileSync } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { URL } from "node:url";

type JsonResponder = (
  res: ServerResponse,
  statusCode: number,
  payload: unknown,
) => void;

type TextResponder = (
  res: ServerResponse,
  statusCode: number,
  body: string,
  contentType?: string,
) => void;

type DashboardRunPayload = Record<string, unknown>;
type DashboardChainLike = { key: string };
type DashboardCliActionSpec = {
  action?: unknown;
  chain?: unknown;
  market?: unknown;
  args?: unknown;
};

export type DashboardApiHandlerDeps = {
  activateLicense: (payload: Record<string, unknown>) => Promise<unknown>;
  buildCliActionSpec: (payload: DashboardRunPayload) => DashboardCliActionSpec;
  buildSummary: (entries: Record<string, unknown>[]) => Record<string, unknown>;
  dashboardConfig: () => Record<string, unknown>;
  historyFilePath: () => string;
  dashboardLiveStateFilePath: () => string;
  dashboardSettingsFilePath: () => string;
  executeCliAction: (
    payload: DashboardRunPayload,
    io?: {
      onStdout?: (chunk: string) => void;
      onStderr?: (chunk: string) => void;
    },
  ) => Promise<Record<string, unknown>>;
  fetchEigenphiLatestLiquidationPage: (payload: {
    chain: string;
    date?: string;
    page: number;
    pageSize: number;
  }) => Promise<unknown>;
  fetchEigenphiFlashloanOverview: (
    chain: string,
    period: "1" | "7" | "30",
  ) => Promise<unknown>;
  fetchEigenphiLiquidationLeaderboard: (
    chain: string,
    period: "1" | "7" | "30",
  ) => Promise<unknown>;
  fetchEigenphiLiquidationOverview: (
    chain: string,
    period: "1" | "7" | "30",
  ) => Promise<unknown>;
  fetchMarketDataIndexStatus: () => unknown | Promise<unknown>;
  fetchMorphoBlueEthereumDashboardSnapshot: (payload: {
    force: boolean;
  }) => Promise<unknown>;
  fetchMorphoBlueBaseDashboardSnapshot: (payload: {
    force: boolean;
  }) => Promise<unknown>;
  fetchQuickNodeUsage: () => Promise<unknown>;
  fetchTxGraph: (payload: {
    txHash: string | null;
    chain: string | null;
    rpcUrl: string | null;
  }) => Promise<unknown>;
  json: JsonResponder;
  liveStatePatchForResult: (result: Record<string, unknown>) => unknown;
  licenseStatus: (token: string | null) => Promise<unknown>;
  loadDashboardLiveState: () => unknown;
  loadDashboardSettings: () => unknown;
  parseOptionalString: (value: unknown) => string | undefined;
  readBody: (req: IncomingMessage) => Promise<string>;
  recentEntries: (limit: number, onlyBroadcast: boolean) => Record<string, unknown>[];
  requireLicensedFeature: (token: string | null, feature: string) => Promise<unknown>;
  saveDashboardLiveState: (patch: unknown) => void;
  saveDashboardSettings: (payload: Record<string, unknown>) => unknown;
  strategyMarketsSummary: () => unknown;
  streamArbitrageLoop: (
    payload: DashboardRunPayload,
    push: (payload: unknown) => void,
    isClosed: () => boolean,
  ) => Promise<void>;
  streamAutoExecutionLoop: (
    payload: DashboardRunPayload,
    push: (payload: unknown) => void,
    isClosed: () => boolean,
  ) => Promise<void>;
  supportedChains: () => DashboardChainLike[];
  truthy: (value: unknown) => boolean;
  walletSnapshotForChain: (chain: DashboardChainLike) => Promise<unknown>;
};

type DashboardHtmlResponderDeps = {
  html: string;
  text: TextResponder;
};

type DashboardStaticAssetResponderDeps = {
  json: JsonResponder;
  cwd?: string;
};

// Route table for the dashboard HTTP surface. The caller injects all side effects.
export function createDashboardApiHandler(deps: DashboardApiHandlerDeps) {
  const {
    activateLicense,
    buildCliActionSpec,
    buildSummary,
    dashboardConfig,
    historyFilePath,
    dashboardLiveStateFilePath,
    dashboardSettingsFilePath,
    executeCliAction,
    fetchEigenphiFlashloanOverview,
    fetchEigenphiLatestLiquidationPage,
    fetchEigenphiLiquidationLeaderboard,
    fetchEigenphiLiquidationOverview,
    fetchMarketDataIndexStatus,
    fetchMorphoBlueEthereumDashboardSnapshot,
    fetchMorphoBlueBaseDashboardSnapshot,
    fetchQuickNodeUsage,
    fetchTxGraph,
    json,
    liveStatePatchForResult,
    licenseStatus,
    loadDashboardLiveState,
    loadDashboardSettings,
    parseOptionalString,
    readBody,
    recentEntries,
    requireLicensedFeature,
    saveDashboardLiveState,
    saveDashboardSettings,
    strategyMarketsSummary,
    streamArbitrageLoop,
    streamAutoExecutionLoop,
    supportedChains,
    truthy,
    walletSnapshotForChain,
  } = deps;

  const tokenFromRequest = (req: IncomingMessage): string | null =>
    parseOptionalString(req.headers?.authorization) ??
    parseOptionalString(req.headers?.["x-license-token"]) ??
    null;

  const enforceFeature = async (
    req: IncomingMessage,
    res: ServerResponse,
    feature: string,
  ): Promise<boolean> => {
    try {
      await requireLicensedFeature(tokenFromRequest(req), feature);
      return true;
    } catch (error) {
      json(res, 403, {
        ok: false,
        licensed: false,
        feature,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  };

  return async function serveApi(
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> {
    if (url.pathname === "/api/health") {
      json(res, 200, {
        ok: true,
        historyFile: historyFilePath(),
        liveStateFile: dashboardLiveStateFilePath(),
        generatedAt: new Date().toISOString(),
      });
      return;
    }

    if (url.pathname === "/api/config") {
      json(res, 200, {
        ...dashboardConfig(),
        strategy: strategyMarketsSummary(),
      });
      return;
    }

    if (url.pathname === "/api/strategy-markets") {
      json(res, 200, strategyMarketsSummary());
      return;
    }

    if (url.pathname === "/api/morpho-blue/markets") {
      try {
        const chain = parseOptionalString(url.searchParams.get("chain")) === "base" ? "base" : "ethereum";
        json(
          res,
          200,
          chain === "base"
            ? await fetchMorphoBlueBaseDashboardSnapshot({
                force: truthy(url.searchParams.get("refresh")),
              })
            : await fetchMorphoBlueEthereumDashboardSnapshot({
                force: truthy(url.searchParams.get("refresh")),
              }),
        );
      } catch (error) {
        json(res, 502, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/settings") {
      if (req.method === "GET") {
        json(res, 200, {
          file: dashboardSettingsFilePath(),
          settings: loadDashboardSettings(),
        });
        return;
      }

      if (req.method === "POST") {
        try {
          const body = await readBody(req);
          const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
          const settings = saveDashboardSettings(payload);
          json(res, 200, {
            ok: true,
            file: dashboardSettingsFilePath(),
            settings,
          });
        } catch (error) {
          json(res, 400, {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          });
        }
        return;
      }
    }

    if (url.pathname === "/api/license/activate" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as Record<string, unknown>) : {};
        json(res, 200, await activateLicense(payload));
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/license/status") {
      try {
        json(res, 200, await licenseStatus(tokenFromRequest(req)));
      } catch (error) {
        json(res, 401, {
          ok: false,
          licensed: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/wallet") {
      const chainParam = parseOptionalString(url.searchParams.get("chain"));
      if (chainParam) {
        const chain = supportedChains().find((item) => item.key === chainParam);
        if (!chain) {
          json(res, 400, { ok: false, error: `Unsupported chain: ${chainParam}` });
          return;
        }
        json(res, 200, {
          ok: true,
          wallet: await walletSnapshotForChain(chain),
        });
        return;
      }

      const wallets = await Promise.all(
        supportedChains().map((chain) => walletSnapshotForChain(chain)),
      );
      json(res, 200, {
        ok: true,
        wallets,
      });
      return;
    }

    if (url.pathname === "/api/quicknode/usage") {
      json(res, 200, await fetchQuickNodeUsage());
      return;
    }

    if (url.pathname === "/api/live-state") {
      json(res, 200, {
        file: dashboardLiveStateFilePath(),
        state: loadDashboardLiveState(),
      });
      return;
    }

    if (url.pathname === "/api/tx-graph") {
      try {
        json(
          res,
          200,
          await fetchTxGraph({
            txHash: url.searchParams.get("txHash"),
            chain: url.searchParams.get("chain"),
            rpcUrl: url.searchParams.get("rpcUrl"),
          }),
        );
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/market-data/index-status") {
      json(res, 200, await fetchMarketDataIndexStatus());
      return;
    }

    if (
      url.pathname === "/api/market-data/liquidation-overview" ||
      url.pathname === "/api/eigenphi/liquidation-overview"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data overview chain: ${requestedChain}`,
        });
        return;
      }

      try {
        json(res, 200, await fetchEigenphiLiquidationOverview(chain, period));
      } catch (error) {
        json(res, 200, {
          ok: false,
          sourceUnavailable: true,
          chain,
          period,
          error: error instanceof Error ? error.message : String(error),
          sourcePage: "market-data:onchain",
        });
      }
      return;
    }

    if (
      url.pathname === "/api/market-data/liquidation-leaderboard" ||
      url.pathname === "/api/eigenphi/liquidation-leaderboard"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data leaderboard chain: ${requestedChain}`,
        });
        return;
      }

      try {
        json(res, 200, await fetchEigenphiLiquidationLeaderboard(chain, period));
      } catch (error) {
        json(res, 200, {
          ok: false,
          sourceUnavailable: true,
          chain,
          period,
          error: error instanceof Error ? error.message : String(error),
          sourcePage: "market-data:onchain",
        });
      }
      return;
    }

    if (
      url.pathname === "/api/market-data/flashloan-overview" ||
      url.pathname === "/api/eigenphi/flashloan-overview"
    ) {
      if (!(await enforceFeature(req, res, "flashloan"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const requestedPeriod = parseOptionalString(url.searchParams.get("period")) ?? "7";
      const period = ["1", "7", "30"].includes(requestedPeriod)
        ? (requestedPeriod as "1" | "7" | "30")
        : "7";

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data flashloan chain: ${requestedChain}`,
        });
        return;
      }

      try {
        json(res, 200, await fetchEigenphiFlashloanOverview(chain, period));
      } catch (error) {
        json(res, 200, {
          ok: false,
          sourceUnavailable: true,
          chain,
          period,
          error: error instanceof Error ? error.message : String(error),
          sourcePage: "market-data:onchain",
        });
      }
      return;
    }

    if (
      url.pathname === "/api/market-data/latest-liquidation" ||
      url.pathname === "/api/eigenphi/latest-liquidation"
    ) {
      if (!(await enforceFeature(req, res, "liquidation"))) return;
      const requestedChain = parseOptionalString(url.searchParams.get("chain")) ?? "ethereum";
      const chain = requestedChain.toLowerCase();
      const date = parseOptionalString(url.searchParams.get("date"));
      const page = Number(url.searchParams.get("page") ?? "0");
      const pageSize = Number(url.searchParams.get("pageSize") ?? "10");

      if (chain !== "ethereum") {
        json(res, 400, {
          ok: false,
          error: `Unsupported market-data latest liquidation chain: ${requestedChain}`,
        });
        return;
      }

      try {
        json(
          res,
          200,
          await fetchEigenphiLatestLiquidationPage({
            chain,
            date,
            page,
            pageSize,
          }),
        );
      } catch (error) {
        json(res, 200, {
          ok: false,
          sourceUnavailable: true,
          chain,
          date: date ?? null,
          page,
          pageSize,
          rows: [],
          error: error instanceof Error ? error.message : String(error),
          sourcePage: "market-data:onchain",
        });
      }
      return;
    }

    if (url.pathname === "/api/history") {
      const limit = Number(url.searchParams.get("limit") ?? "25");
      const includeSimulation =
        url.searchParams.get("includeSimulation") === "1" ||
        url.searchParams.get("includeSimulation") === "true";
      const safeLimit = Number.isFinite(limit)
        ? Math.max(1, Math.min(200, Math.trunc(limit)))
        : 25;
      const entries = recentEntries(safeLimit, !includeSimulation);
      json(res, 200, {
        summary: buildSummary(entries),
        entries,
      });
      return;
    }

    if (url.pathname === "/api/run" && req.method === "POST") {
      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        const result = await executeCliAction(payload);
        try {
          saveDashboardLiveState(liveStatePatchForResult(result));
        } catch {
          // Ignore state persistence failures so the command result still returns.
        }
        json(res, 200, result);
      } catch (error) {
        json(res, 400, {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
      return;
    }

    if (url.pathname === "/api/run-stream" && req.method === "POST") {
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");

      const push = (payload: unknown): void => {
        res.write(`${JSON.stringify(payload)}\n`);
      };

      try {
        const body = await readBody(req);
        const payload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        const spec = buildCliActionSpec(payload);
        push({
          type: "meta",
          action: spec.action,
          chain: spec.chain,
          market: spec.market,
          args: spec.args,
        });

        const result = await executeCliAction(payload, {
          onStdout: (chunk) => push({ type: "stdout", data: chunk }),
          onStderr: (chunk) => push({ type: "stderr", data: chunk }),
        });
        try {
          saveDashboardLiveState(liveStatePatchForResult(result));
        } catch {
          // Ignore state persistence failures so the command result still returns.
        }
        push({ type: "result", data: result });
      } catch (error) {
        push({
          type: "result",
          data: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        res.end();
      }
      return;
    }

    if (
      (url.pathname === "/api/auto-execute-stream" ||
        url.pathname === "/api/arbitrage-stream") &&
      (req.method === "POST" || req.method === "GET")
    ) {
      res.statusCode = 200;
      res.setHeader("content-type", "application/x-ndjson; charset=utf-8");
      res.setHeader("cache-control", "no-cache");
      res.setHeader("connection", "keep-alive");
      res.flushHeaders?.();

      let closed = false;
      req.on("close", () => {
        closed = true;
      });
      res.on("close", () => {
        closed = true;
      });

      const push = (payload: unknown): void => {
        if (closed) {
          return;
        }
        try {
          res.write(`${JSON.stringify(payload)}\n`);
        } catch {
          closed = true;
        }
      };

      try {
        let parsedPayload: DashboardRunPayload = {};
        if (req.method === "GET") {
          parsedPayload = {
            chain: parseOptionalString(url.searchParams.get("chain")) ?? undefined,
            market: parseOptionalString(url.searchParams.get("market")) ?? undefined,
            lookbackBlocks:
              parseOptionalString(url.searchParams.get("lookbackBlocks")) ??
              undefined,
            limit: parseOptionalString(url.searchParams.get("limit")) ?? undefined,
            resumeFromBlock:
              parseOptionalString(url.searchParams.get("resumeFromBlock")) ??
              undefined,
            resumeChunkStart:
              parseOptionalString(url.searchParams.get("resumeChunkStart")) ??
              undefined,
            resumeChunkEnd:
              parseOptionalString(url.searchParams.get("resumeChunkEnd")) ??
              undefined,
            resumeUserOffset:
              parseOptionalString(url.searchParams.get("resumeUserOffset")) ??
              undefined,
            rpcUrl: parseOptionalString(url.searchParams.get("rpcUrl")) ?? undefined,
            contract:
              parseOptionalString(url.searchParams.get("contract")) ?? undefined,
            hfMax: parseOptionalString(url.searchParams.get("hfMax")) ?? undefined,
            allowRisky:
              parseOptionalString(url.searchParams.get("allowRisky")) ?? undefined,
            autoSwap:
              parseOptionalString(url.searchParams.get("autoSwap")) ?? undefined,
            broadcast:
              parseOptionalString(url.searchParams.get("broadcast")) ?? undefined,
            minNetProfit:
              parseOptionalString(url.searchParams.get("minNetProfit")) ?? undefined,
            token: parseOptionalString(url.searchParams.get("token")) ?? undefined,
            venues: parseOptionalString(url.searchParams.get("venues")) ?? undefined,
          };
        } else {
          const body = await readBody(req);
          parsedPayload = body ? (JSON.parse(body) as DashboardRunPayload) : {};
        }
        if (url.pathname === "/api/arbitrage-stream") {
          await streamArbitrageLoop(parsedPayload, push, () => closed);
        } else {
          await streamAutoExecutionLoop(parsedPayload, push, () => closed);
        }
        push({
          type: "result",
          data: {
            ok: true,
            action:
              url.pathname === "/api/arbitrage-stream"
                ? "arbitrage"
                : "auto-execute",
          },
        });
      } catch (error) {
        push({
          type: "result",
          data: {
            ok: false,
            error: error instanceof Error ? error.message : String(error),
          },
        });
      } finally {
        if (!closed) {
          res.end();
        }
      }
      return;
    }

    json(res, 404, { error: "Not found" });
  };
}

export function serveDashboardHtml(
  deps: DashboardHtmlResponderDeps,
  res: ServerResponse,
): void {
  deps.text(res, 200, deps.html, "text/html; charset=utf-8");
}

export function serveDashboardStaticAsset(
  deps: DashboardStaticAssetResponderDeps,
  res: ServerResponse,
  pathname: string,
): boolean {
  const cwd = deps.cwd ?? process.cwd();

  if (pathname === "/vendor/chart.js") {
    const assetPath = path.resolve(cwd, "node_modules", "chart.js", "dist", "chart.umd.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/cytoscape.js") {
    const assetPath = path.resolve(cwd, "node_modules", "cytoscape", "dist", "cytoscape.umd.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/webcola.js") {
    const assetPath = path.resolve(cwd, "node_modules", "webcola", "WebCola", "cola.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (pathname === "/vendor/cytoscape-cola.js") {
    const assetPath = path.resolve(cwd, "node_modules", "cytoscape-cola", "cytoscape-cola.js");
    if (!existsSync(assetPath)) {
      deps.json(res, 404, { error: "Not found" });
      return true;
    }
    res.statusCode = 200;
    res.setHeader("content-type", "application/javascript; charset=utf-8");
    res.end(readFileSync(assetPath));
    return true;
  }

  if (
    !pathname.startsWith("/img/") &&
    !pathname.startsWith("/cryptoimg/") &&
    !pathname.startsWith("/font/")
  ) {
    return false;
  }

  const assetName = path.basename(pathname);
  const assetDir = pathname.startsWith("/cryptoimg/")
    ? "cryptoimg"
    : pathname.startsWith("/font/")
      ? "font"
      : "img";
  const assetPath = path.resolve(cwd, "src", assetDir, assetName);
  if (!existsSync(assetPath)) {
    deps.json(res, 404, { error: "Not found" });
    return true;
  }

  const ext = path.extname(assetPath).toLowerCase();
  const contentType =
    ext === ".svg"
      ? "image/svg+xml"
      : ext === ".png"
        ? "image/png"
        : ext === ".jpg" || ext === ".jpeg"
          ? "image/jpeg"
          : ext === ".otf"
            ? "font/otf"
            : "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("content-type", contentType);
  res.end(readFileSync(assetPath));
  return true;
}
