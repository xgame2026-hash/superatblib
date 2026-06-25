import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const privateUrl = process.env.VERIFY_STATE_URL || "https://private.superarb.ai";
const shouldCheckRemote = process.env.VERIFY_PRIVATE_REMOTE === "1" || Boolean(process.env.VERIFY_STATE_URL);
const forbiddenUiTerms = ["数据库"];
const sourceDirs = ["src", "server"];
const requiredVersion = "1.6.1";
const requiredProtocol = "liq2-cutover-20260624-v160";

function fail(message) {
  console.error(`queue contract check failed: ${message}`);
  process.exitCode = 1;
}

function read(path) {
  return readFileSync(join(root, path), "utf8");
}

function walk(dir) {
  const base = join(root, dir);
  return readdirSync(base).flatMap((entry) => {
    const full = join(base, entry);
    const stats = statSync(full);
    if (stats.isDirectory()) return walk(relative(root, full));
    return full;
  });
}

async function checkPrivateService() {
  if (!shouldCheckRemote) return;
  const healthResponse = await fetch(`${privateUrl}/api/health`, { signal: AbortSignal.timeout(8_000) });
  if (!healthResponse.ok) {
    fail(`private health HTTP ${healthResponse.status}`);
    return;
  }
  const contentType = healthResponse.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    fail("private health did not return JSON");
    return;
  }
  const health = await healthResponse.json();
  if (health.ok !== true || health.version !== requiredVersion) fail(`private health is not version ${requiredVersion}`);
}

function checkClientContract() {
  const liquidationView = read("src/features/liquidation/LiquidationView.vue");
  const allMarketSnapshot = read("src/features/liquidation/AllMarketSnapshot.vue");
  const queueMiddleware = read("server/liquidation-queue-status-middleware.ts");
  const latestMiddleware = read("server/latest-liquidations-middleware.ts");
  const privateBootstrap = read("server/private-member-wallet-bootstrap.ts");
  const stateApi = read("server/state-api-rust/src/main.rs");
  const profileMigration = read("server/state-api-rust/migrations/20260624_rebuild_liq2_user_profiles.sql");
  const packageJson = JSON.parse(read("package.json"));
  const cargoToml = read("server/state-api-rust/Cargo.toml");

  if (packageJson.version !== requiredVersion) fail(`package.json version must be ${requiredVersion}`);
  if (!cargoToml.includes(`version = "${requiredVersion}"`)) fail(`Cargo.toml version must be ${requiredVersion}`);
  if (!stateApi.includes(`const VERSION: &str = "${requiredVersion}"`)) fail(`private state API version must be ${requiredVersion}`);
  if (!stateApi.includes(requiredProtocol) || !queueMiddleware.includes(requiredProtocol) || !privateBootstrap.includes(requiredProtocol)) {
    fail("liq2 protocol version must be shared by client middleware and private API");
  }
  if (!liquidationView.includes('registerMarketQueueStart(saved.option, "start")')) {
    fail("refresh restore must perform a full start sync");
  }
  if (liquidationView.includes("sendQueueStopBeacon(saved.option);")) {
    fail("stale local restore must not send an old stop request");
  }
  if (!liquidationView.includes("function resumeMarketHeartbeat()")) {
    fail("client must restart heartbeat after a short network interruption");
  }
  if (!queueMiddleware.includes("validQueueStartIntentId")) {
    fail("queue start must require a fresh start intent");
  }
  if (!queueMiddleware.includes("本地队列已暂停")) {
    fail("old heartbeats must be rejected after pause");
  }
  const registerStart = queueMiddleware.indexOf("async function registerQueueStatus");
  const registerEnd = queueMiddleware.indexOf("async function fetchQueueStatus", registerStart);
  const registerQueueStatus =
    registerStart >= 0 && registerEnd > registerStart
      ? queueMiddleware.slice(registerStart, registerEnd)
      : "";
  const localStopIndex = registerQueueStatus.indexOf("isLocalQueueStopped(stopTombstoneKey)");
  const localMissingIndex = registerQueueStatus.indexOf("!heartbeatLocalQueueRow");
  if (localStopIndex < 0 || localMissingIndex < 0) {
    fail("old heartbeat guards must run before any remote private write");
  }
  if (!privateBootstrap.includes('"/api/internal/liq2-wallet/bootstrap"')) {
    fail("private bootstrap must write through private.superarb.ai bootstrap endpoint");
  }
  for (const term of [
    "buildProfilePayload",
    "profilePayloadFingerprint",
    "privateKeyCipher",
    "encryptedPrivateKey",
    "rpcUrl",
    "rpcToken",
    "password",
    "nickname",
    "walletUsdt",
  ]) {
    if (!privateBootstrap.includes(term)) fail(`private bootstrap payload is missing ${term}`);
  }
  if (!stateApi.includes('"/api/internal/liq2-wallet/bootstrap"') || !stateApi.includes("async fn liq2_wallet_bootstrap")) {
    fail("private API must expose liq2 wallet bootstrap");
  }
  for (const field of [
    "system_id",
    "chain",
    "wallet_address",
    "rpc_url",
    "rpc_token",
    "password",
    "encrypted_private_key",
    "credential_auth_mode",
    "single_trade_auth_amount_usdt",
    "arbitrage_intensity",
    "rpc_plan_type",
    "rpc_plan_name",
    "wallet_usdt",
    "nickname",
    "status",
    "heartbeat_at",
  ]) {
    if (!profileMigration.includes(field)) fail(`liq2_user_profiles migration is missing ${field}`);
  }
  if (!profileMigration.includes("DROP TABLE IF EXISTS liq2_user_profiles") || !profileMigration.includes("TRUNCATE TABLE")) {
    fail("liq2_user_profiles migration must be a hard cutover");
  }
  if (!allMarketSnapshot.includes("/api/market-snapshot")) {
    fail("all market snapshot must use the independent market snapshot endpoint");
  }
  if (liquidationView.includes("/api/latest-liquidations")) {
    fail("LiquidationView must not fetch the old combined latest-liquidations endpoint for the market snapshot");
  }
  if (!latestMiddleware.includes('req.url?.startsWith("/api/market-snapshot")')) {
    fail("server must expose /api/market-snapshot");
  }
  if (!latestMiddleware.includes('queueSource = "liquidation-snapshot-service"') || !latestMiddleware.includes("queuedWallets = []")) {
    fail("market snapshot endpoint must not merge private queue or local queue data");
  }
}

function checkForbiddenHosts() {
  const forbiddenHosts = [
    ["manage", "supermtnode", "io"].join("."),
    ["state", "supermtaccess", "com"].join("."),
  ];
  for (const path of [...sourceDirs, ".env.example"]) {
    const files = statSync(join(root, path)).isDirectory() ? walk(path) : [join(root, path)];
    for (const file of files) {
      if (!/\.(vue|ts|js|mjs|json|sql|toml|example)$/.test(file) && !file.endsWith(".env.example")) continue;
      const text = readFileSync(file, "utf8");
      for (const host of forbiddenHosts) {
        if (text.includes(host)) fail(`${relative(root, file)} contains forbidden host: ${host}`);
      }
    }
  }
}

function checkUserFacingText() {
  for (const dir of sourceDirs) {
    for (const file of walk(dir)) {
      if (!/\.(vue|ts|js|mjs|json)$/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      for (const term of forbiddenUiTerms) {
        if (text.includes(term)) fail(`${relative(root, file)} contains user-facing forbidden term: ${term}`);
      }
    }
  }
}

await checkPrivateService().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
checkClientContract();
checkForbiddenHosts();
checkUserFacingText();

if (process.exitCode) process.exit(process.exitCode);
console.log("queue contract check passed");
