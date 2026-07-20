<template>
  <span class="alert-sound-monitor" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import { confirmAlertSoundPlayback, normalizeAlertSoundId, type AlertSoundId } from "../../audio/alert-sounds";
import {
  createSoundManager,
  type ManagedSoundEvent,
  type PersistedSoundState,
} from "../../audio/sound-management";
import {
  createSlotOrderManager,
  type SlotOrderManager,
  type SlotOrderPersistedState,
  type SlotOrdersSnapshot,
} from "../slots/slot-order-management";

type SlotsPayload = Partial<SlotOrdersSnapshot> & { ok?: boolean };

const props = defineProps<{
  alertSounds: Record<"rewardReceived" | "slotAnchored", AlertSoundId | string>;
  soundEnabled: boolean;
}>();

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const REFRESH_INTERVAL_MS = 15_000;
const SOUND_STATE_KEY = "liq2-sound-management-state-v1";
const SLOT_STATE_KEY = "liq2-slot-order-management-state-v1";

let refreshTimer = 0;
let loadController: AbortController | undefined;
let slotManager: SlotOrderManager | undefined;
let activeWalletAddress = "";
let deliveryInFlight = false;

const soundManager = createSoundManager({
  store: {
    load: () => readStoredState<PersistedSoundState>(SOUND_STATE_KEY),
    save: (state) => writeStoredState(SOUND_STATE_KEY, state),
  },
  settings: currentSoundSettings(),
  player: async (kind, soundId) => confirmAlertSoundPlayback(kind, soundId),
});

onMounted(() => {
  void loadOrders();
  refreshTimer = window.setInterval(() => void loadOrders(), REFRESH_INTERVAL_MS);
  document.addEventListener("pointerdown", retryPendingSounds);
  document.addEventListener("keydown", retryPendingSounds);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  loadController?.abort();
  document.removeEventListener("pointerdown", retryPendingSounds);
  document.removeEventListener("keydown", retryPendingSounds);
});

watch(
  () => [props.soundEnabled, props.alertSounds.rewardReceived, props.alertSounds.slotAnchored] as const,
  () => {
    soundManager.updateSettings(currentSoundSettings());
    if (props.soundEnabled) window.setTimeout(retryPendingSounds, 0);
  },
);

async function loadOrders() {
  loadController?.abort();
  const controller = new AbortController();
  loadController = controller;
  try {
    const response = await fetch("/api/slots/orders", {
      cache: "no-store",
      headers: authHeaders(),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as SlotsPayload;
    if (
      !response.ok
      || payload.ok !== true
      || !Array.isArray(payload.orders)
      || typeof payload.walletAddress !== "string"
      || typeof payload.updatedAt !== "string"
    ) return;
    processSnapshot(payload as SlotOrdersSnapshot);
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") {
      // Notification delivery must never interrupt the rest of the dashboard.
    }
  } finally {
    if (loadController === controller) loadController = undefined;
  }
}

function processSnapshot(snapshot: SlotOrdersSnapshot) {
  const walletAddress = snapshot.walletAddress.trim().toLowerCase();
  if (!slotManager || activeWalletAddress !== walletAddress) {
    activeWalletAddress = walletAddress;
    slotManager = createSlotOrderManager({
      walletAddress,
      store: {
        load: () => readStoredState<SlotOrderPersistedState>(SLOT_STATE_KEY),
        save: (state) => writeStoredState(SLOT_STATE_KEY, state),
      },
    });
  }
  const result = slotManager.processSnapshot(snapshot);
  if (result.notifications.length) void deliverNotifications(result.notifications);
}

async function deliverNotifications(notifications: ManagedSoundEvent[]) {
  if (deliveryInFlight || !slotManager) return;
  deliveryInFlight = true;
  const acknowledged: string[] = [];
  try {
    for (const notification of notifications) {
      const result = await soundManager.emit(notification);
      if (result.status === "played" || result.status === "duplicate") acknowledged.push(result.occurrenceId);
    }
    if (acknowledged.length) slotManager.acknowledge(acknowledged);
  } finally {
    deliveryInFlight = false;
  }
}

function retryPendingSounds() {
  if (deliveryInFlight) return;
  void retryAndAcknowledge();
}

async function retryAndAcknowledge() {
  if (deliveryInFlight || !slotManager) return;
  deliveryInFlight = true;
  try {
    const results = await soundManager.retryPending();
    const acknowledged = results
      .filter((result) => result.status === "played" || result.status === "duplicate")
      .map((result) => result.occurrenceId);
    if (acknowledged.length) slotManager.acknowledge(acknowledged);
  } finally {
    deliveryInFlight = false;
  }
  const remaining = slotManager.getPendingNotifications();
  if (remaining.length) void deliverNotifications(remaining);
}

function currentSoundSettings() {
  return {
    enabled: props.soundEnabled,
    selections: {
      rewardReceived: normalizeAlertSoundId(props.alertSounds.rewardReceived),
      upgradeRequired: "sound_2" as const,
      upgradeCompleted: "sound_3" as const,
      slotAnchored: normalizeAlertSoundId(props.alertSounds.slotAnchored),
    },
  };
}

function readStoredState<T>(key: string): T | undefined {
  try {
    const value = localStorage.getItem(key);
    return value ? JSON.parse(value) as T : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredState(key: string, state: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // A storage failure leaves the in-memory delivery state intact for this run.
  }
}

function authHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return { accept: "application/json", ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}) };
}

</script>

<style scoped>
.alert-sound-monitor { display: none; }
</style>
