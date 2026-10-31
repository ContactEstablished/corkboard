<script setup lang="ts">
import { ChevronLeft, ChevronRight, Minus, Plus } from 'lucide-vue-next'
import { computed, reactive, watch } from 'vue'
import HudButton from '@/components/hud/HudButton.vue'
import HudModal from '@/components/hud/HudModal.vue'
import MicButton from '@/components/voice/MicButton.vue'
import { useVoiceLauncher } from '@/features/voice/useVoiceLauncher'
import { useVoiceStore } from '@/stores/voice'
import MemberAvatar from '@/components/hud/MemberAvatar.vue'
import type { CalendarEvent, EventCategory, RecurrenceRule } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useFamilyStore } from '@/stores/family'
import { addDays, at, formatTime, startOfDay } from '@/utils/date'
import { describeRecurrence } from './recurrence'

const props = defineProps<{ open: boolean; event?: CalendarEvent | null; date?: Date }>()
const emit = defineEmits<{ close: [] }>()

const calendar = useCalendarStore()
const family = useFamilyStore()
const voice = useVoiceStore()
const { launch } = useVoiceLauncher()

/** Dictate a free-text title; it lands in the form only after the user confirms it. */
const sayTitle = () =>
  launch({ feature: 'calendar', activeModal: 'event-editor', operation: 'edit', field: 'event.title' }, 'local-mic', { onDictation: (t) => (draft.title = t) })

const TITLES = ['Appointment', 'Practice', 'Game', 'Lesson', 'Meeting', 'Birthday Party', 'Dinner', 'Playdate', 'Family Time', 'Dentist', 'Doctor', 'Homework']
const CATEGORIES: { value: EventCategory; label: string }[] = [
  { value: 'activity', label: 'Activity' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'school', label: 'School' },
  { value: 'work', label: 'Work' },
  { value: 'home', label: 'Home' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'other', label: 'Other' },
]
const DURATIONS = [30, 60, 90, 120, 180]
type Repeat = 'once' | 'daily' | 'weekdays' | 'weekly' | 'monthly'
const REPEATS: { value: Repeat; label: string }[] = [
  { value: 'once', label: 'Once' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekdays', label: 'Weekdays' },
  { value: 'weekly', label: 'Every week' },
  { value: 'monthly', label: 'Every month' },
]

const draft = reactive({
  title: '',
  day: startOfDay(new Date()),
  startMin: 9 * 60,
  duration: 60,
  allDay: false,
  memberIds: [] as string[],
  category: 'other' as EventCategory,
  repeat: 'once' as Repeat,
  location: undefined as string | undefined,
})

const isSeries = computed(() => !!props.event?.seriesId)
const isEdit = computed(() => !!props.event)
/** A repeating event can change how it repeats, but not become a one-off. */
const repeatOptions = computed(() => (isSeries.value ? REPEATS.filter((r) => r.value !== 'once') : REPEATS))

function repeatOf(rule?: RecurrenceRule): Repeat {
  if (!rule) return 'once'
  if (rule.freq === 'daily') return 'daily'
  if (rule.freq === 'monthly') return 'monthly'
  return rule.byWeekday?.length === 5 && [1, 2, 3, 4, 5].every((d) => rule.byWeekday!.includes(d)) ? 'weekdays' : 'weekly'
}

watch(
  () => [props.open, props.event, props.date] as const,
  () => {
    if (!props.open) return
    const e = props.event
    if (e) {
      const s = new Date(e.start)
      draft.title = e.title
      draft.day = startOfDay(s)
      draft.startMin = e.allDay ? 9 * 60 : s.getHours() * 60 + s.getMinutes()
      draft.duration = e.allDay ? 60 : Math.round((new Date(e.end).getTime() - s.getTime()) / 60000)
      draft.allDay = !!e.allDay
      draft.memberIds = e.memberIds.slice()
      draft.category = e.category
      draft.repeat = repeatOf(e.recurrence)
      draft.location = e.location
    } else {
      draft.title = ''
      draft.day = startOfDay(props.date ?? calendar.anchor)
      draft.startMin = 9 * 60
      draft.duration = 60
      draft.allDay = false
      draft.memberIds = family.selectedId ? [family.selectedId] : []
      draft.category = 'other'
      draft.repeat = 'once'
      draft.location = undefined
    }
  },
  { immediate: true },
)

const timeLabel = computed(() => formatTime(at(draft.day, Math.floor(draft.startMin / 60), draft.startMin % 60)))
const endLabel = computed(() => formatTime(new Date(at(draft.day, 0, draft.startMin).getTime() + draft.duration * 60_000)))
const dateLabel = computed(() => draft.day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }))
const durationLabel = (m: number) => (m < 60 ? `${m} min` : m % 60 === 0 ? `${m / 60} hr` : `${m / 60} hr`)
const valid = computed(() => draft.title.trim() !== '')
const repeatNote = computed(() => (props.event?.recurrence && draft.repeat !== 'once' ? `Currently: ${describeRecurrence(props.event.recurrence)}` : ''))

const shiftTime = (delta: number) => (draft.startMin = Math.min(23 * 60 + 45, Math.max(5 * 60, draft.startMin + delta)))
const toggle = (id: string) => (draft.memberIds = draft.memberIds.includes(id) ? draft.memberIds.filter((x) => x !== id) : [...draft.memberIds, id])

function rule(): RecurrenceRule | undefined {
  const dow = draft.day.getDay()
  switch (draft.repeat) {
    case 'daily': return { freq: 'daily' }
    case 'weekdays': return { freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] }
    // Keep the original days when a series is only being retitled, not repeated differently.
    case 'weekly': return repeatOf(props.event?.recurrence) === 'weekly' ? props.event!.recurrence : { freq: 'weekly', byWeekday: [dow] }
    case 'monthly': return { freq: 'monthly' }
    default: return undefined
  }
}

async function save() {
  if (!valid.value) return
  const start = draft.allDay ? at(draft.day, 0, 0) : at(draft.day, Math.floor(draft.startMin / 60), draft.startMin % 60)
  const end = draft.allDay ? at(draft.day, 23, 59) : new Date(start.getTime() + draft.duration * 60_000)
  const base = props.event
  await calendar.save({
    // An occurrence id lets the repository keep the series' own start date.
    id: base?.id,
    title: draft.title.trim(),
    start: start.toISOString(),
    end: end.toISOString(),
    allDay: draft.allDay || undefined,
    memberIds: draft.memberIds.slice(),
    category: draft.category,
    location: draft.location,
    recurrence: rule(),
  })
  emit('close')
}
</script>

<template>
  <HudModal :open="open" :title="isEdit ? 'Edit event' : 'New event'" size="lg" layer="top" :close-on-backdrop="false" @close="emit('close')">
    <div class="ee" data-testid="event-editor">
      <section class="ee__sect">
        <div class="say"><h3>What</h3>
          <MicButton size="sm" :state="voice.micVisual" label="Say a title" data-testid="say-title" @press="sayTitle" />
          <span class="say__label">Say a title</span>
        </div>
        <div class="ee__chips" role="group" aria-label="Event ideas">
          <button v-for="t in TITLES" :key="t" type="button" class="ee__chip" :class="{ 'ee__chip--on': draft.title === t }" :aria-pressed="draft.title === t" @click="draft.title = t">{{ t }}</button>
        </div>
        <p v-if="draft.title && !TITLES.includes(draft.title)" class="ee__current">Current: {{ draft.title }}</p>
        <p v-else-if="!draft.title" class="ee__hint">Pick a title, or add events with your voice for a custom name.</p>
      </section>

      <section class="ee__row">
        <div v-if="!isSeries" class="ee__sect">
          <h3>Date</h3>
          <div class="ee__step">
            <button type="button" aria-label="Previous day" @click="draft.day = addDays(draft.day, -1)"><ChevronLeft /></button>
            <output data-testid="editor-date">{{ dateLabel }}</output>
            <button type="button" aria-label="Next day" @click="draft.day = addDays(draft.day, 1)"><ChevronRight /></button>
          </div>
        </div>
        <div v-if="!draft.allDay" class="ee__sect">
          <h3>Starts</h3>
          <div class="ee__step">
            <button type="button" aria-label="15 minutes earlier" @click="shiftTime(-15)"><Minus /></button>
            <output data-testid="editor-time">{{ timeLabel }}</output>
            <button type="button" aria-label="15 minutes later" @click="shiftTime(15)"><Plus /></button>
          </div>
          <span class="ee__end">Ends {{ endLabel }}</span>
        </div>
      </section>
      <p v-if="isSeries" class="ee__note">This event repeats. Changes apply to every repeat.</p>

      <section class="ee__sect">
        <h3>Length</h3>
        <div class="ee__chips" role="group" aria-label="Length">
          <button type="button" class="ee__chip" :class="{ 'ee__chip--on': draft.allDay }" :aria-pressed="draft.allDay" @click="draft.allDay = !draft.allDay">All day</button>
          <template v-if="!draft.allDay">
            <button v-for="d in DURATIONS" :key="d" type="button" class="ee__chip" :class="{ 'ee__chip--on': draft.duration === d }" :aria-pressed="draft.duration === d" @click="draft.duration = d">{{ durationLabel(d) }}</button>
          </template>
        </div>
      </section>

      <section class="ee__sect">
        <h3>Who <small>(none selected = whole family)</small></h3>
        <div class="ee__people" role="group" aria-label="People">
          <MemberAvatar
            v-for="m in family.members"
            :key="m.id"
            :member="m"
            size="2.7rem"
            show-name
            interactive
            :selected="draft.memberIds.includes(m.id)"
            :dimmed="draft.memberIds.length > 0 && !draft.memberIds.includes(m.id)"
            @select="toggle(m.id)"
          />
        </div>
      </section>

      <section class="ee__row">
        <div class="ee__sect ee__sect--grow">
          <h3>Type</h3>
          <div class="ee__chips" role="group" aria-label="Type">
            <button v-for="c in CATEGORIES" :key="c.value" type="button" class="ee__chip" :class="{ 'ee__chip--on': draft.category === c.value }" :aria-pressed="draft.category === c.value" @click="draft.category = c.value">{{ c.label }}</button>
          </div>
        </div>
        <div class="ee__sect ee__sect--grow">
          <h3>Repeats</h3>
          <div class="ee__chips" role="group" aria-label="Repeat">
            <button v-for="r in repeatOptions" :key="r.value" type="button" class="ee__chip" :class="{ 'ee__chip--on': draft.repeat === r.value }" :aria-pressed="draft.repeat === r.value" @click="draft.repeat = r.value">{{ r.label }}</button>
          </div>
          <p v-if="repeatNote" class="ee__hint">{{ repeatNote }}</p>
        </div>
      </section>

      <footer class="ee__foot">
        <HudButton @click="emit('close')">Cancel</HudButton>
        <HudButton variant="primary" :disabled="!valid" data-testid="event-save" @click="save">{{ isEdit ? 'Save changes' : 'Add event' }}</HudButton>
      </footer>
    </div>
  </HudModal>
</template>

<style scoped lang="scss">
.ee {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}
.ee__sect {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  &--grow {
    flex: 1;
  }
  h3 {
    margin: 0;
    font-size: 0.72rem;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: var(--hud-text-dim);
    small {
      text-transform: none;
      letter-spacing: 0;
      color: var(--hud-text-faint);
    }
  }
}

.say {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
}
.say__label {
  font-size: 0.85rem;
  color: var(--hud-text-dim);
}
.ee__row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem 2rem;
}
.ee__chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.ee__chip {
  min-height: 2.8rem;
  padding: 0 0.95rem;
  border: 1px solid var(--hud-border);
  border-radius: 999px;
  background: none;
  color: var(--hud-text-dim);
  font-size: 0.92rem;
  cursor: pointer;
  &--on {
    color: var(--hud-text);
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
}
.ee__people {
  display: flex;
  gap: 0.8rem;
}
.ee__step {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  button {
    display: grid;
    place-items: center;
    width: var(--hud-touch-min);
    height: var(--hud-touch-min);
    border: 1px solid var(--hud-border-bright);
    border-radius: 50%;
    background: color-mix(in srgb, var(--hud-surface) 70%, transparent);
    color: var(--hud-primary);
    cursor: pointer;
    svg {
      width: 1.2rem;
      height: 1.2rem;
    }
    &:active {
      background: color-mix(in srgb, var(--hud-primary) 22%, transparent);
    }
  }
  output {
    min-width: 8.5rem;
    text-align: center;
    font-size: 1.15rem;
    font-weight: 600;
  }
}
.ee__end {
  font-size: 0.8rem;
  color: var(--hud-text-dim);
}
.ee__current,
.ee__hint,
.ee__note {
  margin: 0;
  font-size: 0.84rem;
  color: var(--hud-text-dim);
}
.ee__current {
  color: var(--hud-primary);
}
.ee__note {
  padding: 0.4rem 0.7rem;
  border-radius: 0.5rem;
  background: color-mix(in srgb, var(--hud-warning) 12%, transparent);
  color: color-mix(in srgb, var(--hud-warning) 70%, white);
}
.ee__foot {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--hud-border);
}
</style>
