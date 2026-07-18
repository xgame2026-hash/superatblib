<template>
  <span class="alert-sound-monitor" aria-hidden="true"></span>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted } from "vue";
import { playAlertSound, type AlertSoundId } from "../../audio/alert-sounds";

type OrderStatusGroup = "active" | "completed" | "failed" | "cancelled" | "unknown";
type SlotOrder = {
  id: string;
  orderNo: string;
  orderType: string;
  statusGroup: OrderStatusGroup;
};
type SlotsPayload = { ok?: boolean; orders?: SlotOrder[] };

const props = defineProps<{
  alertSounds: Record<"rewardReceived" | "slotAnchored", AlertSoundId | string>;
}>();

const AUTH_CODE_KEY = "superarb-auth-code-v1.6.5";
const AUTH_CODE_SESSION_KEY = "superarb-auth-code-session-v1.6.5";
const REFRESH_INTERVAL_MS = 15_000;

let refreshTimer = 0;
let loadController: AbortController | undefined;
let hasLoadedOrders = false;
let knownOrders = new Map<string, Pick<SlotOrder, "orderType" | "statusGroup">>();

onMounted(() => {
  void loadOrders();
  refreshTimer = window.setInterval(() => void loadOrders(), REFRESH_INTERVAL_MS);
});

onBeforeUnmount(() => {
  if (refreshTimer) window.clearInterval(refreshTimer);
  loadController?.abort();
});

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
    if (!response.ok || payload.ok === false || !Array.isArray(payload.orders)) return;
    processOrders(payload.orders);
  } catch (error) {
    if ((error as { name?: string }).name !== "AbortError") {
      // Notification delivery must never interrupt the rest of the dashboard.
    }
  } finally {
    if (loadController === controller) loadController = undefined;
  }
}

function processOrders(orders: SlotOrder[]) {
  const nextOrders = new Map<string, Pick<SlotOrder, "orderType" | "statusGroup">>();
  let rewardReceived = false;
  let slotAnchored = false;

  for (const order of orders) {
    const id = order.orderNo || order.id;
    if (!id) continue;
    const previous = knownOrders.get(id);
    if (hasLoadedOrders) {
      if (isRewardOrderType(order.orderType) && !previous) rewardReceived = true;
      if (isTradeOrderType(order.orderType) && order.statusGroup === "completed" && previous?.statusGroup !== "completed") {
        slotAnchored = true;
      }
    }
    nextOrders.set(id, { orderType: order.orderType, statusGroup: order.statusGroup });
  }

  knownOrders = nextOrders;
  hasLoadedOrders = true;
  if (rewardReceived) playAlertSound("rewardReceived", props.alertSounds.rewardReceived);
  if (slotAnchored) playAlertSound("slotAnchored", props.alertSounds.slotAnchored);
}

function authHeaders(): Record<string, string> {
  const authCode = sessionStorage.getItem(AUTH_CODE_SESSION_KEY)?.trim() || localStorage.getItem(AUTH_CODE_KEY)?.trim();
  return { accept: "application/json", ...(authCode ? { "x-supermtnode-auth-code": authCode } : {}) };
}

function isTradeOrderType(orderType: string) {
  return ["buy_xbch", "sell_xbch", "legacy_trade"].includes(orderType);
}

function isRewardOrderType(orderType: string) {
  return ["reward", "rewards", "profit", "paid_profit", "payout", "rebate"].includes(orderType);
}
</script>

<style scoped>
.alert-sound-monitor { display: none; }
</style>
