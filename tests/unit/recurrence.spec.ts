import { describe, expect, it } from 'vitest'
import { expandEvent, describeRecurrence, nextOccurrence, occursOn } from '@/features/calendar/recurrence'
import { packColumns } from '@/features/calendar/layout'
import type { CalendarEvent } from '@/models'

const d = (y: number, m: number, day: number, h = 0, min = 0) => new Date(y, m - 1, day, h, min)

const base = (extra: Partial<CalendarEvent>): CalendarEvent => ({
  id: 'e',
  title: 'Soccer',
  start: d(2026, 10, 6, 16).toISOString(), // a Tuesday, 4 PM
  end: d(2026, 10, 6, 17, 30).toISOString(),
  memberIds: ['liam'],
  category: 'activity',
  ...extra,
})

describe('recurrence', () => {
  it('weekly rules fire only on the chosen weekdays, never before the start', () => {
    const rule = { freq: 'weekly' as const, byWeekday: [2, 4] } // Tue, Thu
    const start = d(2026, 10, 6)
    expect(occursOn(rule, start, d(2026, 10, 8))).toBe(true) // Thu
    expect(occursOn(rule, start, d(2026, 10, 9))).toBe(false) // Fri
    expect(occursOn(rule, start, d(2026, 10, 1))).toBe(false) // Thu before start
  })

  it('honours intervals ("every other week")', () => {
    const rule = { freq: 'weekly' as const, interval: 2, byWeekday: [2] }
    const start = d(2026, 10, 6)
    expect(occursOn(rule, start, d(2026, 10, 13))).toBe(false)
    expect(occursOn(rule, start, d(2026, 10, 20))).toBe(true)
  })

  it('stops after `until` and handles monthly and daily', () => {
    expect(occursOn({ freq: 'daily', until: '2026-10-10' }, d(2026, 10, 6), d(2026, 10, 11))).toBe(false)
    expect(occursOn({ freq: 'monthly' }, d(2026, 10, 15), d(2026, 12, 15))).toBe(true)
    expect(occursOn({ freq: 'monthly' }, d(2026, 10, 15), d(2026, 12, 16))).toBe(false)
  })

  it('expands a series into dated occurrences with the same time of day', () => {
    const e = base({ recurrence: { freq: 'weekly', byWeekday: [2, 4] } })
    const out = expandEvent(e, d(2026, 10, 12), d(2026, 10, 19))
    expect(out.map((o) => o.id)).toEqual(['e#2026-10-13', 'e#2026-10-15'])
    expect(out.every((o) => o.seriesId === 'e')).toBe(true)
    expect(new Date(out[0]!.start).getHours()).toBe(16)
    expect(new Date(out[0]!.end).getMinutes()).toBe(30)
  })

  it('passes one-off events through and filters by window', () => {
    const e = base({})
    expect(expandEvent(e, d(2026, 10, 5), d(2026, 10, 8))).toHaveLength(1)
    expect(expandEvent(e, d(2026, 10, 7), d(2026, 10, 9))).toHaveLength(0)
  })

  it('finds the next occurrence and describes rules for people', () => {
    const rule = { freq: 'weekly' as const, byWeekday: [3] }
    expect(nextOccurrence(rule, d(2026, 10, 1), d(2026, 10, 29))).toBe('2026-11-04') // Wednesdays; 29 Oct is a Thursday
    expect(describeRecurrence(undefined)).toBe('Once')
    expect(describeRecurrence({ freq: 'weekly', byWeekday: [1, 2, 3, 4, 5] })).toBe('Weekdays')
    expect(describeRecurrence({ freq: 'daily' })).toBe('Every day')
  })
})

describe('week-view column packing', () => {
  it('puts overlapping events side by side and leaves separate ones full width', () => {
    const p = packColumns([
      { start: 480, end: 900 }, // 8:00–15:00
      { start: 510, end: 720 }, // 8:30–12:00 overlaps the first
      { start: 960, end: 1050 }, // 16:00–17:30 alone
    ])
    expect(p[0]).toMatchObject({ col: 0, cols: 2 })
    expect(p[1]).toMatchObject({ col: 1, cols: 2 })
    expect(p[2]).toMatchObject({ col: 0, cols: 1 })
  })
})
