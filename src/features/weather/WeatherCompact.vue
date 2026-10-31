<script setup lang="ts">
import { computed } from 'vue'
import { useWeatherStore } from '@/stores/weather'
import { WEATHER_ICONS } from './weatherIcon'

const weather = useWeatherStore()
const icon = computed(() => (weather.snapshot ? WEATHER_ICONS[weather.snapshot.condition] : null))
</script>

<template>
  <div v-if="weather.snapshot" class="wx" :aria-label="`${weather.snapshot.temperature} degrees, ${weather.snapshot.conditionLabel}`" role="img">
    <component :is="icon" class="wx__icon" aria-hidden="true" />
    <span class="wx__temp">{{ weather.snapshot.temperature }}°</span>
  </div>
  <div v-else class="wx wx--empty" aria-label="Weather unavailable" role="img">--°</div>
</template>

<style scoped lang="scss">
.wx {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 1.5rem;
  font-weight: 600;
  &--empty {
    color: var(--hud-text-faint);
  }
}
.wx__icon {
  width: 2rem;
  height: 2rem;
  color: var(--hud-warning);
  filter: drop-shadow(0 0 0.4rem color-mix(in srgb, var(--hud-warning) 50%, transparent));
}
</style>
