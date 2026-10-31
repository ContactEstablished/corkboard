<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { CalendarEvent } from '@/models'
import { useCalendarStore } from '@/stores/calendar'
import { useClockStore } from '@/stores/clock'
import { useFamilyStore } from '@/stores/family'
import { isSameDay } from '@/utils/date'
import { eventAccent, packColumns } from './layout'

defineEmits<{ open: [event: CalendarEvent] }>()
const calendar = useCalendarStore()
const clock = useClockStore()
const family = useFamilyStore()

const FIRST_HOUR = 6
const LAST_HOUR = 22 // exclusive
const ROW_REM = 3.4
const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? 'AM' : 'PM'}`

const minutes = (iso: string) => {
  const d = new Date(iso)
  return d.getHours() * 60 + d.getMinutes()
}

interface Block {
  event: CalendarEvent
  style: Record<string, string>
}

const columns = computed(() =>
  calendar.weekDays.map((day) => {
    const all = calendar.onDay(day)
    const allDay = all.filter((e) => e.allDay)
    const timed = all.filter((e) => !e.allDay)
    const ranges = timed.map((e) => ({
      start: Math.max(minutes(e.start), FIRST_HOUR * 60),
      end: Math.min(Math.max(minutes(e.end), minutes(e.start) + 30), LAST_HOUR * 60),
    }))
    const packed = packColumns(ranges)
    const blocks: Block[] = timed.map((event, i) => {
      const r = ranges[i]!
      const p = packed[i]!
      return {
        event,
        style: {
          top: `${((r.start - FIRST_HOUR * 60) / 60) * ROW_REM}rem`,
          height: `${Math.max(((r.end - r.start) / 60) * ROW_REM, 1.5)}rem`,
          left: `${(p.col / p.cols) * 100}%`,
          width: `calc(${100 / p.cols}% - 2px)`,
          '--accent': eventAccent(event, family.byId),
        },
      }
    })
    return { day, allDay, blocks }
  }),
)

const nowTop = computed(() => {
  const m = clock.now.getHours() * 60 + clock.now.getMinutes()
  return m < FIRST_HOUR * 60 || m >= LAST_HOUR * 60 ? null : `${((m - FIRST_HOUR * 60) / 60) * ROW_REM}rem`
})
const hasAllDay = computed(() => columns.value.some((c) => c.allDay.length))
const dayName = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'short' })
const isToday = (d: Date) => isSameDay(d, clock.today)
const isSelected = (d: Date) => isSameDay(d, calendar.anchor)
const timeRange = (e: CalendarEvent) =>
  `${new Date(e.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`

function pickDay(d: Date) {
  calendar.select(d)
  calendar.view = 'day'
}

const scroller = ref<HTMLElement>()
onMounted(async () => {
  await nextTick()
  // Open scrolled to the morning (or "now" if it's later in the day).
  const startHour = Math.max(FIRST_HOUR, Math.min(clock.now.getHours() - 1, 8))
  if (scroller.value) scroller.value.scrollTop = (startHour - FIRST_HOUR) * ROW_REM * parseFloat(getComputedStyle(document.documentElement).fontSize)
})
</script>

<template>
  <div class="wv" data-testid="week-view">
    <div class="wv__head">
      <span class="wv__gutter" />
      <button
        v-for="c in columns"
        :key="c.day.toISOString()"
        type="button"
        class="wv__day"
        :class="{ 'wv__day--today': isToday(c.day), 'wv__day--sel': isSelected(c.day) }"
        :aria-label="`Open ${c.day.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}`"
        @click="pickDay(c.day)"
      >
        <span>{{ dayName(c.day) }}</span><b>{{ c.day.getDate() }}</b>
      </button>
    </div>

    <div v-if="hasAllDay" class="wv__allday">
      <span class="wv__gutter">All day</span>
      <div v-for="c in columns" :key="c.day.toISOString()" class="wv__allcell">
        <button v-for="e in c.allDay" :key="e.id" type="button" class="wv__chip" :style="{ '--accent': eventAccent(e, family.byId) }" @click="$emit('open', e)">{{ e.title }}</button>
      </div>
    </div>

    <div ref="scroller" class="wv__scroll">
      <div class="wv__grid" :style="{ height: `${hours.length * ROW_REM}rem` }">
        <div class="wv__hours">
          <span v-for="h in hours" :key="h" :style="{ height: `${ROW_REM}rem` }">{{ hourLabel(h) }}</span>
        </div>
        <div v-for="c in columns" :key="c.day.toISOString()" class="wv__col" :class="{ 'wv__col--today': isToday(c.day) }" :style="{ '--row': `${ROW_REM}rem` }">
          <button
            v-for="b in c.blocks"
            :key="b.event.id"
            type="button"
            class="wv__event"
            :style="b.style"
            :aria-label="`${b.event.title} at ${timeRange(b.event)}`"
            :data-testid="`event-${b.event.id}`"
            @click="$emit('open', b.event)"
          >
            <b>{{ b.event.title }}</b>
            <small>{{ timeRange(b.event) }}</small>
          </button>
          <i v-if="isToday(c.day) && nowTop" class="wv__now" :style="{ top: nowTop }" aria-hidden="true" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
$gutter: 4rem;

.wv {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.wv__head,
.wv__allday {
  display: grid;
  grid-template-columns: $gutter repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.wv__gutter {
  display: grid;
  place-items: center;
  font-size: 0.7rem;
  color: var(--hud-text-faint);
}
.wv__day {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 3.8rem;
  border: 1px solid transparent;
  border-radius: 0.7rem;
  background: none;
  color: var(--hud-text-dim);
  cursor: pointer;
  span {
    font-size: 0.8rem;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  b {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--hud-text);
  }
  &--today {
    border-color: var(--hud-primary);
    background: color-mix(in srgb, var(--hud-primary) 12%, transparent);
    box-shadow: 0 0 0.8rem color-mix(in srgb, var(--hud-glow) 30%, transparent);
  }
  &--sel:not(&--today) {
    border-color: var(--hud-border-bright);
  }
  &:active {
    background: color-mix(in srgb, var(--hud-primary) 18%, transparent);
  }
}
.wv__allday {
  margin-bottom: 0.3rem;
}
.wv__allcell {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.wv__chip {
  min-height: 2.2rem;
  padding: 0 0.5rem;
  border: 1px solid color-mix(in srgb, var(--accent) 70%, transparent);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--accent) 18%, var(--hud-panel));
  color: var(--hud-text);
  font-size: 0.78rem;
  text-align: left;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}
.wv__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  border-top: 1px solid var(--hud-border);
}
.wv__grid {
  position: relative;
  display: grid;
  grid-template-columns: $gutter repeat(7, minmax(0, 1fr));
  gap: 2px;
}
.wv__hours {
  display: flex;
  flex-direction: column;
  span {
    padding-right: 0.5rem;
    text-align: right;
    font-size: 0.7rem;
    color: var(--hud-text-faint);
    transform: translateY(-0.45rem);
  }
}
.wv__col {
  position: relative;
  background: repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--row) - 1px), color-mix(in srgb, var(--hud-border) 55%, transparent) calc(var(--row) - 1px), color-mix(in srgb, var(--hud-border) 55%, transparent) var(--row));
  &--today {
    background-color: color-mix(in srgb, var(--hud-primary) 5%, transparent);
  }
}
.wv__event {
  position: absolute;
  display: flex;
  flex-direction: column;
  gap: 0.05rem;
  padding: 0.2rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--accent) 75%, transparent);
  border-left: 0.22rem solid var(--accent);
  border-radius: 0.4rem;
  background: color-mix(in srgb, var(--accent) 20%, var(--hud-panel));
  color: var(--hud-text);
  text-align: left;
  overflow: hidden;
  cursor: pointer;
  b {
    font-size: 0.78rem;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  small {
    font-size: 0.66rem;
    color: var(--hud-text-dim);
  }
  &:active {
    filter: brightness(1.25);
  }
}
.wv__now {
  position: absolute;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--hud-danger);
  box-shadow: 0 0 0.5rem var(--hud-danger);
  pointer-events: none;
}
</style>
