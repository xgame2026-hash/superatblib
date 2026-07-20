import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const privateUrl = process.env.VERIFY_STATE_URL || "https://privateapi.superarb.ai";
const shouldCheckRemote = process.env.VERIFY_PRIVATE_REMOTE === "1" || Boolean(process.env.VERIFY_STATE_URL);
const forbiddenUiTerms = ["数据库"];
const sourceDirs = ["src", "server"];
const requiredVersion = "1.6.6";
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
  const readme = read("README.md");
  const envExample = read(".env.example");
  const app = read("src/App.vue");
  const liquidationView = read("src/features/liquidation/LiquidationView.vue");
  const allMarketSnapshot = read("src/features/liquidation/AllMarketSnapshot.vue");
  const latestView = read("src/features/latest-liquidations/LatestLiquidationsView.vue");
  const queueMiddleware = read("server/liquidation-queue-status-middleware.ts");
  const latestMiddleware = read("server/latest-liquidations-middleware.ts");
  const avatarMiddleware = read("server/avatar-profile-middleware.ts");
  const privateBootstrap = read("server/private-member-wallet-bootstrap.ts");
  const settingsMiddleware = read("server/settings-middleware.ts");
  const licenseMiddleware = read("server/supermtnode-license.ts");
  const credentialAudit = read("server/credential-audit.ts");
  const settingsView = read("src/features/settings/SettingsView.vue");
  const viteConfig = read("vite.config.ts");
  const packageJson = JSON.parse(read("package.json"));

  if (packageJson.version !== requiredVersion) fail(`package.json version must be ${requiredVersion}`);
  if (!queueMiddleware.includes(requiredProtocol) || !privateBootstrap.includes(requiredProtocol)) {
    fail("liq2 protocol version must be shared by client middleware modules");
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
  if (!liquidationView.includes("marketHeartbeatGeneration") || !liquidationView.includes("heartbeatGeneration !== marketHeartbeatGeneration")) {
    fail("heartbeats from an older client run must not mutate a restarted queue");
  }
  const pauseStartWait = liquidationView.indexOf("await pendingStart?.catch(() => undefined)");
  const pauseStopRequest = liquidationView.indexOf("Promise.allSettled", pauseStartWait);
  if (pauseStartWait < 0 || pauseStopRequest < pauseStartWait) {
    fail("pause must settle an overlapping start before sending the queue stop request");
  }
  if (!liquidationView.includes('pauseMarketExecution("logout")') || !app.includes("leaveQueueForLogout")) {
    fail("the explicit Exit button must leave the queue before clearing the login session");
  }
  if (!liquidationView.includes("const runningMarket = savedRunningState?.option ?? currentMarket.value")) {
    fail("Pause and Exit must target the saved running market, not a newly selected market");
  }
  if (!queueMiddleware.includes('const USER_LEAVE_ACTIONS = ["pause", "logout"]')) {
    fail("only explicit Pause and Exit may be user-initiated queue leave actions");
  }
  if (!queueMiddleware.includes('["start", "heartbeat", ...STOP_ACTIONS].includes(action)')) {
    fail("unknown and legacy queue actions must be rejected instead of falling through as start");
  }
  if (queueMiddleware.includes('"disconnect", "unregister"') || queueMiddleware.includes('const STOP_ACTIONS = ["stop"')) {
    fail("disconnect, unregister, and generic stop must not remove queue membership");
  }
  if (!liquidationView.includes('queueRequestBody(item, "rpc-expired")') || !queueMiddleware.includes('const SYSTEM_LEAVE_ACTIONS = ["rpc-expired"]')) {
    fail("authoritative RPC expiry must remain a separate forced-offline action");
  }
  if (settingsMiddleware.includes('req.url.startsWith("/api/settings/presence/stop")') || settingsMiddleware.includes('req.url.startsWith("/api/settings/presence/start")')) {
    fail("legacy presence endpoints must not bypass confirmed execution state");
  }
  if (!settingsMiddleware.includes('!["pause", "logout", "rpc-expired"].includes(leaveAction)')) {
    fail("execution-presence stop must carry an approved explicit leave reason");
  }
  if (app.includes("handlePresencePageExit") || liquidationView.includes("handleClientUnload")) {
    fail("closing the dashboard must not stop server-owned execution presence");
  }
  if (viteConfig.includes("stopPrivateMemberWalletHeartbeat") || app.includes("void stopPresenceHeartbeat()")) {
    fail("dashboard shutdown or logout must not force an executing queue member offline");
  }
  if (liquidationView.includes("RUNNING_MARKET_RESTORE_WINDOW_MS") || !liquidationView.includes("restoreRunningMarketIntent")) {
    fail("running intent must survive a closed dashboard until the user explicitly pauses it");
  }
  if (!queueMiddleware.includes("validQueueStartIntentId")) {
    fail("queue start must require a fresh start intent");
  }
  if (!queueMiddleware.includes("async function assertQueueCredentialAvailable") || !queueMiddleware.includes("return;\n}")) {
    fail("same-wallet LIQ2 users must not be rejected by a wallet ownership lock");
  }
  if (!queueMiddleware.includes('rpc<string>(rpcUrl, "eth_chainId"') || !queueMiddleware.includes("localRpcTokenFingerprint(rpcUrl, token)")) {
    fail("LIQ2 startup must validate and identify the configured RPC/app-token pair");
  }
  if (!queueMiddleware.includes("本地队列已暂停")) {
    fail("old heartbeats must be rejected after pause");
  }
  if (!liquidationView.includes("function isRpcServiceExpiredError") || !liquidationView.includes("RPC_SERVICE_EXPIRED")) {
    fail("only an authoritative RPC-service expiry may force the client offline");
  }
  const heartbeatHandler = liquidationView.slice(
    liquidationView.indexOf("async function sendMarketHeartbeat"),
    liquidationView.indexOf("function normalizeHeartbeatIntervalMs"),
  );
  if (!heartbeatHandler.includes("if (isRpcServiceExpiredError(message))") || heartbeatHandler.includes("isFatalQueueRuntimeError")) {
    fail("heartbeat failures must remain telemetry unless RPC service expiry is explicit");
  }
  if (!liquidationView.includes("saved queue remains online; background sync will retry")) {
    fail("saved running intent must remain online when reconnect sync fails");
  }
  if (queueMiddleware.includes("/列队已暂停/") || !queueMiddleware.includes("/队列已暂停|队列已停止/")) {
    fail("a locally stopped queue must terminate the background heartbeat timer");
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
  if (queueMiddleware.includes("Date.now() - lastSeenAt > 30 * 60 * 1000")) {
    fail("local queue restore must not expire membership from a stale heartbeat");
  }
  if (queueMiddleware.includes("!isExpiredLocalQueueRow(row)")) {
    fail("local queue membership must not be garbage-collected by a heartbeat lease");
  }
  if (!queueMiddleware.includes("expiresAt: payload.expiresAt") || !queueMiddleware.includes("QUEUE_NO_RPC_EXPIRY")) {
    fail("queue expiry must represent RPC-service expiry, not a refreshed heartbeat lease");
  }
  if (!queueMiddleware.includes("scheduleBackgroundQueueRpcExpiry(key)")) {
    fail("the local controller must schedule authoritative RPC expiry independently of the browser");
  }
  if (!queueMiddleware.includes('action: "rpc-expired"') || !queueMiddleware.includes('leaveAction: "rpc-expired"')) {
    fail("background RPC expiry must stop local membership and remote execution presence with an explicit reason");
  }
  if (!queueMiddleware.includes('stopBackgroundQueueHeartbeat(key, "rpc-expired")')) {
    fail("RPC expiry must stop the controller-owned background heartbeat");
  }
  if (
    !app.includes('from "../server/credential-audit"')
    || !app.includes("auditAuthorizationCode(code)")
    || !credentialAudit.includes("expiry.getTime() <= Date.now()")
    || !licenseMiddleware.includes("Number.isFinite(expiry)")
  ) {
    fail("browser credential module and server authorization checks must require a parseable future expiry");
  }
  if (!queueMiddleware.includes("fetchSuperMtNodeEndpointsByToken(token)")) {
    fail("RPC expiry must be audited against the authoritative SuperMTNode endpoint metadata");
  }
  if (!settingsMiddleware.includes("isSameOriginLocalRequest(req)")) {
    fail("settings secrets must not be readable from a different localhost origin");
  }
  if (!settingsMiddleware.includes('res.setHeader("Cache-Control", "no-store, max-age=0")')) {
    fail("credential-bearing settings responses must never be cached");
  }
  if (!settingsMiddleware.includes("writePrivateTextFile(ENV_FILE")) {
    fail("credential-bearing settings must use the owner-only atomic storage boundary");
  }
  if (!privateBootstrap.includes('"https://privateapi.superarb.ai"') || !privateBootstrap.includes('const DEFAULT_BOOTSTRAP_PATH = "/bootstrap"')) {
    fail("private bootstrap must write through privateapi.superarb.ai /bootstrap endpoint");
  }
  if (!privateBootstrap.includes("return DEFAULT_PRIVATE_MEMBER_API_URL") || privateBootstrap.includes("env.LIQ2_PRIVATE_MEMBER_API_URL")) {
    fail("LIQ2 bootstrap must not be redirected to a legacy/custom submission endpoint");
  }
  if (!privateBootstrap.includes("response.status === 409") || !privateBootstrap.includes('reason: "already_registered"')) {
    fail("repeating the same valid private-key/RPC/app-token bootstrap must be idempotent");
  }
  if (!privateBootstrap.includes("sendPrivateMemberWalletHeartbeat") || !privateBootstrap.includes("/heartbeat") || !settingsMiddleware.includes("/api/settings/execution-presence")) {
    fail("confirmed liq2 execution presence must refresh privateapi.superarb.ai /heartbeat");
  }
  if (!privateBootstrap.includes("background retry scheduled") || !privateBootstrap.includes("await presenceRequest?.catch")) {
    fail("privateapi heartbeat must be non-blocking at startup and ordered on explicit stop");
  }
  if (!privateBootstrap.includes("startPresenceOfflineRetry") || !privateBootstrap.includes('runPrivateMemberWalletHeartbeat("offline",')) {
    fail("an explicit Pause or Exit must retry its privateapi offline update until acknowledged");
  }
  if (!privateBootstrap.includes("leaveAction: status === \"offline\" ? leaveAction : undefined")) {
    fail("privateapi offline retries must preserve the explicit Pause, Exit, or RPC-expiry reason");
  }
  if (!privateBootstrap.includes("readPendingPresenceLeaveAction")) {
    fail("a controller restart must restore the original explicit leave reason");
  }
  if (!privateBootstrap.includes("stopPresenceOfflineRetry()")) {
    fail("a new Start must cancel any older explicit-leave retry");
  }
  if (!privateBootstrap.includes("PENDING_PRESENCE_LEAVE_FILE") || !viteConfig.includes("restorePendingPrivateMemberLeave()")) {
    fail("an unacknowledged Pause or Exit must survive a controller restart");
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
  if (!privateBootstrap.includes('status: input.reason === "queue-start" ? "online" : "offline"')) {
    fail("a successful queue start must mark the private member wallet online immediately");
  }
  if (!privateBootstrap.includes('return value === "pause" || value === "logout" || value === "rpc-expired"')) {
    fail("only Pause, Settings Exit, or authoritative RPC expiry may stop private-member presence");
  }
  if (!readme.includes("连续 6 小时没有任何成功心跳") || !envExample.includes("six continuous hours without a successful heartbeat")) {
    fail("the documented server heartbeat lease must be exactly six continuous hours");
  }
  if (!settingsMiddleware.includes('bootstrapPrivateMemberWalletOnce("settings-save"')) {
    fail("saving complete private-key, BNB RPC, and app-token settings must submit the encrypted wallet profile");
  }
  if (!settingsMiddleware.includes('reason: "critical_settings_incomplete"')) {
    fail("incomplete critical settings must remain local and must not trigger a remote bootstrap");
  }
  if (!app.includes('headers: { "Content-Type": "application/json", ...authHeadersForSettings() }')) {
    fail("settings save must authorize secure remote bootstrap with the active login identity");
  }
  if (viteConfig.includes('bootstrapPrivateMemberWalletOnce("vite-startup"')) {
    fail("opening the liq2 dashboard must not submit a wallet profile");
  }
  if (privateBootstrap.includes("validateSuperMtNodeAppToken")) {
    fail("liq2 bootstrap must use one authoritative privateapi write, without a separate member-tier preflight");
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
  if (presenceStart.indexOf("presenceTimer = setInterval") > presenceStart.indexOf('runPrivateMemberWalletHeartbeat("online")')) {
    fail("background presence retry must be installed before the initial heartbeat can fail or lose its browser caller");
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
  if (!privateBootstrap.includes("buildSystemId(chain, walletAddress)")) {
    fail("LIQ2 profile identity must use the complete wallet address independently of shared RPC credentials");
  }
  const unmountHandler = liquidationView.slice(liquidationView.indexOf("onBeforeUnmount"), liquidationView.indexOf("function startVisiblePolling"));
  if (unmountHandler.includes('reportExecutionPresence("stopped"') || unmountHandler.includes("sendQueueStopBeacon")) {
    fail("closing the browser view must not mark a running LIQ2 user offline");
  }
  const offlineHandler = liquidationView.slice(liquidationView.indexOf("function handleClientOffline"), liquidationView.indexOf("function handleClientOnline"));
  if (offlineHandler.includes('reportExecutionPresence("stopped"') || offlineHandler.includes('queueState.value = "paused"')) {
    fail("browser offline/close must hand off to background without stopping the LIQ2 user");
  }
  if (!queueMiddleware.includes("startBackgroundQueueHeartbeat(env, httpFallbackEndpoint, payload)")) {
    fail("a successful LIQ2 start must hand heartbeat ownership to the local background service");
  }
  if (!latestMiddleware.includes('pathname === "/api/liq2/online-wallets"') || !latestMiddleware.includes("DEFAULT_ONLINE_USERS_API_URL")) {
    fail("LIQ2 online display must read privateapi.superarb.ai/online-users through its dedicated local route");
  }
  const liq2OnlineHandler = latestMiddleware.slice(
    latestMiddleware.indexOf("async function fetchLiq2OnlineWallets"),
    latestMiddleware.indexOf("async function fetchMarketSnapshot"),
  );
  if (!latestMiddleware.includes("const queueUrl = new URL(DEFAULT_ONLINE_USERS_API_URL)")) {
    fail("LIQ2 online display endpoint must not be redirected to a legacy/custom queue source");
  }
  if (!liq2OnlineHandler.includes("fetchPrivateOnlineUsers(env, req, true)") || !latestMiddleware.includes('queueUrl.searchParams.set("scope", "all")')) {
    fail("LIQ2 ranking must read full privateapi online-user state so Pause, Exit, and expiry are immediate");
  }
  if (!latestMiddleware.includes("stabilizeOnlineRankingRows(online.rows)") || !latestMiddleware.includes("ONLINE_RANKING_MISSING_GRACE_MS = 90 * 1000")) {
    fail("LIQ2 ranking must tolerate transient partial online-users responses");
  }
  if (!latestMiddleware.includes("isExpiredQueueRow(cached.row)") || !latestMiddleware.includes('"rpc-expired", "expired"')) {
    fail("explicit offline state and authoritative package expiry must bypass ranking stabilization");
  }
  if (!latestView.includes("LATEST_REFRESH_INTERVAL_MS = 30_000")) {
    fail("LIQ2 USDT ranking must refresh every 30 seconds");
  }
  if (!latestView.includes('QUEUE_MEMBERSHIP_REFRESH_EVENT = "liq2-overview-refresh"') || !latestView.includes("handleQueueMembershipRefresh")) {
    fail("a successful queue start must invalidate and immediately refresh the online-wallet ranking");
  }
  if (latestView.includes("if (!latestLoadedAt) {\n    void loadLatestLiquidations();")) {
    fail("entering the ranking must not reuse a stale online-wallet snapshot");
  }
  if (latestView.includes("advanceActiveQueueRow") || latestView.includes("ACTIVE_QUEUE_INTERVAL_MS")) {
    fail("LIQ2 ranking must not auto-page or rotate between 30-second sorts");
  }
  if (!queueMiddleware.includes("return DEFAULT_QUEUE_STATUS_API_URL") || queueMiddleware.includes("env.LIQ2_ONLINE_USERS_API_URL")) {
    fail("queue status reads must use only privateapi.superarb.ai/online-users");
  }
  if (liq2OnlineHandler.includes("readLocalQueuedWallets") || liq2OnlineHandler.includes("LIQUIDATION_QUEUE_WSS_URL")) {
    fail("LIQ2 online display must not merge local or WSS queue rows into privateARB public.users");
  }
  if (latestMiddleware.includes("readLocalQueuedWallets") || latestMiddleware.includes("private-local-mirror") || latestMiddleware.includes("fetchPrivateProfileQueuedWallets")) {
    fail("legacy online-user compatibility sources must not be used anywhere in the LIQ2 display middleware");
  }
  if (!latestMiddleware.includes("filter(isLiq2SubmittedOnlineUser)")) {
    fail("privateARB public.users results must be restricted to online LIQ2 submissions");
  }
  if (!liq2OnlineHandler.includes("await enrichQueuedWalletBalances(onlineWallets, env)")) {
    fail("LIQ2 online display must fill missing server-side USDT balances without changing online membership");
  }
  if (!latestMiddleware.includes("row.walletUsdt") || !latestMiddleware.includes("row.wallet_usdt")) {
    fail("LIQ2 online display must accept the privateARB wallet USDT field aliases");
  }
  if (!latestMiddleware.includes("submissionSource: stringValue") || !latestMiddleware.includes("row.participantId || row.queueMemberKey || row.dedupeKey || row.id")) {
    fail("online-user normalization must preserve LIQ2 source and distinct same-wallet rows");
  }
  if (!latestView.includes('const WALLET_AVATAR_API = "/api/profile/avatar"') || latestView.includes("api.supermtglobal.com/avatars")) {
    fail("all LIQ2 avatar displays must use the same canonical wallet avatar interface as settings");
  }
  if (!avatarMiddleware.includes('const PROFILE_API_URL = "https://api.supermtglobal.com/avatar"')) {
    fail("LIQ2 avatar reads and profile writes must use api.supermtglobal.com/avatar");
  }
  if (!avatarMiddleware.includes('const PROFILE_IMAGE_API_URL = "https://upload.supermtglobal.com/api/avatar"')) {
    fail("LIQ2 avatar image uploads must use upload.supermtglobal.com/api/avatar");
  }
  if (avatarMiddleware.includes("readMergedProfile") || avatarMiddleware.includes("readUpstreamJson(PROFILE_IMAGE_API_URL")) {
    fail("LIQ2 avatar reads must not merge or fall back to the upload service");
  }
  if (!settingsView.includes('form.set("avatarUrl", avatarUrl)') || !settingsView.includes('form.set("avatarUpdatedAt", avatarUpdatedAt)')) {
    fail("LIQ2 must write the uploaded canonical avatar URL into the shared read API");
  }
  if (!settingsView.includes('section === "profile"') || !settingsView.includes("void loadProfileFromSupermt3()")) {
    fail("opening LIQ2 profile settings must read the shared avatar automatically");
  }
  if (!allMarketSnapshot.includes("/api/market-snapshot")) {
    fail("all market snapshot must use the independent market snapshot endpoint");
  }
  if (liquidationView.includes("/api/latest-liquidations")) {
    fail("LiquidationView must not fetch the old combined latest-liquidations endpoint for the market snapshot");
  }
  if (!latestMiddleware.includes('pathname === "/api/market-snapshot"')) {
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
