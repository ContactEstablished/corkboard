import type { CalendarEvent, ISODate, RecurrenceRule } from '@/models'
import { addDays, startOfDay, startOfWeek, toISODate } from '@/utils/date'

const DAY_MS = 86_400_000
const MAX_DAYS = 800

const daysBetween = (a: Date, b: Date) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / DAY_MS)

/** Does a rule that started on `start` produce an occurrence on `day`? */
export function occursOn(rule: RecurrenceRule, start: Date, day: Date): boolean {
  if (day < startOfDay(start)) return false
  if (rule.until && toISODate(day) > rule.until) return false
  const interval = Math.max(1, rule.interval ?? 1)
  switch (rule.freq) {
    case 'daily':
      return daysBetween(start, day) % interval === 0
    case 'weekly': {
      const weeks = Math.round(daysBetween(startOfWeek(start), startOfWeek(day)) / 7)
      if (weeks % interval !== 0) return false
      return (rule.byWeekday ?? [start.getDay()]).includes(day.getDay())
    }
    case 'monthly': {
      const months = (day.getFullYear() - start.getFullYear()) * 12 + day.getMonth() - start.getMonth()
      return months % interval === 0 && day.getDate() === start.getDate()
    }
  }
}

/** Next date (>= `from`) on which the rule fires, or null within ~2 years. */
export function nextOccurrence(rule: RecurrenceRule | undefined, start: Date, from: Date): ISODate | null {
  const first = startOfDay(from) > startOfDay(start) ? startOfDay(from) : startOfDay(start)
  if (!rule) return first.getTime() === startOfDay(start).getTime() ? toISODate(first) : null
  for (let i = 0; i < 740; i++) {
    const d = addDays(first, i)
    if (occursOn(rule, start, d)) return toISODate(d)
  }
  return null
}

/** Expands one event into the occurrences overlapping [from, to). Non-recurring events pass through. */
export function expandEvent(e: CalendarEvent, from: Date, to: Date): CalendarEvent[] {
  const start = new Date(e.start)
  const end = new Date(e.end)
  if (!e.recurrence) return end > from && start < to ? [e] : []

  const duration = end.getTime() - start.getTime()
  const out: CalendarEvent[] = []
  const first = startOfDay(from) > startOfDay(start) ? startOfDay(from) : startOfDay(start)
  for (let i = 0; i < MAX_DAYS; i++) {
    const day = addDays(first, i)
    if (day >= to) break
    if (!occursOn(e.recurrence, start, day)) continue
    const s = new Date(day.getFullYear(), day.getMonth(), day.getDate(), start.getHours(), start.getMinutes())
    const occ: CalendarEvent = {
      ...e,
      id: `${e.id}#${toISODate(day)}`,
      seriesId: e.id,
      start: s.toISOString(),
      end: new Date(s.getTime() + duration).toISOString(),
    }
    if (new Date(occ.end) > from && s < to) out.push(occ)
  }
  return out
}

export function describeRecurrence(rule: RecurrenceRule | undefined): string {
  if (!rule) return 'Once'
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const every = rule.interval && rule.interval > 1 ? `every ${rule.interval} ` : 'every '
  if (rule.freq === 'daily') return rule.interval && rule.interval > 1 ? `Every ${rule.interval} days` : 'Every day'
  if (rule.freq === 'monthly') return 'Every month'
  const days = rule.byWeekday
  if (!days?.length) return rule.interval && rule.interval > 1 ? `Every ${rule.interval} weeks` : 'Every week'
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) return 'Weekdays'
  if (days.length === 2 && days.includes(0) && days.includes(6)) return 'Weekends'
  return `${every === 'every ' ? 'Every ' : 'Every other '}${days.map((d) => names[d]).join(', ')}`
}
