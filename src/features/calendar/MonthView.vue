<script setup lang="ts">
import { CalendarPlus, Lightbulb } from 'lucide-vue-next'
import { computed } from 'vue'
import EventRow from '@/components/calendar/EventRow.vue'
import HudButton from '@/components/hud/HudButton.vue'
import type { CalendarEvent } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { formatDayHeading, isSameDay } from '@/utils/date'
import { eventAccent } from './layout'

defineEmits<{ open: [event: CalendarEvent]; add: [] }>()
const calendar = useCalendarStore()
const clock = useClockStore()
const family = useFamilyStore()

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MAX_DOTS = 4

const cells = computed(() =>
  calendar.monthDays.map((day) => {
    const events = calendar.onDay(day)
    return {
      day,
      inMonth: day.getMonth() === calendar.anchor.getMonth(),
      today: isSameDay(day, clock.today),
      selected: isSameDay(day, calendar.anchor),
      dots: events.slice(0, MAX_DOTS).map((e) => eventAccent(e, family.byId)),
      more: Math.max(0, events.length - MAX_DOTS),
      count: events.length,
    }
  }),
)
const selectedEvents = computed(() => calendar.onDay(calendar.anchor))
const label = (c: (typeof cells.value)[number]) =>
  `${c.day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}, ${c.count} ${c.count === 1 ? 'event' : 'events'}`
</script>

<template>
  <div class="mv" data-testid="month-view">
    <div class="mv__cal">
      <div class="mv__week" aria-hidden="true"><span v-for="d in WEEKDAYS" :key="d">{{ d }}</span></div>
      <div class="mv__grid">
        <button
          v-for="c in cells"
          :key="c.day.toISOString()"
          type="button"
          class="mv__cell"
          :class="{ 'mv__cell--out': !c.inMonth, 'mv__cell--today': c.today, 'mv__cell--sel': c.selected }"
          :aria-label="label(c)"
          :aria-pressed="c.selected"
          :data-testid="`day-${c.day.getFullYear()}-${c.day.getMonth() + 1}-${c.day.getDate()}`"
          @click="calendar.select(c.day)"
        >
          <b>{{ c.day.getDate() }}</b>
          <span class="mv__dots">
            <i v-for="(d, i) in c.dots" :key="i" :style="{ background: d }" />
            <small v-if="c.more">+{{ c.more }}</small>
          </span>
        </button>
      </div>
    </div>

    <aside class="mv__side" aria-label="Selected day">
      <header>
        <h3>{{ formatDayHeading(calendar.anchor) }}</h3>
        <HudButton variant="primary" data-testid="month-add" @click="$emit('add')">
          <template #icon><CalendarPlus /></template>
          Add
        </HudButton>
      </header>
      <ul v-if="selectedEvents.length" class="mv__events" data-testid="month-events">
        <li v-for="e in selectedEvents" :key="e.id">
          <button type="button" class="mv__ev" :aria-label="`${e.title}, open details`" @click="$emit('open', e)"><EventRow :event="e" /></button>
        </li>
      </ul>
      <p v-else class="mv__none" data-testid="month-empty">
        Nothing planned.
        <span><Lightbulb aria-hidden="true" /> Tap Add or use the mic.</span>
      </p>
    </aside>
  </div>
</template>

<style scoped lang="scss">
.mv {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 21rem;
  grid-template-rows: minmax(0, 1fr);
  gap: 1.1rem;
}
.mv__cal {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.mv__week {
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  text-align: center;
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--hud-text-dim);
  padding-bottom: 0.3rem;
}
.mv__grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  grid-template-rows: repeat(6, minmax(0, 1fr));
  gap: 3px;
}
.mv__cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  min-height: 0;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--hud-border) 55%, transparent);
  border-radius: 0.6rem;
  background: color-mix(in srgb, var(--hud-surface) 25%, transparent);
  color: var(--hud-text);
  cursor: pointer;
  b {
    font-size: 1.15rem;
    font-weight: 500;
  }
  &--out {
    opacity: 0.4;
  }
  &--today {
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 10%, transparent);
  }
  &--sel {
    border: 2px solid var(--hud-primary);
    background: linear-gradient(180deg, color-mix(in srgb, var(--hud-blue) 40%, transparent), color-mix(in srgb, var(--hud-blue-deep) 30%, transparent));
    box-shadow: 0 0 0.9rem color-mix(in srgb, var(--hud-glow) 35%, transparent);
  }
  &:active {
    filter: brightness(1.3);
  }
}
.mv__dots {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  min-height: 0.55rem;
  i {
    width: 0.5rem;
    height: 0.5rem;
    border-radius: 50%;
  }
  small {
    font-size: 0.62rem;
    color: var(--hud-text-dim);
  }
}
.mv__side {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  min-height: 0;
  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  h3 {
    margin: 0;
    font-size: 1.05rem;
    font-weight: 600;
  }
}
.mv__events {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.2rem 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  overflow-y: auto;
  // The side list is narrow: stack time above the card.
  :deep(.ev) {
    grid-template-columns: 1fr;
    gap: 0.15rem;
  }
  :deep(.ev__time) {
    flex-direction: row;
    gap: 0.5rem;
    justify-content: flex-start;
  }
}
.mv__ev {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
}
.mv__none {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  color: var(--hud-text-dim);
  span {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.82rem;
  }
  svg {
    width: 1rem;
    height: 1rem;
    color: var(--hud-warning);
  }
}
</style>
