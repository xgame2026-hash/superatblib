<template>
  <div class="market-monitor">
    <span ref="typedTarget" class="market-monitor-line"></span>
  </div>
</template>

<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Typed from "typed.js";

const props = defineProps<{
  messages: string[];
}>();

const typedTarget = ref<HTMLElement | null>(null);
let typed: Typed | null = null;

onMounted(() => {
  void restartTyped();
});

onBeforeUnmount(() => {
  destroyTyped();
});

watch(
  () => props.messages,
  () => {
    void restartTyped();
  },
  { deep: true },
);

async function restartTyped() {
  await nextTick();
  destroyTyped();
  if (!typedTarget.value) return;

  typed = new Typed(typedTarget.value, {
    strings: normalizedMessages(),
    typeSpeed: 34,
    backSpeed: 0,
    backDelay: 3000,
    startDelay: 120,
    loop: true,
    showCursor: true,
    cursorChar: "",
    smartBackspace: false,
  });
}

function destroyTyped() {
  typed?.destroy();
  typed = null;
  if (typedTarget.value) typedTarget.value.textContent = "";
}

function normalizedMessages() {
  return props.messages.length > 0 ? props.messages : ["等待监控数据"];
}
</script>

<style scoped src="./MarketMonitor.css"></style>
