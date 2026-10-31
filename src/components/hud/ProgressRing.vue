<script setup lang="ts">
import { computed, useId } from 'vue'

const props = withDefaults(defineProps<{ value: number; size?: string; stroke?: number }>(), { size: '7rem', stroke: 9 })

const R = 45
const C = 2 * Math.PI * R
const clamped = computed(() => Math.max(0, Math.min(1, props.value)))
const dash = computed(() => `${clamped.value * C} ${C}`)
const gid = useId()
</script>

<template>
  <div class="ring" :style="{ width: size, height: size }">
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <linearGradient :id="gid" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--hud-blue)" />
          <stop offset="1" stop-color="var(--hud-success)" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" :r="R" class="ring__track" :stroke-width="stroke" />
      <circle
        cx="50" cy="50" :r="R" class="ring__bar" :stroke="`url(#${gid})`" :stroke-width="stroke"
        :stroke-dasharray="dash" stroke-linecap="round" transform="rotate(-90 50 50)"
      />
    </svg>
    <div class="ring__center"><slot /></div>
  </div>
</template>

<style scoped lang="scss">
.ring {
  position: relative;
  flex: none;
  svg {
    width: 100%;
    height: 100%;
    overflow: visible;
  }
}
.ring__track {
  fill: none;
  stroke: color-mix(in srgb, var(--hud-border) 55%, transparent);
}
.ring__bar {
  fill: none;
  filter: drop-shadow(0 0 3px color-mix(in srgb, var(--hud-glow) 60%, transparent));
  transition: stroke-dasharray 0.6s ease;
}
.ring__center {
  position: absolute;
  inset: 0;
  display: grid;
  place-content: center;
  text-align: center;
}
</style>
