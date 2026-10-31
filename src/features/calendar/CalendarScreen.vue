<script setup lang="ts">
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { ref } from 'vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudIconButton from '@/components/hud/HudIconButton.vue'
import HudPanel from '@/components/hud/HudPanel.vue'
import MicButton from '@/components/voice/MicButton.vue'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import type { CalendarEvent } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useVoiceStore } from '@/stores/voice'
import { toISODate } from '@/utils/date'
import DayView from './DayView.vue'
import EventDetail from './EventDetail.vue'
import EventEditor from './EventEditor.vue'
import MonthView from './MonthView.vue'
import WeekView from './WeekView.vue'

const calendar = useCalendarStore()
const voice = useVoiceStore()
const { launch } = useVoiceLauncher()

const detail = ref<CalendarEvent | null>(null)
const editing = ref<CalendarEvent | null>(null)
const creating = ref(false)

function edit(e: CalendarEvent) {
  detail.value = null
  editing.value = e
}
function closeEditor() {
  creating.value = false
  editing.value = null
}
const speak = () =>
  launch(
    { feature: 'calendar', activeModal: 'calendar', operation: 'add', calendarView: calendar.view, selectedDate: toISODate(calendar.anchor) },
    'local-mic',
  )
</script>

<template>
  <HudPanel :icon="CalendarDays" variant="primary" class="cal" data-testid="calendar-screen">
    <template #actions>
      <HudButton variant="primary" data-testid="calendar-add" @click="creating = true">
        <template #icon><CalendarPlus /></template>
        Add event
      </HudButton>
      <MicButton size="sm" :state="voice.micVisual" label="Add event by voice" data-testid="calendar-mic" @press="speak" />
    </template>

    <div class="cal__nav">
      <HudIconButton label="Previous" data-testid="cal-prev" @click="calendar.step(-1)"><ChevronLeft /></HudIconButton>
      <h2 class="cal__title" data-testid="cal-title">{{ calendar.title }}</h2>
      <HudIconButton label="Next" data-testid="cal-next" @click="calendar.step(1)"><ChevronRight /></HudIconButton>
      <HudButton :disabled="calendar.isCurrent" data-testid="cal-today" @click="calendar.goToday()">Today</HudButton>
    </div>

    <DayView v-if="calendar.view === 'day'" @open="detail = $event" />
    <WeekView v-else-if="calendar.view === 'week'" @open="detail = $event" />
    <MonthView v-else @open="detail = $event" @add="creating = true" />

    <EventDetail :event="detail" @close="detail = null" @edit="edit" />
    <EventEditor :open="creating || !!editing" :event="editing" @close="closeEditor" />
  </HudPanel>
</template>

<style scoped lang="scss">
.cal__nav {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding-bottom: 0.7rem;
}
.cal__title {
  min-width: 15rem;
  margin: 0;
  text-align: center;
  font-size: 1.4rem;
  font-weight: 600;
  letter-spacing: 0.03em;
}
</style>
