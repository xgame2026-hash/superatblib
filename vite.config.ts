import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { handleGithubVersionRequest } from "./server/github-version-middleware";
import { handleLatestLiquidationsRequest } from "./server/latest-liquidations-middleware";
import { handleLiquidationQueueStatusRequest } from "./server/liquidation-queue-status-middleware";
import { handleNewsRequest } from "./server/news-middleware";
import { handleRpcUsageRequest } from "./server/rpc-usage-middleware";
import { handleSettingsRequest } from "./server/settings-middleware";
import { handleTxGraphRequest } from "./server/tx-graph-middleware";
import { handleWalletAssetsRequest } from "./server/wallet-assets-middleware";

export default defineConfig({
  plugins: [
    vue(),
    {
      name: "superarb-settings-api",
      configureServer(server) {
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
    port: 4310,
    strictPort: true,
    proxy: {
      "/api/license/check": {
        target: "https://api.supermtnode.io",
        changeOrigin: true,
        secure: true,
      },
    },
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
});
