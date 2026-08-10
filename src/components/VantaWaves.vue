<template>
  <div ref="wavesElement" class="vanta-waves" aria-hidden="true"></div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import * as THREE from "three-vanta";
import WAVES from "vanta/dist/vanta.waves.min";

type VantaEffect = {
  destroy: () => void;
};

const wavesElement = ref<HTMLElement | null>(null);
let wavesEffect: VantaEffect | null = null;

onMounted(() => {
  if (!wavesElement.value) return;

  wavesEffect = WAVES({
    el: wavesElement.value,
    THREE,
    mouseControls: true,
    touchControls: true,
    gyroControls: false,
    minHeight: 200,
    minWidth: 200,
    scale: 1,
    scaleMobile: 1,
    color: 0x005588,
    shininess: 30,
    waveHeight: 15,
    waveSpeed: 1,
    zoom: 1,
  }) as VantaEffect;
});

onBeforeUnmount(() => {
  wavesEffect?.destroy();
  wavesEffect = null;
});
</script>

<style scoped>
.vanta-waves {
  width: 100%;
  height: 100%;
  background: #005588;
}
</style>
