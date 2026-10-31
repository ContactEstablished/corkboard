<script setup lang="ts">
withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
    size?: 'md' | 'lg'
    block?: boolean
    disabled?: boolean
  }>(),
  { variant: 'secondary', size: 'md' },
)
</script>

<template>
  <button type="button" class="hud-btn" :class="[`hud-btn--${variant}`, `hud-btn--${size}`, { 'hud-btn--block': block }]" :disabled="disabled">
    <span v-if="$slots.icon" class="hud-btn__icon"><slot name="icon" /></span>
    <span class="hud-btn__label"><slot /></span>
  </button>
</template>

<style scoped lang="scss">
.hud-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.55rem;
  min-height: var(--hud-touch-min);
  padding: 0 1.4rem;
  border-radius: 0.8rem;
  border: 1px solid var(--hud-border-bright);
  background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
  color: var(--hud-text);
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: transform 0.1s, background 0.15s, box-shadow 0.15s;

  &--lg {
    min-height: 3.75rem;
    padding: 0 1.8rem;
    font-size: 1.1rem;
  }
  &--block {
    width: 100%;
  }
  &:active:not(:disabled) {
    transform: scale(0.97);
  }
  &:disabled {
    opacity: 0.45;
    cursor: default;
  }

  &--primary {
    border-color: color-mix(in srgb, var(--hud-primary) 70%, white);
    background: linear-gradient(180deg, color-mix(in srgb, var(--hud-blue) 90%, white), var(--hud-blue-deep));
    box-shadow: 0 0 1rem color-mix(in srgb, var(--hud-glow) 35%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.25);
    &:active:not(:disabled) {
      box-shadow: 0 0 0.4rem color-mix(in srgb, var(--hud-glow) 45%, transparent);
    }
  }
  &--ghost {
    border-color: transparent;
    background: transparent;
    color: var(--hud-primary);
  }
  &--danger {
    border-color: var(--hud-danger);
    background: color-mix(in srgb, var(--hud-danger) 22%, var(--hud-panel));
    color: var(--hud-text);
  }
}

.hud-btn__icon {
  display: inline-flex;
  :deep(svg) {
    width: 1.3rem;
    height: 1.3rem;
  }
}
</style>
