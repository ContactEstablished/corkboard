import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { CalendarEvent, CalendarViewMode, ID } from '@/models'
import { getServices } from '@/services/container'
import {
  addDays, addMonths, formatDayHeading, formatShortRange, isSameDay, monthGrid, startOfDay, startOfMonth, startOfWeek,
} from '@/utils/date'
import { useClockStore } from './clock'
import { useFamilyStore } from './family'

const WINDOW_BEFORE = 60
const WINDOW_AFTER = 90

export const useCalendarStore = defineStore('calendar', () => {
  const clock = useClockStore()
  const family = useFamilyStore()

  const events = ref<CalendarEvent[]>([])
  /** Preserved across member changes and screens. */
  const view = ref<CalendarViewMode>('day')
  /** The selected date; every view is derived from it. */
  const anchor = ref<Date>(clock.today)
  let loaded: { from: Date; to: Date } | null = null

  async function load(force = false) {
    const from = addDays(anchor.value, -WINDOW_BEFORE)
    const to = addDays(anchor.value, WINDOW_AFTER)
    const covered = loaded && anchor.value >= addDays(loaded.from, 20) && anchor.value <= addDays(loaded.to, -20)
    if (covered && !force) return
    events.value = await getServices().calendar.listEvents(from, to)
    loaded = { from, to }
  }

  const visible = computed(() => events.value.filter((e) => family.matchesFilter(e.memberIds)))

  function onDay(day: Date) {
    return visible.value
      .filter((e) => isSameDay(new Date(e.start), day))
      .sort((a, b) => Number(!!b.allDay) - Number(!!a.allDay) || a.start.localeCompare(b.start))
  }

  const today = computed(() => onDay(clock.today))
  const tomorrow = computed(() => onDay(clock.tomorrow))
  /** First not-yet-finished event today. */
  const nextToday = computed(() => today.value.find((e) => new Date(e.end) > clock.now) ?? null)

  // ── navigation ──
  const weekDays = computed(() => Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor.value), i)))
  const monthDays = computed(() => monthGrid(anchor.value))

  const title = computed(() => {
    if (view.value === 'day') return formatDayHeading(anchor.value)
    if (view.value === 'week') return formatShortRange(weekDays.value[0]!, weekDays.value[6]!)
    return anchor.value.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  })
  const isCurrent = computed(() => {
    if (view.value === 'day') return isSameDay(anchor.value, clock.today)
    if (view.value === 'week') return isSameDay(startOfWeek(anchor.value), startOfWeek(clock.today))
    return startOfMonth(anchor.value).getTime() === startOfMonth(clock.today).getTime()
  })

  function select(day: Date) {
    anchor.value = startOfDay(day)
    void load()
  }
  function step(direction: 1 | -1) {
    anchor.value =
      view.value === 'day' ? addDays(anchor.value, direction)
      : view.value === 'week' ? addDays(anchor.value, 7 * direction)
      : addMonths(anchor.value, direction)
    void load()
  }
  function goToday() {
    select(clock.today)
  }

  // ── editing ──
  async function save(input: Omit<CalendarEvent, 'id'> & { id?: ID }): Promise<CalendarEvent> {
    const repo = getServices().calendar
    const { id, ...rest } = input
    const saved = id ? await repo.updateEvent(id, rest) : await repo.createEvent(rest)
    await load(true)
    return saved
  }
  async function remove(id: ID) {
    await getServices().calendar.deleteEvent(id)
    await load(true)
  }

  return {
    events, view, anchor, visible, today, tomorrow, nextToday, weekDays, monthDays, title, isCurrent,
    load, onDay, select, step, goToday, save, remove,
  }
})
