import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { handleAvatarProfileRequest } from "./server/avatar-profile-middleware";
import { handleGithubVersionRequest } from "./server/github-version-middleware";
import { handleInformationNotificationsRequest } from "./server/information-notifications-middleware";
import { handleLatestLiquidationsRequest } from "./server/latest-liquidations-middleware";
import { handleLiquidationQueueStatusRequest, restoreLocalQueueHeartbeats } from "./server/liquidation-queue-status-middleware";
import { handleNewsRequest } from "./server/news-middleware";
import { handlePolymarketMarketRequest } from "./server/polymarket-market-middleware";
import { handlePolymarketReadonlyRequest } from "./server/polymarket-readonly-middleware";
import { handlePaidProfitRequest } from "./server/paid-profit-middleware";
import { handleRpcUsageRequest } from "./server/rpc-usage-middleware";
import { handleSettingsRequest } from "./server/settings-middleware";
import { restorePendingPrivateMemberLeave } from "./server/private-member-wallet-bootstrap";
import { handleSlotsOrdersRequest } from "./server/slots-orders-middleware";
import { handleTxGraphRequest } from "./server/tx-graph-middleware";
import { handleUpdateCompletionRequest } from "./server/update-completion-middleware";
import { handleWalletAssetsRequest } from "./server/wallet-assets-middleware";
import { ENV_FILE, LIQ2_PROFILE, STATE_DIR, stateFile } from "./server/runtime-paths";

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...readSelectedEnv() };
  const dashboardPort = normalizePort(env.DASHBOARD_PORT, 4311);
  const gitCommit = shortGitCommit();

  return {
  define: {
    __APP_GIT_COMMIT__: JSON.stringify(gitCommit),
  },
  plugins: [
    vue(),
    {
      name: "superarb-settings-api",
      configureServer(server) {
        restoreLocalQueueHeartbeats();
        restorePendingPrivateMemberLeave();
        server.httpServer?.once("listening", () => {
          const address = server.httpServer?.address();
          const port = typeof address === "object" && address ? address.port : dashboardPort;
          writeDashboardRuntimePort(port);
        });
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith("/api/")) {
            applyLocalApiCors(req.headers.origin, res);
            if (req.method === "OPTIONS") {
              res.statusCode = 204;
              res.end();
              return;
            }
          }
          if (
            !handleAvatarProfileRequest(req, res) &&
            !handlePolymarketReadonlyRequest(req, res) &&
            !handlePolymarketMarketRequest(req, res) &&
            !handleSlotsOrdersRequest(req, res) &&
            !handleSettingsRequest(req, res) &&
            !handleLatestLiquidationsRequest(req, res) &&
            !handleLiquidationQueueStatusRequest(req, res) &&
            !handleNewsRequest(req, res) &&
            !handlePaidProfitRequest(req, res) &&
            !handleTxGraphRequest(req, res) &&
            !handleRpcUsageRequest(req, res) &&
            !handleGithubVersionRequest(req, res) &&
            !handleInformationNotificationsRequest(req, res) &&
            !handleUpdateCompletionRequest(req, res) &&
            !handleWalletAssetsRequest(req, res)
          ) {
            next();
          }
        });
      },
    },
  ],
  server: {
    host: "127.0.0.1",
    port: dashboardPort,
    strictPort: false,
  },
  preview: {
    host: "127.0.0.1",
    port: dashboardPort,
    strictPort: false,
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/cytoscape")) return "vendor-cytoscape";
          if (id.includes("node_modules/element-plus") || id.includes("node_modules/@element-plus")) return "vendor-element";
          if (id.includes("node_modules/@vue") || id.includes("node_modules/vue")) return "vendor-vue";
        },
      },
    },
  },
  };
});

function shortGitCommit(): string {
  const configured = process.env.SUPERARB_BUILD_COMMIT?.trim();
  if (configured) return configured;
  try {
    return execSync("git rev-parse --short HEAD", { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    const buildCommitFile = resolve(process.cwd(), ".superarb-build-commit");
    return existsSync(buildCommitFile) ? readFileSync(buildCommitFile, "utf8").trim() : "";
  }
}

function normalizePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return fallback;
  return port;
}

function writeDashboardRuntimePort(port: number): void {
  try {
    const path = stateFile("dashboard-runtime.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({
      host: "127.0.0.1",
      port,
      pid: process.pid,
      profile: LIQ2_PROFILE,
      envFile: ENV_FILE,
      stateDir: STATE_DIR,
      url: `http://127.0.0.1:${port}/`,
      updatedAt: new Date().toISOString(),
    }, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  } catch {
    // Runtime URL discovery is best-effort; Vite still prints the actual URL.
  }
}

function readSelectedEnv(): Record<string, string> {
  if (!existsSync(ENV_FILE)) return {};
  return Object.fromEntries(
    readFileSync(ENV_FILE, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

function applyLocalApiCors(origin: string | string[] | undefined, res: { setHeader(name: string, value: string): void }): void {
  const value = Array.isArray(origin) ? origin.find(Boolean) : origin;
  if (value && /^https?:\/\/(?:localhost|127(?:\.\d{1,3}){1,3})(?::\d+)?$/i.test(value)) {
    res.setHeader("Access-Control-Allow-Origin", value);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,OPTIONS");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type,Authorization,X-SuperMtNode-Auth-Code,X-SuperMtNode-App-Token,X-Wallet-Address,X-Superimg-Upload-Token,Accept",
  );
}
