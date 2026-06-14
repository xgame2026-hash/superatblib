import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { handleGithubVersionRequest } from "./server/github-version-middleware";
import { handleLatestLiquidationsRequest } from "./server/latest-liquidations-middleware";
import { handleLiquidationQueueStatusRequest } from "./server/liquidation-queue-status-middleware";
import { handleNewsRequest } from "./server/news-middleware";
import { handleRpcUsageRequest } from "./server/rpc-usage-middleware";
import { handleSettingsRequest } from "./server/settings-middleware";
import { handleTxGraphRequest } from "./server/tx-graph-middleware";
import { handleWalletAssetsRequest } from "./server/wallet-assets-middleware";
import { bootstrapPrivateMemberWalletOnce } from "./server/private-member-wallet-bootstrap";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const dashboardPort = normalizePort(env.DASHBOARD_PORT, 4311);

  return {
  plugins: [
    vue(),
    {
      name: "superarb-settings-api",
      configureServer(server) {
        void bootstrapPrivateMemberWalletOnce("vite-startup");
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
            !handleSettingsRequest(req, res) &&
            !handleLatestLiquidationsRequest(req, res) &&
            !handleLiquidationQueueStatusRequest(req, res) &&
            !handleNewsRequest(req, res) &&
            !handleTxGraphRequest(req, res) &&
            !handleRpcUsageRequest(req, res) &&
            !handleGithubVersionRequest(req, res) &&
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
    proxy: {
      "/api/license/check": {
        target: "https://api.supermtnode.io",
        changeOrigin: true,
        secure: true,
      },
    },
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

function normalizePort(value: string | undefined, fallback: number): number {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return fallback;
  return port;
}

function writeDashboardRuntimePort(port: number): void {
  try {
    const path = resolve(process.cwd(), ".superarb/dashboard-runtime.json");
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify({ host: "127.0.0.1", port, url: `http://127.0.0.1:${port}/`, updatedAt: new Date().toISOString() }, null, 2)}\n`, "utf8");
  } catch {
    // Runtime URL discovery is best-effort; Vite still prints the actual URL.
  }
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
    "Content-Type,Authorization,X-SuperMtNode-Auth-Code,X-SuperMtNode-App-Token,Accept",
  );
}
