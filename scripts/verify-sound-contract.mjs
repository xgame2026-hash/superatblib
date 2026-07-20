import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(root, path), "utf8");
const app = read("src/App.vue");
const soundModule = read("src/audio/alert-sounds.ts");
const settings = read("src/features/settings/SettingsView.vue");
const monitor = read("src/features/alerts/AlertSoundMonitor.vue");
const soundManagement = read("src/audio/sound-management.ts");
const slotManagement = read("src/features/slots/slot-order-management.ts");
const slotsMiddleware = read("server/slots-orders-middleware.ts");

const failures = [];
const requireSource = (source, snippet, message) => {
  if (!source.includes(snippet)) failures.push(message);
};

requireSource(app, "setAlertSoundsEnabled(enabled)", "global switch must control configured alert sounds");
requireSource(app, "const played = await confirmAlertSoundPlayback(\"upgradeRequired\"", "upgrade announcement must confirm real playback");
requireSource(app, "if (!played) return", "blocked upgrade audio must remain pending");
requireSource(app, "document.addEventListener(\"pointerdown\", retryPendingUpgradeAnnouncement)", "blocked upgrade audio must retry after user interaction");
requireSource(app, "document.addEventListener(\"pointerdown\", retryPendingUpdateCompletion)", "blocked completion audio must retry after user interaction");
requireSource(app, "pending.played = true", "a started completion sound must not replay while acknowledgement retries");
requireSource(app, "localStorage.setItem(GITHUB_UPDATE_ANNOUNCED_KEY, serializedTarget)", "a played upgrade must be marked announced");
requireSource(app, "stopLaunchAudios()", "global switch must stop active launch sounds");
requireSource(app, ":sound-enabled=\"launchSoundEnabled\"", "settings previews must receive the global switch state");
requireSource(soundModule, "if (!alertSoundsEnabled) return null", "configured alerts must stay silent while globally muted");
requireSource(soundModule, "activeAlertSounds.clear()", "muting must stop active configured alerts");
requireSource(soundModule, "export async function confirmAlertSoundPlayback", "callers must be able to confirm browser playback");
requireSource(monitor, "slotManager.processSnapshot(snapshot)", "order snapshots must pass through the verified event manager");
requireSource(monitor, "soundManager.emit(notification)", "verified order events must pass through central sound delivery");
requireSource(monitor, "confirmAlertSoundPlayback(kind, soundId)", "order alerts must confirm real browser playback");
requireSource(monitor, "soundManager.retryPending()", "blocked or muted events must retry after user interaction");
requireSource(monitor, "slotManager.acknowledge(acknowledged)", "order events must be acknowledged only after sound delivery");
requireSource(slotManagement, "order.rewardVerified === true", "reward alerts must require a server-verified reward proof");
requireSource(slotManagement, 'order.rewardRecordSource === "tx2"', "reward alerts must require the tx2 record source");
requireSource(slotManagement, 'order.rewardPipelineSource === "treasury-compensation-relayer"', "reward alerts must require the tx2 payout pipeline");
requireSource(slotManagement, "const baselineCreated = !state.initialized", "the first snapshot must baseline historical events");
requireSource(slotManagement, "state.pendingNotifications.push", "unseen order events must remain pending until delivery");
requireSource(slotManagement, 'source: "order_created"', "slot sound must trigger on first order creation");
if (slotManagement.includes('order.statusGroup === "completed"')) failures.push("slot sound must not wait for order completion");
requireSource(soundManagement, "if (!played) return result(event, \"pending\"", "blocked browser audio must stay pending");
requireSource(soundManagement, "markAnnounced(event)", "sound events must be announced only after playback starts");
requireSource(soundManagement, "persisted.pending", "pending sounds must survive a client restart");
requireSource(slotsMiddleware, "transferVerified && payoutEventVerified", "reward proof must require both USDT delivery and the tx2 payout event");
requireSource(slotsMiddleware, 'order.rewardRecordSource === "tx2"', "reward proof must originate from tx2");
requireSource(slotsMiddleware, "COMPENSATION_PAID_OUT_TOPIC", "reward proof must bind the tx2 compensation request on-chain");
requireSource(slotsMiddleware, "readTx2TreasuryPool", "reward proof must load tx2's authoritative Treasury contract pool");
requireSource(slotsMiddleware, "treasuryPool.has(order.rewardCounterparty.toLowerCase())", "reward payer must belong to tx2's current Treasury pool");
requireSource(slotsMiddleware, "amount === expectedAmount", "reward proof amount must match the tx2 record exactly");
requireSource(slotsMiddleware, 'const PRIVATE_ARB_WALLET_ACTIVITY_URL = "https://privateapi.superarb.ai/wallet-activity"', "slots must use the fixed privateAPI wallet activity endpoint");
if (slotsMiddleware.includes("env.PRIVATE_ARB_WALLET_ACTIVITY_URL") || slotsMiddleware.includes("env.LIQ2_PRIVATE_MEMBER_API_URL")) {
  failures.push("slot activity endpoint must not be redirectable through deployment configuration");
}
requireSource(settings, "if (!props.soundEnabled) return", "alert previews must stay silent while globally muted");
requireSource(settings, "if (!enabled) stopAlertSoundPreview()", "muting must stop an active alert preview");

if (failures.length) {
  for (const failure of failures) console.error(`sound contract check failed: ${failure}`);
  process.exit(1);
}

console.log("sound contract check passed");
