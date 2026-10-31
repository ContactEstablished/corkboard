<script setup lang="ts">
/** Compact, touch-sized icon button (48px+ hit area). `label` is required for a11y. */
defineProps<{ label: string; active?: boolean; disabled?: boolean }>()
</script>

<template>
  <button type="button" class="icon-btn" :class="{ 'icon-btn--active': active }" :aria-label="label" :disabled="disabled">
    <slot />
  </button>
</template>

<style scoped lang="scss">
.icon-btn {
  display: inline-grid;
  place-items: center;
  min-width: var(--hud-touch-min);
  min-height: var(--hud-touch-min);
  padding: 0;
  border: 1px solid transparent;
  border-radius: 50%;
  background: transparent;
  color: var(--hud-primary);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s, transform 0.1s;

  :deep(svg) {
    width: 1.5rem;
    height: 1.5rem;
  }
  &:active:not(:disabled) {
    transform: scale(0.92);
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
  &--active {
    border-color: var(--hud-border-bright);
    background: color-mix(in srgb, var(--hud-primary) 12%, transparent);
  }
  &:disabled {
    opacity: 0.4;
  }
}
</style>
