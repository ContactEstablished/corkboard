<script setup lang="ts">
import type { Component } from 'vue'
import HudModal from './HudModal.vue'

/** Near-full-screen modal chrome shared by Grocery, Chores, Messages and Photos. */
defineProps<{ title: string; icon: Component; open: boolean }>()
defineEmits<{ close: [] }>()
</script>

<template>
  <HudModal :open="open" :title="title" size="full" :close-on-backdrop="false" @close="$emit('close')">
    <template #header>
      <div class="fm__head">
        <component :is="icon" class="fm__icon" aria-hidden="true" />
        <h2 class="fm__title hud-display">{{ title }}</h2>
        <div class="fm__actions"><slot name="actions" /></div>
      </div>
    </template>
    <slot />
  </HudModal>
</template>

<style scoped lang="scss">
.fm__head {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  flex: 1;
  min-width: 0;
}
.fm__icon {
  width: 1.9rem;
  height: 1.9rem;
  color: var(--hud-primary);
  filter: drop-shadow(0 0 0.4rem var(--hud-glow));
}
.fm__title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 600;
  letter-spacing: 0.16em;
}
.fm__actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.6rem;
}
</style>
