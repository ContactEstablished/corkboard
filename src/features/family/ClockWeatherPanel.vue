<script setup lang="ts">
import { MapPin } from 'lucide-vue-next'
import { computed } from 'vue'
import HudPanel from '@/components/hud/HudPanel.vue'
import { WEATHER_ICONS } from '@/features/weather/weatherIcon'
import { useClockStore } from '@/stores/clock'
import { useWeatherStore } from '@/stores/weather'
import { clockParts, formatLongDate, parseISODate } from '@/utils/date'

const clock = useClockStore()
const weather = useWeatherStore()
const parts = computed(() => clockParts(clock.now))
const date = computed(() => formatLongDate(clock.now))
const wx = computed(() => weather.snapshot)
const dow = (iso: string) => parseISODate(iso).toLocaleDateString('en-US', { weekday: 'short' })
const greeting = computed(() => {
  const h = clock.now.getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
})
</script>

<template>
  <HudPanel variant="primary" class="cw">
    <div class="cw__body">
      <div class="cw__top">
        <p class="cw__greet hud-display">{{ greeting }}</p>
        <span v-if="wx" class="cw__loc"><MapPin aria-hidden="true" />{{ wx.location }}</span>
      </div>
      <div class="cw__clock" data-testid="clock">
        {{ parts.time }}<small>{{ parts.meridiem }}</small>
      </div>
      <p class="cw__date">{{ date }}</p>

      <div class="cw__wx" v-if="wx" data-testid="weather">
        <component :is="WEATHER_ICONS[wx.condition]" class="cw__wx-icon" aria-hidden="true" />
        <div>
          <div class="cw__temp">{{ wx.temperature }}°</div>
          <div class="cw__cond">{{ wx.conditionLabel }}</div>
          <div class="cw__hl">H: {{ wx.high }}° &nbsp; L: {{ wx.low }}°</div>
        </div>
      </div>
      <div class="cw__wx cw__wx--off" v-else>Weather unavailable. Will retry when online.</div>

      <ul v-if="wx" class="cw__fc" aria-label="Forecast">
        <li v-for="d in wx.forecast.slice(0, 3)" :key="d.date">
          <span>{{ dow(d.date) }}</span>
          <component :is="WEATHER_ICONS[d.condition]" aria-hidden="true" />
          <span>{{ d.high }}°</span>
        </li>
      </ul>
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.cw__body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  flex: 1;
  min-height: 0;
  padding: 0.3rem 0.4rem;
}
.cw__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.cw__greet {
  margin: 0;
  font-size: 0.68rem;
  letter-spacing: 0.3em;
  color: var(--hud-primary);
}
.cw__clock {
  font-size: 4.8rem;
  font-weight: 300;
  line-height: 1;
  letter-spacing: -0.02em;
  color: color-mix(in srgb, var(--hud-primary) 28%, white);
  text-shadow: 0 0 1.4rem color-mix(in srgb, var(--hud-glow) 55%, transparent);
  font-variant-numeric: tabular-nums;
  small {
    margin-left: 0.5rem;
    font-size: 1.5rem;
    font-weight: 500;
    letter-spacing: 0;
    color: var(--hud-text);
    text-shadow: none;
  }
}
.cw__date {
  margin: 0.25rem 0 0.7rem;
  font-size: 1.25rem;
}
.cw__wx {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  padding-top: 0.7rem;
  border-top: 1px solid var(--hud-border);
  &--off {
    color: var(--hud-text-dim);
    font-size: 0.9rem;
  }
}
.cw__wx-icon {
  width: 3.4rem;
  height: 3.4rem;
  color: var(--hud-warning);
  filter: drop-shadow(0 0 0.6rem color-mix(in srgb, var(--hud-warning) 45%, transparent));
}
.cw__temp {
  font-size: 2.4rem;
  font-weight: 500;
  line-height: 1;
}
.cw__cond {
  font-size: 1.05rem;
}
.cw__hl {
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.cw__loc {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.7rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hud-text-dim);
  svg {
    width: 0.9rem;
    height: 0.9rem;
    color: var(--hud-primary);
  }
}
.cw__fc {
  display: flex;
  gap: 0.5rem;
  margin: 0.6rem 0 0;
  padding: 0;
  list-style: none;
  li {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.35rem;
    padding: 0.25rem;
    border-radius: 0.5rem;
    background: color-mix(in srgb, var(--hud-surface) 60%, transparent);
    font-size: 0.8rem;
    color: var(--hud-text-dim);
    svg {
      width: 1.1rem;
      height: 1.1rem;
      color: var(--hud-primary);
    }
  }
}
</style>
