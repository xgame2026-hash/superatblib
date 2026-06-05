import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
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
  const dashboardPort = normalizePort(env.DASHBOARD_PORT, 4310);

  return {
  plugins: [
    vue(),
    {
      name: "superarb-settings-api",
      configureServer(server) {
        void bootstrapPrivateMemberWalletOnce("vite-startup");
        server.middlewares.use((req, res, next) => {
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
