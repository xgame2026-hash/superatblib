<template>
  <aside class="icon-sidebar" aria-label="主导航">
    <el-tooltip v-for="item in items" :key="item.key" :content="item.label" placement="right">
      <button
        class="nav-icon"
        :class="{ active: activeKey === item.key, 'has-image': item.iconUrl }"
        :aria-label="item.label"
        type="button"
        @click="emit('select', item.key)"
      >
        <img v-if="item.iconUrl" class="nav-icon-img" :src="item.iconUrl" alt="" aria-hidden="true" />
        <el-icon v-else-if="item.icon"><component :is="item.icon" /></el-icon>
      </button>
    </el-tooltip>
  </aside>
</template>

<script setup lang="ts">
import type { Component } from "vue";

export type SidebarNavItem = {
  key: string;
  label: string;
  icon?: Component;
  iconUrl?: string;
};

defineProps<{
  items: SidebarNavItem[];
  activeKey: string;
}>();

const emit = defineEmits<{
  select: [key: string];
}>();
</script>

<style scoped src="./SidebarNav.css"></style>
