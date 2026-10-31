import { describe, expect, it } from 'vitest'
import { levelFor, totalPoints, uniqueCompletions, weeklyPoints } from '@/features/chores/scoring'
import type { ChoreCompletion } from '@/models'

const c = (id: string, memberId: string, points: number, at: string, key = id): ChoreCompletion => ({
  id,
  choreId: id,
  choreTitle: id,
  memberId,
  completedAt: at,
  occurrenceKey: key,
  pointsAwarded: points,
})

describe('scoring', () => {
  const rows = [
    c('a', 'liam', 20, '2026-10-27T10:00:00'),
    c('b', 'liam', 15, '2026-10-20T10:00:00'),
    c('c', 'ethan', 10, '2026-10-28T10:00:00'),
  ]

  it('derives totals from completion records, per member or overall', () => {
    expect(totalPoints(rows, 'liam')).toBe(35)
    expect(totalPoints(rows)).toBe(45)
  })

  it('never double-counts the same chore occurrence', () => {
    const dup = [...rows, c('a-again', 'liam', 20, '2026-10-27T10:05:00', 'a')]
    expect(uniqueCompletions(dup)).toHaveLength(3)
    expect(totalPoints(dup, 'liam')).toBe(35)
  })

  it('counts only completions inside the week window', () => {
    const monday = new Date(2026, 9, 26)
    expect(weeklyPoints(rows, monday, 'liam')).toBe(20)
    expect(weeklyPoints(rows, monday)).toBe(30)
  })

  it('maps points to levels and progress', () => {
    expect(levelFor(0).level).toBe(1)
    expect(levelFor(310)).toMatchObject({ level: 5, nextFloor: 500 })
    expect(levelFor(310).progress).toBeCloseTo(0.05)
    expect(levelFor(99999)).toMatchObject({ progress: 1, nextFloor: null })
  })
})
