<script setup lang="ts" generic="T extends string">
/** Touch-friendly segmented control (Day/Week/Month, Today/Tomorrow, filters). */
defineProps<{ options: { value: T; label: string }[]; label: string; compact?: boolean }>()
const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="seg" :class="{ 'seg--compact': compact }" role="radiogroup" :aria-label="label">
    <button
      v-for="o in options"
      :key="o.value"
      type="button"
      role="radio"
      class="seg__item"
      :class="{ 'seg__item--on': model === o.value }"
      :aria-checked="model === o.value"
      @click="model = o.value"
    >
      {{ o.label }}
    </button>
  </div>
</template>

<style scoped lang="scss">
.seg {
  display: inline-flex;
  padding: 0.2rem;
  gap: 0.15rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: color-mix(in srgb, var(--hud-bg-deep) 70%, transparent);
}
.seg--compact .seg__item {
  padding: 0 0.7rem;
  font-size: 0.8rem;
}
.seg__item {
  white-space: nowrap;
  min-height: calc(var(--hud-touch-min) - 0.9rem);
  padding: 0 1.1rem;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--hud-text-dim);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  &--on {
    background: linear-gradient(180deg, var(--hud-blue), var(--hud-blue-deep));
    color: var(--hud-text);
    box-shadow: 0 0 0.8rem color-mix(in srgb, var(--hud-glow) 40%, transparent);
  }
}
</style>
