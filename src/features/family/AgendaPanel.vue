<script setup lang="ts">
import { CalendarDays, Lightbulb } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import EventRow from '@/components/calendar/EventRow.vue'
import HudPanel from '@/components/hud/HudPanel.vue'
import HudSegmented from '@/components/hud/HudSegmented.vue'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'

const calendar = useCalendarStore()
const clock = useClockStore()
const family = useFamilyStore()
const router = useRouter()

const day = ref<'today' | 'tomorrow'>('today')
const events = computed(() => (day.value === 'today' ? calendar.today : calendar.tomorrow))
const nextId = computed(() => (day.value === 'today' ? calendar.nextToday?.id : undefined))
const isPast = (end: string) => day.value === 'today' && new Date(end) <= clock.now
const emptyTitle = computed(() => `No events ${day.value}`)
</script>

<template>
  <HudPanel :icon="CalendarDays" variant="primary" expandable expand-label="Open calendar" @expand="router.push('/calendar')">
    <template #actions>
      <HudSegmented
        v-model="day"
        label="Day"
        :options="[
          { value: 'today', label: 'Today' },
          { value: 'tomorrow', label: 'Tomorrow' },
        ]"
      />
    </template>

    <ul v-if="events.length" class="agenda" data-testid="agenda-list">
      <li v-for="e in events" :key="e.id">
        <button type="button" class="agenda__row" @click="router.push('/calendar')">
          <EventRow :event="e" :past="isPast(e.end)" :next="e.id === nextId" />
        </button>
      </li>
    </ul>

    <div v-else class="agenda-empty" data-testid="agenda-empty">
      <CalendarDays class="agenda-empty__icon" aria-hidden="true" />
      <strong>{{ emptyTitle }}</strong>
      <span>{{ family.selected ? `${family.selected.name}'s day is free!` : 'Your day is free!' }}</span>
      <span class="agenda-empty__tip"><Lightbulb aria-hidden="true" /> Try saying “Add soccer practice tomorrow at 4 PM”</span>
    </div>
  </HudPanel>
</template>

<style scoped lang="scss">
.agenda {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin: 0;
  padding: 0 0.1rem 0 0;
  list-style: none;
  overflow-y: auto;
  min-height: 0;
  flex: 1;
  @include fade-bottom;
}
.agenda__row {
  display: block;
  width: 100%;
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;
  &:active {
    transform: scale(0.99);
  }
}
.agenda-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  text-align: center;
  color: var(--hud-text-dim);
  strong {
    font-size: 1.15rem;
    color: var(--hud-text);
  }
}
.agenda-empty__icon {
  width: 3rem;
  height: 3rem;
  color: var(--hud-primary);
  opacity: 0.8;
}
.agenda-empty__tip {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.8rem;
  font-size: 0.82rem;
  svg {
    width: 1rem;
    height: 1rem;
    color: var(--hud-warning);
  }
}
</style>
