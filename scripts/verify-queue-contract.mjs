import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const stateUrl = process.env.VERIFY_STATE_URL || "https://state.supermtaccess.com";
const forbiddenUiTerms = ["数据库"];
const sourceDirs = ["src", "server"];

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

async function checkStateService() {
  const healthResponse = await fetch(`${stateUrl}/health`, { signal: AbortSignal.timeout(8_000) });
  if (!healthResponse.ok) {
    fail(`state health HTTP ${healthResponse.status}`);
    return;
  }
  const health = await healthResponse.json();
  if (health.ok !== true || health.version !== "1.5.7") fail("state health is not version 1.5.7");

  const leaderboardResponse = await fetch(`${stateUrl}/v1/leaderboard?chain=bnb&limit=5`, { signal: AbortSignal.timeout(8_000) });
  if (!leaderboardResponse.ok) {
    fail(`leaderboard HTTP ${leaderboardResponse.status}`);
    return;
  }
  const leaderboard = await leaderboardResponse.json();
  if (leaderboard.ok !== true) fail("leaderboard response is not ok");
  if (!Array.isArray(leaderboard.queuedWallets)) fail("leaderboard queuedWallets is not an array");
}

function checkClientContract() {
  const liquidationView = read("src/features/liquidation/LiquidationView.vue");
  const queueMiddleware = read("server/liquidation-queue-status-middleware.ts");
  const latestMiddleware = read("server/latest-liquidations-middleware.ts");

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
  if (!queueMiddleware.includes("列队已暂停")) {
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
  const sessionIndex = registerQueueStatus.indexOf("await syncStateQueueStatus(env");
  if (localStopIndex < 0 || localMissingIndex < 0 || sessionIndex < 0 || sessionIndex < localStopIndex || sessionIndex < localMissingIndex) {
    fail("old heartbeat guards must run before state queue sync");
  }
  if (!latestMiddleware.includes("supermt-state-leaderboard")) {
    fail("leaderboard must read from the state queue source");
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

await checkStateService().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
checkClientContract();
checkUserFacingText();

if (process.exitCode) process.exit(process.exitCode);
console.log("queue contract check passed");
