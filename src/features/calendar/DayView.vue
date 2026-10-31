<script setup lang="ts">
import { CalendarDays, Lightbulb } from 'lucide-vue-next'
import { computed } from 'vue'
import EventRow from '@/components/calendar/EventRow.vue'
import type { CalendarEvent } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { isSameDay } from '@/utils/date'

defineEmits<{ open: [event: CalendarEvent] }>()
const calendar = useCalendarStore()
const clock = useClockStore()
const family = useFamilyStore()

const events = computed(() => calendar.onDay(calendar.anchor))
const isToday = computed(() => isSameDay(calendar.anchor, clock.today))
const nextId = computed(() => (isToday.value ? calendar.nextToday?.id : undefined))
const past = (e: CalendarEvent) => isToday.value && new Date(e.end) <= clock.now
</script>

<template>
  <div class="dv" data-testid="day-view">
    <ul v-if="events.length" class="dv__list">
      <li v-for="e in events" :key="e.id">
        <button type="button" class="dv__row" :aria-label="`${e.title}, open details`" :data-testid="`event-${e.id}`" @click="$emit('open', e)">
          <EventRow :event="e" :past="past(e)" :next="e.id === nextId" />
        </button>
      </li>
    </ul>
    <div v-else class="dv__empty" data-testid="day-empty">
      <CalendarDays aria-hidden="true" />
      <strong>No events {{ isToday ? 'today' : 'this day' }}</strong>
      <span>{{ family.selected ? `${family.selected.name}'s day is free!` : 'Your day is free!' }}</span>
      <span class="dv__tip"><Lightbulb aria-hidden="true" /> Add an event, or try “Add soccer practice tomorrow at 4 PM”</span>
    </div>
  </div>
</template>

<style scoped lang="scss">
.dv {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.dv__list {
  flex: 1;
  min-height: 0;
  margin: 0;
  padding: 0 0.3rem 0 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  overflow-y: auto;
  :deep(.ev__card) {
    min-height: 4.2rem;
  }
  :deep(.ev__title) {
    font-size: 1.2rem;
  }
  :deep(.ev__meta) {
    font-size: 0.85rem;
  }
  :deep(.ev__time) {
    font-size: 1rem;
  }
}
.dv__row {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  &:active {
    transform: scale(0.995);
  }
}
.dv__empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.45rem;
  color: var(--hud-text-dim);
  > svg {
    width: 3.5rem;
    height: 3.5rem;
    color: var(--hud-primary);
  }
  strong {
    font-size: 1.3rem;
    color: var(--hud-text);
  }
}
.dv__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.8rem;
  font-size: 0.85rem;
  svg {
    width: 1rem;
    height: 1rem;
    color: var(--hud-warning);
  }
}
</style>
