<script setup lang="ts">
/** Decorative audio waveform. Animates only while `active`. */
withDefaults(defineProps<{ active?: boolean; bars?: number; flip?: boolean }>(), { bars: 22 })

const amp = (i: number) => 0.2 + 0.8 * Math.abs(Math.sin(i * 1.7 + 0.6))
</script>

<template>
  <div class="wave" :class="{ 'wave--active': active, 'wave--flip': flip }" aria-hidden="true">
    <span v-for="i in bars" :key="i" class="wave__bar" :style="{ '--i': i, '--amp': amp(flip ? bars - i : i) }" />
  </div>
</template>

<style scoped lang="scss">
.wave {
  display: flex;
  align-items: center;
  gap: 0.22rem;
  height: 3.4rem;
  flex: 1;
  min-width: 0;
  justify-content: center;
  // fade toward the outer edge
  mask-image: linear-gradient(90deg, transparent, #000 35%, #000 100%);
  &--flip {
    mask-image: linear-gradient(270deg, transparent, #000 35%, #000 100%);
  }
}
.wave__bar {
  width: 0.2rem;
  height: calc(0.35rem + var(--amp) * 0.6rem);
  border-radius: 99px;
  background: var(--hud-primary);
  opacity: 0.45;
  transition: height 0.3s;
  .wave--active & {
    opacity: 0.95;
    box-shadow: 0 0 0.4rem var(--hud-glow);
    animation: wave 1.1s ease-in-out infinite;
    animation-delay: calc(var(--i) * -0.09s);
  }
}
@keyframes wave {
  0%, 100% { height: calc(0.35rem + var(--amp) * 0.5rem); }
  50% { height: calc(0.8rem + var(--amp) * 2.2rem); }
}
@media (prefers-reduced-motion: reduce) {
  .wave--active .wave__bar {
    animation: none;
    height: calc(0.6rem + var(--amp) * 1.6rem);
  }
}
</style>
