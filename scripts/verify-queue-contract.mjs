import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const privateUrl = process.env.VERIFY_STATE_URL || "https://privateapi.superarb.ai";
const shouldCheckRemote = process.env.VERIFY_PRIVATE_REMOTE === "1" || Boolean(process.env.VERIFY_STATE_URL);
const forbiddenUiTerms = ["数据库"];
const sourceDirs = ["src", "server"];
const requiredVersion = "1.6.5";
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
  const healthResponse = await fetch(`${privateUrl}/health`, { signal: AbortSignal.timeout(8_000) });
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
  const app = read("src/App.vue");
  const liquidationView = read("src/features/liquidation/LiquidationView.vue");
  const allMarketSnapshot = read("src/features/liquidation/AllMarketSnapshot.vue");
  const queueMiddleware = read("server/liquidation-queue-status-middleware.ts");
  const latestMiddleware = read("server/latest-liquidations-middleware.ts");
  const privateBootstrap = read("server/private-member-wallet-bootstrap.ts");
  const settingsMiddleware = read("server/settings-middleware.ts");
  const stateApi = read("server/state-api-rust/src/main.rs");
  const viteConfig = read("vite.config.ts");
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
  if (app.includes("handlePresencePageExit") || liquidationView.includes("handleClientUnload")) {
    fail("closing the dashboard must not stop server-owned execution presence");
  }
  if (liquidationView.includes("RUNNING_MARKET_RESTORE_WINDOW_MS") || !liquidationView.includes("restoreRunningMarketIntent")) {
    fail("running intent must survive a closed dashboard until the user explicitly pauses it");
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
  if (!privateBootstrap.includes('"https://privateapi.superarb.ai"') || !privateBootstrap.includes('const DEFAULT_BOOTSTRAP_PATH = "/bootstrap"')) {
    fail("private bootstrap must write through privateapi.superarb.ai /bootstrap endpoint");
  }
  if (!privateBootstrap.includes("sendPrivateMemberWalletHeartbeat") || !privateBootstrap.includes("/heartbeat") || !settingsMiddleware.includes("/api/settings/presence/start")) {
    fail("liq2 client presence must refresh privateapi.superarb.ai /heartbeat");
  }
  if (privateBootstrap.includes("username") || queueMiddleware.includes("username")) {
    fail("liq2 private writes must identify users by full wallet address, never by a derived username");
  }
  if (privateBootstrap.includes("presence-token-rebind") || privateBootstrap.includes("already_submitted_locally")) {
    fail("liq2 presence must not use token-rebind or local bootstrap-cache gates");
  }
  if (!queueMiddleware.includes('bootstrapPrivateMemberWalletOnce("queue-start"')) {
    fail("liq2 queue start must write the current wallet profile before heartbeats begin");
  }
  if (viteConfig.includes('bootstrapPrivateMemberWalletOnce("vite-startup"')) {
    fail("opening the liq2 dashboard must not submit a wallet profile");
  }
  if (privateBootstrap.includes("validateSuperMtNodeAppToken")) {
    fail("liq2 bootstrap must use one authoritative privateapi write, without a separate member-tier preflight");
  }
  if (stateApi.includes("resolve_supermtnode_rpc_plan")) {
    fail("liq2 database bootstrap must not wait for an external RPC-plan lookup");
  }
  if (!queueMiddleware.includes("throw new Error(`用户数据写入失败")) {
    fail("liq2 queue start must stop when the user profile was not written");
  }
  const presenceStart = privateBootstrap.slice(
    privateBootstrap.indexOf("export async function startPrivateMemberWalletHeartbeat"),
    privateBootstrap.indexOf("export async function stopPrivateMemberWalletHeartbeat"),
  );
  if (presenceStart.includes("bootstrapPrivateMemberWalletOnce")) {
    fail("execution presence must only start heartbeat after queue-start bootstrap");
  }
  if (privateBootstrap.includes("slice(2, 10)")) {
    fail("liq2 private writes must not derive a username from the wallet address");
  }
  for (const term of [
    "buildProfilePayload",
    "privateKeyCipher",
    "encryptedPrivateKey",
    "rpcUrl",
    "rpcToken",
    "nickname",
    "walletUsdt",
  ]) {
    if (!privateBootstrap.includes(term)) fail(`private bootstrap payload is missing ${term}`);
  }
  if (!stateApi.includes("async fn liq2_wallet_bootstrap")) {
    fail("liq2 state API bootstrap handler is missing");
  }
  for (const field of [
    "system_id",
    "chain",
    "wallet_address",
    "rpc_url",
    "rpc_token",
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
  if (!profileMigration.includes("uq_liq2_user_profiles_chain_wallet") || !stateApi.includes("ON CONFLICT (chain, wallet_address) DO UPDATE")) {
    fail("liq2 profile writes must upsert by chain plus full wallet address");
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
