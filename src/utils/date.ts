/** Small, dependency-free date helpers. All math is in the device's local time. */

import type { ISODate } from '@/models'

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseISODate(s: ISODate): Date {
  const [y = 1970, m = 1, d = 1] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

export function addDays(d: Date, days: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + days)
  return r
}

/** Monday-based week start. */
export function startOfWeek(d: Date): Date {
  const day = (d.getDay() + 6) % 7
  return startOfDay(addDays(d, -day))
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

/** `at(day, 16, 30)` → that day at 4:30 PM local. */
export function at(day: Date, hours: number, minutes = 0): Date {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), hours, minutes)
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

/** `7:42` and `AM`, split so the clock can style them separately. */
export function clockParts(d: Date): { time: string; meridiem: string } {
  const parts = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).formatToParts(d)
  const time = parts.filter((p) => p.type === 'hour' || p.type === 'literal' || p.type === 'minute').map((p) => p.value).join('')
  const meridiem = parts.find((p) => p.type === 'dayPeriod')?.value ?? ''
  return { time, meridiem }
}

export function formatLongDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

export function formatRelative(from: Date, now: Date): string {
  const mins = Math.round((now.getTime() - from.getTime()) / 60000)
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'Yesterday' : `${days}d ago`
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

export function addMonths(d: Date, months: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth() + months, 1)
  const last = new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()
  r.setDate(Math.min(d.getDate(), last))
  return r
}

/** Sunday-based week start (month grids). */
export function startOfSundayWeek(d: Date): Date {
  return startOfDay(addDays(d, -d.getDay()))
}

/** 6×7 grid of dates covering the month of `d`, Sunday first. */
export function monthGrid(d: Date): Date[] {
  const first = startOfSundayWeek(startOfMonth(d))
  return Array.from({ length: 42 }, (_, i) => addDays(first, i))
}

export function formatDayHeading(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

export function formatShortRange(a: Date, b: Date): string {
  const m = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return a.getMonth() === b.getMonth()
    ? `${m(a)} ${a.getDate()} – ${b.getDate()}, ${b.getFullYear()}`
    : `${m(a)} ${a.getDate()} – ${m(b)} ${b.getDate()}, ${b.getFullYear()}`
}
